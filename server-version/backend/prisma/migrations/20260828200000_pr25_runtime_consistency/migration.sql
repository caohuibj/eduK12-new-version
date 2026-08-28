-- PR25 runtime invariants. Existing duplicate active rows are an operator
-- decision: fail before creating any unique index and reconcile explicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "assessments"
    WHERE "status" = 'IN_PROGRESS'
      AND "questionnaire_assessment_id" IS NULL
      AND "composite_attempt_id" IS NULL
      AND "user_id" IS NOT NULL
    GROUP BY "scale_id", "user_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'PR25 migration refused: duplicate standalone active assessments';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "questionnaire_assessments"
    WHERE "status" = 'IN_PROGRESS'
      AND "token_id" IS NULL
      AND "user_id" IS NOT NULL
    GROUP BY "questionnaire_id", "user_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'PR25 migration refused: duplicate logged-in questionnaire assessments';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "classroom_questions"
    WHERE "started_at" IS NOT NULL AND "ended_at" IS NULL
    GROUP BY "classroom_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'PR25 migration refused: duplicate active classroom questions';
  END IF;
END $$;

-- Persist small list summaries so list endpoints do not load full definitions.
ALTER TABLE "scales"
  ADD COLUMN "item_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dimension_count" INTEGER NOT NULL DEFAULT 0;
UPDATE "scales" AS s
SET "item_count" = CASE
  WHEN jsonb_typeof(COALESCE(s."definition"->'items', '[]'::jsonb)) = 'array'
    THEN jsonb_array_length(s."definition"->'items')
  ELSE 0 END,
    "dimension_count" = CASE
  WHEN jsonb_typeof(COALESCE(s."definition"->'scoring'->'scores', '[]'::jsonb)) = 'array'
    THEN (SELECT COUNT(*) FROM jsonb_array_elements(s."definition"->'scoring'->'scores') AS score WHERE score->>'type' = 'dimension')
  ELSE 0 END;

CREATE UNIQUE INDEX "assessments_standalone_active_scale_user_key"
  ON "assessments"("scale_id", "user_id")
  WHERE "status" = 'IN_PROGRESS'
    AND "questionnaire_assessment_id" IS NULL
    AND "composite_attempt_id" IS NULL
    AND "user_id" IS NOT NULL;

CREATE UNIQUE INDEX "questionnaire_assessments_logged_in_active_key"
  ON "questionnaire_assessments"("questionnaire_id", "user_id")
  WHERE "status" = 'IN_PROGRESS'
    AND "token_id" IS NULL
    AND "user_id" IS NOT NULL;

CREATE UNIQUE INDEX "classroom_questions_active_key"
  ON "classroom_questions"("classroom_id")
  WHERE "started_at" IS NOT NULL AND "ended_at" IS NULL;

CREATE TYPE "QuestionnaireFormAnswerStatus" AS ENUM ('PENDING', 'ANSWERED', 'SKIPPED');
ALTER TABLE "questionnaire_form_answers"
  ALTER COLUMN "value" DROP NOT NULL,
  ADD COLUMN "status" "QuestionnaireFormAnswerStatus" NOT NULL DEFAULT 'PENDING';
UPDATE "questionnaire_form_answers"
SET "status" = 'ANSWERED'
WHERE "value" IS NOT NULL;

-- Materialize every historical slot so the state machine has one explicit row
-- per form item. Existing non-null values were marked ANSWERED above; rows
-- without an answer remain PENDING and are never interpreted as completed.
INSERT INTO "questionnaire_form_answers" ("id", "questionnaire_assessment_id", "form_item_id", "value", "status", "created_at")
SELECT
  md5(random()::text || clock_timestamp()::text || qa."id" || fi."id")::uuid::text,
  qa."id",
  fi."id",
  NULL,
  'PENDING',
  CURRENT_TIMESTAMP
FROM "questionnaire_assessments" qa
JOIN "questionnaire_form_items" fi ON fi."questionnaire_id" = qa."questionnaire_id"
LEFT JOIN "questionnaire_form_answers" fa
  ON fa."questionnaire_assessment_id" = qa."id" AND fa."form_item_id" = fi."id"
WHERE fa."id" IS NULL
ON CONFLICT ("questionnaire_assessment_id", "form_item_id") DO NOTHING;

ALTER TABLE "questionnaire_assessments"
  ADD COLUMN "aggregate_report_encrypted" TEXT;

CREATE TYPE "ExportArtifactStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');
ALTER TABLE "export_artifacts"
  ADD COLUMN "status" "ExportArtifactStatus" NOT NULL DEFAULT 'READY',
  ADD COLUMN "batch_id" TEXT,
  ADD COLUMN "error_code" TEXT;
CREATE INDEX "export_artifacts_status_created_at_idx"
  ON "export_artifacts"("status", "created_at");
CREATE INDEX "export_artifacts_batch_id_idx"
  ON "export_artifacts"("batch_id");
