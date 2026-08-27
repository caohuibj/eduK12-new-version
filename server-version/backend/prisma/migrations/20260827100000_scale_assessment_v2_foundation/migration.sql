-- Scale Assessment v2 has no production scale results to migrate. The new
-- definition/result fields become the only runtime source of truth.
CREATE TYPE "ScaleInstrumentClass" AS ENUM ('STANDARD', 'CUSTOM_DESCRIPTIVE');
CREATE TYPE "AssessmentReferenceInstrumentType" AS ENUM ('SCALE', 'COGNITIVE');
CREATE TYPE "AssessmentReferenceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

ALTER TABLE "scales"
  ADD COLUMN "instrument_class" "ScaleInstrumentClass" NOT NULL DEFAULT 'CUSTOM_DESCRIPTIVE',
  ADD COLUMN "instrument_version" TEXT NOT NULL DEFAULT '2.0.0',
  ADD COLUMN "definition" JSONB,
  ADD COLUMN "definition_hash" TEXT;

ALTER TABLE "assessments"
  ADD COLUMN "result" JSONB;

CREATE TABLE "assessment_reference_sets" (
  "id" TEXT NOT NULL,
  "instrument_type" "AssessmentReferenceInstrumentType" NOT NULL,
  "instrument_key" TEXT NOT NULL,
  "reference_version" TEXT NOT NULL,
  "status" "AssessmentReferenceStatus" NOT NULL DEFAULT 'DRAFT',
  "definition" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "assessment_reference_sets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assessment_reference_sets_instrument_type_instrument_key_reference_version_key"
  ON "assessment_reference_sets"("instrument_type", "instrument_key", "reference_version");
CREATE INDEX "assessment_reference_sets_instrument_type_instrument_key_status_idx"
  ON "assessment_reference_sets"("instrument_type", "instrument_key", "status");

-- Existing Scale resources remain addressable by id. They are deliberately
-- made unavailable until a v2 definition/package is installed. There are no
-- production scale results in this local-only migration, so old scale
-- assessments are removed instead of being read through a compatibility
-- adapter.
UPDATE "scales"
SET "status" = 'DRAFT',
    "visibility" = 'HIDDEN',
    "instrument_class" = 'CUSTOM_DESCRIPTIVE',
    "instrument_version" = '2.0.0',
    "definition" = NULL,
    "definition_hash" = NULL;

DELETE FROM "assessments";

ALTER TABLE "scales" DROP COLUMN "config";
ALTER TABLE "assessments" DROP COLUMN "scores", DROP COLUMN "feedback";

DROP TABLE "item_dimensions";
DROP TABLE "scale_items";
DROP TABLE "dimensions";
