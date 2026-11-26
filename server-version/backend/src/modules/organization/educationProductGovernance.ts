import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { assertEntryAdmin, AdminPermissionError } from '../admin-permissions/service'
import { appendAudit } from './service'
import type { EducationProduct } from './educationProductAccess'

type Transaction = Prisma.TransactionClient
type ProductAction='ACTIVATE'|'SUSPEND'

export class EducationProductGovernanceError extends Error {
  constructor(public readonly code:string, message:string,public readonly statusCode=409){
    super(message);this.name='EducationProductGovernanceError'
  }
}
function refuse(code:string,message='教育产品授权不可用',statusCode=409):never {
  throw new EducationProductGovernanceError(code,message,statusCode)
}
const currentSchool=async(tx:Transaction,organizationId:string)=>{
  const org=await tx.$queryRaw<Array<{id:string;status:string}>>`
    SELECT "id","status" FROM "organizations"
    WHERE "id"=${organizationId} AND "product_domain"='SCHOOL'
    FOR UPDATE
  `
  if(!org[0])refuse('EDUCATION_SCHOOL_NOT_FOUND','学校不存在',404)
  return org[0]
}

/** Product subscription changes are deliberate and exclusively platform-governed. */
export async function setEducationProductEntitlement(input:{
  actorUserId:string;organizationId:string;product:EducationProduct
  action:ProductAction;expectedRevision?:number;initialSchoolAdminMembershipId?:string
}){
  return prisma.$transaction(async tx=>{
    await assertEntryAdmin(tx,input.actorUserId,input.product)
    const school=await currentSchool(tx,input.organizationId)
    if(school.status!=='ACTIVE'&&input.action==='ACTIVATE')
      refuse('EDUCATION_SCHOOL_SUSPENDED','学校处于停用状态')
    const key={organizationId:input.organizationId,product:input.product}
    const existing=await tx.educationProductEntitlement.findUnique({where:{organizationId_product:key}})
    const wanted=input.action==='ACTIVATE'?'ACTIVE':'SUSPENDED'
    if(!existing&&wanted==='SUSPENDED')refuse('EDUCATION_PRODUCT_NOT_ENABLED')
    if(input.expectedRevision!==undefined && input.expectedRevision!==(existing?.revision??0))
      refuse('EDUCATION_PRODUCT_REVISION','产品授权已发生变化')
    if(existing?.status===wanted){
      return {organizationId:input.organizationId,product:input.product,status:wanted,revision:existing.revision,unchanged:true}
    }
    // Activating Huischool on a Teacher-only school requires a separately
    // designated School administrator. Shared ORG_ADMIN is insufficient.
    let initialSchoolAdminId:string|null=null
    if(input.action==='ACTIVATE'&&input.product==='HUISCHOOL'){
      const granted=await tx.$queryRaw<Array<{id:string}>>`
        SELECT grant_row."id" FROM "education_product_role_grants" grant_row
        JOIN "organization_memberships" m ON m."id"=grant_row."membership_id"
          AND m."organization_id"=grant_row."organization_id"
          AND m."org_role"='ORG_ADMIN'
          AND m."valid_from"<=statement_timestamp()
          AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
        JOIN "users" u ON u."id"=m."user_id"
          AND u."account_domain"='SCHOOL'
          AND u."role" IN ('TEACHER','ADMIN')
          AND u."is_active"=TRUE AND u."is_frozen"=FALSE
          AND u."must_change_password"=FALSE
          AND (u."expires_at" IS NULL OR u."expires_at">statement_timestamp())
        WHERE grant_row."organization_id"=${input.organizationId}
          AND grant_row."product"='HUISCHOOL'
          AND grant_row."role"='PRODUCT_ADMIN' AND grant_row."revoked_at" IS NULL
        LIMIT 1
      `
      if(!granted.length){
        if(!input.initialSchoolAdminMembershipId)
          refuse('HUISCHOOL_INITIAL_ADMIN_REQUIRED','必须指定心理健康产品的独立管理员')
        const eligible=await tx.$queryRaw<Array<{id:string}>>`
          SELECT m."id" FROM "organization_memberships" m
          JOIN "users" u ON u."id"=m."user_id"
            AND u."account_domain"='SCHOOL'
            AND u."role" IN ('TEACHER','ADMIN')
            AND u."is_active"=TRUE AND u."is_frozen"=FALSE
            AND u."must_change_password"=FALSE
            AND (u."expires_at" IS NULL OR u."expires_at">statement_timestamp())
          WHERE m."id"=${input.initialSchoolAdminMembershipId}
            AND m."organization_id"=${input.organizationId}
            AND m."org_role"='ORG_ADMIN'
            AND m."valid_from"<=statement_timestamp()
            AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
          FOR SHARE OF m
        `
        if(!eligible.length)refuse('HUISCHOOL_INITIAL_ADMIN_INELIGIBLE')
        initialSchoolAdminId=eligible[0].id
      }
    }
    const changedAt=new Date()
    const record=existing
      ?await tx.educationProductEntitlement.update({
        where:{organizationId_product:key},
        data:{status:wanted,suspendedAt:wanted==='SUSPENDED'?changedAt:null,
          changedByUserId:input.actorUserId,revision:{increment:1}},
      })
      :await tx.educationProductEntitlement.create({
        data:{...key,status:'ACTIVE',grantedByUserId:input.actorUserId},
      })
    if(initialSchoolAdminId){
      const role=await tx.educationProductRoleGrant.create({data:{
        id:randomUUID(),organizationId:input.organizationId,
        membershipId:initialSchoolAdminId,product:'HUISCHOOL',
        role:'PRODUCT_ADMIN',grantedByUserId:input.actorUserId,
      }})
      await appendAudit(tx,{organizationId:input.organizationId,
        actorUserId:input.actorUserId,action:'HUISCHOOL_INITIAL_ADMIN_GRANTED',
        targetType:'MEMBERSHIP',targetId:initialSchoolAdminId,
        domainEventId:randomUUID(),payload:{roleGrantId:role.id},
      })
    }
    await appendAudit(tx,{
      organizationId:input.organizationId,actorUserId:input.actorUserId,
      action:'EDUCATION_PRODUCT_'+input.action,targetType:'EDUCATION_PRODUCT',
      targetId:input.organizationId,domainEventId:randomUUID(),
      payload:{product:input.product,from:existing?.status??null,to:wanted,revision:record.revision},
    })
    return {organizationId:input.organizationId,product:input.product,
      status:record.status,revision:record.revision,unchanged:false}
  })
}
export async function readEducationProductEntitlements(actorUserId:string,organizationId:string){
  const grants=await prisma.adminEntryGrant.findMany({where:{userId:actorUserId,revokedAt:null,entry:{in:['HUISCHOOL','HUITEACHER']}}})
  if(!grants.length)throw new AdminPermissionError(403,'缺少教育入口管理授权')
  const o=await prisma.organization.findFirst({where:{id:organizationId,productDomain:'SCHOOL'},select:{id:true}})
  if(!o)refuse('EDUCATION_SCHOOL_NOT_FOUND','学校不存在',404)
  return prisma.educationProductEntitlement.findMany({where:{organizationId,product:{in:grants.map(g=>g.entry)}},
    select:{product:true,status:true,revision:true,grantedAt:true,suspendedAt:true},
    orderBy:{product:'asc'}})
}

