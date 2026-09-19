ALTER TABLE "relational_assessment_assignments"
  ADD COLUMN "policy_domain" TEXT NOT NULL DEFAULT 'LEGACY_COURSE';

ALTER TABLE "relational_assessment_assignments"
  DROP CONSTRAINT "relational_assignment_subject_role_check",
  ADD CONSTRAINT "relational_assignment_subject_role_check"
    CHECK ("subject_role" IN ('STUDENT', 'TEACHER', 'PARENT', 'COUNSELOR', 'CLIENT')),
  DROP CONSTRAINT "relational_assignment_respondent_role_check",
  ADD CONSTRAINT "relational_assignment_respondent_role_check"
    CHECK ("respondent_role" IN ('STUDENT', 'TEACHER', 'PARENT', 'COUNSELOR', 'CLIENT')),
  DROP CONSTRAINT "relational_assignment_relationship_kind_check",
  ADD CONSTRAINT "relational_assignment_relationship_kind_check"
    CHECK ("relationship_kind" IN (
      'SELF', 'PARENT_CHILD', 'COURSE_TEACHER_STUDENT',
      'CLASS_TEACHER_STUDENT', 'COUNSELOR_CLIENT'
    )),
  ADD CONSTRAINT "relational_assignment_policy_domain_check"
    CHECK ("policy_domain" IN ('LEGACY_COURSE', 'ORGANIZATION_RUN'));

CREATE INDEX "relational_assignment_policy_domain_status_idx"
  ON "relational_assessment_assignments"("policy_domain", "status");
