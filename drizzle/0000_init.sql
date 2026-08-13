CREATE TYPE "public"."account_status" AS ENUM('pending_verification', 'active', 'restricted', 'suspended', 'banned', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."activity_kind" AS ENUM('listing_published', 'service_request_published', 'restaurant_joined', 'animal_adopted', 'project_published', 'cause_goal_reached', 'member_joined');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'admin', 'system', 'anonymous');--> statement-breakpoint
CREATE TYPE "public"."duplicate_review_status" AS ENUM('open', 'confirmed_duplicate', 'dismissed', 'needs_more_information');--> statement-breakpoint
CREATE TYPE "public"."enforcement_reason" AS ENUM('fraud', 'scam', 'financial_deception', 'animal_abuse', 'fraudulent_fundraising', 'multi_account_abuse', 'criminal_misuse', 'harassment', 'spam', 'other');--> statement-breakpoint
CREATE TYPE "public"."enforcement_type" AS ENUM('warning', 'restriction', 'suspension', 'permanent_removal');--> statement-breakpoint
CREATE TYPE "public"."location_level" AS ENUM('region', 'country', 'state', 'city', 'town', 'village', 'neighborhood');--> statement-breakpoint
CREATE TYPE "public"."location_precision" AS ENUM('country', 'city', 'neighborhood', 'exact');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'push', 'email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."payment_domain" AS ENUM('tokens', 'works_subscription', 'yavayago_commercial', 'marketplace', 'impact_donation');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending_provider', 'authorized', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_state" AS ENUM('unreconciled', 'provider_confirmed', 'settled', 'discrepancy');--> statement-breakpoint
CREATE TYPE "public"."report_category" AS ENUM('scam', 'fraud', 'harassment', 'animal_abuse', 'fake_fundraiser', 'fake_listing', 'spam', 'technical_issue', 'other');--> statement-breakpoint
CREATE TYPE "public"."reputation_source" AS ENUM('verification', 'transaction', 'delivery', 'review', 'impact', 'animals', 'moderation', 'admin');--> statement-breakpoint
CREATE TYPE "public"."risk_band" AS ENUM('low', 'elevated', 'review', 'block');--> statement-breakpoint
CREATE TYPE "public"."role_scope" AS ENUM('global', 'district', 'location');--> statement-breakpoint
CREATE TYPE "public"."signal_kind" AS ENUM('device_fingerprint', 'ip_network', 'email_normalized', 'email_domain', 'phone_e164', 'registration_timing', 'behavior_pattern');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'triaged', 'in_review', 'awaiting_reporter', 'resolved', 'rejected', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."token_account_kind" AS ENUM('user', 'treasury', 'system');--> statement-breakpoint
CREATE TYPE "public"."token_entry_reason" AS ENUM('starter_grant', 'purchase', 'admin_grant', 'admin_revoke', 'admin_correction', 'reward', 'referral', 'tavern_reward', 'action_charge', 'action_refund', 'transfer_in', 'transfer_out');--> statement-breakpoint
CREATE TYPE "public"."trust_state" AS ENUM('monitored', 'standard', 'trusted', 'flagged');--> statement-breakpoint
CREATE TYPE "public"."verification_kind" AS ENUM('email', 'phone', 'identity_document');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'submitted', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"parent_id" uuid,
	"level" "location_level" NOT NULL,
	"name" text NOT NULL,
	"names" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"iso_code" text,
	"path" text[] DEFAULT '{}' NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"timezone" text,
	"phone_prefix" text,
	"currency_code" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_supported_market" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_networks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network_hash" text NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "signal_kind" NOT NULL,
	"value_hash" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duplicate_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"matched_user_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"reasons" jsonb NOT NULL,
	"status" "duplicate_review_status" DEFAULT 'open' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"context" text NOT NULL,
	"score" integer NOT NULL,
	"band" "risk_band" NOT NULL,
	"factors" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_id" uuid,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text
);
--> statement-breakpoint
CREATE TABLE "user_devices" (
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_trusted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"bio" text,
	"avatar_media_id" uuid,
	"location_id" uuid,
	"location_precision" "location_precision" DEFAULT 'city' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"yay_id" char(8) NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"phone_e164" text,
	"phone_verified_at" timestamp with time zone,
	"password_hash" text NOT NULL,
	"password_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"display_name" text NOT NULL,
	"status" "account_status" DEFAULT 'pending_verification' NOT NULL,
	"trust_state" "trust_state" DEFAULT 'monitored' NOT NULL,
	"identity_verified_at" timestamp with time zone,
	"monitored_until" timestamp with time zone NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"theme_preference" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verification_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "verification_kind" NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"target" text NOT NULL,
	"code_hash" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"max_attempts" smallint DEFAULT 5 NOT NULL,
	"sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yay_id_registry" (
	"yay_id" char(8) PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" text DEFAULT '0' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_key" text NOT NULL,
	"permission_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"scope" "role_scope" DEFAULT 'global' NOT NULL,
	"scope_ref" text,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"district" text,
	"ip_hash" text,
	"user_agent_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prev_hash" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billable_actions" (
	"key" text PRIMARY KEY NOT NULL,
	"district" text,
	"cost" integer NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reward_rule_key" text NOT NULL,
	"amount" integer NOT NULL,
	"dedupe_key" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "starter_grants" (
	"user_id" uuid NOT NULL,
	"period_index" smallint NOT NULL,
	"amount" integer NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "token_account_kind" NOT NULL,
	"user_id" uuid,
	"handle" text,
	"balance" bigint DEFAULT 0 NOT NULL,
	"lifetime_earned" bigint DEFAULT 0 NOT NULL,
	"lifetime_spent" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"balance_after" bigint NOT NULL,
	"reason" "token_entry_reason" NOT NULL,
	"billable_action_key" text,
	"idempotency_key" text NOT NULL,
	"group_id" uuid,
	"related_type" text,
	"related_id" text,
	"actor_user_id" uuid,
	"note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_packages" (
	"key" text PRIMARY KEY NOT NULL,
	"tokens" integer NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputation_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"rule_key" text NOT NULL,
	"source" "reputation_source" NOT NULL,
	"delta" integer NOT NULL,
	"score_after" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"related_type" text,
	"related_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputation_rules" (
	"key" text PRIMARY KEY NOT NULL,
	"delta" integer NOT NULL,
	"cooldown_seconds" integer DEFAULT 0 NOT NULL,
	"max_per_day" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputation_scores" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"score" integer NOT NULL,
	"successful_transactions" integer DEFAULT 0 NOT NULL,
	"successful_deliveries" integer DEFAULT 0 NOT NULL,
	"positive_reviews" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enforcement_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "enforcement_type" NOT NULL,
	"reason_category" "enforcement_reason" NOT NULL,
	"internal_note" text,
	"publicly_listed" boolean DEFAULT false NOT NULL,
	"issued_by" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"internal_note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"district" text,
	"category" "report_category" NOT NULL,
	"description" text,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ticket_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"category" "report_category" NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'normal' NOT NULL,
	"assigned_to" uuid,
	"resolution_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"district" text,
	"location_id" uuid,
	"public_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visible_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title_key" text NOT NULL,
	"body_key" text,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"from_status" "payment_status",
	"to_status" "payment_status" NOT NULL,
	"source" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"domain" "payment_domain" NOT NULL,
	"provider" text NOT NULL,
	"provider_transaction_id" text,
	"user_id" uuid,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"reconciliation_state" "reconciliation_state" DEFAULT 'unreconciled' NOT NULL,
	"intent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"fulfilled_at" timestamp with time zone,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"signature_verified" boolean DEFAULT false NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text
);
--> statement-breakpoint
CREATE TABLE "demo_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"district" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"key" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"phase" integer NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"rollout" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_locations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_signals" ADD CONSTRAINT "account_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_matched_user_id_users_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_challenges" ADD CONSTRAINT "verification_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yay_id_registry" ADD CONSTRAINT "yay_id_registry_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_key_roles_key_fk" FOREIGN KEY ("role_key") REFERENCES "public"."roles"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_key_roles_key_fk" FOREIGN KEY ("role_key") REFERENCES "public"."roles"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starter_grants" ADD CONSTRAINT "starter_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_accounts" ADD CONSTRAINT "token_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_account_id_token_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."token_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_billable_action_key_billable_actions_key_fk" FOREIGN KEY ("billable_action_key") REFERENCES "public"."billable_actions"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_scores" ADD CONSTRAINT "reputation_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_records" ADD CONSTRAINT "enforcement_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_records" ADD CONSTRAINT "enforcement_records_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enforcement_records" ADD CONSTRAINT "enforcement_records_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_content" ADD CONSTRAINT "demo_content_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_code_key" ON "locations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "locations_parent_idx" ON "locations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "locations_level_idx" ON "locations" USING btree ("level");--> statement-breakpoint
CREATE INDEX "locations_active_idx" ON "locations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "locations_path_idx" ON "locations" USING gin ("path");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_networks_hash_key" ON "shared_networks" USING btree ("network_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "account_signals_key" ON "account_signals" USING btree ("user_id","kind","value_hash");--> statement-breakpoint
CREATE INDEX "account_signals_lookup_idx" ON "account_signals" USING btree ("kind","value_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_fingerprint_key" ON "devices" USING btree ("fingerprint_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "duplicate_candidates_pair_key" ON "duplicate_candidates" USING btree ("user_id","matched_user_id");--> statement-breakpoint
CREATE INDEX "duplicate_candidates_status_idx" ON "duplicate_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "risk_assessments_user_idx" ON "risk_assessments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "risk_assessments_band_idx" ON "risk_assessments" USING btree ("band");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_devices_key" ON "user_devices" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "user_devices_device_idx" ON "user_devices" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "user_profiles_location_idx" ON "user_profiles" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_yay_id_key" ON "users" USING btree ("yay_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_email_normalized_idx" ON "users" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_monitored_until_idx" ON "users" USING btree ("monitored_until");--> statement-breakpoint
CREATE INDEX "verification_challenges_user_idx" ON "verification_challenges" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "verification_challenges_expires_idx" ON "verification_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "yay_id_registry_user_idx" ON "yay_id_registry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "permissions_domain_idx" ON "permissions" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "rate_limit_expires_idx" ON "rate_limit_counters" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_key" ON "role_permissions" USING btree ("role_key","permission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_key" ON "user_roles" USING btree ("user_id","role_key","scope","scope_ref");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_events_occurred_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_grants_dedupe_key" ON "reward_grants" USING btree ("reward_rule_key","dedupe_key");--> statement-breakpoint
CREATE INDEX "reward_grants_user_idx" ON "reward_grants" USING btree ("user_id","granted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "starter_grants_key" ON "starter_grants" USING btree ("user_id","period_index");--> statement-breakpoint
CREATE UNIQUE INDEX "token_accounts_user_key" ON "token_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "token_accounts_handle_key" ON "token_accounts" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "token_ledger_idempotency_key" ON "token_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "token_ledger_account_idx" ON "token_ledger" USING btree ("account_id","id");--> statement-breakpoint
CREATE INDEX "token_ledger_reason_idx" ON "token_ledger" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "token_ledger_group_idx" ON "token_ledger" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reputation_events_idempotency_key" ON "reputation_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "reputation_events_user_idx" ON "reputation_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reputation_events_rule_idx" ON "reputation_events" USING btree ("rule_key");--> statement-breakpoint
CREATE INDEX "enforcement_records_user_idx" ON "enforcement_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "enforcement_records_public_idx" ON "enforcement_records" USING btree ("publicly_listed","issued_at");--> statement-breakpoint
CREATE INDEX "moderation_actions_ticket_idx" ON "moderation_actions" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "reports_subject_idx" ON "reports" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_user_id");--> statement-breakpoint
CREATE INDEX "reports_ticket_idx" ON "reports" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_code_key" ON "tickets" USING btree ("code");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "tickets_subject_idx" ON "tickets" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "activity_events_feed_idx" ON "activity_events" USING btree ("is_demo","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_location_idx" ON "activity_events" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_key" ON "notification_preferences" USING btree ("user_id","category","channel");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_events_transaction_idx" ON "payment_events" USING btree ("transaction_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_reference_key" ON "payment_transactions" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_idempotency_key" ON "payment_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_provider_txn_key" ON "payment_transactions" USING btree ("provider","provider_transaction_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_user_idx" ON "payment_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions" USING btree ("status","reconciliation_state");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_key" ON "payment_webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_unprocessed_idx" ON "payment_webhook_events" USING btree ("processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_content_subject_key" ON "demo_content" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "demo_content_expiry_idx" ON "demo_content" USING btree ("expires_at","removed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "districts_slug_key" ON "districts" USING btree ("slug");