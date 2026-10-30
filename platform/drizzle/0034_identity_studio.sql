CREATE TABLE "identity_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"appearance" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "identity_draft" jsonb;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "identity_published" jsonb;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "identity_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "identity_draft_saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "identity_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "identity_favorites" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "dashboard_layout" jsonb;--> statement-breakpoint
ALTER TABLE "identity_presets" ADD CONSTRAINT "identity_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_presets_user_name_key" ON "identity_presets" USING btree ("user_id","name");--> statement-breakpoint
-- The application caps a configuration far below these (PROFILE_STUDIO_RULES.maxConfigBytes);
-- the database refuses anything that slipped past it, so a profile can never become storage.
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_identity_draft_size" CHECK (identity_draft IS NULL OR octet_length(identity_draft::text) <= 65536);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_identity_published_size" CHECK (identity_published IS NULL OR octet_length(identity_published::text) <= 65536);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_dashboard_layout_size" CHECK (dashboard_layout IS NULL OR octet_length(dashboard_layout::text) <= 8192);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_identity_favorites_count" CHECK (cardinality(identity_favorites) <= 200);--> statement-breakpoint
ALTER TABLE "identity_presets" ADD CONSTRAINT "identity_presets_appearance_size" CHECK (octet_length(appearance::text) <= 16384);--> statement-breakpoint
ALTER TABLE "identity_presets" ADD CONSTRAINT "identity_presets_name_length" CHECK (char_length(name) BETWEEN 1 AND 80);
