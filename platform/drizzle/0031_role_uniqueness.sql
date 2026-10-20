-- One row per person, role and scope. A global role's scope_ref is NULL, and
-- the old unique index let NULLs differ, so grantRole's ON CONFLICT never
-- matched a global role: every grant added a row (the admin bootstrap, run on
-- every deploy, stacked the owner's admin role ~100 times; a re-appointment
-- added another). Keep one row per group — the active one granted first, or
-- if none is active, the first one — then let the constraint hold the line.
-- The history of who was appointed and removed stays in the audit log.
DELETE FROM "user_roles" WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "user_id", "role_key", "scope", "scope_ref"
      ORDER BY ("revoked_at" IS NULL) DESC, "granted_at" ASC, "id" ASC
    ) AS "n"
    FROM "user_roles"
  ) AS "ranked"
  WHERE "n" > 1
);--> statement-breakpoint
DROP INDEX "user_roles_key";--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_key" UNIQUE NULLS NOT DISTINCT("user_id","role_key","scope","scope_ref");