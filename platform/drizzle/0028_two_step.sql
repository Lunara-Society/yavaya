CREATE TABLE "two_step_factors" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"secret_sealed" text NOT NULL,
	"last_used_step" bigint DEFAULT 0 NOT NULL,
	"enabled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_step_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "two_step_factors" ADD CONSTRAINT "two_step_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_step_recovery_codes" ADD CONSTRAINT "two_step_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "two_step_recovery_codes_user_idx" ON "two_step_recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "two_step_recovery_codes_hash_key" ON "two_step_recovery_codes" USING btree ("code_hash");--> statement-breakpoint
-- Same lockdown as every other table (see 0002): RLS on, no policies. The
-- external identities table from 0027 missed it; it is closed here too.
ALTER TABLE "two_step_factors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "two_step_recovery_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_identities" ENABLE ROW LEVEL SECURITY;
