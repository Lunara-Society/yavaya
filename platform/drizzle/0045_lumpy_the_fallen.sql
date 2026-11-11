CREATE TABLE "board_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"district" text NOT NULL,
	"subdistrict" text,
	"kind" text,
	"query" text,
	"place_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_alerts" ADD CONSTRAINT "board_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_alerts_user_idx" ON "board_alerts" USING btree ("user_id","district");--> statement-breakpoint
CREATE INDEX "board_alerts_district_idx" ON "board_alerts" USING btree ("district");