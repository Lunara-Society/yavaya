import { signalHash } from './crypto';

/**
 * Network signal handling.
 *
 * Yavaya never stores a raw IP address. What it stores is a keyed hash of a
 * *network prefix* — /24 for IPv4, /48 for IPv6 — which is enough to notice
 * "these two accounts came from the same network" without retaining the
 * address itself.
 *
 * This signal is deliberately weak. Shared Wi-Fi, families, businesses, VPNs,
 * mobile carriers and public networks all produce matches between unrelated
 * people, so a network match may contribute to a risk score and may never on
 * its own restrict an account.
 */

export type ClientNetwork = {
  /** Hash of the /24 or /48 prefix. Null when no address could be determined. */
  networkHash: string | null;
  /** Hash of the full address, for rate limiting only — never for matching. */
  addressHash: string | null;
  family: 'ipv4' | 'ipv6' | 'unknown';
};

export function describeNetwork(rawAddress: string | null | undefined): ClientNetwork {
  const address = (rawAddress ?? '').trim();
  if (!address) return { networkHash: null, addressHash: null, family: 'unknown' };

  const addressHash = signalHash('ip', address);

  if (isIpv4(address)) {
    const prefix = address.split('.').slice(0, 3).join('.');
    return { networkHash: signalHash('net4', `${prefix}.0/24`), addressHash, family: 'ipv4' };
  }

  if (address.includes(':')) {
    const groups = expandIpv6(address);
    if (groups) {
      const prefix = groups.slice(0, 3).join(':');
      return { networkHash: signalHash('net6', `${prefix}::/48`), addressHash, family: 'ipv6' };
    }
  }

  return { networkHash: null, addressHash, family: 'unknown' };
}

/**
 * Extracts the client address from proxy headers.
 *
 * `X-Forwarded-For` is attacker-controlled unless the edge overwrites it, so
 * the index is counted from the *right*, skipping the number of trusted
 * proxies in front of the application. Configure `trustedProxyCount` to match
 * the deployment — see docs/CONFIGURATION.md.
 */
export function clientAddressFromHeaders(
  headers: { get(name: string): string | null },
  trustedProxyCount = 1,
): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const chain = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const index = chain.length - 1 - Math.max(0, trustedProxyCount - 1);
    const candidate = chain[Math.max(0, index)];
    if (candidate) return stripPort(candidate);
  }
  const real = headers.get('x-real-ip');
  return real ? stripPort(real.trim()) : null;
}

export type ClientAddressConfig = {
  /**
   * How many proxies sit in front of the application. Each one appends to
   * `X-Forwarded-For`, so this is what decides which entry in the chain is the
   * real client rather than a value the client wrote themselves.
   */
  trustedProxyCount: number;
  /**
   * Which header carries the client address.
   *
   * `cf-connecting-ip` is set and overwritten by Cloudflare on every proxied
   * request, so it does not depend on counting hops correctly — useful because
   * adding or removing a proxy silently changes the right count, and a wrong
   * count is not a visible failure.
   */
  header: 'forwarded' | 'cf-connecting-ip';
};

/**
 * The client address for this deployment's proxy topology.
 *
 * Getting this wrong is not a crash, which is what makes it dangerous. Too low
 * a count and a client can spoof its own address to defeat rate limiting. Too
 * high, or the wrong header, and *every* visitor resolves to the proxy's
 * address — one shared bucket, where a single abuser exhausts the limit for
 * everyone and per-account limits stop existing.
 *
 * Behind Cloudflare in front of another host there are two hops, not one.
 *
 * Neither setting can defend an origin that is still reachable without going
 * through the proxy: anyone who finds the host directly can write these
 * headers themselves. That is a matter of rate-limit accuracy rather than
 * authentication — sessions and permissions do not consult this — but it is
 * the reason the origin hostname is worth keeping quiet.
 */
export function clientAddress(
  headers: { get(name: string): string | null },
  config: ClientAddressConfig,
): string | null {
  if (config.header === 'cf-connecting-ip') {
    const connecting = headers.get('cf-connecting-ip');
    if (connecting) return stripPort(connecting.trim());
    // No fall-through to X-Forwarded-For. The header is absent because the
    // request did not come through Cloudflare, and honouring a chain the
    // configuration says not to trust is how a bypass becomes a spoof.
    return null;
  }

  return clientAddressFromHeaders(headers, config.trustedProxyCount);
}

function stripPort(value: string): string {
  // IPv4 with port, or bracketed IPv6 with port.
  if (value.startsWith('[')) {
    const close = value.indexOf(']');
    return close > 0 ? value.slice(1, close) : value;
  }
  const parts = value.split(':');
  return parts.length === 2 && isIpv4(parts[0] as string) ? (parts[0] as string) : value;
}

function isIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** Returns the eight 16-bit groups of an IPv6 address, or null if malformed. */
function expandIpv6(value: string): string[] | null {
  const address = value.split('%')[0] ?? value;
  const halves = address.split('::');
  if (halves.length > 2) return null;

  const head = (halves[0] ?? '').split(':').filter(Boolean);
  const tail = halves.length === 2 ? (halves[1] ?? '').split(':').filter(Boolean) : [];

  if (halves.length === 1) {
    return head.length === 8 ? head.map(pad) : null;
  }

  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  return [...head, ...Array<string>(missing).fill('0'), ...tail].map(pad);
}

function pad(group: string): string {
  return group.toLowerCase().padStart(4, '0');
}
