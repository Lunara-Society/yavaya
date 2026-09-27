import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { closeDb, db, type Database, type Executor } from '../client';
import {
  billableActions,
  districts as districtsTable,
  featureFlags,
  locations,
  permissions as permissionsTable,
  reputationRules,
  rolePermissions,
  roles as rolesTable,
  systemSettings,
  tokenAccounts,
  tokenPackages,
  tokenLedger,
  users,
} from '../schema';
import {
  DEMO_CONTENT_RULES,
  NEW_USER_RULES,
  REPUTATION_RULE_DEFAULTS,
  RISK_RULES,
  TOKEN_PACKAGES,
  TOKEN_RULES,
} from '@/config/business-rules';
import { districtList } from '@/config/districts';
import { operationalEnv } from '@/config/env';
import { PERMISSIONS, SYSTEM_ROLES } from '@/server/domains/access/permissions';
import { TREASURY_HANDLE } from '@/server/domains/tokens/service';
import { recordAudit } from '@/server/domains/audit/service';
import { grantRole } from '@/server/domains/access/authorize';
import { canonicalEmail } from '@/server/domains/identity/normalize';
import { GEOGRAPHY_SEED } from './geography-data';

/**
 * Idempotent seed.
 *
 * Running it twice must leave the database in the same state as running it
 * once. Everything below therefore upserts, and nothing creates a user account
 * or hands out tokens to anyone who has not registered.
 */

async function seedGeography(database: Database): Promise<void> {
  for (const [regionIndex, region] of GEOGRAPHY_SEED.entries()) {
    await upsertLocation(database, {
      code: region.code,
      name: region.name,
      names: region.names,
      level: 'region',
      parentCode: null,
      path: [],
      depth: 0,
      sortOrder: regionIndex,
      isSupportedMarket: false,
    });

    for (const [countryIndex, country] of region.countries.entries()) {
      await upsertLocation(database, {
        code: country.code,
        name: country.name,
        names: country.names ?? { es: country.name, en: country.name },
        level: 'country',
        parentCode: region.code,
        path: [region.code],
        depth: 1,
        isoCode: country.isoCode,
        phonePrefix: country.phonePrefix,
        currencyCode: country.currencyCode,
        timezone: country.timezone,
        sortOrder: countryIndex,
        isSupportedMarket: country.supported,
      });

      for (const [stateIndex, state] of country.states.entries()) {
        await upsertLocation(database, {
          code: state.code,
          name: state.name,
          level: 'state',
          parentCode: country.code,
          path: [region.code, country.code],
          depth: 2,
          isoCode: state.isoCode ?? null,
          timezone: country.timezone,
          sortOrder: stateIndex,
          isSupportedMarket: country.supported,
        });

        for (const [cityIndex, city] of (state.cities ?? []).entries()) {
          await upsertLocation(database, {
            code: city.code,
            name: city.name,
            level: city.level ?? 'city',
            parentCode: state.code,
            path: [region.code, country.code, state.code],
            depth: 3,
            latitude: city.lat ?? null,
            longitude: city.lon ?? null,
            timezone: country.timezone,
            sortOrder: cityIndex,
            isSupportedMarket: country.supported,
          });
        }
      }
    }
  }
}

async function upsertLocation(
  executor: Executor,
  input: {
    code: string;
    name: string;
    names?: Record<string, string>;
    level: 'region' | 'country' | 'state' | 'city' | 'town' | 'village' | 'neighborhood';
    parentCode: string | null;
    path: string[];
    depth: number;
    isoCode?: string | null;
    phonePrefix?: string | null;
    currencyCode?: string | null;
    timezone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    sortOrder?: number;
    isSupportedMarket?: boolean;
  },
): Promise<void> {
  let parentId: string | null = null;
  if (input.parentCode) {
    const [parent] = await executor
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.code, input.parentCode))
      .limit(1);
    parentId = parent?.id ?? null;
  }

  await executor
    .insert(locations)
    .values({
      code: input.code,
      name: input.name,
      names: input.names ?? {},
      level: input.level,
      parentId,
      path: input.path,
      depth: input.depth,
      isoCode: input.isoCode ?? null,
      phonePrefix: input.phonePrefix ?? null,
      currencyCode: input.currencyCode ?? null,
      timezone: input.timezone ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      sortOrder: input.sortOrder ?? 0,
      isSupportedMarket: input.isSupportedMarket ?? false,
    })
    .onConflictDoUpdate({
      target: locations.code,
      set: {
        name: input.name,
        names: input.names ?? {},
        parentId,
        path: input.path,
        depth: input.depth,
        isoCode: input.isoCode ?? null,
        phonePrefix: input.phonePrefix ?? null,
        currencyCode: input.currencyCode ?? null,
        timezone: input.timezone ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        sortOrder: input.sortOrder ?? 0,
        isSupportedMarket: input.isSupportedMarket ?? false,
        updatedAt: new Date(),
      },
    });
}

