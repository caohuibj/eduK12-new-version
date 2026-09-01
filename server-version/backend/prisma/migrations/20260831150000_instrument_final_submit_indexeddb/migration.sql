-- Instrument-level final submission foundation. Existing attempt rows are kept
-- readable but are explicitly marked LEGACY so the old incremental write APIs
-- can be rejected without changing their historical data.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "InstrumentDeliveryMode" AS ENUM ('LEGACY', 'FINAL_ONLY');

ALTER TABLE "assessments"
  ADD COLUMN "delivery_mode" "InstrumentDeliveryMode" NOT NULL DEFAULT 'FINAL_ONLY',
  ADD COLUMN "attempt_epoch" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "submission_id" TEXT,
  ADD COLUMN "submission_payload_hash" TEXT,
  ADD COLUMN "submission_completed_at" TIMESTAMP(3);

ALTER TABLE "questionnaire_assessments"
  ADD COLUMN "delivery_mode" "InstrumentDeliveryMode" NOT NULL DEFAULT 'FINAL_ONLY',
  ADD COLUMN "attempt_epoch" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "composite_assessment_attempts"
  ADD COLUMN "delivery_mode" "InstrumentDeliveryMode" NOT NULL DEFAULT 'FINAL_ONLY',
  ADD COLUMN "attempt_epoch" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "cognitive_sessions"
  ADD COLUMN "delivery_mode" "InstrumentDeliveryMode" NOT NULL DEFAULT 'FINAL_ONLY',
  ADD COLUMN "submission_id" TEXT,
  ADD COLUMN "submission_payload_hash" TEXT,
  ADD COLUMN "submitted_at" TIMESTAMP(3);

UPDATE "assessments" SET "delivery_mode" = 'LEGACY';
UPDATE "questionnaire_assessments" SET "delivery_mode" = 'LEGACY';
UPDATE "composite_assessment_attempts"
SET "delivery_mode" = 'LEGACY', "attempt_epoch" = "attempt_no";
UPDATE "cognitive_sessions" SET "delivery_mode" = 'LEGACY';

CREATE UNIQUE INDEX "assessments_submission_id_key" ON "assessments"("submission_id");
CREATE UNIQUE INDEX "cognitive_sessions_submission_id_key" ON "cognitive_sessions"("submission_id");

