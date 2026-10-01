ALTER TABLE "notifications" ADD COLUMN "emailed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sanctuary_devotionals" ADD COLUMN "followers_notified_at" timestamp with time zone;--> statement-breakpoint
-- Words already published for today or earlier were announced when they were
-- published (or before notifications existed); the scheduler must not repeat them.
UPDATE "sanctuary_devotionals" SET "followers_notified_at" = "created_at" WHERE "for_date" <= current_date;