async function seedAccessControl(database: Database): Promise<void> {
  for (const [key, domain] of Object.entries(PERMISSIONS)) {
    await database
      .insert(permissionsTable)
      .values({ key, domain, description: key })
      .onConflictDoUpdate({ target: permissionsTable.key, set: { domain } });
  }

  for (const [key, role] of Object.entries(SYSTEM_ROLES)) {
    await database
      .insert(rolesTable)
      .values({ key, name: role.name, description: role.description, isSystem: true })
      .onConflictDoUpdate({
        target: rolesTable.key,
        set: { name: role.name, description: role.description, isSystem: true },
      });

    for (const permissionKey of role.permissions) {
      await database
        .insert(rolePermissions)
        .values({ roleKey: key, permissionKey })
        .onConflictDoNothing();
    }
  }
}

async function seedDistricts(database: Database): Promise<void> {
  for (const [index, district] of districtList.entries()) {
    await database
      .insert(districtsTable)
      .values({
        key: district.key,
        slug: district.slug,
        phase: district.phase,
        status: district.status,
        // A district is only enabled once it is actually built. Phase 0 ships
        // the platform, so every district starts disabled — the navigation
        // must never offer something that does not exist.
        enabled: false,
        sortOrder: index,
      })
      .onConflictDoUpdate({
        target: districtsTable.key,
        set: {
          slug: district.slug,
          phase: district.phase,
          status: district.status,
          sortOrder: index,
          updatedAt: new Date(),
        },
      });
  }
}

async function seedTokenConfiguration(database: Database): Promise<void> {
  for (const pkg of TOKEN_PACKAGES) {
    // The 100-token package is seeded disabled: it exceeds the per-purchase
    // ceiling, so it exists in the catalogue but is never offered.
    const enabled = pkg.enabled && pkg.tokens <= TOKEN_RULES.maxTokensPerPurchase;
    await database
      .insert(tokenPackages)
      .values({
        key: pkg.key,
        tokens: pkg.tokens,
        priceMinor: pkg.priceMinor,
        currency: pkg.currency,
        enabled,
        sortOrder: pkg.sortOrder,
      })
      .onConflictDoUpdate({
        target: tokenPackages.key,
        set: { tokens: pkg.tokens, priceMinor: pkg.priceMinor, enabled, sortOrder: pkg.sortOrder },
      });
  }

  /**
   * Billable actions: the closed set of things that may cost a token.
   * Publishing qualifying content costs 1. Browsing, searching, messaging,
   * reporting and asking for help cost nothing — charging for those would
   * price people out of the parts of Yavaya that exist to help them.
   */
  const actions = [
    { key: 'mercadito.publish_listing', district: 'mercadito', cost: 1, description: 'Publish a Mercadito listing' },
    { key: 'services.publish_request', district: 'services', cost: 1, description: 'Publish a service request' },
    { key: 'services.publish_offer', district: 'services', cost: 1, description: 'Publish a service offer' },
    { key: 'works.publish_project', district: 'works', cost: 1, description: 'Publish a Works project' },
    { key: 'community.publish_request', district: 'community', cost: 0, description: 'Publish a community support request (free)' },
    { key: 'impact.publish_cause', district: 'impact', cost: 0, description: 'Submit a cause for review (free)' },
    { key: 'animals.publish_listing', district: 'animals', cost: 0, description: 'Publish an animal welfare listing (free)' },
  ];

  for (const action of actions) {
    await database
      .insert(billableActions)
      .values({ ...action, enabled: true })
      .onConflictDoUpdate({
        target: billableActions.key,
        set: { cost: action.cost, description: action.description, updatedAt: new Date() },
      });
  }
}

async function seedReputationRules(database: Database): Promise<void> {
  for (const rule of REPUTATION_RULE_DEFAULTS) {
    await database
      .insert(reputationRules)
      .values({
        key: rule.key,
        delta: rule.delta,
        cooldownSeconds: rule.cooldownSeconds,
        maxPerDay: rule.maxPerDay,
        enabled: rule.enabled,
        description: rule.key,
      })
      // Deliberately does not overwrite an existing rule: once operations have
      // tuned a weight, re-running the seed must not silently reset it.
      .onConflictDoNothing({ target: reputationRules.key });
  }
}

