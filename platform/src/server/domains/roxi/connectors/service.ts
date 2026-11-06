import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import type { Database, Executor } from '@/server/db/client';
import { roxiConnections } from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import { ROXI_CREDIT_RULES, ROXI_PLANS, type RoxiPlanKey } from '@/config/business-rules';
import { DomainError, errors } from '@/server/errors';
import { recordAudit } from '@/server/domains/audit/service';
import { seal, unsealAny, usableKey } from '@/server/security/sealed-text';
import { seal as sealCookie, unseal as unsealCookie } from '@/server/auth/sealed';
import { currentPlan, spendCredits } from '../credits';
import { meteringOn } from '../billing';
import { checkUrl, safeRequest, UnsafeAddressError } from './safe-http';
import { callMcpTool, listMcpTools, McpError, type McpTool } from './mcp';
import * as google from './google';

/**
 * Tools a member connects to Roxi, and Roxi's use of them.
 *
 * - **google** — the member's Gmail and Calendar (Pro and Max).
 * - **mcp** — any remote MCP server the member runs or subscribes to (Max).
 * - **api** — any HTTPS API with a key (Max).
 *
 * Roxi reaches them only through here, with the member's session, and only
 * what the member's plan allows. Anything that changes something outside
 * Yavaya (sending an email, adding an event, an MCP tool that is not marked
 * read-only, an API call other than GET) is shown to the member first and
 * happens only after their tap: the server hands the browser a confirmation
 * token bound to exactly those arguments, and refuses the action without it.
 * Text that comes back (an email, a web page) is data: Roxi is told never to
 * follow instructions found in it.
 */

export type ConnectorKind = 'google' | 'mcp' | 'api';
const PURPOSE = 'roxi.connections';

function keys() {
  const env = serverEnv();
  return { current: usableKey(env.ROXI_KEY), previous: usableKey(env.ROXI_KEY_PREVIOUS) };
}

export function connectorsAvailable(): boolean {
  return keys().current !== null;
}

function sealSecret(secret: string): string {
  const key = keys().current;
  if (!key) throw new DomainError('integration_unconfigured', 'roxi.connect.error.unavailable');
  return seal(key, PURPOSE, secret);
}

function openSecret(sealed: string | null): string | null {
  if (!sealed) return null;
  const { current, previous } = keys();
  return unsealAny([current, previous], PURPOSE, sealed);
}

export type ConnectionView = {
  id: string;
  kind: ConnectorKind;
  label: string;
  detail: string;
  status: 'active' | 'error';
  /** False when the member's plan no longer includes this kind (kept, not used, until they upgrade or remove it). */
  allowed: boolean;
  toolCount: number;
  lastUsedAt: Date | null;
  lastError: string | null;
};

type Row = typeof roxiConnections.$inferSelect;

function kindAllowed(plan: RoxiPlanKey, kind: ConnectorKind): boolean {
  return (ROXI_PLANS[plan].connectorKinds as readonly string[]).includes(kind);
}

function toView(row: Row, plan: RoxiPlanKey): ConnectionView {
  const config = row.config as { url?: string; email?: string; tools?: unknown[] };
  const kind = row.kind as ConnectorKind;
  return {
    id: row.id,
    kind,
    label: row.label,
    detail: kind === 'google' ? (config.email ?? '') : config.url ? new URL(config.url).host : '',
    status: row.status === 'error' ? 'error' : 'active',
    allowed: kindAllowed(plan, kind),
    toolCount: kind === 'google' ? GOOGLE_TOOLS.length : kind === 'api' ? 1 : (config.tools?.length ?? 0),
    lastUsedAt: row.lastUsedAt,
    lastError: row.lastError,
  };
}

export async function listConnections(executor: Executor, userId: string): Promise<ConnectionView[]> {
  const plan = (await currentPlan(executor, userId)).plan;
  const rows = await executor.select().from(roxiConnections).where(eq(roxiConnections.userId, userId)).orderBy(roxiConnections.createdAt);
  return rows.map((row) => toView(row, plan));
}

