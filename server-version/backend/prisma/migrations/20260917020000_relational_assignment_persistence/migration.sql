-- RA-01 C2: additive relational-assessment persistence.
-- Existing assessment rows remain untouched. Pending consent becomes persistable
-- by relaxing accepted_at only; accepted consent rows retain their values.

ALTER TABLE "assessment_attempt_consents"
  ALTER COLUMN "accepted_at" DROP NOT NULL;

CREATE TABLE "relational_assessment_assignments" (
  "id" TEXT NOT NULL,
  "episode_id" TEXT NOT NULL,
  "subject_user_id" TEXT NOT NULL,
  "subject_role" TEXT NOT NULL,
  "respondent_user_id" TEXT NOT NULL,
  "respondent_role" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "relationship_kind" TEXT NOT NULL,
  "relationship_ref" TEXT,
  "relationship_snapshot_json" JSONB NOT NULL,
  "relationship_snapshot_hash" TEXT NOT NULL,
  "perspective" TEXT NOT NULL,
  "resource_kind" TEXT NOT NULL,
  "resource_key" TEXT NOT NULL,
  "resource_version" TEXT NOT NULL,
  "consent_id" TEXT,
  "visibility_policy_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "relational_assessment_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "relational_assignment_subject_role_check"
    CHECK ("subject_role" IN ('STUDENT', 'TEACHER', 'PARENT')),
  CONSTRAINT "relational_assignment_respondent_role_check"
    CHECK ("respondent_role" IN ('STUDENT', 'TEACHER', 'PARENT')),
  CONSTRAINT "relational_assignment_relationship_kind_check"
    CHECK ("relationship_kind" IN ('SELF', 'PARENT_CHILD', 'COURSE_TEACHER_STUDENT')),
  CONSTRAINT "relational_assignment_perspective_check"
    CHECK ("perspective" IN ('SELF_REPORT', 'OBSERVER_REPORT', 'RELATIONAL_EXPERIENCE')),
  CONSTRAINT "relational_assignment_status_check"
    CHECK ("status" IN ('OPEN', 'STARTED', 'COMPLETED', 'REVOKED', 'EXPIRED')),
  CONSTRAINT "relational_assignment_relationship_hash_check"
    CHECK ("relationship_snapshot_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "relational_assignment_episode_respondent_resource_key"
  ON "relational_assessment_assignments"(
    "episode_id", "respondent_user_id", "resource_kind", "resource_key", "resource_version"
  );
CREATE INDEX "relational_assignment_respondent_status_idx"
  ON "relational_assessment_assignments"("respondent_user_id", "status");
CREATE INDEX "relational_assignment_subject_status_idx"
  ON "relational_assessment_assignments"("subject_user_id", "status");
CREATE INDEX "relational_assignment_episode_idx"
  ON "relational_assessment_assignments"("episode_id");
CREATE INDEX "relational_assignment_relationship_ref_idx"
  ON "relational_assessment_assignments"("relationship_kind", "relationship_ref");

ALTER TABLE "relational_assessment_assignments"
  ADD CONSTRAINT "relational_assignment_episode_fkey"
  FOREIGN KEY ("episode_id") REFERENCES "assessment_episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "relational_assessment_assignments"
  ADD CONSTRAINT "relational_assignment_subject_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "relational_assessment_assignments"
  ADD CONSTRAINT "relational_assignment_respondent_fkey"
  FOREIGN KEY ("respondent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "relational_assessment_assignments"
  ADD CONSTRAINT "relational_assignment_created_by_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "relational_assessment_assignments"
  ADD CONSTRAINT "relational_assignment_consent_fkey"
  FOREIGN KEY ("consent_id") REFERENCES "assessment_attempt_consents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
