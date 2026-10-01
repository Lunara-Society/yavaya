CREATE TYPE "public"."animals_lost_found_kind" AS ENUM('lost', 'found');--> statement-breakpoint
CREATE TYPE "public"."animals_lost_found_status" AS ENUM('open', 'reunited', 'closed', 'removed');--> statement-breakpoint
CREATE TABLE "animals_lost_found" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"kind" "animals_lost_found_kind" NOT NULL,
	"species" text NOT NULL,
	"name" text,
	"description" text NOT NULL,
	"location_id" uuid NOT NULL,
	"seen_on" date NOT NULL,
	"whatsapp_e164" text NOT NULL,
	"status" "animals_lost_found_status" DEFAULT 'open' NOT NULL,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "animals_lost_found_photos" (
	"post_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "animals_lost_found_photos_post_id_media_id_pk" PRIMARY KEY("post_id","media_id")
);
--> statement-breakpoint
ALTER TABLE "animals_lost_found" ADD CONSTRAINT "animals_lost_found_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_lost_found" ADD CONSTRAINT "animals_lost_found_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_lost_found" ADD CONSTRAINT "animals_lost_found_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_lost_found_photos" ADD CONSTRAINT "animals_lost_found_photos_post_id_animals_lost_found_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."animals_lost_found"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals_lost_found_photos" ADD CONSTRAINT "animals_lost_found_photos_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "animals_lost_found_browse_idx" ON "animals_lost_found" USING btree ("status","kind","created_at");--> statement-breakpoint
CREATE INDEX "animals_lost_found_match_idx" ON "animals_lost_found" USING btree ("location_id","species","kind","status");--> statement-breakpoint
CREATE INDEX "animals_lost_found_author_idx" ON "animals_lost_found" USING btree ("author_user_id","created_at");--> statement-breakpoint
ALTER TABLE "animals_lost_found" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "animals_lost_found_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "animals_lost_found" ADD CONSTRAINT "animals_lost_found_species" CHECK ("species" IN ('dog', 'cat', 'other'));--> statement-breakpoint
ALTER TABLE "animals_lost_found" ADD CONSTRAINT "animals_lost_found_whatsapp_e164" CHECK ("whatsapp_e164" ~ '^\+[1-9][0-9]{6,14}$');
