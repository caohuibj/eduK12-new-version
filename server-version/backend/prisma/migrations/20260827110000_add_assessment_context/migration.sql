ALTER TABLE "questionnaire_form_items"
  ADD COLUMN "context_key" TEXT;

ALTER TABLE "composite_assessment_items"
  ADD COLUMN "context_key" TEXT;

ALTER TABLE "questionnaire_assessments"
  ADD COLUMN "context_snapshot_encrypted" TEXT,
  ADD COLUMN "context_snapshot_hash" TEXT,
  ADD COLUMN "context_frozen_at" TIMESTAMP(3);

ALTER TABLE "composite_assessment_attempts"
  ADD COLUMN "context_snapshot_encrypted" TEXT,
  ADD COLUMN "context_snapshot_hash" TEXT,
  ADD COLUMN "context_frozen_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "questionnaire_form_items_questionnaire_id_context_key_key"
  ON "questionnaire_form_items"("questionnaire_id", "context_key");

CREATE UNIQUE INDEX "composite_assessment_items_composite_assessment_id_context_key_key"
  ON "composite_assessment_items"("composite_assessment_id", "context_key");
