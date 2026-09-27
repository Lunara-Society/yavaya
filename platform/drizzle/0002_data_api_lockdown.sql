-- Close any auto-exposed data API, and deny every role that is not the owner.
--
-- Managed Postgres platforms commonly publish the `public` schema through a
-- REST layer reachable with a browser-side key. Supabase does this by default:
-- on a fresh project every table in `public` is readable through PostgREST with
-- the anon key unless privileges are revoked or row-level security denies it.
--
-- For Yavaya that default would expose password hashes, session token hashes,
-- verification codes, risk assessments, moderation notes and the audit log.
--
-- Yavaya never uses such an API. It connects directly to Postgres as the owner
-- role and enforces access in the application, where `requirePermission` and
-- the Trust Shield boundary live. So the fix is to remove the API's access
-- rather than write policies for an interface nothing uses.
--
-- Two independent layers, because a single one failing quietly is the whole
-- risk:
--   1. No privileges for the API roles, including on tables created later.
--   2. RLS enabled with no policies, which denies every non-owner role.
--
-- The owner role bypasses RLS, so the application is unaffected. If Yavaya is
-- ever pointed at a non-owner role, policies must be written first or every
-- query will return nothing.
--
-- The role checks make this migration a no-op on a plain Postgres (local and
-- CI), where `anon` and `authenticated` do not exist.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;
  END IF;
END $$;
--> statement-breakpoint

-- Defence in depth: RLS with no policies denies every role except the owner.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint

-- A mutable search_path lets a caller shadow the objects a function resolves.
-- This one only raises an exception, but it runs on every write to the
-- append-only tables, so it is pinned rather than left to chance.
ALTER FUNCTION public.yavaya_reject_mutation() SET search_path = pg_catalog;
