ALTER TYPE "public"."payment_domain" ADD VALUE 'play_gems';--> statement-breakpoint
ALTER TABLE "play_progress" ADD COLUMN "gems" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "play_rewards" ADD COLUMN "gems" integer DEFAULT 0 NOT NULL;