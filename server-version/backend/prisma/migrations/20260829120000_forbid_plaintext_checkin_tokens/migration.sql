-- New check-in access tokens are never allowed to persist the bearer value.
-- NOT VALID skips existing rows only; subsequent writes are still checked.
-- Production must drain/stop old API and worker writers before this migration,
-- then run the explicit legacy backfill and validate the constraints before
-- reopening traffic (see the deployment runbook).
ALTER TABLE "checkin_access_tokens"
  ADD CONSTRAINT "checkin_access_tokens_token_must_be_null"
  CHECK ("token" IS NULL)
  NOT VALID;
