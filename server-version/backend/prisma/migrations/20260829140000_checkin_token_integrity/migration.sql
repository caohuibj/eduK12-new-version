-- Keep the resumable legacy-token window explicit while requiring every
-- token row to have the protected lookup/encryption material once the
-- backfill has completed.  NOT VALID skips historical rows only; subsequent
-- writes are still checked.  Production must drain/stop old API and worker
-- writers before applying this migration, then backfill and validate before
-- reopening traffic.
ALTER TABLE "checkin_access_tokens"
  ADD CONSTRAINT "checkin_access_tokens_protected_fields_present"
  CHECK (
    "token" IS NOT NULL
    OR ("token_hash" IS NOT NULL AND "token_encrypted" IS NOT NULL)
  )
  NOT VALID;
