-- Huiteacher PR1-C1: the SCHOOL account realm is the shared education identity.
-- Product entitlement is an independent boundary; a SCHOOL user or membership
-- does not, by itself, authorize either product's business data.
-- Existing user IDs, passwords, school memberships and campus reports stay intact.
CREATE TABLE "education_product_entitlements" (
  "organization_id" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "granted_by_user_id" TEXT NOT NULL,
  "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "suspended_at" TIMESTAMPTZ(6),
  "changed_by_user_id" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "education_product_entitlements_pkey" PRIMARY KEY ("organization_id", "product"),
  CONSTRAINT "education_product_entitlements_product_check" CHECK ("product" IN ('HUISCHOOL', 'HUITEACHER')),
  CONSTRAINT "education_product_entitlements_status_check" CHECK (
    ("status"='ACTIVE' AND "suspended_at" IS NULL) OR
    ("status"='SUSPENDED' AND "suspended_at" IS NOT NULL)
  ),
  CONSTRAINT "education_product_entitlements_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "education_product_entitlements_org_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "education_product_entitlements_grantor_fkey" FOREIGN KEY ("granted_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "education_product_entitlements_changer_fkey" FOREIGN KEY ("changed_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "education_product_entitlements_product_status_idx"
  ON "education_product_entitlements"("product", "status", "organization_id");

-- Domain checks stay DB-authoritative: no legacy/TRAINING Organization is
-- converted into an education school merely by inserting an entitlement.
CREATE OR REPLACE FUNCTION require_education_organization_domain()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM "organizations" o
    WHERE o."id"=NEW."organization_id" AND o."product_domain"='SCHOOL'
  ) THEN
    RAISE EXCEPTION 'education entitlement requires SCHOOL identity organization'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "education_product_entitlements_domain_guard"
  BEFORE INSERT OR UPDATE OF "organization_id", "product"
  ON "education_product_entitlements"
  FOR EACH ROW EXECUTE FUNCTION require_education_organization_domain();

CREATE TABLE "education_product_role_grants" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "granted_by_user_id" TEXT NOT NULL,
  "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_by_user_id" TEXT,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "education_product_role_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "education_product_role_grants_product_check" CHECK ("product" IN ('HUISCHOOL', 'HUITEACHER')),
  CONSTRAINT "education_product_role_grants_role_check" CHECK ("role" IN ('PRODUCT_ADMIN')),
  CONSTRAINT "education_product_role_grants_revoke_check" CHECK (
    ("revoked_at" IS NULL AND "revoked_by_user_id" IS NULL)
    OR ("revoked_at" IS NOT NULL AND "revoked_by_user_id" IS NOT NULL)
  ),
  CONSTRAINT "education_product_role_grants_entitlement_fkey"
    FOREIGN KEY ("organization_id", "product")
    REFERENCES "education_product_entitlements"("organization_id", "product") ON DELETE RESTRICT,
  CONSTRAINT "education_product_role_grants_membership_fkey"
    FOREIGN KEY ("organization_id", "membership_id")
    REFERENCES "organization_memberships"("organization_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "education_product_role_grants_grantor_fkey"
    FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "education_product_role_grants_revoker_fkey"
    FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "education_product_role_grants_current_key"
  ON "education_product_role_grants"("organization_id", "membership_id", "product", "role")
  WHERE "revoked_at" IS NULL;
CREATE INDEX "education_product_role_grants_membership_idx"
  ON "education_product_role_grants"("membership_id", "product", "revoked_at");

-- Compatibility-only backfill: retain the *existing* SCHOOL product for proven
-- SCHOOL Organizations. HUITEACHER always requires a new explicit grant.
-- Do not infer entitlements by organization name, member role or account ID.
INSERT INTO "education_product_entitlements"
  ("organization_id","product","status","granted_by_user_id")
SELECT o."id",'HUISCHOOL','ACTIVE',o."created_by_user_id"
FROM "organizations" o WHERE o."product_domain"='SCHOOL'
ON CONFLICT ("organization_id","product") DO NOTHING;
