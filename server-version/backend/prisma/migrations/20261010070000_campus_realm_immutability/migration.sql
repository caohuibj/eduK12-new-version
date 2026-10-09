-- Product boundary is permanent: historic organizations cannot be relabelled
-- SCHOOL by editing a column, and school learners cannot be linked into a
-- legacy TRAINING course roster through old teacher APIs.
CREATE OR REPLACE FUNCTION organization_product_domain_immutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."product_domain" <> NEW."product_domain" THEN
    RAISE EXCEPTION 'organization product domain is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER organization_product_domain_immutable
  BEFORE UPDATE OF "product_domain" ON "organizations"
  FOR EACH ROW EXECUTE FUNCTION organization_product_domain_immutable();

CREATE OR REPLACE FUNCTION course_student_realm_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users" WHERE "id"=NEW."student_id" AND "account_domain"='SCHOOL'
  ) THEN
    RAISE EXCEPTION 'campus identities cannot enroll in training Course'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER course_student_realm_guard
  BEFORE INSERT OR UPDATE OF "student_id","course_id" ON "course_students"
  FOR EACH ROW EXECUTE FUNCTION course_student_realm_guard();
