-- Append-only enforcement for the records Yavaya must be able to prove.
--
-- The audit log, the token ledger and the reputation event stream are evidence.
-- Application code is not trusted to leave them alone: the database refuses
-- UPDATE and DELETE outright, so "silently altering a balance" is not something
-- a bug, a migration script or a compromised service account can do.
--
-- Corrections are made by appending a compensating entry, never by editing.

CREATE OR REPLACE FUNCTION yavaya_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'Table % is append-only; % is not permitted. Append a compensating entry instead.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION yavaya_reject_mutation();
--> statement-breakpoint

CREATE TRIGGER token_ledger_append_only
  BEFORE UPDATE OR DELETE ON token_ledger
  FOR EACH ROW EXECUTE FUNCTION yavaya_reject_mutation();
--> statement-breakpoint

CREATE TRIGGER reputation_events_append_only
  BEFORE UPDATE OR DELETE ON reputation_events
  FOR EACH ROW EXECUTE FUNCTION yavaya_reject_mutation();
--> statement-breakpoint

CREATE TRIGGER payment_events_append_only
  BEFORE UPDATE OR DELETE ON payment_events
  FOR EACH ROW EXECUTE FUNCTION yavaya_reject_mutation();
--> statement-breakpoint

-- A token account's balance must always equal the balance recorded by its most
-- recent ledger entry. This is a structural guard against a code path that
-- updates the cache without writing the ledger row.
ALTER TABLE token_accounts
  ADD CONSTRAINT token_accounts_balance_non_negative CHECK (balance >= 0);
--> statement-breakpoint

-- A ledger entry may not move an account below zero.
ALTER TABLE token_ledger
  ADD CONSTRAINT token_ledger_balance_after_non_negative CHECK (balance_after >= 0);
--> statement-breakpoint

-- A charge entry must be negative and a grant entry must be positive; a
-- "charge" that credits tokens is a bug, not a business case.
ALTER TABLE token_ledger
  ADD CONSTRAINT token_ledger_delta_direction CHECK (
    (reason IN ('action_charge', 'admin_revoke', 'transfer_out') AND delta < 0)
    OR (reason IN ('starter_grant', 'purchase', 'admin_grant', 'reward', 'referral',
                   'tavern_reward', 'action_refund', 'transfer_in') AND delta > 0)
    OR (reason = 'admin_correction' AND delta <> 0)
  );
--> statement-breakpoint

-- Reputation stays inside its declared range no matter which code path writes it.
ALTER TABLE reputation_scores
  ADD CONSTRAINT reputation_scores_range CHECK (score >= 0 AND score <= 100);
--> statement-breakpoint

-- A location may not be its own parent.
ALTER TABLE locations
  ADD CONSTRAINT locations_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id);
--> statement-breakpoint

-- A user token account must reference a user; a treasury account must not.
ALTER TABLE token_accounts
  ADD CONSTRAINT token_accounts_owner_shape CHECK (
    (kind = 'user' AND user_id IS NOT NULL AND handle IS NULL)
    OR (kind <> 'user' AND user_id IS NULL AND handle IS NOT NULL)
  );
--> statement-breakpoint

-- Permanent removal never expires.
ALTER TABLE enforcement_records
  ADD CONSTRAINT enforcement_permanent_has_no_expiry CHECK (
    type <> 'permanent_removal' OR expires_at IS NULL
  );
