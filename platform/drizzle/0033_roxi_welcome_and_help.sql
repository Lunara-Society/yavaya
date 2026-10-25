CREATE TABLE "roxi_welcome_plays" (
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"welcome_key" text NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roxi_welcome_plays_user_id_session_id_pk" PRIMARY KEY("user_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "roxi_help_daily" (
	"day" date NOT NULL,
	"event" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "roxi_help_daily_day_event_pk" PRIMARY KEY("day","event")
);
--> statement-breakpoint
ALTER TABLE "roxi_welcome_plays" ADD CONSTRAINT "roxi_welcome_plays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roxi_welcome_plays_user_idx" ON "roxi_welcome_plays" USING btree ("user_id","welcome_key");