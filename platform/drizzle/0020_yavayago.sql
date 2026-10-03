CREATE TYPE "public"."go_driver_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."go_order_status" AS ENUM('placed', 'accepted', 'ready', 'picked_up', 'delivered', 'cancelled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."go_store_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TABLE "go_drivers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"vehicle_type" text NOT NULL,
	"vehicle_description" text NOT NULL,
	"plate" text,
	"location_id" uuid NOT NULL,
	"whatsapp_e164" text NOT NULL,
	"photo_media_id" uuid NOT NULL,
	"document_media_id" uuid NOT NULL,
	"status" "go_driver_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"online" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "go_menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"section" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_minor" integer NOT NULL,
	"photo_media_id" uuid,
	"available" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "go_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"driver_user_id" uuid,
	"status" "go_order_status" DEFAULT 'placed' NOT NULL,
	"lines" jsonb NOT NULL,
	"currency" text NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"delivery_fee_minor" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"paying_with_minor" integer,
	"dropoff_latitude" double precision,
	"dropoff_longitude" double precision,
	"dropoff_directions" text,
	"customer_whatsapp_e164" text,
	"note" text,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"assigned_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "go_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"about" text NOT NULL,
	"location_id" uuid NOT NULL,
	"address" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"whatsapp_e164" text NOT NULL,
	"photo_media_id" uuid,
	"hours" text NOT NULL,
	"currency" text NOT NULL,
	"delivery_fee_minor" integer NOT NULL,
	"minimum_order_minor" integer DEFAULT 0 NOT NULL,
	"prep_minutes" integer DEFAULT 20 NOT NULL,
	"is_open" boolean DEFAULT false NOT NULL,
	"status" "go_store_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "go_tracking" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy" integer,
	"heading" integer,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "go_drivers" ADD CONSTRAINT "go_drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_drivers" ADD CONSTRAINT "go_drivers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_drivers" ADD CONSTRAINT "go_drivers_photo_media_id_media_id_fk" FOREIGN KEY ("photo_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_drivers" ADD CONSTRAINT "go_drivers_document_media_id_media_id_fk" FOREIGN KEY ("document_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_drivers" ADD CONSTRAINT "go_drivers_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_menu_items" ADD CONSTRAINT "go_menu_items_store_id_go_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."go_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_menu_items" ADD CONSTRAINT "go_menu_items_photo_media_id_media_id_fk" FOREIGN KEY ("photo_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_orders" ADD CONSTRAINT "go_orders_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_orders" ADD CONSTRAINT "go_orders_store_id_go_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."go_stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_orders" ADD CONSTRAINT "go_orders_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_stores" ADD CONSTRAINT "go_stores_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_stores" ADD CONSTRAINT "go_stores_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_stores" ADD CONSTRAINT "go_stores_photo_media_id_media_id_fk" FOREIGN KEY ("photo_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_stores" ADD CONSTRAINT "go_stores_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_tracking" ADD CONSTRAINT "go_tracking_order_id_go_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."go_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "go_drivers_status_idx" ON "go_drivers" USING btree ("status","location_id","online");--> statement-breakpoint
CREATE INDEX "go_menu_items_store_idx" ON "go_menu_items" USING btree ("store_id","section","position");--> statement-breakpoint
CREATE UNIQUE INDEX "go_orders_code_key" ON "go_orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "go_orders_customer_idx" ON "go_orders" USING btree ("customer_user_id","placed_at");--> statement-breakpoint
CREATE INDEX "go_orders_store_idx" ON "go_orders" USING btree ("store_id","status","placed_at");--> statement-breakpoint
CREATE INDEX "go_orders_driver_idx" ON "go_orders" USING btree ("driver_user_id","status");--> statement-breakpoint
CREATE INDEX "go_orders_open_idx" ON "go_orders" USING btree ("status","placed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "go_stores_owner_key" ON "go_stores" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "go_stores_browse_idx" ON "go_stores" USING btree ("status","location_id","is_open");--> statement-breakpoint
ALTER TABLE "go_stores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "go_menu_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "go_drivers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "go_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "go_tracking" ENABLE ROW LEVEL SECURITY;
