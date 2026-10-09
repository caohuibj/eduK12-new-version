-- The school/class tuple is authoritative for every campus admission row.
-- These composite FKs prevent a forged org_id with another school's class.
ALTER TABLE "campus_class_admissions"
  ADD CONSTRAINT "campus_class_admissions_org_class_key"
  UNIQUE ("organization_id", "class_unit_id");

ALTER TABLE "campus_student_eligibilities"
  DROP CONSTRAINT "campus_student_eligibilities_class_fkey";
ALTER TABLE "campus_student_eligibilities"
  ADD CONSTRAINT "campus_student_eligibilities_scope_fkey"
  FOREIGN KEY ("organization_id", "class_unit_id")
  REFERENCES "campus_class_admissions" ("organization_id","class_unit_id")
  ON DELETE RESTRICT;

ALTER TABLE "campus_activation_codes"
  DROP CONSTRAINT "campus_activation_codes_class_fkey";
ALTER TABLE "campus_activation_codes"
  ADD CONSTRAINT "campus_activation_codes_scope_fkey"
  FOREIGN KEY ("organization_id", "class_unit_id")
  REFERENCES "campus_class_admissions" ("organization_id","class_unit_id")
  ON DELETE RESTRICT;

ALTER TABLE "campus_student_enrollments"
  DROP CONSTRAINT "campus_student_enrollments_class_fkey";
ALTER TABLE "campus_student_enrollments"
  ADD CONSTRAINT "campus_student_enrollments_scope_fkey"
  FOREIGN KEY ("organization_id", "class_unit_id")
  REFERENCES "campus_class_admissions" ("organization_id","class_unit_id")
  ON DELETE RESTRICT;

ALTER TABLE "campus_admission_incidents"
  DROP CONSTRAINT "campus_admission_incidents_class_fkey";
ALTER TABLE "campus_admission_incidents"
  ADD CONSTRAINT "campus_admission_incidents_scope_fkey"
  FOREIGN KEY ("organization_id", "class_unit_id")
  REFERENCES "campus_class_admissions" ("organization_id","class_unit_id")
  ON DELETE RESTRICT;

ALTER TABLE "campus_student_recoveries"
  ADD CONSTRAINT "campus_student_recoveries_scope_fkey"
  FOREIGN KEY ("organization_id","class_unit_id")
  REFERENCES "campus_class_admissions" ("organization_id","class_unit_id")
  ON DELETE RESTRICT;

-- Prevent a SCHOOL member from silently being assigned to a legacy product
-- organization and a LEGACY/TRAINING user entering a SCHOOL organization.
CREATE OR REPLACE FUNCTION campus_membership_domain_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "organizations" o JOIN "users" u ON u."id"=NEW."user_id"
    WHERE o."id"=NEW."organization_id"
      AND ((o."product_domain"='SCHOOL' AND u."account_domain"<>'SCHOOL')
           OR (o."product_domain"<>'SCHOOL' AND u."account_domain"='SCHOOL'))
  ) THEN
    RAISE EXCEPTION 'cross-product organization membership forbidden'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER campus_membership_domain_guard
  BEFORE INSERT OR UPDATE OF "organization_id","user_id"
  ON "organization_memberships"
  FOR EACH ROW EXECUTE FUNCTION campus_membership_domain_guard();
