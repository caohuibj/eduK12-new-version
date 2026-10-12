-- PR5 privacy follow-up. Even two different classes for one teacher may
-- contain overlapping student rosters. Prevent cross-class differential
-- disclosures until a reviewed multi-class disclosure plan is available.
-- Deliberately preserve the existing PK for DB compatibility.
CREATE UNIQUE INDEX "huiteacher_student_disclosure_org_teacher_unique"
  ON "huiteacher_student_disclosure_ledgers"("organization_id","teacher_user_id");
