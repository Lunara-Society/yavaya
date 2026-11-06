CREATE TABLE "roxi_business_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"cost_minor" integer,
	"currency" text NOT NULL,
	"occurred_on" text NOT NULL,
	"note_sealed" text,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roxi_business_entries" ADD CONSTRAINT "roxi_business_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roxi_business_entries_user_idx" ON "roxi_business_entries" USING btree ("user_id","occurred_on");