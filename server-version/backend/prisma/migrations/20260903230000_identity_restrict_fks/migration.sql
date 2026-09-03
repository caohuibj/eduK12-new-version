-- Prep 13.1: missing RESTRICT FKs for invite/relationship/episode/assessment/attempt identity columns
-- Nullable FKs OK for history rows.

ALTER TABLE "parent_invite_codes"
  ADD CONSTRAINT "parent_invite_codes_student_user_id_fkey"
  FOREIGN KEY ("student_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parent_invite_codes"
  ADD CONSTRAINT "parent_invite_codes_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parent_invite_codes"
  ADD CONSTRAINT "parent_invite_codes_consumed_by_parent_user_id_fkey"
  FOREIGN KEY ("consumed_by_parent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parent_student_relationships"
  ADD CONSTRAINT "parent_student_relationships_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parent_student_relationships"
  ADD CONSTRAINT "parent_student_relationships_revoked_by_user_id_fkey"
  FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessment_episodes"
  ADD CONSTRAINT "assessment_episodes_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_respondent_user_id_fkey"
  FOREIGN KEY ("respondent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "composite_assessment_attempts"
  ADD CONSTRAINT "composite_assessment_attempts_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "composite_assessment_attempts"
  ADD CONSTRAINT "composite_assessment_attempts_respondent_user_id_fkey"
  FOREIGN KEY ("respondent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
