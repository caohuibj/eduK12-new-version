ALTER TABLE "submissions"
  ADD COLUMN "idempotency_key_hash" TEXT;

ALTER TABLE "checkin_submissions"
  ADD COLUMN "idempotency_key_hash" TEXT;
