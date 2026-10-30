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
  actorUserId?:string
  product:EducationProduct
  organizationId?:string
  candidateSearch?:string
  candidatePage?:number
  requiredProductAdmin?:boolean
  requiredCapability?:'PSYCHOLOGY_STAFF'
},db:Database):Promise<Array<EducationProductMemberScope&{userId?:string;username?:string}>>=>{
  const accessDeny = input.product+'_ACCESS'
  const adminDeny = input.product+'_ADMIN'
  const orgFilter=input.organizationId
    ? Prisma.sql`AND o."id"=${input.organizationId}`
    : Prisma.empty
  // A professional identity belongs to this exact membership, not to the
  // user's platform role or a grant held in another school. Keep the whole
  // decision in the same statement as account/product/membership validity.
  const professionalFilter=input.requiredCapability==='PSYCHOLOGY_STAFF'
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "organization_persona_grants" persona
        WHERE persona."organization_id"=o."id" AND persona."membership_id"=m."id"
          AND persona."persona"='COUNSELOR' AND persona."revoked_at" IS NULL
      ) AND EXISTS (
        SELECT 1 FROM "organization_capability_grants" capability
        WHERE capability."organization_id"=o."id" AND capability."membership_id"=m."id"
          AND capability."capability"='PSYCHOLOGY_STAFF' AND capability."revoked_at" IS NULL
      ) AND NOT EXISTS (
        SELECT 1 FROM "organization_access_denies" professional_deny
        WHERE professional_deny."organization_id"=o."id" AND professional_deny."user_id"=u."id"
          AND professional_deny."lifted_at" IS NULL
          AND professional_deny."permission"='PSYCHOLOGY_STAFF'
      )`
    : Prisma.empty
  const limit=input.organizationId?1:100
  const candidates=input.candidatePage!==undefined
  if(candidates&&!input.organizationId)throw Error('Author candidate projection requires an exact organization')
  if(!candidates&&!input.actorUserId)return []
  const statement=Prisma.sql`
    SELECT ${!candidates?Prisma.empty:Prisma.sql`DISTINCT ON (u.id)`} o."id" AS "organizationId",o."name" AS "organizationName",
           m."id" AS "membershipId",m."org_role" AS "orgRole",
           (
             EXISTS (
               SELECT 1 FROM "education_product_role_grants" grant_row
               WHERE grant_row."organization_id"=o."id"
                 AND grant_row."membership_id"=m."id"
                 AND grant_row."product"=${input.product}
                 AND grant_row."role"='PRODUCT_ADMIN'
                 AND grant_row."revoked_at" IS NULL
             ) AND u."role" IN ('ADMIN','TEACHER')
               AND u."teacher_approved"=TRUE
               AND NOT EXISTS (
               SELECT 1 FROM "organization_access_denies" denied_admin
               WHERE denied_admin."organization_id"=o."id"
                 AND denied_admin."user_id"=u."id"
                 AND denied_admin."lifted_at" IS NULL
                 AND denied_admin."permission" IN ('*',${adminDeny})
             )
           ) AS "productAdmin" ${!candidates?Prisma.empty:Prisma.sql`,u.id AS "userId",u.username`}
    FROM "organizations" o
    JOIN "education_product_entitlements" e
      ON e."organization_id"=o."id"
      AND e."product"=${input.product} AND e."status"='ACTIVE'
    JOIN "organization_memberships" m ON m."organization_id"=o."id"
      ${!candidates?Prisma.sql`AND m."user_id"=${input.actorUserId}`:Prisma.empty}
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    JOIN "users" u ON u."id"=m."user_id"
      AND u."account_domain"='SCHOOL'
      AND u."is_active"=TRUE AND u."is_frozen"=FALSE
      AND u."must_change_password"=FALSE
      AND (u."expires_at" IS NULL OR u."expires_at">statement_timestamp())
    WHERE o."product_domain"='SCHOOL' AND o."status"='ACTIVE'
      ${orgFilter}
      ${professionalFilter}
      AND NOT EXISTS(
        SELECT 1 FROM "organization_access_denies" deny
        WHERE deny."organization_id"=o."id" AND deny."user_id"=u."id"
          AND deny."lifted_at" IS NULL
          AND deny."permission" IN ('*','EDUCATION_ACCESS',${accessDeny})
      )
    ${!candidates?Prisma.empty:Prisma.sql`AND (${input.candidateSearch??''}='' OR strpos(lower(u.username),lower(${input.candidateSearch??''}))>0)`}
  `
  const rows=await db.$queryRaw<Array<Omit<EducationProductMemberScope,'product'>&{userId?:string;username?:string}>>(!candidates
    ?Prisma.sql`${statement} ORDER BY o."id",m."valid_from" DESC LIMIT ${limit}`
    :Prisma.sql`SELECT * FROM (${statement} ORDER BY u.id,m.valid_from DESC) eligible
      WHERE (${input.requiredProductAdmin??false}=false OR eligible."productAdmin")
      ORDER BY eligible.username,eligible."userId" LIMIT 26 OFFSET ${((input.candidatePage??1)-1)*25}`)
  return rows.map(row=>({...row,product:input.product}))
}

export async function resolveEducationProductMemberScope(input:{
  actorUserId:string
  organizationId:string
  product:EducationProduct
  requiredCapability?:'PSYCHOLOGY_STAFF'
},db:Database=prisma):Promise<EducationProductMemberScope|null>{
  return (await memberScopes(input,db))[0]??null
}

/** One bounded SQL read, no N+1 / no return of irrelevant school memberships. */
export async function listEducationProductMemberships(
  actorUserId:string,product:EducationProduct,db:Database=prisma,
):Promise<EducationProductMemberScope[]>{
  return memberScopes({actorUserId,product},db)
}

/** Read-only manager chooser. Reuses the same member/account/deny/qualification
 * SQL as single-actor authorization; it never returns a reusable write permit. */
export async function listEducationAuthoringMemberCandidates(input:{product:EducationProduct;organizationId:string;page:number;q:string},db:Database=prisma){
  if(!Number.isInteger(input.page)||input.page<1||input.page>10000||input.q.length>120)throw Error('Invalid author candidate page')
  const rows=await memberScopes({product:input.product,organizationId:input.organizationId,candidatePage:input.page,candidateSearch:input.q,
    ...(input.product==='HUISCHOOL'?{requiredCapability:'PSYCHOLOGY_STAFF' as const}:{requiredProductAdmin:true})},db)
  return {page:input.page,hasMore:rows.length>25,list:rows.slice(0,25).map(row=>({userId:row.userId!,username:row.username!,membershipId:row.membershipId}))}
}
