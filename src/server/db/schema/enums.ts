import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Shared enumerations. Adding a value is a migration; removing one is a
 * breaking change, so values are only ever appended.
 */

// --- Identity ---------------------------------------------------------------
export const accountStatusEnum = pgEnum('account_status', [
  'pending_verification',
  'active',
  'restricted',
  'suspended',
  'banned',
  'deactivated',
]);

export const trustStateEnum = pgEnum('trust_state', [
  'monitored', // inside the 72h enhanced monitoring window
  'standard',
  'trusted',
  'flagged',
]);

export const verificationKindEnum = pgEnum('verification_kind', [
  'email',
  'phone',
  'identity_document',
]);

export const verificationStatusEnum = pgEnum('verification_status', [
  'pending',
  'submitted',
  'approved',
  'rejected',
  'expired',
]);

export const signalKindEnum = pgEnum('signal_kind', [
  'device_fingerprint',
  'ip_network',
  'email_normalized',
  'email_domain',
  'phone_e164',
  'registration_timing',
  'behavior_pattern',
]);

export const riskBandEnum = pgEnum('risk_band', ['low', 'elevated', 'review', 'block']);

export const duplicateReviewStatusEnum = pgEnum('duplicate_review_status', [
  'open',
  'confirmed_duplicate',
  'dismissed',
  'needs_more_information',
]);

// --- Geography --------------------------------------------------------------
export const locationLevelEnum = pgEnum('location_level', [
  'region',
  'country',
  'state', // state / department / province
  'city',
  'town',
  'village',
  'neighborhood',
]);

export const locationPrecisionEnum = pgEnum('location_precision', [
  'country',
  'city',
  'neighborhood',
  'exact',
]);

// --- Access -----------------------------------------------------------------
export const roleScopeEnum = pgEnum('role_scope', ['global', 'district', 'location']);

// --- Tokens -----------------------------------------------------------------
export const tokenAccountKindEnum = pgEnum('token_account_kind', ['user', 'treasury', 'system']);

export const tokenEntryReasonEnum = pgEnum('token_entry_reason', [
  'starter_grant',
  'purchase',
  'admin_grant',
  'admin_revoke',
  'admin_correction',
  'reward',
  'referral',
  'tavern_reward',
  'action_charge',
  'action_refund',
  'transfer_in',
  'transfer_out',
]);

// --- Reputation -------------------------------------------------------------
export const reputationSourceEnum = pgEnum('reputation_source', [
  'verification',
  'transaction',
  'delivery',
  'review',
  'impact',
  'animals',
  'moderation',
  'admin',
]);

// --- Moderation -------------------------------------------------------------
export const reportCategoryEnum = pgEnum('report_category', [
  'scam',
  'fraud',
  'harassment',
  'animal_abuse',
  'fake_fundraiser',
  'fake_listing',
  'spam',
  'technical_issue',
  'other',
]);

export const ticketStatusEnum = pgEnum('ticket_status', [
  'open',
  'triaged',
  'in_review',
  'awaiting_reporter',
  'resolved',
  'rejected',
  'duplicate',
]);

export const ticketPriorityEnum = pgEnum('ticket_priority', ['low', 'normal', 'high', 'urgent']);

export const enforcementTypeEnum = pgEnum('enforcement_type', [
  'warning',
  'restriction',
  'suspension',
  'permanent_removal',
]);

export const enforcementReasonEnum = pgEnum('enforcement_reason', [
  'fraud',
  'scam',
  'financial_deception',
  'animal_abuse',
  'fraudulent_fundraising',
  'multi_account_abuse',
  'criminal_misuse',
  'harassment',
  'spam',
  'other',
]);

// --- Notifications ----------------------------------------------------------
export const notificationChannelEnum = pgEnum('notification_channel', [
  'in_app',
  'push',
  'email',
  'sms',
]);

export const activityKindEnum = pgEnum('activity_kind', [
  'listing_published',
  'service_request_published',
  'restaurant_joined',
  'animal_adopted',
  'project_published',
  'cause_goal_reached',
  'member_joined',
]);

// --- Payments ---------------------------------------------------------------
export const paymentDomainEnum = pgEnum('payment_domain', [
  'tokens',
  'works_subscription',
  'yavayago_commercial',
  'marketplace',
  'impact_donation',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'created',
  'pending_provider',
  'authorized',
  'succeeded',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded',
]);

export const reconciliationStateEnum = pgEnum('reconciliation_state', [
  'unreconciled',
  'provider_confirmed',
  'settled',
  'discrepancy',
]);

// --- Audit ------------------------------------------------------------------
export const actorTypeEnum = pgEnum('actor_type', ['user', 'admin', 'system', 'anonymous']);
