ALTER TABLE "assessment_run_executions"
  DROP CONSTRAINT "assessment_run_executions_status_check",
  ADD CONSTRAINT "assessment_run_executions_status_check"
    CHECK ("status" IN ('ASSIGNED','STARTED','COMPLETED','EXPIRED','REVOKED','CANCELLED'));
