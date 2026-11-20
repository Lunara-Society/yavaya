CREATE TABLE "mirador_blocks" (
	"blocker_user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mirador_blocks_blocker_user_id_blocked_user_id_pk" PRIMARY KEY("blocker_user_id","blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "mirador_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"parent_id" uuid,
	"body" text NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mirador_follows" (
	"follower_user_id" uuid NOT NULL,
	"creator_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mirador_follows_follower_user_id_creator_user_id_pk" PRIMARY KEY("follower_user_id","creator_user_id")
);
--> statement-breakpoint
CREATE TABLE "mirador_likes" (
	"video_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mirador_likes_video_id_user_id_pk" PRIMARY KEY("video_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "mirador_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"interests" text[] DEFAULT '{}' NOT NULL,
	"reset_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mirador_saves" (
	"video_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mirador_saves_video_id_user_id_pk" PRIMARY KEY("video_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "mirador_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_user_id" uuid NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"hashtags" text[] DEFAULT '{}' NOT NULL,
	"location_id" uuid,
	"language" text DEFAULT 'es' NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"district" text,
	"link_type" text,
	"link_id" uuid,
	"original_key" text,
	"original_bytes" integer,
	"upload_id" text,
	"upload_parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"playback_key" text,
	"low_key" text,
	"poster_key" text,
	"playback_bytes" integer,
	"low_bytes" integer,
	"duration_ms" integer,
	"width" smallint,
	"height" smallint,
	"has_audio" boolean DEFAULT false NOT NULL,
	"processing_attempts" smallint DEFAULT 0 NOT NULL,
	"processing_started_at" timestamp with time zone,
	"failure_reason" text,
	"views" integer DEFAULT 0 NOT NULL,
	"completions" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"link_opens" integer DEFAULT 0 NOT NULL,
	"reports" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"removed_reason" text
);
--> statement-breakpoint
CREATE TABLE "mirador_views" (
	"video_id" uuid NOT NULL,
	"viewer_key" text NOT NULL,
	"user_id" uuid,
	"day" date NOT NULL,
	"watched_ms" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"replays" smallint DEFAULT 0 NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mirador_blocks" ADD CONSTRAINT "mirador_blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_blocks" ADD CONSTRAINT "mirador_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_comments" ADD CONSTRAINT "mirador_comments_video_id_mirador_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."mirador_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_comments" ADD CONSTRAINT "mirador_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_follows" ADD CONSTRAINT "mirador_follows_follower_user_id_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_follows" ADD CONSTRAINT "mirador_follows_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_likes" ADD CONSTRAINT "mirador_likes_video_id_mirador_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."mirador_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_likes" ADD CONSTRAINT "mirador_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_preferences" ADD CONSTRAINT "mirador_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_saves" ADD CONSTRAINT "mirador_saves_video_id_mirador_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."mirador_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_saves" ADD CONSTRAINT "mirador_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_videos" ADD CONSTRAINT "mirador_videos_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_videos" ADD CONSTRAINT "mirador_videos_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_videos" ADD CONSTRAINT "mirador_videos_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_views" ADD CONSTRAINT "mirador_views_video_id_mirador_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."mirador_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirador_views" ADD CONSTRAINT "mirador_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mirador_comments_video_idx" ON "mirador_comments" USING btree ("video_id","status","created_at");--> statement-breakpoint
CREATE INDEX "mirador_comments_parent_idx" ON "mirador_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "mirador_follows_creator_idx" ON "mirador_follows" USING btree ("creator_user_id","created_at");--> statement-breakpoint
CREATE INDEX "mirador_likes_user_idx" ON "mirador_likes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "mirador_saves_user_idx" ON "mirador_saves" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "mirador_videos_feed_idx" ON "mirador_videos" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "mirador_videos_creator_idx" ON "mirador_videos" USING btree ("creator_user_id","created_at");--> statement-breakpoint
CREATE INDEX "mirador_videos_link_idx" ON "mirador_videos" USING btree ("link_type","link_id");--> statement-breakpoint
CREATE INDEX "mirador_videos_location_idx" ON "mirador_videos" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mirador_views_key" ON "mirador_views" USING btree ("video_id","viewer_key","day");--> statement-breakpoint
CREATE INDEX "mirador_views_user_idx" ON "mirador_views" USING btree ("user_id","updated_at");