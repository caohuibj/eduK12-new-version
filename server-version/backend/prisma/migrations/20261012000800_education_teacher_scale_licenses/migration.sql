-- Huiteacher PR3: a separately released adult SELF scale requires an
-- explicit *school-product* license. Legacy/material grants and UserRole.ADMIN
-- are not Teacher school entitlements.
CREATE TABLE "education_teacher_scale_licenses" (
  "organization_id" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "granted_by_user_id" TEXT NOT NULL,
  "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  "revision" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "education_teacher_scale_licenses_pkey" PRIMARY KEY ("organization_id","resource_id"),
  CONSTRAINT "education_teacher_scale_licenses_organization_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "education_teacher_scale_licenses_resource_fk"
    FOREIGN KEY ("resource_id") REFERENCES "registered_assessment_resources"("id") ON DELETE RESTRICT,
  CONSTRAINT "education_teacher_scale_licenses_grantor_fk"
    FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "education_teacher_scale_licenses_status_check"
    CHECK (("status"='ACTIVE' AND "revoked_at" IS NULL)
       OR ("status"='REVOKED' AND "revoked_at" IS NOT NULL)),
  CONSTRAINT "education_teacher_scale_licenses_revision_check" CHECK("revision">=1)
);
CREATE INDEX "education_teacher_scale_licenses_active_resources_idx"
  ON "education_teacher_scale_licenses"("resource_id","status","organization_id");
CREATE OR REPLACE FUNCTION guard_teacher_scale_license() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status"='ACTIVE' AND (NOT EXISTS (
    SELECT 1 FROM "organizations" o
    JOIN "education_product_entitlements" e
      ON e."organization_id"=o."id" AND e."product"='HUITEACHER'
      AND e."status"='ACTIVE'
    WHERE o."id"=NEW."organization_id" AND o."product_domain"='SCHOOL'
      AND o."status"='ACTIVE'
  ) OR NOT EXISTS (
    SELECT 1 FROM "registered_assessment_resources" r
    WHERE r."id"=NEW."resource_id"
      AND r."resource_key" LIKE 'teacher-scale:%:INDIVIDUAL'
      AND r."status"='PUBLISHED'
  )) THEN
    RAISE EXCEPTION 'Teacher Scale licensing requires released adult-self resource and enabled school'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "education_teacher_scale_licenses_guard"
  BEFORE INSERT OR UPDATE OF "organization_id","resource_id","status"
  ON "education_teacher_scale_licenses"
  FOR EACH ROW EXECUTE FUNCTION guard_teacher_scale_license();
