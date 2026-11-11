CREATE TABLE "board_post_photos" (
	"post_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_post_photos" ADD CONSTRAINT "board_post_photos_post_id_board_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."board_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_post_photos" ADD CONSTRAINT "board_post_photos_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_post_photos_media_key" ON "board_post_photos" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "board_post_photos_position_key" ON "board_post_photos" USING btree ("post_id","position");