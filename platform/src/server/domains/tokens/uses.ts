import type { Executor } from '@/server/db/client';
import { GO_RULES, MERCADITO_RULES, REFERRAL_RULES, TOKEN_RULES, WORK_RULES } from '@/config/business-rules';
import { getSetting } from '@/server/domains/platform/settings';
import type { TokenFacts } from '@/ui/tokens/facts';
import type { HomeStarts } from '@/ui/site/home';
import { actionCost } from './service';

/**
 * Every figure the public tokens page states — what each paid action costs,
 * how much is free first, how long a feature lasts, what welcomes and
 * invitations give — read from the same prices and settings the services
 * charge by. Until 25 October 2026 these were typed into the page's copy, so
 * retuning a price in `system_settings` or `billable_actions` would have left
 * the page promising the old one.
 *
 * A cost is null when its action is disabled or missing: the page then leaves
 * that row out rather than quote a price nobody can be charged.
 */
export async function tokenFacts(executor: Executor): Promise<TokenFacts> {
  const [
    mercaditoFree,
    listingCost,
    featureListingCost,
    listingDays,
    workFree,
    postCost,
    featurePostCost,
    postDays,
    featureStoreCost,
    storeDays,
    inviterReward,
    inviteeReward,
    inviteMonthCap,
  ] = await Promise.all([
    getSetting(executor, 'mercadito.free_open_listings', MERCADITO_RULES.freeOpenListings),
    actionCost(executor, 'mercadito.publish_listing'),
    actionCost(executor, 'mercadito.feature_listing'),
    getSetting(executor, 'mercadito.feature_days', MERCADITO_RULES.featureDays),
    getSetting(executor, 'work.free_open_posts', WORK_RULES.freeOpenPosts),
    actionCost(executor, 'work.publish_post'),
    actionCost(executor, 'work.feature_post'),
    getSetting(executor, 'work.feature_days', WORK_RULES.featureDays),
    actionCost(executor, 'go.feature_store'),
    getSetting(executor, 'go.feature_days', GO_RULES.featureDays),
    getSetting(executor, 'referral.inviter_reward', REFERRAL_RULES.inviterReward),
    getSetting(executor, 'referral.invitee_reward', REFERRAL_RULES.inviteeReward),
    getSetting(executor, 'referral.max_rewarded_per_month', REFERRAL_RULES.maxRewardedPerMonth),
  ]);
  return {
    mercadito_free: mercaditoFree,
    listing_cost: listingCost,
    feature_listing_cost: featureListingCost,
    listing_days: listingDays,
    work_free: workFree,
    post_cost: postCost,
    feature_post_cost: featurePostCost,
    post_days: postDays,
    feature_store_cost: featureStoreCost,
    store_days: storeDays,
    // The starter grant is not a setting: the service reads these constants directly.
    starter_per_day: TOKEN_RULES.starterGrantPerDay,
    starter_days: TOKEN_RULES.starterGrantDays,
    inviter_reward: inviterReward,
    invitee_reward: inviteeReward,
    invite_month_cap: inviteMonthCap,
  };
}

/**
 * What starting out costs, for the home page's "Empieza hoy": how many
 * listings and job posts may be open at once for free, and whether asking
 * for or answering a service request is still free. Four reads, not the
 * tokens page's thirteen: this runs on every visit to the home page.
 */
export async function startingFacts(executor: Executor): Promise<HomeStarts> {
  const [mercaditoFree, workFree, askCost, answerCost] = await Promise.all([
    getSetting(executor, 'mercadito.free_open_listings', MERCADITO_RULES.freeOpenListings),
    getSetting(executor, 'work.free_open_posts', WORK_RULES.freeOpenPosts),
    actionCost(executor, 'services.publish_request'),
    actionCost(executor, 'services.respond'),
  ]);
  return { mercaditoFree, workFree, askFree: askCost === 0, answerFree: answerCost === 0 };
}
