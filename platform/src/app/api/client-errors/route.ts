import { serverEnv } from '@/config/env';
import { clientAddress, describeNetwork } from '@/server/security/network';
import { AUTOMATED } from '@/server/domains/stats/rules';
import { sentryDsn } from '@/server/observability/sentry';
import { isSilentPath, scrubText, scrubUrl } from '@/server/observability/scrub';

export const dynamic = 'force-dynamic';

/**
 * Where browsers report an error that happened on the page
 * (src/ui/components/client-error-report.ts). Forwarded to Sentry from here,
 * so members' browsers never talk to Sentry and the page carries no SDK.
 *
 * Anyone can call it, so like /api/metrics it trusts nothing and always
 * answers an empty 204. Every field is cut to length and scrubbed, a network
 * may send only a few per minute, and nothing is stored here.
 */

const MAX_BODY = 6000;
const PER_MINUTE = 10;
const KINDS = new Set(['boundary', 'error', 'rejection']);

const minute = { at: 0 };
const counts = new Map<string, number>();

function allowed(subject: string, now: number): boolean {
  if (now - minute.at > 60_000) {
    minute.at = now;
    counts.clear();
  }
  const used = (counts.get(subject) ?? 0) + 1;
  counts.set(subject, used);
  return used <= PER_MINUTE;
}

/** /members/3f2a…/x → /members/[id]/x: an id says which thing, and the report needs only which page. */
function routeOf(path: string): string {
  return scrubUrl(path)
    .split('/')
    .map((part) => (/^[0-9a-f-]{16,}$/i.test(part) || /\d{4,}/.test(part) || part.length > 40 ? '[id]' : part))
    .join('/');
}

const nothing = () => new Response(null, { status: 204 });

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export async function POST(request: Request) {
  if (!sentryDsn()) return nothing();
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return nothing();
  const agent = request.headers.get('user-agent') ?? '';
  if (AUTOMATED.test(agent)) return nothing();

  const raw = await request.text().catch(() => '');
  if (!raw || raw.length > MAX_BODY) return nothing();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return nothing();
  }
  if (!body || typeof body !== 'object') return nothing();
  const kind = text(body.kind, 20);
  const message = scrubText(text(body.message, 500));
  if (!KINDS.has(kind) || !message) return nothing();

  const env = serverEnv();
  const network = describeNetwork(clientAddress(request.headers, { trustedProxyCount: env.TRUSTED_PROXY_COUNT, header: env.CLIENT_IP_HEADER }));
  if (!allowed(network.addressHash ?? 'unknown', Date.now())) return nothing();

  const name = text(body.name, 80).replace(/[^\w.$-]/g, '') || 'Error';
  const path = routeOf(text(body.path, 200));
  if (isSilentPath(path)) return nothing();
  const stack = scrubText(text(body.stack, 3000));

  const Sentry = await import('@sentry/nextjs');
  Sentry.captureEvent({
    level: 'error',
    // Not 'javascript': Sentry fills in the sender's IP address for events
    // marked as coming from a browser, and the privacy page promises none.
    platform: 'node',
    exception: { values: [{ type: name, value: message }] },
    tags: { service: 'web', runtime: 'browser', kind, path },
    extra: { stack },
    request: { url: path, headers: { 'user-agent': agent.slice(0, 300) } },
    // Grouped by what broke and where, not by every phone it broke on.
    fingerprint: ['browser', name, message.replace(/\d+/g, 'N').slice(0, 160), path],
  });
  return nothing();
}