async function assertRoom(executor: Executor, userId: string, kind: ConnectorKind): Promise<void> {
  if (!connectorsAvailable()) throw new DomainError('integration_unconfigured', 'roxi.connect.error.unavailable');
  const plan = (await currentPlan(executor, userId)).plan;
  if (!kindAllowed(plan, kind)) throw errors.conflict(kind === 'google' ? 'roxi.connect.error.needs_pro' : 'roxi.connect.error.needs_max');
  const [row] = await executor.select({ n: count() }).from(roxiConnections).where(eq(roxiConnections.userId, userId));
  if (Number(row?.n ?? 0) >= ROXI_PLANS[plan].connections) throw errors.conflict('roxi.connect.error.limit', { limit: ROXI_PLANS[plan].connections });
}

const cleanLabel = (label: string, fallback: string) => label.replace(/\s+/g, ' ').trim().slice(0, 60) || fallback;

/** Header lines a member may set for their own server or API: a name, and a value without line breaks. */
const HEADER_NAME = /^[A-Za-z0-9-]{1,40}$/;
const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'cookie', 'connection', 'transfer-encoding']);

function authHeaders(config: { headerName?: string; prefix?: string }, secret: string | null): Record<string, string> {
  if (!secret) return {};
  const name = config.headerName && HEADER_NAME.test(config.headerName) && !FORBIDDEN_HEADERS.has(config.headerName.toLowerCase()) ? config.headerName : 'Authorization';
  const prefix = config.prefix ?? (name === 'Authorization' ? 'Bearer' : '');
  return { [name]: prefix ? `${prefix} ${secret}` : secret };
}

function addressError(error: unknown): DomainError {
  if (error instanceof UnsafeAddressError) return errors.validation('roxi.connect.error.address');
  if (error instanceof McpError && error.message === 'unauthorized') return errors.validation('roxi.connect.error.unauthorized');
  return errors.validation('roxi.connect.error.unreachable');
}

/** An MCP server: checked by listing its tools before it is saved. */
export async function addMcpConnection(database: Database, userId: string, input: { label: string; url: string; token?: string; headerName?: string }): Promise<ConnectionView> {
  await assertRoom(database, userId, 'mcp');
  let url: URL;
  try {
    url = checkUrl(input.url);
  } catch (error) {
    throw addressError(error);
  }
  const secret = input.token?.trim() || null;
  if (secret && /[\r\n]/.test(secret)) throw errors.validation('roxi.connect.error.token');
  const config = { url: url.toString(), headerName: input.headerName?.trim() || undefined };
  let tools: McpTool[];
  try {
    tools = await listMcpTools(config.url, authHeaders(config, secret));
  } catch (error) {
    throw addressError(error);
  }
  const plan = (await currentPlan(database, userId)).plan;
  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(roxiConnections)
      .values({ userId, kind: 'mcp', label: cleanLabel(input.label, url.host), config: { ...config, tools }, secretSealed: secret ? sealSecret(secret) : null })
      .returning();
    await recordAudit(tx, { actorType: 'user', actorUserId: userId, action: 'roxi.connection.added', subjectType: 'roxi_connection', subjectId: row!.id, metadata: { kind: 'mcp', host: url.host } });
    return toView(row!, plan);
  });
}

