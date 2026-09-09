-- PR-D embeds the existing Situational runtime in the existing Composite
-- attempt/slot/snapshot lifecycle. No second bundle persistence model is added.
ALTER TYPE "AssessmentUnitType" ADD VALUE IF NOT EXISTS 'SITUATIONAL';
ALTER TYPE "CompositeAssessmentItemType" ADD VALUE IF NOT EXISTS 'SITUATIONAL';

ALTER TABLE "composite_assessment_items"
  ADD COLUMN "situational_instrument_key" TEXT,
  ADD COLUMN "situational_instrument_version" TEXT;

ALTER TABLE "situational_attempts"
  ADD COLUMN "composite_attempt_id" TEXT,
  ADD COLUMN "composite_item_id" TEXT,
  ADD COLUMN "composite_slot_key" TEXT;

DROP INDEX IF EXISTS "situational_attempts_active_participant_key";
DROP INDEX IF EXISTS "situational_attempts_identity_key";
CREATE UNIQUE INDEX "situational_attempts_standalone_identity_key"
  ON "situational_attempts"("instrument_key", "instrument_version", "participant_key", "attempt_no")
  WHERE "composite_attempt_id" IS NULL;
CREATE UNIQUE INDEX "situational_attempts_active_participant_key"
  ON "situational_attempts"("instrument_key", "instrument_version", "participant_key")
  WHERE "status" = 'IN_PROGRESS' AND "composite_attempt_id" IS NULL;
CREATE UNIQUE INDEX "situational_attempts_active_composite_slot_key"
  ON "situational_attempts"("composite_attempt_id", "composite_item_id")
  WHERE "status" = 'IN_PROGRESS' AND "composite_attempt_id" IS NOT NULL;
CREATE INDEX "situational_attempts_composite_attempt_id_status_idx"
  ON "situational_attempts"("composite_attempt_id", "status");
CREATE UNIQUE INDEX "situational_attempts_composite_item_key"
  ON "situational_attempts"("composite_attempt_id", "composite_item_id");

ALTER TABLE "situational_attempts"
  ADD CONSTRAINT "situational_attempts_composite_attempt_id_fkey"
  FOREIGN KEY ("composite_attempt_id") REFERENCES "composite_assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "situational_attempts"
  ADD CONSTRAINT "situational_attempts_composite_item_id_fkey"
  FOREIGN KEY ("composite_item_id") REFERENCES "composite_assessment_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
