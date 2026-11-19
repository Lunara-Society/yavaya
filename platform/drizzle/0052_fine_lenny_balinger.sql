CREATE TABLE "roxi_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"form" text NOT NULL,
	"fields" jsonb NOT NULL,
	"photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roxi_drafts" ADD CONSTRAINT "roxi_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roxi_drafts_user_form_key" ON "roxi_drafts" USING btree ("user_id","form");--> statement-breakpoint
CREATE INDEX "roxi_drafts_expires_idx" ON "roxi_drafts" USING btree ("expires_at");