CREATE TABLE "board_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"district" text NOT NULL,
	"subdistrict" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"price_text" text,
	"location_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"removed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "board_posts" ADD CONSTRAINT "board_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_posts" ADD CONSTRAINT "board_posts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_posts" ADD CONSTRAINT "board_posts_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_posts_feed_idx" ON "board_posts" USING btree ("district","status","created_at");--> statement-breakpoint
CREATE INDEX "board_posts_sub_idx" ON "board_posts" USING btree ("district","subdistrict","status");--> statement-breakpoint
CREATE INDEX "board_posts_author_idx" ON "board_posts" USING btree ("author_user_id","created_at");