import 'server-only';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

/**
 * HTTPS to an address a member typed (their MCP server, their API).
 *
 * The danger is the member pointing Roxi at Yavaya's own network — the
 * database, the cloud's metadata service, anything on a private address —
 * and reading the answer back. So:
 *
 * - https only, on the standard port or one the member wrote out;
 * - every address the name resolves to must be public, and the connection
 *   goes to the address that was checked (the check happens inside the
 *   socket's own look-up, so a name cannot resolve one way when checked and
 *   another when connected — DNS rebinding);
 * - no redirects followed (a redirect is an answer, not a new request);
 * - a time limit and a size limit on every answer.
 */

// Two lists: Node matches an IPv4 address against an IPv6 rule for ::ffff:0:0/96, which would block every IPv4 address.
const blocked = new BlockList();
const blocked6 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked6.addSubnet(network, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6) {
    // An IPv4 address written as IPv6 is judged as the IPv4 address it is.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return !blocked.check(mapped[1]!, 'ipv4');
    return !blocked6.check(address, 'ipv6');
  }
  return !blocked.check(address, 'ipv4');
}

export class UnsafeAddressError extends Error {}

/** Checks the shape of an address a member typed: https, a real host name, no credentials in it. */
export function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeAddressError('not a URL');
  }
  if (url.protocol !== 'https:') throw new UnsafeAddressError('https only');
  if (url.username || url.password) throw new UnsafeAddressError('no credentials in the address');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicAddress(host)) throw new UnsafeAddressError('private address');
  if (!isIP(host) && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) throw new UnsafeAddressError('not a public host name');
  if (/(^|\.)(localhost|local|internal|railway\.internal)$/i.test(host)) throw new UnsafeAddressError('private host name');
  return url;
}

/** The socket's look-up: resolves, and refuses unless every address is public. */
function guardedLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((entry) => !isPublicAddress(entry.address))) {
      return callback(Object.assign(new UnsafeAddressError(`${hostname} resolves to a private address`), { code: 'EUNSAFE' }), '', 0);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}

export type SafeResponse = { status: number; headers: Record<string, string>; body: string; truncated: boolean };

export async function safeRequest(
  raw: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxBytes?: number } = {},
): Promise<SafeResponse> {
  const url = checkUrl(raw);
  const maxBytes = init.maxBytes ?? 1_000_000;
  return new Promise<SafeResponse>((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: init.method ?? 'GET',
        headers: { 'user-agent': 'Yavaya-Roxi/1.0', ...(init.headers ?? {}), ...(init.body ? { 'content-length': String(Buffer.byteLength(init.body)) } : {}) },
        lookup: guardedLookup as never,
        timeout: init.timeoutMs ?? 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on('data', (chunk: Buffer) => {
          if (truncated) return;
          size += chunk.length;
          if (size > maxBytes) {
            truncated = true;
            chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - maxBytes))));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        const finish = () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) if (typeof value === 'string') headers[key.toLowerCase()] = value;
          resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString('utf8'), truncated });
        };
        res.on('end', finish);
        res.on('close', finish);
        res.on('error', (error) => (truncated ? finish() : reject(error)));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}
