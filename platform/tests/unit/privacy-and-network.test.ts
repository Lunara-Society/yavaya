import { describe, expect, it } from 'vitest';
import { fuzzCoordinates, haversineKm } from '@/server/domains/geography/service';
import { clientAddress, clientAddressFromHeaders, describeNetwork } from '@/server/security/network';
import { statusKeyFor, cautionKeyFor } from '@/server/domains/trust/shield';
import { bandFor } from '@/server/domains/identity/risk';
import { RISK_RULES } from '@/config/business-rules';

const MANAGUA = { latitude: 12.1149, longitude: -86.2362 };

describe('location privacy', () => {
  it('reduces precision to what the user agreed to publish', () => {
    const city = fuzzCoordinates(MANAGUA, 'city');
    const neighborhood = fuzzCoordinates(MANAGUA, 'neighborhood');
    expect(city).not.toBeNull();
    expect(neighborhood).not.toBeNull();

    const cityError = haversineKm(MANAGUA.latitude, MANAGUA.longitude, city!.latitude, city!.longitude);
    const neighborhoodError = haversineKm(
      MANAGUA.latitude,
      MANAGUA.longitude,
      neighborhood!.latitude,
      neighborhood!.longitude,
    );

    // City precision must be coarser than neighborhood precision.
    expect(cityError).toBeGreaterThanOrEqual(neighborhoodError);
    expect(neighborhoodError).toBeLessThan(1);
  });

  it('is stable, so repeated reads cannot be averaged back to the true point', () => {
    const a = fuzzCoordinates(MANAGUA, 'city');
    const b = fuzzCoordinates(MANAGUA, 'city');
    expect(a).toEqual(b);
  });

  it('only returns the exact point at exact precision', () => {
    expect(fuzzCoordinates(MANAGUA, 'exact')).toEqual(MANAGUA);
    expect(fuzzCoordinates(MANAGUA, 'city')).not.toEqual(MANAGUA);
  });
});

describe('network signals', () => {
  it('hashes to a prefix, never storing the address itself', () => {
    const a = describeNetwork('190.53.7.14');
    const b = describeNetwork('190.53.7.200');
    const c = describeNetwork('190.53.8.14');

    expect(a.networkHash).toBe(b.networkHash); // same /24
    expect(a.networkHash).not.toBe(c.networkHash); // different /24
    expect(a.networkHash).not.toContain('190');
    expect(a.addressHash).not.toBe(b.addressHash);
  });

  it('groups IPv6 addresses by /48', () => {
    const a = describeNetwork('2001:db8:abcd:0012::1');
    const b = describeNetwork('2001:db8:abcd:ffff::9');
    const c = describeNetwork('2001:db8:abce:0012::1');
    expect(a.networkHash).toBe(b.networkHash);
    expect(a.networkHash).not.toBe(c.networkHash);
  });

  it('takes the client address from the right of the forwarded chain', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.9, 198.51.100.4, 10.0.0.1' });
    // With one trusted proxy, the rightmost entry is the one the edge appended.
    expect(clientAddressFromHeaders(headers, 1)).toBe('10.0.0.1');
    expect(clientAddressFromHeaders(headers, 2)).toBe('198.51.100.4');
  });

  it('reports unknown rather than inventing a value', () => {
    const unknown = describeNetwork(null);
    expect(unknown.networkHash).toBeNull();
    expect(unknown.family).toBe('unknown');
  });
});

