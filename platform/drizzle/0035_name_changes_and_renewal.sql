ALTER TABLE "users" ADD COLUMN "name_changes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mercadito_listings" ADD COLUMN "renewed_at" timestamp with time zone;