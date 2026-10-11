import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'

/**
 * A SCHOOL account and Organization are shared education identity, NOT a
 * subscription to either product's business data. A global UserRole.ADMIN
 * or school orgRole=ORG_ADMIN NEVER makes one a Huiteacher product admin.
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

const memberScopes = async (input:{
  actorUserId:string
  product:EducationProduct
  organizationId?:string
},db:Database):Promise<EducationProductMemberScope[]>=>{
  const accessDeny = input.product+'_ACCESS'
  const adminDeny = input.product+'_ADMIN'
  const orgFilter=input.organizationId
    ? Prisma.sql`AND o."id"=${input.organizationId}`
    : Prisma.empty
  const limit=input.organizationId?1:100
  const rows=await db.$queryRaw<Array<Omit<EducationProductMemberScope,'product'>>>(Prisma.sql`
    SELECT o."id" AS "organizationId",o."name" AS "organizationName",
           m."id" AS "membershipId",m."org_role" AS "orgRole",
           (
             EXISTS (
               SELECT 1 FROM "education_product_role_grants" grant_row
               WHERE grant_row."organization_id"=o."id"
                 AND grant_row."membership_id"=m."id"
                 AND grant_row."product"=${input.product}
                 AND grant_row."role"='PRODUCT_ADMIN'
                 AND grant_row."revoked_at" IS NULL
             ) AND NOT EXISTS (
               SELECT 1 FROM "organization_access_denies" denied_admin
               WHERE denied_admin."organization_id"=o."id"
                 AND denied_admin."user_id"=u."id"
                 AND denied_admin."lifted_at" IS NULL
                 AND denied_admin."permission" IN ('*',${adminDeny})
             )
           ) AS "productAdmin"
    FROM "organizations" o
    JOIN "education_product_entitlements" e
      ON e."organization_id"=o."id"
      AND e."product"=${input.product} AND e."status"='ACTIVE'
    JOIN "organization_memberships" m ON m."organization_id"=o."id"
      AND m."user_id"=${input.actorUserId}
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    JOIN "users" u ON u."id"=m."user_id"
      AND u."account_domain"='SCHOOL'
      AND u."is_active"=TRUE AND u."is_frozen"=FALSE
      AND u."must_change_password"=FALSE
      AND (u."expires_at" IS NULL OR u."expires_at">statement_timestamp())
    WHERE o."product_domain"='SCHOOL' AND o."status"='ACTIVE'
      ${orgFilter}
      AND NOT EXISTS(
        SELECT 1 FROM "organization_access_denies" deny
        WHERE deny."organization_id"=o."id" AND deny."user_id"=u."id"
          AND deny."lifted_at" IS NULL
          AND deny."permission" IN ('*','EDUCATION_ACCESS',${accessDeny})
      )
    ORDER BY o."id",m."valid_from" DESC
    LIMIT ${limit}
  `)
  return rows.map(row=>({...row,product:input.product}))
}

export async function resolveEducationProductMemberScope(input:{
  actorUserId:string
  organizationId:string
  product:EducationProduct
},db:Database=prisma):Promise<EducationProductMemberScope|null>{
  return (await memberScopes(input,db))[0]??null
}

/** One bounded SQL read, no N+1 / no return of irrelevant school memberships. */
export async function listEducationProductMemberships(
  actorUserId:string,product:EducationProduct,db:Database=prisma,
):Promise<EducationProductMemberScope[]>{
  return memberScopes({actorUserId,product},db)
}
