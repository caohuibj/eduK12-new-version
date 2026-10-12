-- PR2: materialize exactly one immutable projection per authorized new
-- Teacher disclosure. An old V1 Run is never rewritten and legacy ledgers
-- remain authoritative for previously published reports.
ALTER TABLE "education_report_release_records"
  ADD COLUMN "report_projection" JSONB;
ALTER TABLE "education_report_release_records"
  ADD CONSTRAINT "education_report_release_records_projection_check"
  CHECK ("report_projection" IS NULL OR jsonb_typeof("report_projection")='object');
