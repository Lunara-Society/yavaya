CREATE TABLE "sanctuary_candles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"for_name" text,
	"intention" text,
	"anonymous" boolean DEFAULT false NOT NULL,
	"light_date" date NOT NULL,
	"status" text DEFAULT 'lit' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"burns_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sanctuary_candles" ADD CONSTRAINT "sanctuary_candles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sanctuary_candles_day_idx" ON "sanctuary_candles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sanctuary_candles_user_idx" ON "sanctuary_candles" USING btree ("user_id","created_at");