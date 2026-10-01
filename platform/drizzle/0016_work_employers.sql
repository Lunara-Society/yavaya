CREATE TYPE "public"."work_employer_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TABLE "work_employers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"registration" text,
	"about" text NOT NULL,
	"website" text,
	"location_id" uuid NOT NULL,
	"whatsapp_e164" text NOT NULL,
	"status" "work_employer_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_employers" ADD CONSTRAINT "work_employers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_employers" ADD CONSTRAINT "work_employers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_employers" ADD CONSTRAINT "work_employers_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_employers_status_idx" ON "work_employers" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "work_employers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_employers" ADD CONSTRAINT "work_employers_kind" CHECK ("kind" IN ('person', 'business'));--> statement-breakpoint
ALTER TABLE "work_employers" ADD CONSTRAINT "work_employers_business_registration" CHECK ("kind" <> 'business' OR length(trim(coalesce("registration", ''))) > 0);--> statement-breakpoint
ALTER TABLE "work_employers" ADD CONSTRAINT "work_employers_whatsapp_e164" CHECK ("whatsapp_e164" ~ '^\+[1-9][0-9]{6,14}$');
