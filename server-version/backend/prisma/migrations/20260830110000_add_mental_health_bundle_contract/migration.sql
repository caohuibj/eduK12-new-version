-- Generic package dispatch and future-safe subject/respondent provenance.
-- This migration only adds nullable compatibility fields; existing Cognitive
-- composites and attempts retain their historical behavior.

ALTER TABLE "composite_assessments"
  ADD COLUMN "analysis_engine_key" TEXT;

CREATE TABLE "assessment_episodes" (
    "id" TEXT NOT NULL,
    "subject_user_id" TEXT,
    "subject_key" TEXT,
    "context_key" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_episodes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "composite_assessment_attempts"
  ADD COLUMN "subject_user_id" TEXT,
  ADD COLUMN "subject_key" TEXT,
  ADD COLUMN "respondent_user_id" TEXT,
  ADD COLUMN "respondent_key" TEXT,
  ADD COLUMN "respondent_type" TEXT,
  ADD COLUMN "assessment_episode_id" TEXT;

CREATE INDEX "assessment_episodes_subject_user_id_started_at_idx"
  ON "assessment_episodes"("subject_user_id", "started_at");
CREATE INDEX "assessment_episodes_subject_key_started_at_idx"
  ON "assessment_episodes"("subject_key", "started_at");
CREATE INDEX "assessment_episodes_context_key_started_at_idx"
  ON "assessment_episodes"("context_key", "started_at");
CREATE INDEX "composite_assessments_analysis_engine_key_idx"
  ON "composite_assessments"("analysis_engine_key");
CREATE INDEX "composite_assessment_attempts_subject_user_id_started_at_idx"
  ON "composite_assessment_attempts"("subject_user_id", "started_at");
CREATE INDEX "composite_assessment_attempts_subject_key_started_at_idx"
  ON "composite_assessment_attempts"("subject_key", "started_at");
CREATE INDEX "composite_assessment_attempts_respondent_user_id_started_at_idx"
  ON "composite_assessment_attempts"("respondent_user_id", "started_at");
CREATE INDEX "composite_assessment_attempts_respondent_key_started_at_idx"
  ON "composite_assessment_attempts"("respondent_key", "started_at");
CREATE INDEX "composite_assessment_attempts_assessment_episode_id_started_at_idx"
  ON "composite_assessment_attempts"("assessment_episode_id", "started_at");

ALTER TABLE "assessment_episodes"
  ADD CONSTRAINT "assessment_episodes_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "composite_assessment_attempts"
  ADD CONSTRAINT "composite_assessment_attempts_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "composite_assessment_attempts_respondent_user_id_fkey"
  FOREIGN KEY ("respondent_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "composite_assessment_attempts_assessment_episode_id_fkey"
  FOREIGN KEY ("assessment_episode_id") REFERENCES "assessment_episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
