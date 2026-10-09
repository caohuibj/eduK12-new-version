-- Keep historic quarantined identities and permit a new distinct SCHOOL
-- User after verified identity recovery, never reassociating old FINAL rows.
ALTER TABLE "campus_class_admissions"
  ADD COLUMN "roster_expected_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "campus_class_admissions"
  ADD CONSTRAINT "campus_class_admissions_expected_count_check"
  CHECK ("roster_expected_count" >= 0);

ALTER TABLE "campus_student_eligibilities"
  DROP CONSTRAINT "campus_student_eligibilities_org_digest_key";
CREATE INDEX "campus_student_eligibilities_org_digest_lookup_idx"
  ON "campus_student_eligibilities" ("organization_id","student_no_digest");
CREATE UNIQUE INDEX "campus_student_eligibilities_active_digest_key"
  ON "campus_student_eligibilities" ("organization_id","student_no_digest")
  WHERE "status"='VALID';
