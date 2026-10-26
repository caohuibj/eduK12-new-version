-- No date inference, defaults or backfill: all existing artifacts stay historical.
-- The existing append-only trigger protects this marker together with ciphertext.
ALTER TABLE survey_package_report_artifacts
 ADD COLUMN budget_version smallint,
 ADD CONSTRAINT survey_package_report_budget_version_supported CHECK (budget_version IS NULL OR budget_version=1);
