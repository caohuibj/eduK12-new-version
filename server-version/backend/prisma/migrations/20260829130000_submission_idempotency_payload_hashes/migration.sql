-- Bind an explicit retry key to the logical request payload. Existing rows
-- remain compatible: controllers fall back to hashing persisted content until
-- the next keyed write supplies this column.
ALTER TABLE "submissions"
  ADD COLUMN "idempotency_payload_hash" TEXT;

ALTER TABLE "checkin_submissions"
  ADD COLUMN "idempotency_payload_hash" TEXT;
