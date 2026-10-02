CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"summary" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "job_runs_failed_idx" ON "job_runs" USING btree ("ok","started_at");--> statement-breakpoint
ALTER TABLE "job_runs" ENABLE ROW LEVEL SECURITY;