// Membership and account checks follow current education authorization. An
// administrator with no enabled Authenticator cannot complete a fresh login.
const eligibleAdminMember = (product:EducationProduct) => Prisma.sql`
  m."valid_from"<=statement_timestamp()
  AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
  ${product==='HUISCHOOL'?Prisma.sql`AND m."org_role"='ORG_ADMIN'`:Prisma.empty}
  AND u."account_domain"='SCHOOL' AND u."role" IN ('TEACHER','ADMIN')
  AND u."teacher_approved" AND u."is_active" AND NOT u."is_frozen" AND NOT u."must_change_password"
  AND (u."expires_at" IS NULL OR u."expires_at">statement_timestamp())
  AND NOT EXISTS (
    SELECT 1 FROM "organization_access_denies" d
    WHERE d."organization_id"=m."organization_id" AND d."user_id"=u."id"
      AND d."lifted_at" IS NULL
      AND (d."permission" IN ('*','EDUCATION_ACCESS',${product+'_ACCESS'},${product+'_ADMIN'})
        OR (${product}='HUISCHOOL' AND d."permission"='ORGANIZATION_GOVERNANCE'))
  )
`
const enrolled = Prisma.sql`EXISTS (
  SELECT 1 FROM "campus_mfa_credentials" c WHERE c."user_id"=u."id" AND c."enabled"
)`
function productAdminRecords(organizationId:string,product:EducationProduct) {
  return Prisma.sql`
    SELECT g."id" AS "grantId",g."membership_id" AS "membershipId",
      COALESCE(a."login_name",u."username") AS "loginName",g."granted_at" AS "grantedAt",
      ((${eligibleAdminMember(product)}) AND a."user_id" IS NOT NULL AND ${enrolled}
        AND o."status"='ACTIVE' AND e."status"='ACTIVE') AS "effective"
    FROM "education_product_role_grants" g
    JOIN "organizations" o ON o."id"=g."organization_id"
    JOIN "education_product_entitlements" e ON e."organization_id"=g."organization_id" AND e."product"=g."product"
    JOIN "organization_memberships" m ON m."id"=g."membership_id" AND m."organization_id"=g."organization_id"
    JOIN "users" u ON u."id"=m."user_id"
    LEFT JOIN "campus_accounts" a ON a."user_id"=u."id"
    WHERE g."organization_id"=${organizationId} AND g."product"=${product}
      AND g."role"='PRODUCT_ADMIN' AND g."revoked_at" IS NULL
  `
}