describe('client address behind Cloudflare', () => {
  /*
   * Cloudflare in front of a platform edge is two hops, not one. The chain the
   * application sees is:
   *
   *   <what the client claimed>, <real client, added by Cloudflare>, <Cloudflare, added by the edge>
   */
  const CHAIN = 'x-forwarded-for';
  const spoofed = '9.9.9.9';
  const realClient = '203.0.113.77';
  const cloudflare = '172.71.0.10';

  it('resolves the real client through two proxies, ignoring what the client claimed', () => {
    const headers = new Headers({ [CHAIN]: `${spoofed}, ${realClient}, ${cloudflare}` });

    expect(
      clientAddress(headers, { trustedProxyCount: 2, header: 'forwarded' }),
    ).toBe(realClient);
  });

  it('collapses every visitor into one bucket when the count is left at 1', () => {
    // The failure this guards against is silent: nothing errors, rate limits
    // simply start applying to all of humanity at once.
    const headers = new Headers({ [CHAIN]: `${spoofed}, ${realClient}, ${cloudflare}` });

    expect(
      clientAddress(headers, { trustedProxyCount: 1, header: 'forwarded' }),
    ).toBe(cloudflare);
  });

  it('prefers the Cloudflare header when configured, regardless of hop count', () => {
    const headers = new Headers({
      [CHAIN]: `${spoofed}, ${realClient}, ${cloudflare}`,
      'cf-connecting-ip': realClient,
    });

    expect(
      clientAddress(headers, { trustedProxyCount: 1, header: 'cf-connecting-ip' }),
    ).toBe(realClient);
  });

  it('refuses to fall back to a chain it was told not to trust', () => {
    // A request that reaches the origin without passing through Cloudflare has
    // no cf-connecting-ip. Reading the forwarded chain instead would hand the
    // caller exactly the spoof the setting exists to prevent.
    const headers = new Headers({ [CHAIN]: spoofed });

    expect(
      clientAddress(headers, { trustedProxyCount: 1, header: 'cf-connecting-ip' }),
    ).toBeNull();
  });
});

describe('risk bands', () => {
  it('never lets a single signal reach the blocking threshold', () => {
    const heaviest = Math.max(...Object.values(RISK_RULES.weights));
    expect(heaviest).toBeLessThan(RISK_RULES.blockAt);
    expect(bandFor(heaviest)).not.toBe('block');
  });

  it('treats a shared-network match as near-noise', () => {
    expect(bandFor(RISK_RULES.weights.sameIpNetworkSharedRange)).toBe('low');
    expect(bandFor(RISK_RULES.weights.sameIpNetwork)).toBe('low');
  });

  it('escalates only when evidence accumulates', () => {
    const { phoneMatch, exactDeviceMatch, emailAliasMatch } = RISK_RULES.weights;
    expect(bandFor(phoneMatch)).toBe('elevated');
    expect(bandFor(phoneMatch + exactDeviceMatch)).toBe('review');
    expect(bandFor(phoneMatch + exactDeviceMatch + emailAliasMatch)).toBe('block');
  });
});

describe('trust shield derivation', () => {
  it('reports account state ahead of score', () => {
    expect(statusKeyFor({ status: 'banned', trustState: 'standard', score: 100 })).toBe(
      'trust.status.removed',
    );
    expect(statusKeyFor({ status: 'restricted', trustState: 'standard', score: 90 })).toBe(
      'trust.status.restricted',
    );
    expect(statusKeyFor({ status: 'active', trustState: 'monitored', score: 90 })).toBe(
      'trust.status.new_member',
    );
  });

  it('bands an established account by score', () => {
    expect(statusKeyFor({ status: 'active', trustState: 'standard', score: 94 })).toBe(
      'trust.status.trusted',
    );
    expect(statusKeyFor({ status: 'active', trustState: 'standard', score: 65 })).toBe(
      'trust.status.established',
    );
    expect(statusKeyFor({ status: 'active', trustState: 'standard', score: 45 })).toBe(
      'trust.status.new',
    );
  });

  it('cautions on very new accounts without explaining moderation', () => {
    expect(cautionKeyFor({ status: 'active', trustState: 'monitored', accountAgeDays: 0 })).toBe(
      'trust.caution.new_account',
    );
    expect(cautionKeyFor({ status: 'active', trustState: 'standard', accountAgeDays: 200 })).toBeNull();
  });
});
