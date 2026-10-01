CREATE TYPE "public"."safe_space_member_kind" AS ENUM('member', 'professional');--> statement-breakpoint
CREATE TYPE "public"."safe_space_member_status" AS ENUM('active', 'banned');--> statement-breakpoint
CREATE TYPE "public"."safe_space_report_status" AS ENUM('open', 'dismissed', 'removed', 'banned');--> statement-breakpoint
CREATE TABLE "safe_space_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "safe_space_member_kind" NOT NULL,
	"handle" text NOT NULL,
	"profession" text,
	"status" "safe_space_member_status" DEFAULT 'active' NOT NULL,
	"show_presence" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"handle_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safe_space_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_member_id" uuid,
	"reported_member_id" uuid NOT NULL,
	"source" text NOT NULL,
	"message_id" uuid,
	"snapshot_sealed" text NOT NULL,
	"category" text NOT NULL,
	"note_sealed" text,
	"status" "safe_space_report_status" DEFAULT 'open' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safe_space_room_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_member_id" uuid NOT NULL,
	"body_sealed" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safe_space_thread_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_member_id" uuid NOT NULL,
	"body_sealed" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safe_space_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_a" uuid NOT NULL,
	"member_b" uuid NOT NULL,
	"started_by" uuid NOT NULL,
	"blocked_by" uuid,
	"a_read_at" timestamp with time zone,
	"b_read_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "safe_space_members" ADD CONSTRAINT "safe_space_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_space_reports" ADD CONSTRAINT "safe_space_reports_reporter_member_id_safe_space_members_id_fk" FOREIGN KEY ("reporter_member_id") REFERENCES "public"."safe_space_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_space_reports" ADD CONSTRAINT "safe_space_reports_reported_member_id_safe_space_members_id_fk" FOREIGN KEY ("reported_member_id") REFERENCES "public"."safe_space_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_space_reports" ADD CONSTRAINT "safe_space_reports_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_space_room_messages" ADD CONSTRAINT "safe_space_room_messages_author_member_id_safe_space_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."safe_space_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_space_thread_messages" ADD CONSTRAINT "safe_space_thread_messages_thread_id_safe_space_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."safe_space_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_space_thread_messages" ADD CONSTRAINT "safe_space_thread_messages_author_member_id_safe_space_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."safe_space_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_space_threads" ADD CONSTRAINT "safe_space_threads_member_a_safe_space_members_id_fk" FOREIGN KEY ("member_a") REFERENCES "public"."safe_space_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safe_space_threads" ADD CONSTRAINT "safe_space_threads_member_b_safe_space_members_id_fk" FOREIGN KEY ("member_b") REFERENCES "public"."safe_space_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "safe_space_members_user_key" ON "safe_space_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "safe_space_members_handle_key" ON "safe_space_members" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "safe_space_members_presence_idx" ON "safe_space_members" USING btree ("status","last_seen_at");--> statement-breakpoint
CREATE INDEX "safe_space_reports_status_idx" ON "safe_space_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "safe_space_reports_once" ON "safe_space_reports" USING btree ("reporter_member_id","message_id");--> statement-breakpoint
CREATE INDEX "safe_space_room_messages_created_idx" ON "safe_space_room_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "safe_space_thread_messages_thread_idx" ON "safe_space_thread_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "safe_space_threads_pair_key" ON "safe_space_threads" USING btree ("member_a","member_b");--> statement-breakpoint
CREATE INDEX "safe_space_threads_b_idx" ON "safe_space_threads" USING btree ("member_b");--> statement-breakpoint
ALTER TABLE "safe_space_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "safe_space_room_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "safe_space_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "safe_space_thread_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "safe_space_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "safe_space_members" ADD CONSTRAINT "safe_space_members_profession" CHECK (("kind" = 'professional') = ("profession" IN ('psychology', 'psychiatry')) AND ("kind" = 'member') = ("profession" IS NULL));--> statement-breakpoint
ALTER TABLE "safe_space_threads" ADD CONSTRAINT "safe_space_threads_ordered_pair" CHECK ("member_a" < "member_b");--> statement-breakpoint
ALTER TABLE "safe_space_room_messages" ADD CONSTRAINT "safe_space_room_messages_sealed" CHECK ("body_sealed" LIKE 'v1.%');--> statement-breakpoint
ALTER TABLE "safe_space_thread_messages" ADD CONSTRAINT "safe_space_thread_messages_sealed" CHECK ("body_sealed" LIKE 'v1.%');--> statement-breakpoint
ALTER TABLE "safe_space_reports" ADD CONSTRAINT "safe_space_reports_source" CHECK ("source" IN ('room', 'thread'));
