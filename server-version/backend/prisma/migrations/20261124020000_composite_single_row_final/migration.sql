-- Phase 2 PR 1: Additive single-row composite FINAL storage, universal composite
-- checkpoints with monotonic unit locks (Cognitive / SJT), and publication_hash
-- anchor on composite_assessment_attempts.
--
-- Purely additive so existing legacy paths and CI regression suites stay green
-- while PR 2-4 cut over writes, frontend runner, and downstream readers.

CREATE TABLE IF NOT EXISTS "composite_attempt_finals" (
  "attempt_id"       TEXT NOT NULL,
  "attempt_epoch"    INTEGER NOT NULL DEFAULT 1,
  "composite_id"     TEXT NOT NULL,
  "organization_id"  TEXT,
  "course_id"        TEXT,
  "publication_hash" TEXT NOT NULL,
  "slot_set_hash"    TEXT NOT NULL,
  "context_hash"     TEXT,
  "submission_id"    TEXT NOT NULL,
  "payload_hash"     TEXT NOT NULL,
  "aggregate_hash"   TEXT NOT NULL,
  "facts_hash"       TEXT NOT NULL,
  "facts_cipher"     TEXT NOT NULL,
  "raw_hash"         TEXT NOT NULL,
  "raw_cipher"       TEXT NOT NULL,
  "feedback_cipher"  TEXT,
  "completed_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "composite_attempt_finals_pkey" PRIMARY KEY ("attempt_id", "attempt_epoch"),
  CONSTRAINT "composite_attempt_finals_attempt_fk"
    FOREIGN KEY ("attempt_id") REFERENCES "composite_assessment_attempts"("id") ON DELETE RESTRICT,
  CONSTRAINT "composite_attempt_finals_composite_fk"
    FOREIGN KEY ("composite_id") REFERENCES "composite_assessments"("id") ON DELETE RESTRICT,
  CONSTRAINT "composite_attempt_finals_submission_uniq" UNIQUE ("submission_id"),
  CONSTRAINT "composite_attempt_finals_epoch_pos_check" CHECK ("attempt_epoch" > 0),
  CONSTRAINT "composite_attempt_finals_hashes_check" CHECK (
    "publication_hash" ~ '^[a-f0-9]{64}$'
    AND "slot_set_hash" ~ '^[a-f0-9]{64}$'
    AND ("context_hash" IS NULL OR "context_hash" ~ '^[a-f0-9]{64}$')
    AND "payload_hash" ~ '^[a-f0-9]{64}$'
    AND "aggregate_hash" ~ '^[a-f0-9]{64}$'
    AND "facts_hash" ~ '^[a-f0-9]{64}$'
    AND "raw_hash" ~ '^[a-f0-9]{64}$'
  )
);

CREATE INDEX IF NOT EXISTS "composite_attempt_finals_composite_time_idx"
  ON "composite_attempt_finals" ("composite_id", "completed_at" DESC);

CREATE INDEX IF NOT EXISTS "composite_attempt_finals_course_time_idx"
  ON "composite_attempt_finals" ("course_id", "completed_at" DESC)
  WHERE "course_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "composite_attempt_finals_org_time_idx"
  ON "composite_attempt_finals" ("organization_id", "completed_at" DESC)
  WHERE "organization_id" IS NOT NULL;

CREATE OR REPLACE FUNCTION "guard_composite_attempt_finals_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Composite attempt final facts are immutable';
  END IF;
  IF (OLD.attempt_id, OLD.attempt_epoch, OLD.composite_id, OLD.organization_id, OLD.course_id,
      OLD.publication_hash, OLD.slot_set_hash, OLD.context_hash, OLD.submission_id,
      OLD.payload_hash, OLD.aggregate_hash, OLD.facts_hash, OLD.facts_cipher,
      OLD.raw_hash, OLD.raw_cipher, OLD.completed_at)
     IS DISTINCT FROM
     (NEW.attempt_id, NEW.attempt_epoch, NEW.composite_id, NEW.organization_id, NEW.course_id,
      NEW.publication_hash, NEW.slot_set_hash, NEW.context_hash, NEW.submission_id,
      NEW.payload_hash, NEW.aggregate_hash, NEW.facts_hash, NEW.facts_cipher,
      NEW.raw_hash, NEW.raw_cipher, NEW.completed_at) THEN
    RAISE EXCEPTION 'Composite attempt final facts are immutable';
  END IF;
  IF OLD.feedback_cipher IS NOT NULL AND OLD.feedback_cipher IS DISTINCT FROM NEW.feedback_cipher THEN
    RAISE EXCEPTION 'Composite attempt pre-materialized feedback is immutable once populated';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "composite_attempt_finals_immutable_guard" ON "composite_attempt_finals";
