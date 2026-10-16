-- Keep legacy report permits strict while complete sealed whole receipts
-- use the durable outbox independently of the legacy report queue counter.
BEGIN;
ALTER TABLE "composite_report_jobs" DROP CONSTRAINT "composite_report_jobs_budget_check";
ALTER TABLE "composite_report_jobs" ADD CONSTRAINT "composite_report_jobs_budget_check" CHECK (
  "budget_held" = ("status" IN ('PENDING','PROCESSING'))
  OR (NOT "budget_held" AND "status" IN ('PENDING','PROCESSING')
    AND "whole_submission_id" IS NOT NULL AND "whole_payload_hash" IS NOT NULL
    AND "whole_answers_encrypted" IS NOT NULL AND "whole_accepted_at" IS NOT NULL)
);
COMMIT;
