-- Teacher student *identity admission* is separate from Huischool psychology
-- admission. Both create/reuse the SAME User, Membership and Class.
-- Granting Teacher-only membership never becomes approved psychology enrollment.
CREATE TABLE "education_teacher_student_invitations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "class_unit_id" TEXT NOT NULL,
  "student_no_digest" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "invited_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "consumed_by_user_id" TEXT,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "education_teacher_student_invites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "education_teacher_student_invites_token_key" UNIQUE ("token_hash"),
  CONSTRAINT "education_teacher_student_invites_class_fkey" FOREIGN KEY
    ("organization_id","class_unit_id")
    REFERENCES "organization_units"("organization_id","id") ON DELETE RESTRICT,
  CONSTRAINT "education_teacher_student_invites_issuer_fkey" FOREIGN KEY
    ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "education_teacher_student_invites_claim_fkey" FOREIGN KEY
    ("consumed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "education_teacher_student_invites_interval_check"
    CHECK ("expires_at" > "created_at"),
  CONSTRAINT "education_teacher_student_invites_consume_check"
    CHECK (("consumed_at" IS NULL) = ("consumed_by_user_id" IS NULL))
);
CREATE UNIQUE INDEX "education_teacher_student_invites_pending_key"
 ON "education_teacher_student_invitations"("organization_id","student_no_digest")
 WHERE "consumed_at" IS NULL AND "revoked_at" IS NULL;
CREATE INDEX "education_teacher_student_invites_class_idx"
 ON "education_teacher_student_invitations"("organization_id","class_unit_id","expires_at");

-- Keep accidental direct SQL inserts fail closed even outside API guards.
CREATE OR REPLACE FUNCTION guard_teacher_student_invitation_class()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "organization_units" unit_row
    JOIN "organizations" org ON org."id"=unit_row."organization_id"
    JOIN "education_product_entitlements" entitlement
      ON entitlement."organization_id"=org."id"
      AND entitlement."product"='HUITEACHER'
      AND entitlement."status"='ACTIVE'
    WHERE org."id"=NEW."organization_id"
      AND org."product_domain"='SCHOOL' AND org."status"='ACTIVE'
      AND unit_row."id"=NEW."class_unit_id"
      AND unit_row."unit_kind"='CLASS'
  ) THEN
    RAISE EXCEPTION 'Teacher invitation needs an active product school class'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "education_teacher_student_invites_class_guard"
  BEFORE INSERT OR UPDATE OF "organization_id","class_unit_id"
  ON "education_teacher_student_invitations"
  FOR EACH ROW EXECUTE FUNCTION guard_teacher_student_invitation_class();
