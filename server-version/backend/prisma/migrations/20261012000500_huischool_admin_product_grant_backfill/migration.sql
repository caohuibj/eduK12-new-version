-- PR1 hardening: School ORG_ADMIN is not automatically a Huischool
-- *product* admin. Backfill only proven existing Huischool organizations, not
-- Teacher-only schools created after the identity/product split.
INSERT INTO "education_product_role_grants"
  ("id","organization_id","membership_id","product","role","granted_by_user_id")
SELECT gen_random_uuid()::text,m."organization_id",m."id",
       'HUISCHOOL','PRODUCT_ADMIN',m."user_id"
FROM "organization_memberships" m
JOIN "organizations" o ON o."id"=m."organization_id"
  AND o."product_domain"='SCHOOL'
JOIN "education_product_entitlements" ent
  ON ent."organization_id"=m."organization_id"
  AND ent."product"='HUISCHOOL' AND ent."status"='ACTIVE'
WHERE m."org_role"='ORG_ADMIN'
  AND m."valid_from"<=statement_timestamp()
  AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
ON CONFLICT DO NOTHING;
