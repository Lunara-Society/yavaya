CREATE TYPE "public"."animals_application_status" AS ENUM('submitted', 'approved', 'rejected', 'withdrawn', 'completed');--> statement-breakpoint
CREATE TYPE "public"."animals_listing_status" AS ENUM('available', 'reserved', 'adopted', 'withdrawn', 'removed');--> statement-breakpoint
CREATE TYPE "public"."animals_rescuer_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TABLE "animals_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"applicant_user_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"commitments" text[] NOT NULL,
	"status" "animals_application_status" DEFAULT 'submitted' NOT NULL,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"follow_up_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animals_certificates" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"score" integer NOT NULL,
	"passed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animals_listing_photos" (
	"listing_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "animals_listing_photos_listing_id_media_id_pk" PRIMARY KEY("listing_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "animals_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rescuer_user_id" uuid NOT NULL,
	"species" text NOT NULL,
	"name" text NOT NULL,
	"sex" text NOT NULL,
	"size" text NOT NULL,
	"age_months" integer,
	"sterilised" boolean NOT NULL,
	"vaccinated" boolean NOT NULL,
	"dewormed" boolean NOT NULL,
	"health_notes" text,
	"temperament" text,
	"description" text NOT NULL,
	"location_id" uuid NOT NULL,
	"status" "animals_listing_status" DEFAULT 'available' NOT NULL,
	"adopted_by" uuid,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animals_rescuers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"about" text NOT NULL,
	"location_id" uuid NOT NULL,
	"whatsapp_e164" text NOT NULL,
	"status" "animals_rescuer_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animals_applications" ADD CONSTRAINT "animals_applications_listing_id_animals_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animals_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_applications" ADD CONSTRAINT "animals_applications_applicant_user_id_users_id_fk" FOREIGN KEY ("applicant_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_certificates" ADD CONSTRAINT "animals_certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_listing_photos" ADD CONSTRAINT "animals_listing_photos_listing_id_animals_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."animals_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_listing_photos" ADD CONSTRAINT "animals_listing_photos_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_listings" ADD CONSTRAINT "animals_listings_rescuer_user_id_users_id_fk" FOREIGN KEY ("rescuer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_listings" ADD CONSTRAINT "animals_listings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_listings" ADD CONSTRAINT "animals_listings_adopted_by_users_id_fk" FOREIGN KEY ("adopted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_listings" ADD CONSTRAINT "animals_listings_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_rescuers" ADD CONSTRAINT "animals_rescuers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_rescuers" ADD CONSTRAINT "animals_rescuers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_rescuers" ADD CONSTRAINT "animals_rescuers_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "animals_applications_one_per_person" ON "animals_applications" USING btree ("listing_id","applicant_user_id");--> statement-breakpoint
CREATE INDEX "animals_applications_applicant_idx" ON "animals_applications" USING btree ("applicant_user_id","created_at");--> statement-breakpoint
CREATE INDEX "animals_applications_follow_up_idx" ON "animals_applications" USING btree ("status","completed_at");--> statement-breakpoint
CREATE INDEX "animals_listings_browse_idx" ON "animals_listings" USING btree ("status","species","created_at");--> statement-breakpoint
CREATE INDEX "animals_listings_rescuer_idx" ON "animals_listings" USING btree ("rescuer_user_id","status");--> statement-breakpoint
CREATE INDEX "animals_rescuers_status_idx" ON "animals_rescuers" USING btree ("status");--> statement-breakpoint
ALTER TABLE "animals_certificates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "animals_rescuers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "animals_listings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "animals_listing_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "animals_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "animals_rescuers" ADD CONSTRAINT "animals_rescuers_kind" CHECK ("kind" IN ('person', 'organisation'));--> statement-breakpoint
ALTER TABLE "animals_rescuers" ADD CONSTRAINT "animals_rescuers_whatsapp_e164" CHECK ("whatsapp_e164" ~ '^\+[1-9][0-9]{6,14}$');--> statement-breakpoint
ALTER TABLE "animals_listings" ADD CONSTRAINT "animals_listings_species" CHECK ("species" IN ('dog', 'cat', 'other'));--> statement-breakpoint
ALTER TABLE "animals_listings" ADD CONSTRAINT "animals_listings_sex" CHECK ("sex" IN ('male', 'female', 'unknown'));--> statement-breakpoint
ALTER TABLE "animals_listings" ADD CONSTRAINT "animals_listings_size" CHECK ("size" IN ('small', 'medium', 'large'));--> statement-breakpoint
ALTER TABLE "animals_listings" ADD CONSTRAINT "animals_listings_age" CHECK ("age_months" IS NULL OR "age_months" BETWEEN 0 AND 360);
