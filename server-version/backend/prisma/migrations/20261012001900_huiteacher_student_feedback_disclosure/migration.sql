-- PR5 student feedback: disclosure is a controlled WRITE, not a plain
-- SELECT that administrators or teachers can filter and repeatedly subtract.
-- V1 allows ONE disclosed Run per exact school/teacher/class across waves
-- and instrument changes; PR6 must independently review longitudinal release.
CREATE TABLE "huiteacher_student_disclosure_ledgers"(
  "organization_id" TEXT NOT NULL,
  "teacher_user_id" TEXT NOT NULL,
  "class_unit_id" TEXT NOT NULL,
  "first_run_id" TEXT NOT NULL,
  "form_digest" TEXT NOT NULL,
  "population_digest" TEXT NOT NULL,
  "released_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "huiteacher_student_disclosure_ledgers_pkey"
    PRIMARY KEY("organization_id","teacher_user_id","class_unit_id"),
  CONSTRAINT "huiteacher_student_disclosure_run_fkey"
    FOREIGN KEY ("organization_id","first_run_id")
    REFERENCES "assessment_runs"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_student_disclosure_teacher_fkey"
    FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_student_disclosure_class_fkey"
    FOREIGN KEY ("organization_id","class_unit_id")
    REFERENCES "organization_units"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "huiteacher_student_disclosure_digests_check"
    CHECK("form_digest" ~ '^[a-f0-9]{64}$'
      AND "population_digest" ~ '^[a-f0-9]{64}$')
);
-- Ledger rows cannot be rewritten to admit another Run or alter evidence.
CREATE OR REPLACE FUNCTION protect_huiteacher_student_disclosure()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE'
    OR NEW."organization_id"<>OLD."organization_id"
    OR NEW."teacher_user_id"<>OLD."teacher_user_id"
    OR NEW."class_unit_id"<>OLD."class_unit_id"
    OR NEW."first_run_id"<>OLD."first_run_id"
    OR NEW."form_digest"<>OLD."form_digest"
    OR NEW."population_digest"<>OLD."population_digest"
    OR NEW."released_at"<>OLD."released_at" THEN
    RAISE EXCEPTION 'student feedback disclosure ledger is immutable'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "huiteacher_student_disclosure_immutable"
BEFORE UPDATE OR DELETE ON "huiteacher_student_disclosure_ledgers"
FOR EACH ROW EXECUTE FUNCTION protect_huiteacher_student_disclosure();
