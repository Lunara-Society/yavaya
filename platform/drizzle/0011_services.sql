CREATE TYPE "public"."services_licence_status" AS ENUM('none', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."services_provider_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."services_request_status" AS ENUM('open', 'in_progress', 'completed', 'cancelled', 'removed');--> statement-breakpoint
CREATE TYPE "public"."services_response_status" AS ENUM('sent', 'accepted', 'withdrawn', 'removed');--> statement-breakpoint
CREATE TABLE "services_provider_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"headline" text NOT NULL,
	"bio" text NOT NULL,
	"categories" text[] NOT NULL,
	"location_id" uuid NOT NULL,
	"whatsapp_e164" text NOT NULL,
	"available_until" timestamp with time zone,
	"licence_claim" text,
	"licence_status" "services_licence_status" DEFAULT 'none' NOT NULL,
	"licence_note" text,
	"licence_reviewed_by" uuid,
	"licence_reviewed_at" timestamp with time zone,
	"status" "services_provider_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"location_id" uuid NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"status" "services_request_status" DEFAULT 'open' NOT NULL,
	"accepted_response_id" uuid,
	"response_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"removed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "services_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"provider_user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"price_text" text,
	"status" "services_response_status" DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services_reviews" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"provider_user_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "services_provider_profiles" ADD CONSTRAINT "services_provider_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_provider_profiles" ADD CONSTRAINT "services_provider_profiles_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_provider_profiles" ADD CONSTRAINT "services_provider_profiles_licence_reviewed_by_users_id_fk" FOREIGN KEY ("licence_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_requests" ADD CONSTRAINT "services_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_requests" ADD CONSTRAINT "services_requests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_requests" ADD CONSTRAINT "services_requests_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_responses" ADD CONSTRAINT "services_responses_request_id_services_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."services_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_responses" ADD CONSTRAINT "services_responses_provider_user_id_users_id_fk" FOREIGN KEY ("provider_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_reviews" ADD CONSTRAINT "services_reviews_request_id_services_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."services_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_reviews" ADD CONSTRAINT "services_reviews_provider_user_id_users_id_fk" FOREIGN KEY ("provider_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services_reviews" ADD CONSTRAINT "services_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "services_providers_available_idx" ON "services_provider_profiles" USING btree ("status","available_until");--> statement-breakpoint
CREATE INDEX "services_providers_licence_idx" ON "services_provider_profiles" USING btree ("licence_status");--> statement-breakpoint
CREATE INDEX "services_requests_board_idx" ON "services_requests" USING btree ("status","category","created_at");--> statement-breakpoint
CREATE INDEX "services_requests_requester_idx" ON "services_requests" USING btree ("requester_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "services_responses_one_per_provider" ON "services_responses" USING btree ("request_id","provider_user_id");--> statement-breakpoint
CREATE INDEX "services_responses_provider_idx" ON "services_responses" USING btree ("provider_user_id","created_at");--> statement-breakpoint
CREATE INDEX "services_reviews_provider_idx" ON "services_reviews" USING btree ("provider_user_id","created_at");--> statement-breakpoint
ALTER TABLE "services_provider_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "services_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "services_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "services_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "services_reviews" ADD CONSTRAINT "services_reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "services_provider_profiles" ADD CONSTRAINT "services_providers_whatsapp_e164" CHECK ("whatsapp_e164" ~ '^\+[1-9][0-9]{6,14}$');--> statement-breakpoint
ALTER TABLE "services_provider_profiles" ADD CONSTRAINT "services_providers_categories_bounded" CHECK (cardinality("categories") >= 1);--> statement-breakpoint
ALTER TABLE "services_requests" ADD CONSTRAINT "services_requests_accepted_fk" FOREIGN KEY ("accepted_response_id") REFERENCES "services_responses"("id") ON DELETE SET NULL;