CREATE TABLE "questionnaire_form_sections" (
    "id" TEXT NOT NULL,
    "questionnaire_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '表单',
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "context_section" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_form_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "questionnaire_form_sections_questionnaire_id_position_key"
  ON "questionnaire_form_sections"("questionnaire_id", "position");
CREATE INDEX "questionnaire_form_sections_questionnaire_id_idx"
  ON "questionnaire_form_sections"("questionnaire_id");

ALTER TABLE "questionnaire_form_items"
  ADD COLUMN "section_id" TEXT,
  ADD COLUMN "section_position" INTEGER;

CREATE INDEX "questionnaire_form_items_section_id_section_position_idx"
  ON "questionnaire_form_items"("section_id", "section_position");

CREATE TABLE "questionnaire_form_section_attempts" (
    "id" TEXT NOT NULL,
    "questionnaire_assessment_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "attempt_epoch" INTEGER NOT NULL DEFAULT 1,
    "submission_id" TEXT,
    "submission_payload_hash" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_form_section_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "questionnaire_form_section_attempts_submission_id_key"
  ON "questionnaire_form_section_attempts"("submission_id");
CREATE UNIQUE INDEX "questionnaire_form_section_attempts_assessment_section_key"
  ON "questionnaire_form_section_attempts"("questionnaire_assessment_id", "section_id");
CREATE INDEX "questionnaire_form_section_attempts_assessment_status_idx"
  ON "questionnaire_form_section_attempts"("questionnaire_assessment_id", "status");

ALTER TABLE "questionnaire_form_answers"
  ADD COLUMN "form_section_attempt_id" TEXT;
CREATE INDEX "questionnaire_form_answers_form_section_attempt_id_idx"
  ON "questionnaire_form_answers"("form_section_attempt_id");

CREATE TABLE "composite_form_sections" (
    "id" TEXT NOT NULL,
    "composite_assessment_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '表单',
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "context_section" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composite_form_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "composite_form_sections_assessment_position_key"
  ON "composite_form_sections"("composite_assessment_id", "position");
CREATE INDEX "composite_form_sections_assessment_id_idx"
  ON "composite_form_sections"("composite_assessment_id");

ALTER TABLE "composite_assessment_items"
  ADD COLUMN "form_section_id" TEXT,
  ADD COLUMN "form_section_position" INTEGER;
CREATE INDEX "composite_assessment_items_form_section_position_idx"
  ON "composite_assessment_items"("form_section_id", "form_section_position");

CREATE TABLE "composite_form_section_attempts" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "status" "CompositeAssessmentAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "attempt_epoch" INTEGER NOT NULL DEFAULT 1,
    "submission_id" TEXT,
    "submission_payload_hash" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composite_form_section_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "composite_form_section_attempts_submission_id_key"
  ON "composite_form_section_attempts"("submission_id");
CREATE UNIQUE INDEX "composite_form_section_attempts_attempt_section_key"
  ON "composite_form_section_attempts"("attempt_id", "section_id");
CREATE INDEX "composite_form_section_attempts_attempt_status_idx"
  ON "composite_form_section_attempts"("attempt_id", "status");

ALTER TABLE "composite_form_answers"
  ADD COLUMN "form_section_attempt_id" TEXT;
CREATE INDEX "composite_form_answers_form_section_attempt_id_idx"
  ON "composite_form_answers"("form_section_attempt_id");

-- Map current mixed-order form fields into sections. A new section starts
-- whenever a scale/non-form unit occurs between two form fields.
DO $$
DECLARE
  questionnaire_row RECORD;
  form_row RECORD;
  current_section_id TEXT;
  previous_position INTEGER;
  local_position INTEGER;
  has_intervening_scale BOOLEAN;
BEGIN
  FOR questionnaire_row IN SELECT id FROM "questionnaires" LOOP
    current_section_id := NULL;
    previous_position := NULL;
    local_position := 0;
    FOR form_row IN
      SELECT id, position, context_key
      FROM "questionnaire_form_items"
      WHERE questionnaire_id = questionnaire_row.id
      ORDER BY position, id
    LOOP
      SELECT EXISTS (
        SELECT 1 FROM "questionnaire_scales" qs
        WHERE qs.questionnaire_id = questionnaire_row.id
          AND previous_position IS NOT NULL
          AND qs.position > previous_position
          AND qs.position < form_row.position
      ) INTO has_intervening_scale;

      IF current_section_id IS NULL OR has_intervening_scale THEN
        current_section_id := gen_random_uuid()::TEXT;
        local_position := 0;
        INSERT INTO "questionnaire_form_sections"
          (id, questionnaire_id, title, position, context_section, created_at, updated_at)
        VALUES
          (current_section_id, questionnaire_row.id, '表单', form_row.position,
           form_row.context_key IS NOT NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      ELSE
        IF form_row.context_key IS NOT NULL THEN
          UPDATE "questionnaire_form_sections"
          SET context_section = true, updated_at = CURRENT_TIMESTAMP
          WHERE id = current_section_id;
        END IF;
      END IF;

      UPDATE "questionnaire_form_items"
      SET section_id = current_section_id, section_position = local_position
      WHERE id = form_row.id;
      previous_position := form_row.position;
      local_position := local_position + 1;
    END LOOP;
  END LOOP;

  FOR questionnaire_row IN SELECT id FROM "composite_assessments" LOOP
    current_section_id := NULL;
    previous_position := NULL;
    local_position := 0;
    FOR form_row IN
      SELECT id, position, context_key
      FROM "composite_assessment_items"
      WHERE composite_assessment_id = questionnaire_row.id AND type = 'FORM'
      ORDER BY position, id
    LOOP
      SELECT EXISTS (
        SELECT 1 FROM "composite_assessment_items" ci
        WHERE ci.composite_assessment_id = questionnaire_row.id
          AND previous_position IS NOT NULL
          AND ci.type <> 'FORM'
          AND ci.position > previous_position
          AND ci.position < form_row.position
      ) INTO has_intervening_scale;

      IF current_section_id IS NULL OR has_intervening_scale THEN
        current_section_id := gen_random_uuid()::TEXT;
        local_position := 0;
        INSERT INTO "composite_form_sections"
          (id, composite_assessment_id, title, position, context_section, created_at, updated_at)
        VALUES
          (current_section_id, questionnaire_row.id, '表单', form_row.position,
           form_row.context_key IS NOT NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      ELSE
        IF form_row.context_key IS NOT NULL THEN
          UPDATE "composite_form_sections"
          SET context_section = true, updated_at = CURRENT_TIMESTAMP
          WHERE id = current_section_id;
        END IF;
      END IF;

      UPDATE "composite_assessment_items"
      SET form_section_id = current_section_id, form_section_position = local_position
      WHERE id = form_row.id;
      previous_position := form_row.position;
      local_position := local_position + 1;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE "questionnaire_form_sections"
  ADD CONSTRAINT "questionnaire_form_sections_questionnaire_id_fkey"
  FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questionnaire_form_items"
  ADD CONSTRAINT "questionnaire_form_items_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "questionnaire_form_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "questionnaire_form_section_attempts"
  ADD CONSTRAINT "questionnaire_form_section_attempts_assessment_id_fkey"
  FOREIGN KEY ("questionnaire_assessment_id") REFERENCES "questionnaire_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "questionnaire_form_section_attempts_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "questionnaire_form_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questionnaire_form_answers"
  ADD CONSTRAINT "questionnaire_form_answers_section_attempt_id_fkey"
  FOREIGN KEY ("form_section_attempt_id") REFERENCES "questionnaire_form_section_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "composite_form_sections"
  ADD CONSTRAINT "composite_form_sections_assessment_id_fkey"
  FOREIGN KEY ("composite_assessment_id") REFERENCES "composite_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "composite_assessment_items"
  ADD CONSTRAINT "composite_assessment_items_form_section_id_fkey"
  FOREIGN KEY ("form_section_id") REFERENCES "composite_form_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "composite_form_section_attempts"
  ADD CONSTRAINT "composite_form_section_attempts_attempt_id_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "composite_assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "composite_form_section_attempts_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "composite_form_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "composite_form_answers"
  ADD CONSTRAINT "composite_form_answers_section_attempt_id_fkey"
  FOREIGN KEY ("form_section_attempt_id") REFERENCES "composite_form_section_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