CREATE TRIGGER "composite_attempt_finals_immutable_guard"
  BEFORE UPDATE OR DELETE ON "composite_attempt_finals"
  FOR EACH ROW EXECUTE FUNCTION "guard_composite_attempt_finals_immutable"();

CREATE TABLE IF NOT EXISTS "composite_attempt_checkpoints" (
  "attempt_id"       TEXT PRIMARY KEY,
  "attempt_epoch"    INTEGER NOT NULL,
  "publication_hash" TEXT NOT NULL,
  "revision"         INTEGER NOT NULL DEFAULT 1,
  "save_count"       INTEGER NOT NULL DEFAULT 1,
  "locked_slot_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "payload_cipher"   TEXT NOT NULL,
  "payload_hash"     TEXT NOT NULL,
  "expires_at"       TIMESTAMPTZ(6) NOT NULL,
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "composite_attempt_checkpoints_attempt_fk"
    FOREIGN KEY ("attempt_id") REFERENCES "composite_assessment_attempts"("id") ON DELETE CASCADE,
  CONSTRAINT "composite_attempt_checkpoints_bounds_check" CHECK (
    "attempt_epoch" > 0
    AND "revision" >= 1
    AND "save_count" >= 1
    AND "publication_hash" ~ '^[a-f0-9]{64}$'
    AND "payload_hash" ~ '^[a-f0-9]{64}$'
  )
);

CREATE INDEX IF NOT EXISTS "composite_attempt_checkpoints_expires_idx"
  ON "composite_attempt_checkpoints" ("expires_at");

CREATE OR REPLACE FUNCTION "guard_composite_attempt_checkpoints"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.attempt_epoch < OLD.attempt_epoch THEN
      RAISE EXCEPTION 'Composite checkpoint attempt_epoch cannot regress';
    END IF;
    IF NEW.attempt_epoch = OLD.attempt_epoch THEN
      IF OLD.publication_hash IS DISTINCT FROM NEW.publication_hash THEN
        RAISE EXCEPTION 'Composite checkpoint publication_hash is immutable within an epoch';
      END IF;
      IF NEW.revision <> OLD.revision + 1 OR NEW.save_count < OLD.save_count THEN
        RAISE EXCEPTION 'Composite checkpoint revision/save_count violation';
      END IF;
      IF NOT (OLD.locked_slot_keys <@ NEW.locked_slot_keys) THEN
        RAISE EXCEPTION 'Composite checkpoint locked_slot_keys are monotonic within an epoch';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "composite_attempt_checkpoints_guard" ON "composite_attempt_checkpoints";
CREATE TRIGGER "composite_attempt_checkpoints_guard"
  BEFORE UPDATE ON "composite_attempt_checkpoints"
  FOR EACH ROW EXECUTE FUNCTION "guard_composite_attempt_checkpoints"();

ALTER TABLE "composite_assessment_attempts"
  ADD COLUMN IF NOT EXISTS "publication_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "unit_seeds_encrypted" TEXT;

ALTER TABLE "composite_assessment_attempts"
  DROP CONSTRAINT IF EXISTS "composite_assessment_attempts_publication_hash_check";
ALTER TABLE "composite_assessment_attempts"
  ADD CONSTRAINT "composite_assessment_attempts_publication_hash_check"
  CHECK ("publication_hash" IS NULL OR "publication_hash" ~ '^[a-f0-9]{64}$');

CREATE OR REPLACE FUNCTION "guard_composite_attempt_publication_hash"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.publication_hash IS NOT NULL AND OLD.publication_hash IS DISTINCT FROM NEW.publication_hash THEN
    RAISE EXCEPTION 'Composite attempt publication_hash is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "composite_attempt_publication_hash_guard" ON "composite_assessment_attempts";
CREATE TRIGGER "composite_attempt_publication_hash_guard"
  BEFORE UPDATE OF "publication_hash" ON "composite_assessment_attempts"
  FOR EACH ROW EXECUTE FUNCTION "guard_composite_attempt_publication_hash"();

ALTER TABLE "assessment_public_templates"
  DROP CONSTRAINT IF EXISTS "assessment_public_templates_template_kind_check";

ALTER TABLE "assessment_public_templates"
  ADD CONSTRAINT "assessment_public_templates_template_kind_check"
  CHECK ("template_kind" IN (
    'SCALE_RESULT_BASE',
    'SCALE_REFERENCE',
    'SCALE_INTERPRETATION',
    'SCALE_CAVEATS',
    'SCALE_CANONICAL_LAYOUT',
    'COMPOSITE_REPORT_LAYOUT',
    'UNIT_ADMISSION_PLAN',
    'FROZEN_SLOT_PLAN',
    'WHOLE_VALIDATION_PLAN',
    'COGNITIVE_PROFILE_CONFIGURATION',
    'SCALE_RUNTIME_POLICY_PLAN',
    'SCALE_FACTS_BUNDLE',
    'COMPOSITE_PUBLICATION_PLAN'
  ));