export async function searchEducationGovernanceSchools(actorUserId:string,input:{q:string;page:number}){
  const entry=await prisma.adminEntryGrant.findFirst({
    where:{userId:actorUserId,revokedAt:null,entry:{in:['HUISCHOOL','HUITEACHER']}},select:{entry:true},
  })
  if(entry?.entry!=='HUISCHOOL'&&entry?.entry!=='HUITEACHER')throw new AdminPermissionError(403,'缺少教育入口管理授权')
  await assertEntryAdmin(prisma,actorUserId,entry.entry)
  const rows=await prisma.$queryRaw<Array<{id:string;name:string}>>`
    SELECT id,name FROM organizations
    WHERE product_domain='SCHOOL' AND (${input.q}='' OR strpos(lower(name),lower(${input.q}))>0 OR id=${input.q})
    ORDER BY name,id LIMIT 26 OFFSET ${(input.page-1)*25}
  `
  return {list:rows.slice(0,25),hasMore:rows.length>25,page:input.page}
}

export async function listEducationProductAdminCandidates(actorUserId:string,organizationId:string,product:EducationProduct,input:{q:string;page:number}){
  await assertEntryAdmin(prisma,actorUserId,product)
  const rows=await prisma.$queryRaw<Array<{membershipId:string;loginName:string;ready:boolean}>>`
    SELECT m."id" AS "membershipId",a."login_name" AS "loginName",${enrolled} AS "ready"
    FROM "organization_memberships" m
    JOIN "organizations" o ON o."id"=m."organization_id" AND o."product_domain"='SCHOOL' AND o."status"='ACTIVE'
    JOIN "users" u ON u."id"=m."user_id"
    JOIN "campus_accounts" a ON a."user_id"=u."id"
    WHERE m."organization_id"=${organizationId} AND (${eligibleAdminMember(product)})
      AND (${input.q}='' OR strpos(lower(a."login_name"),lower(${input.q}))>0)
    ORDER BY "loginName",m."id" LIMIT 26 OFFSET ${(input.page-1)*25}
  `
  return {list:rows.slice(0,25),hasMore:rows.length>25,page:input.page}
}

export async function listEducationProductAdmins(actorUserId:string,organizationId:string,product:EducationProduct='HUITEACHER'){
  await assertEntryAdmin(prisma,actorUserId,product)
  const school=await prisma.organization.findFirst({where:{id:organizationId,productDomain:'SCHOOL'},select:{id:true}})
  if(!school)refuse('EDUCATION_SCHOOL_NOT_FOUND','学校不存在',404)
  const rows=await prisma.$queryRaw<Array<{grantId:string;membershipId:string;loginName:string;grantedAt:Date;effective:boolean;effectiveCount:number}>>`
    SELECT r.*,(COUNT(*) FILTER (WHERE r."effective") OVER ())::int AS "effectiveCount"
    FROM (${productAdminRecords(organizationId,product)}) r
    ORDER BY r."effective" DESC,r."grantedAt" DESC,r."grantId" DESC LIMIT 101
  `
  return {list:rows.slice(0,100).map(({effectiveCount,...row})=>row),truncated:rows.length>100,effectiveCount:rows[0]?.effectiveCount??0}
}
export const listEducationTeacherAdmins = listEducationProductAdmins