/** An HTTPS API with a key. Roxi may call paths under its address only. */
export async function addApiConnection(
  database: Database,
  userId: string,
  input: { label: string; baseUrl: string; secret?: string; headerName?: string; prefix?: string; notes?: string },
): Promise<ConnectionView> {
  await assertRoom(database, userId, 'api');
  let url: URL;
  try {
    url = checkUrl(input.baseUrl);
  } catch (error) {
    throw addressError(error);
  }
  const secret = input.secret?.trim() || null;
  if (secret && /[\r\n]/.test(secret)) throw errors.validation('roxi.connect.error.token');
  const headerName = input.headerName?.trim() || undefined;
  if (headerName && (!HEADER_NAME.test(headerName) || FORBIDDEN_HEADERS.has(headerName.toLowerCase()))) throw errors.validation('roxi.connect.error.header');
  const prefix = input.prefix?.trim().slice(0, 20) || undefined;
  const base = url.toString().replace(/\/?$/, '/');
  const plan = (await currentPlan(database, userId)).plan;
  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(roxiConnections)
      .values({
        userId,
        kind: 'api',
        label: cleanLabel(input.label, url.host),
        config: { url: base, headerName, prefix, notes: input.notes?.trim().slice(0, 600) || undefined },
        secretSealed: secret ? sealSecret(secret) : null,
      })
      .returning();
    await recordAudit(tx, { actorType: 'user', actorUserId: userId, action: 'roxi.connection.added', subjectType: 'roxi_connection', subjectId: row!.id, metadata: { kind: 'api', host: url.host } });
    return toView(row!, plan);
  });
}

// --- Google -----------------------------------------------------------------

/** Where to send the member to grant access. The state names this member and expires in 10 minutes. */
export async function startGoogleConnect(executor: Executor, userId: string): Promise<string> {
  if (!google.googleConnectorAvailable()) throw new DomainError('integration_unconfigured', 'roxi.connect.error.google_unavailable');
  await assertRoom(executor, userId, 'google');
  const state = sealCookie('roxi-google-connect', { userId, nonce: randomUUID() }, 600);
  return google.googleAuthorizeUrl(state);
}

export async function finishGoogleConnect(database: Database, params: { userId: string; code: string; state: string }): Promise<ConnectionView> {
  const state = unsealCookie<{ userId: string }>('roxi-google-connect', params.state);
  if (!state || state.userId !== params.userId) throw errors.validation('roxi.connect.error.expired');
  await assertRoom(database, params.userId, 'google');
  const granted = await google.exchangeGoogleCode(params.code);
  const plan = (await currentPlan(database, params.userId)).plan;
  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(roxiConnections)
      .values({
        userId: params.userId,
        kind: 'google',
        label: granted.email ?? 'Google',
        config: { email: granted.email, scopes: granted.scopes.filter((scope) => google.GOOGLE_SCOPES.includes(scope)) },
        secretSealed: sealSecret(granted.refreshToken),
      })
      .returning();
    await recordAudit(tx, { actorType: 'user', actorUserId: params.userId, action: 'roxi.connection.added', subjectType: 'roxi_connection', subjectId: row!.id, metadata: { kind: 'google' } });
    return toView(row!, plan);
  });
}

/** Removes a connection; a Google grant is also revoked at Google. */
export async function removeConnection(database: Database, userId: string, id: string): Promise<void> {
  const row = await ownedConnection(database, userId, id);
  if (row.kind === 'google') {
    const token = (() => {
      try {
        return openSecret(row.secretSealed);
      } catch {
        return null;
      }
    })();
    if (token) await google.revokeGoogle(token);
  }
  await database.transaction(async (tx) => {
    await tx.delete(roxiConnections).where(eq(roxiConnections.id, row.id));
    await recordAudit(tx, { actorType: 'user', actorUserId: userId, action: 'roxi.connection.removed', subjectType: 'roxi_connection', subjectId: row.id, metadata: { kind: row.kind } });
  });
}

async function ownedConnection(executor: Executor, userId: string, id: string): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw errors.notFound('roxi_connection');
  const [row] = await executor.select().from(roxiConnections).where(and(eq(roxiConnections.id, id), eq(roxiConnections.userId, userId))).limit(1);
  if (!row) throw errors.notFound('roxi_connection');
  return row;
}

// --- What Roxi can do with them ----------------------------------------------

type ToolSpec = { name: string; description: string; parameters: Record<string, string>; changes: boolean };

