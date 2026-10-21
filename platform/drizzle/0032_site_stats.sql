CREATE TABLE "page_views_daily" (
	"day" date NOT NULL,
	"path" text NOT NULL,
	"device" text NOT NULL,
	"source" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"entries" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "page_views_daily_day_path_device_source_pk" PRIMARY KEY("day","path","device","source")
);
--> statement-breakpoint
CREATE TABLE "web_vitals_daily" (
	"day" date NOT NULL,
	"path" text NOT NULL,
	"device" text NOT NULL,
	"metric" text NOT NULL,
	"good" integer DEFAULT 0 NOT NULL,
	"needs_improvement" integer DEFAULT 0 NOT NULL,
	"poor" integer DEFAULT 0 NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "web_vitals_daily_day_path_device_metric_pk" PRIMARY KEY("day","path","device","metric")
);
--> statement-breakpoint
-- Like every table: no access for a data API's roles (0002_data_api_lockdown). The application connects as the owner.
ALTER TABLE "page_views_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "web_vitals_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- The endpoint checks these too; the database keeps the lists closed whatever writes to it.
ALTER TABLE "page_views_daily" ADD CONSTRAINT "page_views_daily_device" CHECK ("device" IN ('phone', 'tablet', 'desktop'));--> statement-breakpoint
ALTER TABLE "page_views_daily" ADD CONSTRAINT "page_views_daily_counts" CHECK ("views" >= 0 AND "entries" >= 0 AND "entries" <= "views");--> statement-breakpoint
ALTER TABLE "web_vitals_daily" ADD CONSTRAINT "web_vitals_daily_device" CHECK ("device" IN ('phone', 'tablet', 'desktop'));--> statement-breakpoint
ALTER TABLE "web_vitals_daily" ADD CONSTRAINT "web_vitals_daily_metric" CHECK ("metric" IN ('LCP', 'INP', 'CLS', 'FCP', 'TTFB'));
