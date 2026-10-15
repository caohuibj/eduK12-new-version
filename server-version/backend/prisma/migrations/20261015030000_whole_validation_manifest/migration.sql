ALTER TABLE "composite_report_jobs"
  ADD COLUMN "whole_validation_encrypted" TEXT,
  ADD COLUMN "whole_validation_hash" TEXT,
  ADD CONSTRAINT "composite_report_jobs_validation_check" CHECK (("whole_validation_encrypted" IS NULL) = ("whole_validation_hash" IS NULL));