const GOOGLE_TOOLS: ToolSpec[] = [
  { name: 'gmail_search', description: 'Search the member\'s Gmail. Returns sender, subject, date and a short snippet.', parameters: { query: 'Gmail search words, e.g. "from:banco is:unread"', max: 'number, 1-10' }, changes: false },
  { name: 'gmail_read', description: 'Read one email (plain text) by its id from gmail_search.', parameters: { id: 'message id' }, changes: false },
  { name: 'gmail_draft', description: 'Save an email as a draft in Gmail. The member reviews it there.', parameters: { to: 'address', subject: 'text', body: 'text' }, changes: true },
  { name: 'gmail_send', description: 'Send an email from the member\'s Gmail.', parameters: { to: 'address', subject: 'text', body: 'text' }, changes: true },
  { name: 'calendar_upcoming', description: 'The member\'s calendar events for the next days.', parameters: { days: 'number, 1-31' }, changes: false },
  { name: 'calendar_add', description: 'Add an event to the member\'s Google Calendar.', parameters: { title: 'text', start: 'ISO date-time with offset', end: 'ISO date-time with offset', description: 'optional text' }, changes: true },
];

const API_TOOL: ToolSpec = {
  name: 'request',
  description: 'Call the API at a path under its address. GET reads; anything else changes something.',
  parameters: { method: 'GET | POST | PUT | PATCH | DELETE', path: 'path under the API address, e.g. "v1/orders?status=open"', body: 'optional JSON object' },
  changes: false,
};

export type RoxiConnectorTool = { connection_id: string; connection: string; kind: ConnectorKind; tool: string; description: string; parameters: unknown; asks_member_first: boolean };

/** Every tool Roxi may use for this member now, across their connections. */
export async function connectorToolsFor(executor: Executor, userId: string): Promise<{ tools: RoxiConnectorTool[]; notes: Array<{ connection: string; notes: string }> }> {
  const plan = (await currentPlan(executor, userId)).plan;
  const rows = await executor.select().from(roxiConnections).where(eq(roxiConnections.userId, userId));
  const tools: RoxiConnectorTool[] = [];
  const notes: Array<{ connection: string; notes: string }> = [];
  for (const row of rows) {
    const kind = row.kind as ConnectorKind;
    if (!kindAllowed(plan, kind)) continue;
    const base = { connection_id: row.id, connection: row.label, kind };
    if (kind === 'google') for (const spec of GOOGLE_TOOLS) tools.push({ ...base, tool: spec.name, description: spec.description, parameters: spec.parameters, asks_member_first: spec.changes });
    if (kind === 'api') {
      tools.push({ ...base, tool: API_TOOL.name, description: API_TOOL.description, parameters: API_TOOL.parameters, asks_member_first: false });
      const note = (row.config as { notes?: string }).notes;
      if (note) notes.push({ connection: row.label, notes: note });
    }
    if (kind === 'mcp') {
      for (const tool of ((row.config as { tools?: McpTool[] }).tools ?? [])) {
        tools.push({ ...base, tool: tool.name, description: tool.description, parameters: tool.inputSchema, asks_member_first: !tool.readOnly });
      }
    }
  }
  return { tools, notes };
}

/** Re-reads an MCP server's tools (the member pressed "refresh", or a call named a tool the list does not have). */
export async function refreshMcpTools(database: Database, userId: string, id: string): Promise<number> {
  const row = await ownedConnection(database, userId, id);
  if (row.kind !== 'mcp') throw errors.validation('roxi.connect.error.kind');
  const config = row.config as { url: string; headerName?: string };
  try {
    const tools = await listMcpTools(config.url, authHeaders(config, openSecret(row.secretSealed)));
    await database.update(roxiConnections).set({ config: { ...row.config, tools }, status: 'active', lastError: null }).where(eq(roxiConnections.id, row.id));
    return tools.length;
  } catch (error) {
    await database.update(roxiConnections).set({ status: 'error', lastError: error instanceof Error ? error.message.slice(0, 200) : 'error' }).where(eq(roxiConnections.id, row.id));
    throw addressError(error);
  }
}

// --- Confirmation ------------------------------------------------------------

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function signature(userId: string, connectionId: string, tool: string, args: Record<string, unknown>, expires: number): string {
  return createHmac('sha256', serverEnv().SESSION_SECRET).update(`roxi-confirm|${userId}|${connectionId}|${tool}|${stable(args)}|${expires}`).digest('hex');
}

