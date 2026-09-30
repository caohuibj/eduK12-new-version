CREATE TABLE "organization_assessment_delivery_grants" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "teacher_membership_id" TEXT NOT NULL,
  "class_unit_id" TEXT NOT NULL,
  "permission" TEXT NOT NULL DEFAULT 'CLASS_ASSESSMENT_DELIVERY',
  "granted_by_user_id" TEXT NOT NULL,
  "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_by_user_id" TEXT,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "organization_assessment_delivery_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_assessment_delivery_grants_permission_check"
    CHECK ("permission" = 'CLASS_ASSESSMENT_DELIVERY'),
  CONSTRAINT "organization_assessment_delivery_grants_org_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_assessment_delivery_grants_membership_fkey"
    FOREIGN KEY ("organization_id", "teacher_membership_id")
    REFERENCES "organization_memberships"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_assessment_delivery_grants_class_fkey"
    FOREIGN KEY ("organization_id", "class_unit_id")
    REFERENCES "organization_units"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_assessment_delivery_grants_granter_fkey"
    FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_assessment_delivery_grants_revoker_fkey"
    FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "organization_assessment_delivery_grants_active_key"
  ON "organization_assessment_delivery_grants"("organization_id","teacher_membership_id","class_unit_id","permission")
  WHERE "revoked_at" IS NULL;
CREATE INDEX "organization_assessment_delivery_grants_history_idx"
  ON "organization_assessment_delivery_grants"("organization_id","teacher_membership_id","class_unit_id","granted_at" DESC);
