-- Keep one immutable receipt per keyed submission request.  The current
-- submission row intentionally remains mutable for backwards compatibility;
-- receipts are the source of truth for replaying older keys after a newer
-- submission has been accepted.
CREATE TABLE "submission_idempotency_receipts" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "idempotency_key_hash" TEXT NOT NULL,
    "idempotency_payload_hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_idempotency_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "submission_idempotency_receipt_scope_key"
  ON "submission_idempotency_receipts"("assignment_id", "student_id", "idempotency_key_hash");
CREATE INDEX "submission_idempotency_receipts_submission_id_idx"
  ON "submission_idempotency_receipts"("submission_id");
CREATE INDEX "submission_idempotency_receipts_created_at_idx"
  ON "submission_idempotency_receipts"("created_at");

ALTER TABLE "submission_idempotency_receipts"
  ADD CONSTRAINT "submission_idempotency_receipts_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "checkin_submission_idempotency_receipts" (
    "id" TEXT NOT NULL,
    "checkin_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "idempotency_key_hash" TEXT NOT NULL,
    "idempotency_payload_hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_submission_idempotency_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkin_submission_idempotency_receipt_scope_key"
  ON "checkin_submission_idempotency_receipts"("checkin_id", "student_id", "idempotency_key_hash");
CREATE INDEX "checkin_submission_idempotency_receipts_submission_id_idx"
  ON "checkin_submission_idempotency_receipts"("submission_id");
CREATE INDEX "checkin_submission_idempotency_receipts_created_at_idx"
  ON "checkin_submission_idempotency_receipts"("created_at");

ALTER TABLE "checkin_submission_idempotency_receipts"
  ADD CONSTRAINT "checkin_submission_idempotency_receipts_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "checkin_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