export function confirmationToken(userId: string, connectionId: string, tool: string, args: Record<string, unknown>, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + 300;
  return `${expires}.${signature(userId, connectionId, tool, args, expires)}`;
}

export function confirmationValid(token: string | undefined, userId: string, connectionId: string, tool: string, args: Record<string, unknown>, now = Date.now()): boolean {
  const [expiresText, given] = (token ?? '').split('.');
  const expires = Number(expiresText);
  if (!given || !Number.isInteger(expires) || expires < now / 1000) return false;
  const expected = Buffer.from(signature(userId, connectionId, tool, args, expires), 'hex');
  const actual = Buffer.from(given, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// --- Calling -------------------------------------------------------------------

export type CallOutcome =
  | { ok: true; result: unknown; untrusted: true }
  | { ok: false; needsConfirmation: true; confirmToken: string; summary: { connection: string; tool: string; lines: string[] } }
  | { ok: false; error: string };

const EMAIL_LIST = /^\s*[^\s@,<>"\r\n]+@[^\s@,<>"\r\n]+\.[^\s@,<>"\r\n]+(\s*,\s*[^\s@,<>"\r\n]+@[^\s@,<>"\r\n]+\.[^\s@,<>"\r\n]+){0,9}\s*$/;
const str = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
const oneLine = (value: unknown, max: number) => str(value, max).replace(/[\r\n]+/g, ' ').trim();

/** What the member sees before an action happens: plain lines, no markup. */
function describe(kind: ConnectorKind, tool: string, args: Record<string, unknown>): string[] {
  if (tool === 'gmail_draft' || tool === 'gmail_send') return [`→ ${oneLine(args.to, 300)}`, oneLine(args.subject, 200), str(args.body, 600)];
  if (tool === 'calendar_add') return [oneLine(args.title, 200), `${oneLine(args.start, 40)} – ${oneLine(args.end, 40)}`];
  if (kind === 'api') return [`${oneLine(args.method, 10).toUpperCase()} ${oneLine(args.path, 300)}`, args.body ? JSON.stringify(args.body).slice(0, 400) : ''];
  return [tool, JSON.stringify(args).slice(0, 500)];
}

function changes(kind: ConnectorKind, tool: string, args: Record<string, unknown>, row: Row): boolean {
  if (kind === 'google') return GOOGLE_TOOLS.find((spec) => spec.name === tool)?.changes ?? true;
  if (kind === 'api') return oneLine(args.method, 10).toUpperCase() !== 'GET';
  const known = ((row.config as { tools?: McpTool[] }).tools ?? []).find((spec) => spec.name === tool);
  return !known?.readOnly;
}

async function runGoogle(secret: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
  const access = await google.googleAccessToken(secret);
  switch (tool) {
    case 'gmail_search':
      return google.gmailSearch(access, oneLine(args.query, 200) || 'in:inbox', Number(args.max) || 5);
    case 'gmail_read':
      return google.gmailRead(access, oneLine(args.id, 64));
    case 'gmail_draft':
    case 'gmail_send': {
      const to = oneLine(args.to, 600);
      if (!EMAIL_LIST.test(to)) throw new DomainError('validation_failed', 'roxi.connect.error.address_to');
      const subject = oneLine(args.subject, 200);
      const body = str(args.body, 20_000);
      return tool === 'gmail_draft' ? google.gmailDraft(access, to, subject, body) : google.gmailSend(access, to, subject, body);
    }
    case 'calendar_upcoming':
      return google.calendarUpcoming(access, Number(args.days) || 7);
    case 'calendar_add': {
      const start = oneLine(args.start, 40);
      const end = oneLine(args.end, 40) || start;
      if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) throw new DomainError('validation_failed', 'roxi.connect.error.when');
      return google.calendarAdd(access, { title: oneLine(args.title, 200), start, end, description: str(args.description, 2_000) || undefined, timeZone: oneLine(args.time_zone, 60) || undefined });
    }
    default:
      throw new DomainError('validation_failed', 'roxi.connect.error.tool');
  }
}