async function seedSettings(database: Database): Promise<void> {
  const settings: Array<{ key: string; value: unknown; description: string }> = [
    { key: 'identity.monitoring_window_hours', value: NEW_USER_RULES.monitoringWindowHours, description: 'Enhanced monitoring window for new accounts' },
    { key: 'identity.monitoring_alert_risk_score', value: NEW_USER_RULES.monitoringAlertRiskScore, description: 'Risk score that raises an admin alert during monitoring' },
    { key: 'risk.review_at', value: RISK_RULES.reviewAt, description: 'Risk score that opens a manual review case' },
    { key: 'risk.block_at', value: RISK_RULES.blockAt, description: 'Risk score that restricts an action pending review' },
    { key: 'tokens.max_per_purchase', value: TOKEN_RULES.maxTokensPerPurchase, description: 'Maximum tokens deliverable by one purchase' },
    { key: 'tokens.starter_per_day', value: TOKEN_RULES.starterGrantPerDay, description: 'Starter tokens granted per 24h period' },
    { key: 'tokens.starter_days', value: TOKEN_RULES.starterGrantDays, description: 'Number of days the starter allocation runs' },
    { key: 'tokens.starter_maximum', value: TOKEN_RULES.starterGrantMaximum, description: 'Total starter allocation cap' },
    { key: 'demo.lifetime_days', value: DEMO_CONTENT_RULES.defaultLifetimeDays, description: 'Days before demo content expires' },
    { key: 'demo.real_inventory_threshold', value: DEMO_CONTENT_RULES.realInventoryThreshold, description: 'Real items per district that end demo mode early' },
  ];

  for (const setting of settings) {
    await database
      .insert(systemSettings)
      .values({ key: setting.key, value: setting.value as never, description: setting.description })
      .onConflictDoNothing({ target: systemSettings.key });
  }

  await database
    .insert(featureFlags)
    .values({
      key: 'demo_mode',
      enabled: DEMO_CONTENT_RULES.defaultEnabled,
      description: 'Show explicitly-marked demo content during launch',
    })
    .onConflictDoNothing({ target: featureFlags.key });
}

/**
 * Opens the administrative treasury with its 50,000 tokens.
 *
 * The opening balance is a ledger entry like any other, so total supply stays
 * reconcilable and the treasury's history starts from a recorded event rather
 * than an unexplained number.
 */
async function seedTreasury(database: Database): Promise<void> {
  await database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: tokenAccounts.id })
      .from(tokenAccounts)
      .where(eq(tokenAccounts.handle, TREASURY_HANDLE))
      .limit(1);

    if (existing) return;

    const [account] = await tx
      .insert(tokenAccounts)
      .values({ kind: 'treasury', handle: TREASURY_HANDLE, balance: 0 })
      .returning({ id: tokenAccounts.id });

    if (!account) throw new Error('treasury account insert returned no row');

    await tx
      .update(tokenAccounts)
      .set({
        balance: TOKEN_RULES.adminTreasuryOpeningBalance,
        lifetimeEarned: TOKEN_RULES.adminTreasuryOpeningBalance,
      })
      .where(eq(tokenAccounts.id, account.id));

    await tx.insert(tokenLedger).values({
      accountId: account.id,
      delta: TOKEN_RULES.adminTreasuryOpeningBalance,
      balanceAfter: TOKEN_RULES.adminTreasuryOpeningBalance,
      reason: 'admin_grant',
      idempotencyKey: 'treasury:opening_balance',
      note: 'Treasury opening balance',
    });

    await recordAudit(tx, {
      actorType: 'system',
      action: 'tokens.treasury_opened',
      subjectType: 'token_account',
      subjectId: account.id,
      metadata: { openingBalance: TOKEN_RULES.adminTreasuryOpeningBalance },
    });
  });
}

/**
 * Administrator bootstrap.
 *
 * This grants the `admin` role *server-side* to the configured address, and
 * only if that account already exists — the seed never creates a login, never
 * sets a password, and never trusts an email address supplied by a client.
 * The administrator registers through the normal flow; this promotes them.
 */
async function bootstrapAdministrator(database: Database): Promise<void> {
  const email = canonicalEmail(operationalEnv().PRIMARY_ADMIN_EMAIL);

  const [admin] = await database
    .select({ id: users.id, yayId: users.yayId })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!admin) {
    // eslint-disable-next-line no-console
    console.log(
      `admin bootstrap: no account for ${email} yet — register it, then re-run the seed to grant the admin role`,
    );
    return;
  }

  await database.transaction(async (tx) => {
    await grantRole(tx, { userId: admin.id, roleKey: 'admin', grantedBy: null });
    await tx
      .update(users)
      .set({ trustState: 'trusted', status: 'active' })
      .where(eq(users.id, admin.id));
    await recordAudit(tx, {
      actorType: 'system',
      action: 'access.admin_bootstrapped',
      subjectType: 'user',
      subjectId: admin.id,
      metadata: { yayId: admin.yayId, role: 'admin' },
    });
  });

  // eslint-disable-next-line no-console
  console.log(`admin bootstrap: granted admin role to ${email}`);
}

async function main(): Promise<void> {
  const database = db();

  await seedGeography(database);
  await seedAccessControl(database);
  await seedDistricts(database);
  await seedTokenConfiguration(database);
  await seedReputationRules(database);
  await seedSettings(database);
  await seedTreasury(database);
  await bootstrapAdministrator(database);

  const [{ count } = { count: 0 }] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(locations);

  // eslint-disable-next-line no-console
  console.log(`seed complete — ${count} locations`);
  await closeDb();
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('seed failed:', error);
  await closeDb();
  process.exit(1);
});
