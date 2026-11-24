-- Concurrency hot-path indexes (School & Teacher START, student enrollment, worker queue)
-- and additive public template kinds for compact scale runtime/facts deduplication.
--
-- Production evidence (2026-11-23, 9af040c8):
--   1. composite_assessment_attempts had 18,487 Seq Scans (79,336 rows, 16,243 buffers = ~130 MiB,
--      711.5 ms per School/Teacher START) on `WHERE assignment_ref = $1 ORDER BY started_at DESC LIMIT 1`.
--   2. course_students had 10,611 Seq Scans because it only indexed (course_id, student_id).
--   3. composite_report_jobs_pending_idx (status, next_attempt_at) indexed all 78k+ READY rows
--      and recorded 5.8B index tuple reads. Partial indexes keep active PENDING / PROCESSING scans tiny.
--   4. Extend assessment_public_templates_template_kind_check with SCALE_RUNTIME_POLICY_PLAN and
--      SCALE_FACTS_BUNDLE for deduplicating per-unit frozen policy and scale facts template tuples.

CREATE INDEX IF NOT EXISTS
  "composite_assessment_attempts_assignment_ref_started_at_idx"
  ON "composite_assessment_attempts" ("assignment_ref", "started_at" DESC)
  WHERE "assignment_ref" IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  "course_students_student_id_status_idx"
  ON "course_students" ("student_id", "status", "course_id");

CREATE INDEX IF NOT EXISTS
  "composite_report_jobs_active_pending_idx"
  ON "composite_report_jobs" ("next_attempt_at", "created_at")
  WHERE "status" = 'PENDING';

CREATE INDEX IF NOT EXISTS
  "composite_report_jobs_active_lease_idx"
  ON "composite_report_jobs" ("lease_expires_at")
  WHERE "status" = 'PROCESSING';

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
    'SCALE_FACTS_BUNDLE'
  ));
