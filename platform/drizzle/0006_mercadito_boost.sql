ALTER TYPE "public"."listing_status" ADD VALUE 'reserved';--> statement-breakpoint
CREATE TABLE "mercadito_saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"query" text,
	"category" "listing_category",
	"place_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mercadito_saved_searches" ADD CONSTRAINT "mercadito_saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mercadito_saved_searches_user_idx" ON "mercadito_saved_searches" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "mercadito_saved_searches" ENABLE ROW LEVEL SECURITY;
