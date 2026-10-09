-- Campus identity onboarding. This is additive only; legacy organizations
-- and courses keep their historical semantics, without inferred conversion.
ALTER TABLE "organizations" ADD COLUMN "product_domain" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_product_domain_check"
  CHECK ("product_domain" IN ('LEGACY', 'SCHOOL'));

CREATE TABLE "campus_class_admissions" (
  "class_unit_id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "roster_version" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "window_opens_at" TIMESTAMPTZ(6),
  "window_closes_at" TIMESTAMPTZ(6),
  "approved_at" TIMESTAMPTZ(6),
  "approved_by_user_id" TEXT,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_class_admissions_org_class_fkey" FOREIGN KEY
    ("organization_id", "class_unit_id")
    REFERENCES "organization_units" ("organization_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "campus_class_admissions_approver_fkey" FOREIGN KEY ("approved_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "campus_class_admissions_status_check"
    CHECK ("status" IN ('DRAFT', 'OPEN', 'CLOSED', 'APPROVED')),
  CONSTRAINT "campus_class_admissions_revision_check" CHECK ("roster_version" >= 0),
  CONSTRAINT "campus_class_admissions_window_check" CHECK
    ("window_closes_at" IS NULL OR ("window_opens_at" IS NOT NULL AND "window_closes_at" > "window_opens_at"))
);
CREATE INDEX "campus_class_admissions_org_status_idx"
  ON "campus_class_admissions" ("organization_id", "status");

CREATE TABLE "campus_student_eligibilities" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "class_unit_id" TEXT NOT NULL,
  "student_no_digest" TEXT NOT NULL,
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "roster_version" INTEGER NOT NULL,
  "claimed_user_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'VALID',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_student_eligibilities_class_fkey" FOREIGN KEY
    ("class_unit_id") REFERENCES "campus_class_admissions" ("class_unit_id") ON DELETE RESTRICT,
  CONSTRAINT "campus_student_eligibilities_claimed_user_fkey" FOREIGN KEY ("claimed_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "campus_student_eligibilities_status_check" CHECK ("status" IN ('VALID', 'VOID')),
  CONSTRAINT "campus_student_eligibilities_key_version_check" CHECK ("key_version" > 0),
  CONSTRAINT "campus_student_eligibilities_org_digest_key" UNIQUE
    ("organization_id", "student_no_digest"),
  CONSTRAINT "campus_student_eligibilities_claimed_user_key" UNIQUE ("claimed_user_id")
);
CREATE INDEX "campus_student_eligibilities_class_idx" ON
  "campus_student_eligibilities" ("organization_id", "class_unit_id", "roster_version");

CREATE TABLE "campus_activation_codes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "class_unit_id" TEXT NOT NULL,
  "roster_version" INTEGER NOT NULL,
  "code_digest" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "consumed_user_id" TEXT,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_activation_codes_class_fkey" FOREIGN KEY
    ("class_unit_id") REFERENCES "campus_class_admissions" ("class_unit_id") ON DELETE RESTRICT,
  CONSTRAINT "campus_activation_codes_user_fkey" FOREIGN KEY ("consumed_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "campus_activation_codes_digest_key" UNIQUE ("code_digest"),
  CONSTRAINT "campus_activation_codes_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "campus_activation_codes_consume_check"
    CHECK (("consumed_at" IS NULL) = ("consumed_user_id" IS NULL))
);
CREATE INDEX "campus_activation_codes_class_idx"
  ON "campus_activation_codes" ("organization_id", "class_unit_id", "expires_at");

CREATE TABLE "campus_student_enrollments" (
  "user_id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "class_unit_id" TEXT NOT NULL,
  "eligibility_id" TEXT NOT NULL UNIQUE,
  "roster_version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_CLASS_APPROVAL',
  "approved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_student_enrollments_user_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "campus_student_enrollments_class_fkey" FOREIGN KEY ("class_unit_id")
    REFERENCES "campus_class_admissions"("class_unit_id") ON DELETE RESTRICT,
  CONSTRAINT "campus_student_enrollments_eligibility_fkey" FOREIGN KEY ("eligibility_id")
    REFERENCES "campus_student_eligibilities"("id") ON DELETE RESTRICT,
  CONSTRAINT "campus_student_enrollments_status_check"
    CHECK ("status" IN ('PENDING_CLASS_APPROVAL', 'APPROVED', 'QUARANTINED', 'ENDED'))
);
CREATE INDEX "campus_student_enrollments_class_idx" ON
  "campus_student_enrollments" ("organization_id", "class_unit_id", "status");

CREATE TABLE "campus_admission_incidents" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL,
  "class_unit_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campus_admission_incidents_class_fkey" FOREIGN KEY ("class_unit_id")
    REFERENCES "campus_class_admissions"("class_unit_id") ON DELETE RESTRICT
);
CREATE INDEX "campus_admission_incidents_class_idx" ON
  "campus_admission_incidents" ("organization_id", "class_unit_id", "resolved_at");

-- A roster can only be opened on a class in a SCHOOL organization.
CREATE OR REPLACE FUNCTION campus_school_class_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "organization_units" u
    JOIN "organizations" o ON o."id" = u."organization_id"
    WHERE u."id" = NEW."class_unit_id"
      AND u."organization_id" = NEW."organization_id"
      AND u."unit_kind" = 'CLASS'
      AND o."product_domain" = 'SCHOOL'
  ) THEN
    RAISE EXCEPTION 'Campus admission requires SCHOOL class' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER campus_school_class_guard_insert
  BEFORE INSERT OR UPDATE OF "class_unit_id", "organization_id"
  ON "campus_class_admissions"
  FOR EACH ROW EXECUTE FUNCTION campus_school_class_guard();
