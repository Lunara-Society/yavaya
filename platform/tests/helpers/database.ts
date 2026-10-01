import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';

/**
 * Clears transactional data between tests while leaving reference data
 * (geography, roles, districts, packages, reputation rules) in place.
 *
 * TRUNCATE is used deliberately: the append-only triggers on the audit and
 * ledger tables reject DELETE, which is exactly what they are for. TRUNCATE is
 * a table-level operation available to the test harness only.
 */
export async function resetTransactionalData(): Promise<void> {
  await db().execute(sql`
    truncate table
      audit_events,
      token_ledger,
      token_accounts,
      starter_grants,
      reward_grants,
      reputation_events,
      reputation_scores,
      risk_assessments,
      duplicate_candidates,
      account_signals,
      user_devices,
      devices,
      verification_challenges,
      sessions,
      user_roles,
      user_profiles,
      yay_id_registry,
      users,
      payment_events,
      payment_transactions,
      payment_webhook_events,
      reports,
      moderation_actions,
      enforcement_records,
      tickets,
      notifications,
      notification_preferences,
      activity_events,
      demo_content,
      rate_limit_counters,
      services_reviews,
      services_responses,
      services_requests,
      services_provider_profiles,
      sanctuary_follows,
      sanctuary_devotionals,
      sanctuary_services,
      sanctuary_churches,
      community_supports,
      community_replies,
      community_posts,
      mercadito_saved_searches,
      mercadito_listing_photos,
      mercadito_listings,
      media
    restart identity cascade
  `);

  // The treasury lives in token_accounts, so it is re-created after truncation.
  await db().execute(sql`
    insert into token_accounts (kind, handle, balance, lifetime_earned)
    values ('treasury', 'treasury:primary', 50000, 50000)
    on conflict (handle) do nothing
  `);
}
