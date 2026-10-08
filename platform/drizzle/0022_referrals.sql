CREATE TABLE "referrals" (
	"invitee_user_id" uuid PRIMARY KEY NOT NULL,
	"inviter_user_id" uuid NOT NULL,
	"suspect" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rewarded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_invitee_user_id_users_id_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referrals_inviter_idx" ON "referrals" USING btree ("inviter_user_id","rewarded_at");--> statement-breakpoint
-- Same posture as every table: row level security on, so a client role that
-- connects without the application gets nothing. The application role owns it.
ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;