-- PR2 Teacher Form V2 canonical runtime: one Attempt per frozen Run
-- execution, one immutable encrypted FINAL per Attempt. The authoritative
-- relational assignment/Run execution are NOT duplicated as access grants.
CREATE TABLE "huiteacher_form_attempts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "run_execution_id" TEXT NOT NULL,
  "form_id" TEXT NOT NULL,
  "respondent_user_id" TEXT NOT NULL,
  "definition_digest" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'STARTED',
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "huiteacher_form_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "huiteacher_form_attempts_execution_unique" UNIQUE("run_execution_id"),
  CONSTRAINT "huiteacher_form_attempts_org_id_unique" UNIQUE("organization_id","id"),
  CONSTRAINT "huiteacher_form_attempts_run_execution_fkey"
    FOREIGN KEY ("organization_id","run_id","run_execution_id")
    REFERENCES "assessment_run_executions"("organization_id","run_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_form_attempts_form_fkey"
    FOREIGN KEY ("organization_id","form_id")
    REFERENCES "huiteacher_form_instruments"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_form_attempts_respondent_fkey"
    FOREIGN KEY ("respondent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_form_attempts_status_check"
    CHECK ("status" IN ('STARTED','COMPLETED')),
  CONSTRAINT "huiteacher_form_attempts_completion_check"
    CHECK (("status"='COMPLETED')=("completed_at" IS NOT NULL)),
  CONSTRAINT "huiteacher_form_attempts_digest_check"
    CHECK ("definition_digest" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "huiteacher_form_attempts_org_form_idx"
  ON "huiteacher_form_attempts"("organization_id","form_id","status","started_at");

CREATE TABLE "huiteacher_form_finals" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "attempt_id" TEXT NOT NULL,
  "submission_id" TEXT NOT NULL,
  "definition_digest" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "results_cipher" TEXT NOT NULL,
  "results_hash" TEXT NOT NULL,
  "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "huiteacher_form_finals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "huiteacher_form_finals_attempt_unique" UNIQUE("attempt_id"),
  CONSTRAINT "huiteacher_form_finals_scope_fkey"
    FOREIGN KEY ("organization_id","attempt_id")
    REFERENCES "huiteacher_form_attempts"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_form_finals_submission_check"
    CHECK (length("submission_id") BETWEEN 16 AND 120),
  CONSTRAINT "huiteacher_form_finals_digest_check"
    CHECK ("definition_digest" ~ '^[a-f0-9]{64}$'
       AND "payload_hash" ~ '^[a-f0-9]{64}$'
       AND "results_hash" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "huiteacher_form_finals_org_time_idx"
  ON "huiteacher_form_finals"("organization_id","completed_at","id");

CREATE OR REPLACE FUNCTION protect_teacher_form_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Huiteacher canonical FINAL is immutable'
    USING ERRCODE='23514';
END; $$;
CREATE TRIGGER "huiteacher_form_final_immutable"
  BEFORE UPDATE OR DELETE ON "huiteacher_form_finals"
  FOR EACH ROW EXECUTE FUNCTION protect_teacher_form_final();
