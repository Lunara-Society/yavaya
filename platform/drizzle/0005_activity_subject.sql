ALTER TABLE "activity_events" ADD COLUMN "subject_type" text;--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "subject_id" text;--> statement-breakpoint
-- Listing events recorded before subjects were tracked cannot be checked
-- against their listing. The only one in production is a staff test listing
-- that was withdrawn at once, so they are retired from the feed.
UPDATE "activity_events" SET "visible_until" = now()
WHERE "kind" = 'listing_published' AND "subject_id" IS NULL;
