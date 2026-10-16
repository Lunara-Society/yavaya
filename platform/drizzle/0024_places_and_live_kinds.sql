ALTER TYPE "public"."activity_kind" ADD VALUE 'animal_listed';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'pet_lost';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'pet_found';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'church_joined';--> statement-breakpoint
ALTER TYPE "public"."activity_kind" ADD VALUE 'community_post_published';--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "population" integer;