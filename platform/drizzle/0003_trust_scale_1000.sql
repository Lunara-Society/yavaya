-- Trust score scale: 0–100 → 0–1000, as the Master Bible specifies.
--
-- Stored scores and every rule delta are multiplied by ten, so an account
-- keeps its standing and each rule keeps its weight relative to the others.
-- reputation_events is append-only evidence and is deliberately not
-- rewritten: events recorded before this migration carry deltas and
-- score_after values on the 0–100 scale.
ALTER TABLE reputation_scores DROP CONSTRAINT reputation_scores_range;
--> statement-breakpoint
UPDATE reputation_scores SET score = score * 10, updated_at = now();
--> statement-breakpoint
ALTER TABLE reputation_scores
  ADD CONSTRAINT reputation_scores_range CHECK (score >= 0 AND score <= 1000);
--> statement-breakpoint
UPDATE reputation_rules SET delta = delta * 10, updated_at = now();
