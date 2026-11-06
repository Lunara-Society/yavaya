ALTER TYPE "public"."payment_domain" ADD VALUE 'roxi_plan';--> statement-breakpoint
ALTER TYPE "public"."payment_domain" ADD VALUE 'roxi_credits';--> statement-breakpoint
CREATE TABLE "roxi_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_sealed" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roxi_conversations" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"cost_usd" numeric(12, 6),
	"credits" integer,
	"duration_seconds" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "roxi_credit_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan_credits" integer DEFAULT 0 NOT NULL,
	"plan_period_key" text DEFAULT '' NOT NULL,
	"purchased_credits" integer DEFAULT 0 NOT NULL,
	"purchased_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roxi_credit_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_delta" integer DEFAULT 0 NOT NULL,
	"purchased_delta" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"reference" text NOT NULL,
	"plan_after" integer NOT NULL,
	"purchased_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roxi_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body_sealed" text NOT NULL,
	"due_at" timestamp with time zone,
	"repeat" text DEFAULT 'none' NOT NULL,
	"day" text,
	"done_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roxi_subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"provider_subscription_id" text,
	"replaced_subscription_id" text,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roxi_connections" ADD CONSTRAINT "roxi_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roxi_conversations" ADD CONSTRAINT "roxi_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roxi_credit_accounts" ADD CONSTRAINT "roxi_credit_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roxi_credit_ledger" ADD CONSTRAINT "roxi_credit_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roxi_items" ADD CONSTRAINT "roxi_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roxi_subscriptions" ADD CONSTRAINT "roxi_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roxi_connections_user_idx" ON "roxi_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "roxi_conversations_open_idx" ON "roxi_conversations" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "roxi_conversations_user_idx" ON "roxi_conversations" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "roxi_credit_ledger_once" ON "roxi_credit_ledger" USING btree ("user_id","reason","reference");--> statement-breakpoint
CREATE INDEX "roxi_credit_ledger_user_idx" ON "roxi_credit_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "roxi_items_user_idx" ON "roxi_items" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "roxi_items_due_idx" ON "roxi_items" USING btree ("due_at");