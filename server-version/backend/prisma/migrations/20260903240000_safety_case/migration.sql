-- Commit 14: SafetyPolicyTemplate + SafetyCase + append-only events (additive)

CREATE TYPE "SafetyPolicyStatus" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');
CREATE TYPE "SafetyCaseStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ESCALATED', 'DISPOSED', 'REFERRED');
CREATE TYPE "SafetyCaseEventType" AS ENUM ('CREATED', 'ACKNOWLEDGED', 'ACTION_RECORDED', 'ESCALATED', 'DISPOSED', 'REFERRED', 'WAKEUP_SCHEDULED', 'WAKEUP_FIRED', 'RECONCILED');

CREATE TABLE "safety_policy_templates" (
    "id" TEXT NOT NULL,
    "policy_key" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "status" "SafetyPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "acknowledge_within_ms" INTEGER NOT NULL,
    "dispose_within_ms" INTEGER NOT NULL,
    "escalation_chain_json" JSONB NOT NULL,
    "production_trigger_enabled" BOOLEAN NOT NULL DEFAULT false,
    "test_only_authoritative_fixture" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" TEXT NOT NULL,
    "approved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "safety_policy_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "safety_policy_templates_policy_key_policy_version_key"
  ON "safety_policy_templates"("policy_key", "policy_version");

CREATE TABLE "safety_cases" (
    "id" TEXT NOT NULL,
    "policy_key" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "status" "SafetyCaseStatus" NOT NULL DEFAULT 'OPEN',
    "subject_user_id" TEXT NOT NULL,
    "primary_owner_user_id" TEXT NOT NULL,
    "backup_owner_user_ids" TEXT[] NOT NULL,
    "trigger_source_kind" TEXT NOT NULL,
    "trigger_source_hash" TEXT NOT NULL,
    "trigger_bundle_key" TEXT,
    "trigger_bundle_version" TEXT,
    "trigger_notes_json" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "prior_case_id" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "disposed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "safety_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "safety_cases_idempotency_key_key" ON "safety_cases"("idempotency_key");
CREATE INDEX "safety_cases_subject_user_id_status_idx" ON "safety_cases"("subject_user_id", "status");
CREATE INDEX "safety_cases_primary_owner_user_id_status_idx" ON "safety_cases"("primary_owner_user_id", "status");

CREATE TABLE "safety_case_events" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "type" "SafetyCaseEventType" NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "wakeup_job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "safety_case_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "safety_case_events_case_id_at_idx" ON "safety_case_events"("case_id", "at");

ALTER TABLE "safety_cases"
  ADD CONSTRAINT "safety_cases_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "safety_cases"
  ADD CONSTRAINT "safety_cases_primary_owner_user_id_fkey"
  FOREIGN KEY ("primary_owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "safety_case_events"
  ADD CONSTRAINT "safety_case_events_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "safety_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
