/**
 * Billable actions: the closed set of things that may cost a token, with the
 * price each is seeded at. Publishing qualifying content costs 1. Browsing,
 * searching, messaging, reporting and asking for help cost nothing —
 * charging for those would price people out of the parts of Yavaya that
 * exist to help them.
 *
 * These are defaults, like everything in business-rules.ts: the seed writes
 * them to `billable_actions`, and what a member is charged is read from that
 * table (tokens/service.ts, actionCost), so operations can retune a price
 * without a deploy. Each key appears once; asking for a service is free (until
 * October 2026 the seed listed it twice, the free entry winning).
 */
export const BILLABLE_ACTIONS: ReadonlyArray<{ key: string; district: string; cost: number; description: string }> = [
  { key: 'mercadito.publish_listing', district: 'mercadito', cost: 1, description: 'Publish a Mercadito listing beyond the free allowance' },
  { key: 'mercadito.publish_listing_free', district: 'mercadito', cost: 0, description: 'Publish a Mercadito listing within the free allowance (free)' },
  { key: 'mercadito.feature_listing', district: 'mercadito', cost: 3, description: 'Feature a Mercadito listing at the top for a week' },
  { key: 'work.publish_post', district: 'works', cost: 3, description: 'Publish a Trabajo post beyond the free allowance (employers only)' },
  { key: 'work.publish_post_free', district: 'works', cost: 0, description: 'Publish a Trabajo post within the free allowance (free)' },
  { key: 'work.feature_post', district: 'works', cost: 3, description: 'Feature a Trabajo post at the top for a week' },
  { key: 'go.feature_store', district: 'yavayago', cost: 5, description: 'Feature a YavayaGo store at the top for a week' },
  { key: 'services.publish_offer', district: 'services', cost: 1, description: 'Publish a service offer' },
  { key: 'works.publish_project', district: 'works', cost: 1, description: 'Publish a Works project' },
  { key: 'community.publish_request', district: 'community', cost: 0, description: 'Publish a community support request (free)' },
  { key: 'services.publish_request', district: 'services', cost: 0, description: 'Ask for a service (free)' },
  { key: 'services.respond', district: 'services', cost: 0, description: 'Answer a service request (free)' },
  { key: 'sanctuary.register_church', district: 'sanctuary', cost: 0, description: 'Register a church in Sanctuary (free)' },
  { key: 'sanctuary.publish_devotional', district: 'sanctuary', cost: 0, description: 'Publish a church prayer or word for the day (free)' },
  { key: 'impact.publish_cause', district: 'community', cost: 0, description: 'Submit a cause for review (free)' },
  { key: 'animals.publish_listing', district: 'animals', cost: 0, description: 'Publish an animal welfare listing (free)' },
];
