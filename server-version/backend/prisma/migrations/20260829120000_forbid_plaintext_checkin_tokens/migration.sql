-- New check-in access tokens are never allowed to persist the bearer value.
-- NOT VALID keeps the migration safe before the explicit legacy backfill; the
-- backfill validates this constraint after it reports remaining = 0.
ALTER TABLE "checkin_access_tokens"
  ADD CONSTRAINT "checkin_access_tokens_token_must_be_null"
  CHECK ("token" IS NULL)
  NOT VALID;
