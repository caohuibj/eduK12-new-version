-- Expand canonical relational assignment policy to reviewed SCHOOL peer cohorts,
-- leaving all existing relationship kinds and policy domains unchanged.
ALTER TABLE "relational_assessment_assignments"
  DROP CONSTRAINT "relational_assignment_relationship_kind_check";
ALTER TABLE "relational_assessment_assignments"
  ADD CONSTRAINT "relational_assignment_relationship_kind_check"
    CHECK ("relationship_kind" IN (
      'SELF','PARENT_CHILD','COURSE_TEACHER_STUDENT',
      'CLASS_TEACHER_STUDENT','COUNSELOR_CLIENT','STUDENT_PEER'
    ));
