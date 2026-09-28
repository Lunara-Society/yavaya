CREATE TYPE "public"."community_post_kind" AS ENUM('help_request', 'help_offer', 'prayer', 'family_support');--> statement-breakpoint
CREATE TYPE "public"."community_post_status" AS ENUM('open', 'resolved', 'withdrawn', 'removed');--> statement-breakpoint
CREATE TYPE "public"."community_reply_status" AS ENUM('visible', 'removed');--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"kind" "community_post_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"location_id" uuid,
	"anonymous" boolean DEFAULT false NOT NULL,
	"status" "community_post_status" DEFAULT 'open' NOT NULL,
	"support_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"removed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "community_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" "community_reply_status" DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "community_supports" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_supports_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_supports" ADD CONSTRAINT "community_supports_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_supports" ADD CONSTRAINT "community_supports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_posts_feed_idx" ON "community_posts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "community_posts_kind_idx" ON "community_posts" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "community_posts_author_idx" ON "community_posts" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE INDEX "community_replies_post_idx" ON "community_replies" USING btree ("post_id","created_at");--> statement-breakpoint
ALTER TABLE "community_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "community_replies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "community_supports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_counts_nonnegative" CHECK ("support_count" >= 0 AND "reply_count" >= 0);
--> statement-breakpoint
-- Community is built: switch its existing row on, as 0004 did for Mercadito.
UPDATE "districts" SET "enabled" = true, "status" = 'available', "updated_at" = now() WHERE "key" = 'community';
