CREATE TABLE "whatsapp_contacts" (
	"wa_id" text PRIMARY KEY NOT NULL,
	"name_sealed" text,
	"last_inbound_at" timestamp with time zone,
	"last_message_at" timestamp with time zone NOT NULL,
	"unread" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wa_message_id" text NOT NULL,
	"wa_id" text NOT NULL,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"body_sealed" text,
	"status" text,
	"sent_by" uuid,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_messages_wa_message_id_unique" UNIQUE("wa_message_id")
);
--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_wa_id_whatsapp_contacts_wa_id_fk" FOREIGN KEY ("wa_id") REFERENCES "public"."whatsapp_contacts"("wa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_contacts_last_idx" ON "whatsapp_contacts" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_contact_idx" ON "whatsapp_messages" USING btree ("wa_id","sent_at");