CREATE TABLE "play_achievements" (
	"user_id" uuid NOT NULL,
	"achievement" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "play_achievements_user_id_achievement_pk" PRIMARY KEY("user_id","achievement")
);
--> statement-breakpoint
CREATE TABLE "play_items" (
	"user_id" uuid NOT NULL,
	"item" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "play_items_user_id_item_pk" PRIMARY KEY("user_id","item")
);
--> statement-breakpoint
CREATE TABLE "play_progress" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "play_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"ref" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "play_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course" text NOT NULL,
	"seconds" double precision NOT NULL,
	"medal" text NOT NULL,
	"no_checkpoints" boolean DEFAULT false NOT NULL,
	"fails" integer DEFAULT 0 NOT NULL,
	"input" text NOT NULL,
	"best" boolean DEFAULT false NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "play_stats" (
	"day" date NOT NULL,
	"key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "play_stats_day_key_pk" PRIMARY KEY("day","key")
);
--> statement-breakpoint
ALTER TABLE "play_achievements" ADD CONSTRAINT "play_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_items" ADD CONSTRAINT "play_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_progress" ADD CONSTRAINT "play_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_rewards" ADD CONSTRAINT "play_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_runs" ADD CONSTRAINT "play_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "play_rewards_once_idx" ON "play_rewards" USING btree ("user_id","reason","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "play_runs_best_idx" ON "play_runs" USING btree ("user_id","course") WHERE "play_runs"."best";--> statement-breakpoint
CREATE INDEX "play_runs_board_idx" ON "play_runs" USING btree ("course","seconds");