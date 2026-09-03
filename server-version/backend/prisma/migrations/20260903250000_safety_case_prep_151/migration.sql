-- Prep 15.1: safety deadlines, sourceRecordId, wakeup ledger, prior_case FK

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'SafetyCaseEventType' AND e.enumlabel = 'WAKEUP_DUPLICATE_NOOP'
  ) THEN
    ALTER TYPE "SafetyCaseEventType" ADD VALUE 'WAKEUP_DUPLICATE_NOOP';
  END IF;
END $$;

ALTER TABLE "safety_cases"
  ADD COLUMN IF NOT EXISTS "trigger_source_record_id" TEXT,
  ADD COLUMN IF NOT EXISTS "ack_due_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dispose_due_at" TIMESTAMP(3);

UPDATE "safety_cases" AS sc
SET
  "ack_due_at" = COALESCE(sc."ack_due_at", sc."created_at" + (p."acknowledge_within_ms" * INTERVAL '1 millisecond')),
  "dispose_due_at" = COALESCE(sc."dispose_due_at", sc."created_at" + (p."dispose_within_ms" * INTERVAL '1 millisecond'))
FROM "safety_policy_templates" p
WHERE p."policy_key" = sc."policy_key"
  AND p."policy_version" = sc."policy_version"
  AND (sc."ack_due_at" IS NULL OR sc."dispose_due_at" IS NULL);

UPDATE "safety_cases"
SET
  "ack_due_at" = COALESCE("ack_due_at", "created_at" + INTERVAL '60 seconds'),
  "dispose_due_at" = COALESCE("dispose_due_at", "created_at" + INTERVAL '5 minutes')
WHERE "ack_due_at" IS NULL OR "dispose_due_at" IS NULL;

ALTER TABLE "safety_cases"
  ALTER COLUMN "ack_due_at" SET NOT NULL,
  ALTER COLUMN "dispose_due_at" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'safety_cases_prior_case_id_fkey'
  ) THEN
    ALTER TABLE "safety_cases"
      ADD CONSTRAINT "safety_cases_prior_case_id_fkey"
      FOREIGN KEY ("prior_case_id") REFERENCES "safety_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "safety_wakeup_ledger" (
    "id" TEXT NOT NULL,
    "wakeup_job_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fire_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    CONSTRAINT "safety_wakeup_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "safety_wakeup_ledger_wakeup_job_id_key"
  ON "safety_wakeup_ledger"("wakeup_job_id");
CREATE INDEX IF NOT EXISTS "safety_wakeup_ledger_case_id_status_idx"
  ON "safety_wakeup_ledger"("case_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'safety_wakeup_ledger_case_id_fkey'
  ) THEN
    ALTER TABLE "safety_wakeup_ledger"
      ADD CONSTRAINT "safety_wakeup_ledger_case_id_fkey"
      FOREIGN KEY ("case_id") REFERENCES "safety_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "safety_case_events_wakeup_job_id_idx"
  ON "safety_case_events"("wakeup_job_id");
