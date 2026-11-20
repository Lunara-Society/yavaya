CREATE TABLE "mirador_offer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"quantity" smallint NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mirador_offers" (
	"video_id" uuid PRIMARY KEY NOT NULL,
	"creator_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"price_minor" bigint,
	"currency" char(3) NOT NULL,
	"unit" text,
	"quantity" smallint NOT NULL,
	"remaining" smallint NOT NULL,
	"ingredients" text,
	"food_rules_at" timestamp with time zone,
	"pickup_location_id" uuid NOT NULL,
	"pickup_details" text DEFAULT '' NOT NULL,
	"available_until" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mirador_voice_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"script" text NOT NULL,
	"voice" text NOT NULL,
	"original_volume" smallint NOT NULL,
	"characters" integer NOT NULL,
	"action_key" text NOT NULL,
	"tokens" integer NOT NULL,
	"provider_cost_micros" integer NOT NULL,
	"status" text DEFAULT 'charged' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mirador_videos" ADD COLUMN "input_kind" text DEFAULT 'video' NOT NULL;--> statement-breakpoint
ALTER TABLE "mirador_videos" ADD COLUMN "photo_keys" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "mirador_videos" ADD COLUMN "captions_key" text;--> statement-breakpoint
ALTER TABLE "mirador_videos" ADD COLUMN "version" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "mirador_offer_requests" ADD CONSTRAINT "mirador_offer_requests_video_id_mirador_offers_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."mirador_offers"("video_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_offer_requests" ADD CONSTRAINT "mirador_offer_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_offers" ADD CONSTRAINT "mirador_offers_video_id_mirador_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."mirador_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_offers" ADD CONSTRAINT "mirador_offers_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_offers" ADD CONSTRAINT "mirador_offers_pickup_location_id_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_voice_jobs" ADD CONSTRAINT "mirador_voice_jobs_video_id_mirador_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."mirador_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_voice_jobs" ADD CONSTRAINT "mirador_voice_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mirador_offer_requests_video_idx" ON "mirador_offer_requests" USING btree ("video_id","status");--> statement-breakpoint
CREATE INDEX "mirador_offer_requests_requester_idx" ON "mirador_offer_requests" USING btree ("requester_user_id","created_at");--> statement-breakpoint
CREATE INDEX "mirador_offers_open_idx" ON "mirador_offers" USING btree ("status","kind","available_until");--> statement-breakpoint
CREATE INDEX "mirador_offers_creator_idx" ON "mirador_offers" USING btree ("creator_user_id","status");--> statement-breakpoint
CREATE INDEX "mirador_voice_jobs_status_idx" ON "mirador_voice_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "mirador_voice_jobs_video_idx" ON "mirador_voice_jobs" USING btree ("video_id");