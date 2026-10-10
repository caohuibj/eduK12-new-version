-- Campus PR2 C01. Historical Course stays legacy without guessing product.
-- Legacy Course Code/Teacher/Student contracts remain valid only for noncampus.
ALTER TABLE "courses"
  ADD COLUMN "course_type" TEXT NOT NULL DEFAULT 'LEGACY_COURSE',
  ADD COLUMN "organization_id" TEXT;
ALTER TABLE "courses" ADD CONSTRAINT "courses_course_type_check"
  CHECK ("course_type" IN ('LEGACY_COURSE','TRAINING_COURSE','CAMPUS_ACTIVITY'));
ALTER TABLE "courses" ADD CONSTRAINT "courses_product_kind_check"
  CHECK (
    ("course_type"='CAMPUS_ACTIVITY'
      AND "organization_id" IS NOT NULL
      AND "is_library"=FALSE AND "is_recruiting"=FALSE)
    OR ("course_type"<>'CAMPUS_ACTIVITY' AND "organization_id" IS NULL)
  );
ALTER TABLE "courses" ADD CONSTRAINT "courses_campus_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
CREATE INDEX "courses_organization_type_status_idx"
  ON "courses" ("organization_id","course_type","status","created_at" DESC);

-- Prevent a legacy course creator from crossing the SCHOOL product boundary;
-- prevent a SCHOOL creator from creating a TRAINING/LEGACY course through any
-- forgotten repository-level write. Immutable type prevents reclassification.
CREATE OR REPLACE FUNCTION campus_course_realm_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW."course_type"<>OLD."course_type"
    OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
  ) THEN
    RAISE EXCEPTION 'course product domain is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW."course_type"='CAMPUS_ACTIVITY' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "organizations" o
      JOIN "users" u ON u."id"=NEW."creator_id"
      WHERE o."id"=NEW."organization_id" AND o."product_domain"='SCHOOL'
        AND u."account_domain"='SCHOOL'
    ) THEN
      RAISE EXCEPTION 'campus course needs SCHOOL organization and creator'
        USING ERRCODE='23514';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM "users" u
    WHERE u."id"=NEW."creator_id" AND u."account_domain"='SCHOOL'
  ) THEN
    RAISE EXCEPTION 'school account cannot own training course'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER campus_course_realm_guard
  BEFORE INSERT OR UPDATE OF "course_type","organization_id","creator_id"
  ON "courses" FOR EACH ROW EXECUTE FUNCTION campus_course_realm_guard();
