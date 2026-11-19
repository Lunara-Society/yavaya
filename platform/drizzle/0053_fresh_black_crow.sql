ALTER TABLE "whatsapp_messages" ADD COLUMN "media_id" text;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD COLUMN "media_mime" text;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD COLUMN "media_used_at" timestamp with time zone;