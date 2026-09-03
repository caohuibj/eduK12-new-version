-- Prep 17.1: one ACK + one DISPOSE wakeup per case; unique escalation consumption by wakeupJobId

CREATE UNIQUE INDEX IF NOT EXISTS "safety_wakeup_ledger_case_id_kind_key"
  ON "safety_wakeup_ledger"("case_id", "kind");

-- At most one ESCALATED event may consume a given wakeupJobId.
CREATE UNIQUE INDEX IF NOT EXISTS "safety_case_events_escalated_wakeup_job_id_key"
  ON "safety_case_events"("wakeup_job_id")
  WHERE "wakeup_job_id" IS NOT NULL AND "type" = 'ESCALATED';
