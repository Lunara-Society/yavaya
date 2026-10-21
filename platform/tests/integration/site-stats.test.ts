import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/server/db/client';
import { pageViewsDaily, webVitalsDaily } from '@/server/db/schema';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { purgeSiteStats, recordStats, siteStats, statsDay } from '@/server/domains/stats/service';
import { SITE_STATS_RULES } from '@/config/business-rules';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'stats-test', deviceFingerprint: null, userAgent: 'vitest' };
const DAY = 24 * 60 * 60 * 1000;

async function member(name = 'Rosa'): Promise<string> {
  const created = await register(db(), { email: `s-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: name, locale: 'es', acceptedTerms: true }, context);
  return created.userId;
}

beforeEach(resetTransactionalData);
afterAll(closeDb);

describe('Visit statistics', () => {
  it('adds up views, visits and speed per day, page, screen and source', async () => {
    const now = new Date();
    await recordStats(db(), [
      { kind: 'view', path: '/', device: 'phone', source: 'google', entry: true },
      { kind: 'view', path: '/', device: 'phone', source: 'google', entry: true },
      { kind: 'view', path: '/mercadito', device: 'phone', source: '', entry: false },
      { kind: 'vital', path: '/', device: 'phone', metric: 'LCP', value: 2000 },
      { kind: 'vital', path: '/', device: 'phone', metric: 'LCP', value: 5000 },
    ], now);
    // A second batch for the same keys adds to the same rows.
    await recordStats(db(), [{ kind: 'view', path: '/', device: 'desktop', source: 'direct', entry: true }, { kind: 'vital', path: '/', device: 'phone', metric: 'LCP', value: 3000 }], now);

    const views = await db().select().from(pageViewsDaily);
    expect(views.find((row) => row.path === '/' && row.source === 'google')).toMatchObject({ day: statsDay(now), views: 2, entries: 2 });
    expect(views.find((row) => row.path === '/mercadito')).toMatchObject({ views: 1, entries: 0 });
    const [lcp] = await db().select().from(webVitalsDaily);
    expect(lcp).toMatchObject({ metric: 'LCP', good: 1, needsImprovement: 1, poor: 1, total: 10000 });

    const owner = await member('Dueña');
    await db().transaction((tx) => grantRole(tx, { userId: owner, roleKey: 'admin', grantedBy: null }));
    const stats = await siteStats(db(), { userId: owner, status: 'active' }, { days: 7, now });
    expect(stats.totals).toEqual({ views: 4, visits: 3 });
    expect(stats.sources).toEqual([
      { source: 'google', visits: 2 },
      { source: 'direct', visits: 1 },
    ]);
    expect(stats.pages[0]).toEqual({ path: '/', views: 3, visits: 3 });
    const phoneLcp = stats.vitals.phone.find((v) => v.metric === 'LCP')!;
    expect(phoneLcp).toMatchObject({ good: 1, needsImprovement: 1, poor: 1, samples: 3, average: 10000 / 3 });
    // The funnel counts the accounts themselves: the owner's own account was created today.
    expect(stats.funnel).toMatchObject({ visits: 3, accounts: 1, verified: 0, acted: 0 });
    expect(stats.countingSince).toBe(statsDay(now));
  });

  it('is for roles.manage only', async () => {
    const mod = await member();
    await db().transaction((tx) => grantRole(tx, { userId: mod, roleKey: 'moderator', grantedBy: null }));
    await expect(siteStats(db(), { userId: mod, status: 'active' }, { days: 7 })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(siteStats(db(), null, { days: 7 })).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('deletes counts older than the rules keep them', async () => {
    const now = new Date();
    await recordStats(db(), [{ kind: 'view', path: '/', device: 'phone', source: 'direct', entry: true }], new Date(now.getTime() - (SITE_STATS_RULES.keepDays + 2) * DAY));
    await recordStats(db(), [{ kind: 'view', path: '/', device: 'phone', source: 'direct', entry: true }], now);
    expect(await purgeSiteStats(db(), now)).toEqual({ views: 1, vitals: 0 });
    expect(await db().select().from(pageViewsDaily)).toHaveLength(1);
  });
});
