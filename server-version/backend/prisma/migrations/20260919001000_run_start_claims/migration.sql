CREATE TABLE "assessment_run_execution_start_claims" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "execution_id" TEXT NOT NULL,
  "operation_key" TEXT NOT NULL,
  "claim_generation" INTEGER NOT NULL DEFAULT 1,
  "state" TEXT NOT NULL DEFAULT 'CLAIMED',
  "claimed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_until" TIMESTAMPTZ(6) NOT NULL,
  "dispatched_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "aborted_at" TIMESTAMPTZ(6),
  "unknown_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_run_execution_start_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "run_start_claim_generation_check" CHECK ("claim_generation" >= 1),
  CONSTRAINT "run_start_claim_state_check" CHECK ("state" IN ('CLAIMED','DISPATCHED','COMPLETED','ABORTED','UNKNOWN')),
  CONSTRAINT "run_start_claim_lease_check" CHECK ("lease_until" >= "claimed_at"),
  CONSTRAINT "run_start_claim_dispatch_shape_check" CHECK (
    ("state" = 'CLAIMED' AND "dispatched_at" IS NULL AND "completed_at" IS NULL AND "aborted_at" IS NULL AND "unknown_at" IS NULL)
    OR ("state" = 'DISPATCHED' AND "dispatched_at" IS NOT NULL AND "completed_at" IS NULL AND "aborted_at" IS NULL AND "unknown_at" IS NULL)
    OR ("state" = 'COMPLETED' AND "dispatched_at" IS NOT NULL AND "completed_at" IS NOT NULL AND "aborted_at" IS NULL AND "unknown_at" IS NULL)
    OR ("state" = 'ABORTED' AND "completed_at" IS NULL AND "aborted_at" IS NOT NULL AND "unknown_at" IS NULL)
    OR ("state" = 'UNKNOWN' AND "completed_at" IS NULL AND "unknown_at" IS NOT NULL)
  ),
  CONSTRAINT "run_start_claim_execution_fkey"
    FOREIGN KEY ("organization_id", "run_id", "execution_id")
    REFERENCES "assessment_run_executions"("organization_id", "run_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "run_start_claim_execution_key"
  ON "assessment_run_execution_start_claims"("execution_id");
CREATE UNIQUE INDEX "run_start_claim_operation_key"
  ON "assessment_run_execution_start_claims"("operation_key");
CREATE INDEX "run_start_claim_recovery_idx"
  ON "assessment_run_execution_start_claims"("state", "lease_until");
