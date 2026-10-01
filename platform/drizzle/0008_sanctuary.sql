CREATE TYPE "public"."sanctuary_church_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."sanctuary_devotional_status" AS ENUM('published', 'removed');--> statement-breakpoint
CREATE TABLE "sanctuary_churches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"denomination" text,
	"description" text NOT NULL,
	"location_id" uuid NOT NULL,
	"address" text,
	"whatsapp_e164" text,
	"stream_url" text,
	"status" "sanctuary_church_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanctuary_devotionals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"for_date" date NOT NULL,
	"title" text NOT NULL,
	"scripture" text,
	"body" text NOT NULL,
	"status" "sanctuary_devotional_status" DEFAULT 'published' NOT NULL,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanctuary_follows" (
	"church_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sanctuary_follows_church_id_user_id_pk" PRIMARY KEY("church_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "sanctuary_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sanctuary_churches" ADD CONSTRAINT "sanctuary_churches_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctuary_churches" ADD CONSTRAINT "sanctuary_churches_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctuary_churches" ADD CONSTRAINT "sanctuary_churches_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctuary_devotionals" ADD CONSTRAINT "sanctuary_devotionals_church_id_sanctuary_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."sanctuary_churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctuary_devotionals" ADD CONSTRAINT "sanctuary_devotionals_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctuary_devotionals" ADD CONSTRAINT "sanctuary_devotionals_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctuary_follows" ADD CONSTRAINT "sanctuary_follows_church_id_sanctuary_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."sanctuary_churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctuary_follows" ADD CONSTRAINT "sanctuary_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctuary_services" ADD CONSTRAINT "sanctuary_services_church_id_sanctuary_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."sanctuary_churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sanctuary_churches_status_idx" ON "sanctuary_churches" USING btree ("status","name");--> statement-breakpoint
CREATE INDEX "sanctuary_churches_owner_idx" ON "sanctuary_churches" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "sanctuary_churches_location_idx" ON "sanctuary_churches" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "sanctuary_devotionals_feed_idx" ON "sanctuary_devotionals" USING btree ("status","for_date");--> statement-breakpoint
CREATE INDEX "sanctuary_devotionals_church_idx" ON "sanctuary_devotionals" USING btree ("church_id","for_date");--> statement-breakpoint
CREATE INDEX "sanctuary_follows_user_idx" ON "sanctuary_follows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sanctuary_services_church_idx" ON "sanctuary_services" USING btree ("church_id","weekday");--> statement-breakpoint
ALTER TABLE "sanctuary_churches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sanctuary_services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sanctuary_devotionals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sanctuary_follows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sanctuary_services" ADD CONSTRAINT "sanctuary_services_weekday_range" CHECK ("weekday" BETWEEN 0 AND 6);--> statement-breakpoint
ALTER TABLE "sanctuary_services" ADD CONSTRAINT "sanctuary_services_time_format" CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');--> statement-breakpoint
-- A broadcast link is only ever an https address; anything else could run in a viewer's browser.
ALTER TABLE "sanctuary_churches" ADD CONSTRAINT "sanctuary_churches_stream_https" CHECK ("stream_url" IS NULL OR "stream_url" LIKE 'https://%');
