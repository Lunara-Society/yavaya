import 'server-only';
import { lookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/**
 * Where the server may connect when a member hands it an address.
 *
 * Fetching a link for a member (a photo by URL) makes the server a client
 * that anyone can point. Pointed inward, it reaches what the internet cannot:
 * Railway's private network, the database, a cloud metadata endpoint, the
 * server itself. So only public unicast addresses are allowed, and the check
 * runs at connect time on every address a name resolves to: a name that
 * answers one way when asked and another when connected to (DNS rebinding)
 * gains nothing, and each redirect is checked again because each one is a
 * new connection.
 */

const NOT_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, where cloud metadata endpoints live
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['2001::', 23], // protocol assignments, Teredo among them
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4, which can carry any IPv4 address inside it
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, 'ipv6');
}

// Global unicast IPv6 is 2000::/3; everything else (loopback, unique-local
// fd00::/8 that Railway's private network uses, link-local, multicast,
// NAT64) is outside it.
const GLOBAL_IPV6 = new BlockList();
GLOBAL_IPV6.addSubnet('2000::', 3, 'ipv6');

/** True only for an address anyone on the internet could reach. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !NOT_PUBLIC.check(address, 'ipv4');
  if (family === 6) {
    // BlockList judges an IPv4-mapped address (::ffff:127.0.0.1) by the IPv4 rules itself.
    if (NOT_PUBLIC.check(address, 'ipv6')) return false;
    return GLOBAL_IPV6.check(address, 'ipv6');
  }
  return false;
}

export class BlockedAddressError extends Error {
  constructor() {
    super('connection to a non-public address refused');
    this.name = 'BlockedAddressError';
  }
}

/**
 * A DNS lookup for `http(s).request` that refuses a name if any address it
 * resolves to fails `allow`. Literal IP hosts never reach a lookup, so the
 * caller checks those itself.
 */
export function guardedLookup(allow: (address: string) => boolean = isPublicAddress): LookupFunction {
  return (hostname, options, callback) => {
    lookup(hostname, { ...options, all: true }, (error, found) => {
      const addresses = (found ?? []) as LookupAddress[];
      if (error) return callback(error, '', 0);
      if (addresses.length === 0 || addresses.some((entry) => !allow(entry.address))) {
        return callback(new BlockedAddressError() as NodeJS.ErrnoException, '', 0);
      }
      if (options.all) return callback(null, addresses);
      return callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}
