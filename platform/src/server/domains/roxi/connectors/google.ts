import 'server-only';
import { serverEnv } from '@/config/env';

/**
 * The member's own Google account, connected to Roxi: Gmail and Calendar.
 *
 * Separate from "Continuar con Google" (sign-in asks only who you are). Here
 * the member grants read access to their mail, the right to write drafts and
 * send, and their calendar's events — each a Google permission screen they
 * see and can refuse. The refresh token is sealed at rest; access tokens live
 * only for one request.
 *
 * Gmail's scopes are "restricted" at Google: until Google has verified
 * Yavaya's use of them, the consent screen warns the member and at most 100
 * accounts can connect. That is the owner's step (CONFIGURATION.md, "Roxi's
 * connectors"), and ROXI_GOOGLE_CONNECTOR stays unset until the Gmail and
 * Calendar APIs are enabled and the address below is registered.
 */

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.events',
];

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export function googleConnectorAvailable(): boolean {
  const env = serverEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.ROXI_GOOGLE_CONNECTOR === 'enabled');
}

export const googleRedirectUri = () => `${serverEnv().APP_URL.replace(/\/$/, '')}/api/roxi/connectors/google/callback`;

export function googleAuthorizeUrl(state: string, loginHint?: string): string {
  const query = new URLSearchParams({
    client_id: serverEnv().GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    // A refresh token is only issued on consent; ask every time a member connects.
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `${AUTHORIZE_URL}?${query}`;
}

async function tokenRequest(body: Record<string, string>): Promise<Record<string, unknown>> {
  const env = serverEnv();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, ...body }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(`google token: ${String(data.error ?? response.status)}`);
  return data;
}

/** The code Google sent back, exchanged for tokens. Which scopes were really granted is read from the answer. */
export async function exchangeGoogleCode(code: string): Promise<{ refreshToken: string; accessToken: string; scopes: string[]; email: string | null }> {
  const data = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: googleRedirectUri() });
  if (typeof data.refresh_token !== 'string' || typeof data.access_token !== 'string') throw new Error('google token: no refresh token');
  const scopes = typeof data.scope === 'string' ? data.scope.split(' ') : [];
  let email: string | null = null;
  if (typeof data.id_token === 'string') {
    try {
      // Straight from Google's token endpoint over TLS: its claims need no second check here.
      const claims = JSON.parse(Buffer.from(data.id_token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string };
      email = claims.email ?? null;
    } catch {
      email = null;
    }
  }
  return { refreshToken: data.refresh_token, accessToken: data.access_token, scopes, email };
}

export async function googleAccessToken(refreshToken: string): Promise<string> {
  const data = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  if (typeof data.access_token !== 'string') throw new Error('google token: no access token');
  return data.access_token;
}

export async function revokeGoogle(refreshToken: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, { method: 'POST', signal: AbortSignal.timeout(8000) }).catch(() => undefined);
}

async function google(accessToken: string, url: string, init: { method?: string; body?: unknown } = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${accessToken}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const reason = (data.error as { status?: string; message?: string } | undefined)?.status ?? String(response.status);
    throw new Error(`google api: ${reason}`);
  }
  return data;
}

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDAR = 'https://www.googleapis.com/calendar/v3/calendars/primary';

type Header = { name?: string; value?: string };
const header = (headers: Header[] | undefined, name: string) => headers?.find((entry) => entry.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

export async function gmailSearch(accessToken: string, query: string, max: number) {
  const list = await google(accessToken, `${GMAIL}/messages?${new URLSearchParams({ q: query, maxResults: String(Math.min(Math.max(max, 1), 10)) })}`);
  const ids = ((list.messages as Array<{ id: string }> | undefined) ?? []).map((message) => message.id);
  const messages = await Promise.all(
    ids.map(async (id) => {
      const message = await google(accessToken, `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
      const headers = (message.payload as { headers?: Header[] } | undefined)?.headers;
      return { id, from: header(headers, 'From'), subject: header(headers, 'Subject'), date: header(headers, 'Date'), snippet: String(message.snippet ?? '').slice(0, 300) };
    }),
  );
  return messages;
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

function plainText(part: Part | undefined): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  for (const child of part.parts ?? []) {
    const text = plainText(child);
    if (text) return text;
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url')
      .toString('utf8')
      .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
  }
  return '';
}

export async function gmailRead(accessToken: string, id: string) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new Error('not a message id');
  const message = await google(accessToken, `${GMAIL}/messages/${id}?format=full`);
  const payload = message.payload as (Part & { headers?: Header[] }) | undefined;
  return {
    id,
    from: header(payload?.headers, 'From'),
    to: header(payload?.headers, 'To'),
    subject: header(payload?.headers, 'Subject'),
    date: header(payload?.headers, 'Date'),
    text: plainText(payload).trim().slice(0, 5_000),
  };
}

/** An RFC 2822 message, with the subject encoded so accents survive. */
function mime(to: string, subject: string, body: string): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  return Buffer.from([`To: ${to}`, `Subject: ${encodedSubject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', body].join('\r\n'), 'utf8').toString('base64url');
}

export async function gmailDraft(accessToken: string, to: string, subject: string, body: string) {
  const draft = await google(accessToken, `${GMAIL}/drafts`, { method: 'POST', body: { message: { raw: mime(to, subject, body) } } });
  return { draftId: String(draft.id ?? '') };
}

export async function gmailSend(accessToken: string, to: string, subject: string, body: string) {
  const sent = await google(accessToken, `${GMAIL}/messages/send`, { method: 'POST', body: { raw: mime(to, subject, body) } });
  return { messageId: String(sent.id ?? '') };
}

export async function calendarUpcoming(accessToken: string, days: number) {
  const now = new Date();
  const until = new Date(now.getTime() + Math.min(Math.max(days, 1), 31) * 86_400_000);
  const data = await google(
    accessToken,
    `${CALENDAR}/events?${new URLSearchParams({ timeMin: now.toISOString(), timeMax: until.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '15' })}`,
  );
  return ((data.items as Array<Record<string, unknown>> | undefined) ?? []).map((event) => ({
    title: String(event.summary ?? ''),
    start: String((event.start as { dateTime?: string; date?: string } | undefined)?.dateTime ?? (event.start as { date?: string } | undefined)?.date ?? ''),
    end: String((event.end as { dateTime?: string; date?: string } | undefined)?.dateTime ?? (event.end as { date?: string } | undefined)?.date ?? ''),
    where: String(event.location ?? ''),
  }));
}

export async function calendarAdd(accessToken: string, event: { title: string; start: string; end: string; description?: string; timeZone?: string }) {
  const created = await google(accessToken, `${CALENDAR}/events`, {
    method: 'POST',
    body: {
      summary: event.title,
      description: event.description,
      start: { dateTime: event.start, ...(event.timeZone ? { timeZone: event.timeZone } : {}) },
      end: { dateTime: event.end, ...(event.timeZone ? { timeZone: event.timeZone } : {}) },
    },
  });
  return { eventId: String(created.id ?? ''), link: String(created.htmlLink ?? '') };
}
