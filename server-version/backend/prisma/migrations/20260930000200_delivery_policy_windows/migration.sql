ALTER TABLE "organizations"
  ADD COLUMN "homeroom_delivery_enabled" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "organization_assessment_delivery_grants"
  ADD COLUMN "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "valid_until" TIMESTAMPTZ(6),
  ADD CONSTRAINT "organization_assessment_delivery_grants_window_check"
    CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from");
