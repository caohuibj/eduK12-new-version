-- Additive migration: old application images continue to read/write existing tables.
ALTER TABLE "composite_assessment_attempts" ADD COLUMN "async_report_epoch" INTEGER;
CREATE TYPE "CompositeReportJobStatus" AS ENUM ('PENDING','PROCESSING','WAITING','READY','FAILED','CANCELLED');
CREATE TABLE "composite_report_jobs" (
  "id" TEXT PRIMARY KEY,
  "attempt_id" TEXT NOT NULL,
  "attempt_epoch" INTEGER NOT NULL CHECK ("attempt_epoch" > 0),
  "slot_set_hash" TEXT NOT NULL,
  "context_hash" TEXT,
  "status" "CompositeReportJobStatus" NOT NULL DEFAULT 'WAITING',
  "requested_revision" INTEGER NOT NULL DEFAULT 1,
  "claimed_revision" INTEGER NOT NULL DEFAULT 0,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "budget_held" BOOLEAN NOT NULL DEFAULT false,
  "lease_token" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "report_encrypted" TEXT,
  "aggregate_input_hash" TEXT,
  "error_code" TEXT,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  CONSTRAINT "composite_report_jobs_attempt_epoch_key" UNIQUE ("attempt_id","attempt_epoch"),
  CONSTRAINT "composite_report_jobs_revision_check" CHECK ("requested_revision" >= "claimed_revision" AND "claimed_revision" >= 0),
  CONSTRAINT "composite_report_jobs_lease_check" CHECK (("status" = 'PROCESSING') = ("lease_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL)),
  CONSTRAINT "composite_report_jobs_ready_check" CHECK ("status" <> 'READY' OR ("report_encrypted" IS NOT NULL AND "aggregate_input_hash" IS NOT NULL)),
  CONSTRAINT "composite_report_jobs_budget_check" CHECK ("budget_held" = ("status" IN ('PENDING','PROCESSING')))
);
CREATE INDEX "composite_report_jobs_pending_idx" ON "composite_report_jobs" ("status","next_attempt_at");
CREATE INDEX "composite_report_jobs_lease_idx" ON "composite_report_jobs" ("status","lease_expires_at");
CREATE TABLE "composite_report_queue_budget" (
  "id" TEXT PRIMARY KEY,
  "pending" INTEGER NOT NULL DEFAULT 0 CHECK ("pending" >= 0)
);
INSERT INTO "composite_report_queue_budget" ("id","pending") VALUES ('reports',0);
