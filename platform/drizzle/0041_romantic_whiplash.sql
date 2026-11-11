ALTER TABLE "whatsapp_contacts" ADD COLUMN "roxi_paused_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN "needs_team" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD COLUMN "roxi_answered_through" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD COLUMN "by_roxi" boolean DEFAULT false NOT NULL;