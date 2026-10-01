CREATE TYPE "public"."work_application_status" AS ENUM('submitted', 'shortlisted', 'declined', 'hired', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."work_post_kind" AS ENUM('job', 'project');--> statement-breakpoint
CREATE TYPE "public"."work_post_status" AS ENUM('open', 'closed', 'filled', 'removed');--> statement-breakpoint
CREATE TYPE "public"."work_profile_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "work_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"candidate_user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"status" "work_application_status" DEFAULT 'submitted' NOT NULL,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_user_id" uuid NOT NULL,
	"kind" "work_post_kind" NOT NULL,
	"employment" text NOT NULL,
	"field" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"requirements" text,
	"pay_text" text NOT NULL,
	"company_name" text,
	"location_id" uuid NOT NULL,
	"place_mode" text NOT NULL,
	"whatsapp_e164" text NOT NULL,
	"status" "work_post_status" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"headline" text NOT NULL,
	"about" text NOT NULL,
	"fields" text[] NOT NULL,
	"skills" text,
	"experience_years" integer,
	"portfolio_links" text[] DEFAULT '{}' NOT NULL,
	"location_id" uuid NOT NULL,
	"whatsapp_e164" text NOT NULL,
	"open_to_work" boolean DEFAULT true NOT NULL,
	"status" "work_profile_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_applications" ADD CONSTRAINT "work_applications_post_id_work_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."work_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_applications" ADD CONSTRAINT "work_applications_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_posts" ADD CONSTRAINT "work_posts_employer_user_id_users_id_fk" FOREIGN KEY ("employer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_posts" ADD CONSTRAINT "work_posts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_posts" ADD CONSTRAINT "work_posts_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_profiles" ADD CONSTRAINT "work_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_profiles" ADD CONSTRAINT "work_profiles_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_applications_one_per_candidate" ON "work_applications" USING btree ("post_id","candidate_user_id");--> statement-breakpoint
CREATE INDEX "work_applications_candidate_idx" ON "work_applications" USING btree ("candidate_user_id","created_at");--> statement-breakpoint
CREATE INDEX "work_posts_board_idx" ON "work_posts" USING btree ("status","field","created_at");--> statement-breakpoint
CREATE INDEX "work_posts_employer_idx" ON "work_posts" USING btree ("employer_user_id","status");--> statement-breakpoint
CREATE INDEX "work_posts_expiry_idx" ON "work_posts" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "work_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_profiles" ADD CONSTRAINT "work_profiles_whatsapp_e164" CHECK ("whatsapp_e164" ~ '^\+[1-9][0-9]{6,14}$');--> statement-breakpoint
ALTER TABLE "work_posts" ADD CONSTRAINT "work_posts_whatsapp_e164" CHECK ("whatsapp_e164" ~ '^\+[1-9][0-9]{6,14}$');--> statement-breakpoint
ALTER TABLE "work_profiles" ADD CONSTRAINT "work_profiles_fields_present" CHECK (cardinality("fields") >= 1);--> statement-breakpoint
ALTER TABLE "work_posts" ADD CONSTRAINT "work_posts_pay_present" CHECK (length(trim("pay_text")) > 0);
