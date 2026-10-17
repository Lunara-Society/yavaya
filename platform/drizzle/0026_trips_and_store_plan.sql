CREATE TYPE "public"."go_trip_kind" AS ENUM('ride', 'parcel', 'errand', 'assist');--> statement-breakpoint
CREATE TYPE "public"."go_trip_offer_status" AS ENUM('pending', 'accepted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."go_trip_status" AS ENUM('open', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "go_trip_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"driver_user_id" uuid NOT NULL,
	"fare_minor" integer NOT NULL,
	"eta_minutes" integer NOT NULL,
	"status" "go_trip_offer_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "go_trip_tracking" (
	"trip_id" uuid PRIMARY KEY NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy" integer,
	"heading" integer,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "go_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" "go_trip_kind" NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"driver_user_id" uuid,
	"location_id" uuid NOT NULL,
	"vehicle_wanted" text DEFAULT 'any' NOT NULL,
	"passengers" integer DEFAULT 1 NOT NULL,
	"description" text,
	"pickup_latitude" double precision,
	"pickup_longitude" double precision,
	"pickup_directions" text,
	"dropoff_latitude" double precision,
	"dropoff_longitude" double precision,
	"dropoff_directions" text,
	"distance_km" double precision,
	"currency" text NOT NULL,
	"offered_fare_minor" integer NOT NULL,
	"agreed_fare_minor" integer,
	"purchase_budget_minor" integer,
	"customer_whatsapp_e164" text,
	"share_token" text NOT NULL,
	"status" "go_trip_status" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "go_orders" ADD COLUMN "recipient_name" text;--> statement-breakpoint
ALTER TABLE "go_stores" ADD COLUMN "founding_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "go_trip_offers" ADD CONSTRAINT "go_trip_offers_trip_id_go_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."go_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_trip_offers" ADD CONSTRAINT "go_trip_offers_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_trip_tracking" ADD CONSTRAINT "go_trip_tracking_trip_id_go_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."go_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_trips" ADD CONSTRAINT "go_trips_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_trips" ADD CONSTRAINT "go_trips_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_trips" ADD CONSTRAINT "go_trips_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "go_trip_offers_key" ON "go_trip_offers" USING btree ("trip_id","driver_user_id");--> statement-breakpoint
CREATE INDEX "go_trip_offers_trip_idx" ON "go_trip_offers" USING btree ("trip_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "go_trips_code_key" ON "go_trips" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "go_trips_share_key" ON "go_trips" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "go_trips_customer_idx" ON "go_trips" USING btree ("customer_user_id","created_at");--> statement-breakpoint
CREATE INDEX "go_trips_driver_idx" ON "go_trips" USING btree ("driver_user_id","status");--> statement-breakpoint
CREATE INDEX "go_trips_open_idx" ON "go_trips" USING btree ("status","location_id","created_at");