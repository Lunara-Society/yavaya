ALTER TABLE "safe_space_reports" DROP CONSTRAINT "safe_space_reports_reported_member_id_safe_space_members_id_fk";
--> statement-breakpoint
ALTER TABLE "safe_space_reports" ALTER COLUMN "reported_member_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "safe_space_reports" ADD COLUMN "reported_user_id" uuid;--> statement-breakpoint
ALTER TABLE "safe_space_reports" ADD CONSTRAINT "safe_space_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_space_reports" ADD CONSTRAINT "safe_space_reports_reported_member_id_safe_space_members_id_fk" FOREIGN KEY ("reported_member_id") REFERENCES "public"."safe_space_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Existing reports: the account behind each reported member.
UPDATE "safe_space_reports" r SET "reported_user_id" = m."user_id" FROM "safe_space_members" m WHERE m."id" = r."reported_member_id";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "safe_space_reports_reported_user_idx" ON "safe_space_reports" USING btree ("reported_user_id");
