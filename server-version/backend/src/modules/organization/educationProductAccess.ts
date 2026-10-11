import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'

/**
 * A SCHOOL account/Organization is the shared education identity, NOT a
 * subscription to Huischool psychology or Huiteacher development.
 * Entitlement, membership, product-specific authority and source ACLs are
 * separate conditions. In particular, orgRole=ORG_ADMIN never implies
 * HUITEACHER PRODUCT_ADMIN.
 */
export const EDUCATION_PRODUCTS = ['HUISCHOOL', 'HUITEACHER'] as const
export type EducationProduct = typeof EDUCATION_PRODUCTS[number]

type Database = Prisma.TransactionClient | typeof prisma

export interface EducationProductMemberScope {
  organizationId: string
  organizationName: string
  membershipId: string
  orgRole: 'MEMBER' | 'ORG_ADMIN'
  product: EducationProduct
  productAdmin: boolean
}

export async function resolveEducationProductMemberScope(input: {
  actorUserId: string
  organizationId: string
  product: EducationProduct
}, db: Database = prisma): Promise<EducationProductMemberScope | null> {
  const deniedPermission = input.product + '_ACCESS'
  const rows = await db.$queryRaw<Array<{
    organizationId: string
    organizationName: string
    membershipId: string
    orgRole: 'MEMBER' | 'ORG_ADMIN'
    productAdmin: boolean
  }>>`
    SELECT o."id" AS "organizationId", o."name" AS "organizationName",
           m."id" AS "membershipId", m."org_role" AS "orgRole",
           EXISTS (
             SELECT 1 FROM "education_product_role_grants" grant_row
             WHERE grant_row."organization_id"=o."id"
               AND grant_row."membership_id"=m."id"
               AND grant_row."product"=${input.product}
               AND grant_row."role"='PRODUCT_ADMIN'
               AND grant_row."revoked_at" IS NULL
           ) AS "productAdmin"
    FROM "organizations" o
    JOIN "education_product_entitlements" entitlement
      ON entitlement."organization_id"=o."id"
      AND entitlement."product"=${input.product}
      AND entitlement."status"='ACTIVE'
    JOIN "organization_memberships" m ON m."organization_id"=o."id"
      AND m."user_id"=${input.actorUserId}
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    JOIN "users" u ON u."id"=m."user_id"
      AND u."account_domain"='SCHOOL'
      AND u."is_active"=TRUE AND u."is_frozen"=FALSE
      AND u."must_change_password"=FALSE
      AND (u."expires_at" IS NULL OR u."expires_at">statement_timestamp())
    WHERE o."id"=${input.organizationId}
      AND o."product_domain"='SCHOOL'
      AND o."status"='ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM "organization_access_denies" deny
        WHERE deny."organization_id"=o."id" AND deny."user_id"=u."id"
          AND deny."lifted_at" IS NULL
          AND deny."permission" IN ('*', 'EDUCATION_ACCESS', ${deniedPermission})
      )
    LIMIT 1
  `
  const row = rows[0]
  return row ? { ...row, product: input.product } : null
}

/** Read-only projection for *this* member: absence means no product access. */
export async function listEducationProductMemberships(
  actorUserId: string,
  product: EducationProduct,
  db: Database = prisma,
): Promise<EducationProductMemberScope[]> {
  const rows = await db.$queryRaw<Array<{ organizationId: string }>>`
    SELECT DISTINCT m."organization_id" AS "organizationId"
    FROM "organization_memberships" m
    JOIN "education_product_entitlements" e
      ON e."organization_id"=m."organization_id"
      AND e."product"=${product} AND e."status"='ACTIVE'
    JOIN "organizations" o ON o."id"=m."organization_id"
      AND o."product_domain"='SCHOOL' AND o."status"='ACTIVE'
    WHERE m."user_id"=${actorUserId}
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    ORDER BY m."organization_id"
    LIMIT 101
  `
  // Final authority is always the same canonical predicate as exact reads.
  const scopes: EducationProductMemberScope[] = []
  for (const { organizationId } of rows.slice(0, 100)) {
    const scope = await resolveEducationProductMemberScope({ actorUserId, organizationId, product }, db)
    if (scope) scopes.push(scope)
  }
  return scopes
}
