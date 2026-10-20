CREATE TABLE "sanction_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enforcement_record_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"outcome" text,
	"response" text
);
--> statement-breakpoint
ALTER TABLE "sanction_appeals" ADD CONSTRAINT "sanction_appeals_enforcement_record_id_enforcement_records_id_fk" FOREIGN KEY ("enforcement_record_id") REFERENCES "public"."enforcement_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction_appeals" ADD CONSTRAINT "sanction_appeals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanction_appeals" ADD CONSTRAINT "sanction_appeals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sanction_appeals_record_key" ON "sanction_appeals" USING btree ("enforcement_record_id");--> statement-breakpoint
CREATE INDEX "sanction_appeals_open_idx" ON "sanction_appeals" USING btree ("decided_at");--> statement-breakpoint
-- Locked down like every other table (see 0002).
ALTER TABLE "sanction_appeals" ENABLE ROW LEVEL SECURITY;
