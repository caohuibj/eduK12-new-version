ALTER TABLE "composite_report_jobs"
  ADD COLUMN "whole_submission_id" TEXT,
  ADD COLUMN "whole_payload_hash" TEXT,
  ADD COLUMN "whole_answers_encrypted" TEXT,
  ADD COLUMN "whole_accepted_at" TIMESTAMP(3),
  ADD CONSTRAINT "composite_report_jobs_whole_receipt_check" CHECK (
    ("whole_submission_id" IS NULL AND "whole_payload_hash" IS NULL AND "whole_answers_encrypted" IS NULL AND "whole_accepted_at" IS NULL)
    OR ("whole_submission_id" IS NOT NULL AND "whole_payload_hash" IS NOT NULL AND "whole_answers_encrypted" IS NOT NULL AND "whole_accepted_at" IS NOT NULL)
  );