/** Explicit product admin, never inferred from School ORG_ADMIN or UserRole. */
export async function grantEducationProductAdmin(input:{
  actorUserId:string;organizationId:string;membershipId:string;product?:EducationProduct
}){
  const product=input.product??'HUITEACHER'
  return prisma.$transaction(async tx=>{
    await assertEntryAdmin(tx,input.actorUserId,product)
    const school=await currentSchool(tx,input.organizationId)
    if(school.status!=='ACTIVE')refuse('EDUCATION_SCHOOL_SUSPENDED')
    const e=await tx.educationProductEntitlement.findUnique({
      where:{organizationId_product:{organizationId:input.organizationId,product}},
    })
    if(e?.status!=='ACTIVE')refuse('EDUCATION_PRODUCT_NOT_ENABLED')
    const [eligible]=await tx.$queryRaw<Array<{id:string}>>`
      SELECT m."id" FROM "organization_memberships" m JOIN "users" u ON u."id"=m."user_id"
      JOIN "campus_accounts" a ON a."user_id"=u."id"
      WHERE m."organization_id"=${input.organizationId} AND m."id"=${input.membershipId} AND (${eligibleAdminMember(product)})
      FOR SHARE OF m
    `
    if(!eligible)refuse('EDUCATION_ADMIN_INELIGIBLE')
    const existing=await tx.educationProductRoleGrant.findFirst({where:{
      organizationId:input.organizationId,membershipId:input.membershipId,
      product,role:'PRODUCT_ADMIN',revokedAt:null}})
    if(existing)return {grantId:existing.id,unchanged:true}
    const id=randomUUID()
    const row=await tx.educationProductRoleGrant.create({data:{
      id,organizationId:input.organizationId,membershipId:input.membershipId,
      product,role:'PRODUCT_ADMIN',grantedByUserId:input.actorUserId}})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'EDUCATION_PRODUCT_ADMIN_GRANTED',
      targetType:'MEMBERSHIP',targetId:input.membershipId,domainEventId:randomUUID(),
      payload:{product,grantId:id}})
    return {grantId:row.id,unchanged:false}
  })
}

export async function revokeEducationProductAdmin(input:{
  actorUserId:string;organizationId:string;grantId:string;product?:EducationProduct
}){
  const product=input.product??'HUITEACHER'
  return prisma.$transaction(async tx=>{
    await assertEntryAdmin(tx,input.actorUserId,product)
    await currentSchool(tx,input.organizationId)
    const target=await tx.educationProductRoleGrant.findFirst({where:{
      id:input.grantId,organizationId:input.organizationId,
      product,role:'PRODUCT_ADMIN',revokedAt:null}})
    if(!target)refuse('EDUCATION_ADMIN_GRANT_NOT_FOUND','管理授权不存在',404)
    const [remaining]=await tx.$queryRaw<Array<{targetEffective:boolean;alternativeEffective:boolean}>>`
      SELECT COALESCE(bool_or(r."effective" AND r."grantId"=${input.grantId}),FALSE) AS "targetEffective",
        COALESCE(bool_or(r."effective" AND r."grantId"<>${input.grantId}),FALSE) AS "alternativeEffective"
      FROM (${productAdminRecords(input.organizationId,product)}) r
    `
    if(remaining.targetEffective&&!remaining.alternativeEffective)
      refuse('EDUCATION_LAST_ADMIN','请先确认接任管理员可登录，再撤销最后一名可用管理员')
    await tx.educationProductRoleGrant.update({where:{id:target.id},
      data:{revokedAt:new Date(),revokedByUserId:input.actorUserId}})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'EDUCATION_PRODUCT_ADMIN_REVOKED',
      targetType:'MEMBERSHIP',targetId:target.membershipId,domainEventId:randomUUID(),
      payload:{product,grantId:target.id}})
    return {revoked:true,grantId:target.id}
  })
}