async function runApi(row: Row, secret: string | null, args: Record<string, unknown>): Promise<unknown> {
  const config = row.config as { url: string; headerName?: string; prefix?: string };
  const method = oneLine(args.method, 10).toUpperCase() || 'GET';
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new DomainError('validation_failed', 'roxi.connect.error.method');
  const path = oneLine(args.path, 1_000).replace(/^\/+/, '');
  const target = new URL(path, config.url);
  // Only paths under the address the member gave: no "../", no other host.
  if (target.origin !== new URL(config.url).origin || !target.pathname.startsWith(new URL(config.url).pathname)) throw new DomainError('validation_failed', 'roxi.connect.error.path');
  const body = args.body === undefined || method === 'GET' ? undefined : JSON.stringify(args.body).slice(0, 50_000);
  const response = await safeRequest(target.toString(), {
    method,
    headers: { accept: 'application/json, text/plain;q=0.9, */*;q=0.5', ...(body ? { 'content-type': 'application/json' } : {}), ...authHeaders(config, secret) },
    body,
    maxBytes: 500_000,
  });
  return { status: response.status, body: response.body.slice(0, 6_000), truncated: response.truncated || response.body.length > 6_000 };
}

/**
 * One use of a connected tool for Roxi. A tool that changes something needs
 * the member's confirmation token; the first call returns what to show them.
 */
export async function callConnector(
  database: Database,
  userId: string,
  input: { connectionId: string; tool: string; args: Record<string, unknown>; confirmToken?: string },
): Promise<CallOutcome> {
  const row = await ownedConnection(database, userId, input.connectionId);
  const kind = row.kind as ConnectorKind;
  const plan = (await currentPlan(database, userId)).plan;
  if (!kindAllowed(plan, kind)) return { ok: false, error: kind === 'google' ? 'needs_pro_plan' : 'needs_max_plan' };
  const tool = oneLine(input.tool, 80);
  const args = input.args && typeof input.args === 'object' && !Array.isArray(input.args) ? input.args : {};
  if (changes(kind, tool, args, row) && !confirmationValid(input.confirmToken, userId, row.id, tool, args)) {
    return { ok: false, needsConfirmation: true, confirmToken: confirmationToken(userId, row.id, tool, args), summary: { connection: row.label, tool, lines: describe(kind, tool, args).filter(Boolean) } };
  }
  let secret: string | null;
  try {
    secret = openSecret(row.secretSealed);
  } catch {
    return { ok: false, error: 'reconnect_needed' };
  }
  try {
    let result: unknown;
    if (kind === 'google') result = await runGoogle(secret ?? '', tool, args);
    else if (kind === 'api') result = await runApi(row, secret, args);
    else {
      const config = row.config as { url: string; headerName?: string };
      result = await callMcpTool(config.url, authHeaders(config, secret), tool, args);
    }
    await database.update(roxiConnections).set({ lastUsedAt: new Date(), status: 'active', lastError: null }).where(eq(roxiConnections.id, row.id));
    if (meteringOn()) await spendCredits(database, { userId, credits: ROXI_CREDIT_RULES.connectorCall, reason: 'connector', reference: randomUUID() });
    if (changes(kind, tool, args, row)) {
      await recordAudit(database, { actorType: 'user', actorUserId: userId, action: 'roxi.connection.action', subjectType: 'roxi_connection', subjectId: row.id, metadata: { kind, tool } });
    }
    return { ok: true, result, untrusted: true };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.messageKey };
    const message = error instanceof Error ? error.message.slice(0, 200) : 'error';
    await database.update(roxiConnections).set({ status: 'error', lastError: message }).where(eq(roxiConnections.id, row.id));
    return { ok: false, error: error instanceof UnsafeAddressError ? 'unsafe_address' : /invalid_grant/.test(message) ? 'reconnect_needed' : 'failed' };
  }
}
