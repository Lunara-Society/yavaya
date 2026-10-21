import { db } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import { SITE_STATS_RULES } from '@/config/business-rules';
import { siteUrl } from '@/server/seo';
import { clientAddress, describeNetwork } from '@/server/security/network';
import { recordStats, statsDay, type StatsEvent } from '@/server/domains/stats/service';
import { AUTOMATED, cleanDevice, cleanPath, cleanSource, cleanVital } from '@/server/domains/stats/rules';

export const dynamic = 'force-dynamic';

/**
 * Where browsers report a page view and how fast the page was
 * (src/ui/components/site-metrics.tsx). Anyone can call it, so it trusts
 * nothing: every field is checked against a short list or a strict pattern,
 * a network may send only so much per minute, and the answer is always an
 * empty 204 — a caller learns nothing, not even whether it was counted.
 *
 * No address is stored. The address's keyed hash is held in this process's
 * memory for a minute, to count events against the limit, and then dropped.
 */

const MAX_BODY = 4096;
const MAX_EVENTS = 12;

const windowStart = { at: 0 };
const counts = new Map<string, number>();
const seenPaths = { day: '', paths: new Set<string>() };

function allowed(subject: string, events: number, now: number): boolean {
  if (now - windowStart.at > 60_000) {
    windowStart.at = now;
    counts.clear();
  }
  const used = (counts.get(subject) ?? 0) + events;
  counts.set(subject, used);
  return used <= SITE_STATS_RULES.eventsPerMinute;
}

/** Caps how many distinct page addresses one process accepts in a day; the rest count as "(other)". */
function knownPath(path: string, day: string): string {
  if (seenPaths.day !== day) {
    seenPaths.day = day;
    seenPaths.paths.clear();
  }
  if (seenPaths.paths.has(path)) return path;
  if (seenPaths.paths.size >= SITE_STATS_RULES.newPathsPerDay) return '(other)';
  seenPaths.paths.add(path);
  return path;
}

const nothing = () => new Response(null, { status: 204 });

export async function POST(request: Request) {
  // Only pages of this site report; a cross-site form or script is ignored.
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return nothing();
  if (AUTOMATED.test(request.headers.get('user-agent') ?? '')) return nothing();

  const text = await request.text().catch(() => '');
  if (!text || text.length > MAX_BODY) return nothing();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return nothing();
  }
  const raw = (body as { events?: unknown })?.events;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_EVENTS) return nothing();

  const env = serverEnv();
  const network = describeNetwork(clientAddress(request.headers, { trustedProxyCount: env.TRUSTED_PROXY_COUNT, header: env.CLIENT_IP_HEADER }));
  const now = new Date();
  if (!allowed(network.addressHash ?? 'unknown', raw.length, now.getTime())) return nothing();

  const own = new URL(siteUrl()).hostname;
  const ownHosts = [own, own.startsWith('www.') ? own.slice(4) : `www.${own}`, new URL(request.url).hostname];
  const day = statsDay(now);
  const events: StatsEvent[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object') continue;
    const path = cleanPath(item.p);
    const device = cleanDevice(item.d);
    if (!path || !device) continue;
    if (item.k === 'view') {
      const source = cleanSource(item.s, ownHosts);
      if (source === null) continue;
      // A visit begins only when someone arrives from outside.
      events.push({ kind: 'view', path: knownPath(path, day), device, source, entry: item.e === true && source !== '' });
    } else if (item.k === 'vital') {
      const vital = cleanVital(item.m, item.v);
      if (vital) events.push({ kind: 'vital', path: knownPath(path, day), device, ...vital });
    }
  }
  if (events.length) await recordStats(db(), events, now).catch(() => undefined);
  return nothing();
}
