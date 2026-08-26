-- PR6B: report packages are code-defined resources granted through MaterialGrant.
-- Keep the legacy analysis_protocol_* columns readable for historical composites.
ALTER TYPE "MaterialResourceType" ADD VALUE IF NOT EXISTS 'REPORT_PACKAGE';

ALTER TABLE "composite_assessments"
  ADD COLUMN "report_package_key" TEXT,
  ADD COLUMN "report_package_version" TEXT,
  ADD COLUMN "report_package_profile" TEXT,
  ADD COLUMN "report_package_snapshot_encrypted" TEXT;

CREATE INDEX "composite_assessments_report_package_key_version_idx"
  ON "composite_assessments"("report_package_key", "report_package_version");

ALTER TABLE "composite_assessments"
  ADD CONSTRAINT "composite_report_package_pair_check"
  CHECK (
    ("report_package_key" IS NULL
      AND "report_package_version" IS NULL
      AND "report_package_profile" IS NULL
      AND "report_package_snapshot_encrypted" IS NULL)
    OR
    ("report_package_key" IS NOT NULL
      AND "report_package_version" IS NOT NULL
      AND "report_package_profile" IS NOT NULL
      AND "report_package_profile" IN ('standard', 'research'))
  );
