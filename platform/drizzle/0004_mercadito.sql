CREATE TYPE "public"."listing_category" AS ENUM('vehicles', 'real_estate', 'electronics', 'services', 'fashion', 'home', 'sports', 'classifieds');--> statement-breakpoint
CREATE TYPE "public"."listing_condition" AS ENUM('new', 'like_new', 'used', 'for_parts', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('published', 'sold', 'withdrawn', 'removed');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" bigint NOT NULL,
	"source_sha256" text NOT NULL,
	"status" "media_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mercadito_listing_photos" (
	"listing_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mercadito_listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"price_minor" bigint NOT NULL,
	"currency_code" char(3) NOT NULL,
	"category" "listing_category" NOT NULL,
	"condition" "listing_condition" NOT NULL,
	"location_id" uuid NOT NULL,
	"status" "listing_status" DEFAULT 'published' NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"removed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "whatsapp_e164" text;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadito_listing_photos" ADD CONSTRAINT "mercadito_listing_photos_listing_id_mercadito_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."mercadito_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadito_listing_photos" ADD CONSTRAINT "mercadito_listing_photos_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadito_listings" ADD CONSTRAINT "mercadito_listings_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadito_listings" ADD CONSTRAINT "mercadito_listings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercadito_listings" ADD CONSTRAINT "mercadito_listings_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_storage_key_key" ON "media" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "media_owner_idx" ON "media" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "media_source_sha256_idx" ON "media" USING btree ("source_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "mercadito_listing_photos_media_key" ON "mercadito_listing_photos" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mercadito_listing_photos_position_key" ON "mercadito_listing_photos" USING btree ("listing_id","position");--> statement-breakpoint
CREATE INDEX "mercadito_listings_browse_idx" ON "mercadito_listings" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "mercadito_listings_seller_idx" ON "mercadito_listings" USING btree ("seller_user_id","created_at");--> statement-breakpoint
CREATE INDEX "mercadito_listings_category_idx" ON "mercadito_listings" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "mercadito_listings_location_idx" ON "mercadito_listings" USING btree ("location_id");--> statement-breakpoint
-- Same two layers as 0002 for the new tables: RLS with no policies denies
-- every non-owner role, should a data API ever be pointed at this database.
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mercadito_listings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mercadito_listing_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mercadito_listings" ADD CONSTRAINT "mercadito_listings_price_nonnegative" CHECK ("price_minor" >= 0);--> statement-breakpoint
ALTER TABLE "mercadito_listing_photos" ADD CONSTRAINT "mercadito_listing_photos_position_range" CHECK ("position" >= 0);
--> statement-breakpoint
-- Mercadito is built: switch its existing row on. The seed only sets the flag
-- when it creates a row, so an operator's later choice is never overwritten.
UPDATE "districts" SET "enabled" = true, "status" = 'available', "updated_at" = now() WHERE "key" = 'mercadito';
