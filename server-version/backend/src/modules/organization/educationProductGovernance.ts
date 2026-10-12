import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { assertCurrentSystemAdmin } from '../../services/accountAuthorityService'
import { appendAudit } from './service'
import type { EducationProduct } from './educationProductAccess'

type Transaction = Prisma.TransactionClient
type ProductAction='ACTIVATE'|'SUSPEND'

export class EducationProductGovernanceError extends Error {
  constructor(public readonly code:string, message:string,public readonly statusCode=409){
    super(message);this.name='EducationProductGovernanceError'
  }
}
const refuse=(code:string,message='教育产品授权不可用',statusCode=409):never=>{
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
    await assertCurrentSystemAdmin(tx,input.actorUserId)
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
  await assertCurrentSystemAdmin(prisma,actorUserId)
  const o=await prisma.organization.findFirst({where:{id:organizationId,productDomain:'SCHOOL'},select:{id:true}})
  if(!o)refuse('EDUCATION_SCHOOL_NOT_FOUND','学校不存在',404)
  return prisma.educationProductEntitlement.findMany({where:{organizationId},
    select:{product:true,status:true,revision:true,grantedAt:true,suspendedAt:true},
    orderBy:{product:'asc'}})
}

/** Read-only tenant-scoped product-admin roster for the platform operator.
 * This is not the School or Teacher organization-member listing endpoint.
 * Only the existing LEGACY/TRAINING SYSTEM_ADMIN can call it.
 */
export async function listEducationTeacherAdmins(actorUserId:string,organizationId:string){
  await assertCurrentSystemAdmin(prisma,actorUserId)
  const school=await prisma.organization.findFirst({
    where:{id:organizationId,productDomain:'SCHOOL'},
    select:{id:true},
  })
  if(!school)refuse('EDUCATION_SCHOOL_NOT_FOUND','学校不存在',404)
  const rows=await prisma.$queryRaw<Array<{
    grantId:string;membershipId:string;loginName:string;grantedAt:Date
  }>>`
    SELECT g."id" AS "grantId",g."membership_id" AS "membershipId",
      COALESCE(account."login_name",u."username") AS "loginName",
      g."granted_at" AS "grantedAt"
    FROM "education_product_role_grants" g
    JOIN "organization_memberships" m
      ON m."id"=g."membership_id" AND m."organization_id"=g."organization_id"
    JOIN "users" u ON u."id"=m."user_id" AND u."account_domain"='SCHOOL'
    LEFT JOIN "campus_accounts" account ON account."user_id"=u."id"
    WHERE g."organization_id"=${organizationId}
      AND g."product"='HUITEACHER'
      AND g."role"='PRODUCT_ADMIN' AND g."revoked_at" IS NULL
      AND m."valid_from"<=statement_timestamp()
      AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
    ORDER BY g."granted_at" DESC,g."id" DESC LIMIT 101
  `
  return {list:rows.slice(0,100),truncated:rows.length>100}
}

/** Explicit product admin, never inferred from School ORG_ADMIN or UserRole. */
export async function grantEducationProductAdmin(input:{
  actorUserId:string;organizationId:string;membershipId:string
}){
  return prisma.$transaction(async tx=>{
    await assertCurrentSystemAdmin(tx,input.actorUserId)
    const school=await currentSchool(tx,input.organizationId)
    if(school.status!=='ACTIVE')refuse('EDUCATION_SCHOOL_SUSPENDED')
    const e=await tx.educationProductEntitlement.findUnique({
      where:{organizationId_product:{organizationId:input.organizationId,product:'HUITEACHER'}},
    })
    if(e?.status!=='ACTIVE')refuse('EDUCATION_PRODUCT_NOT_ENABLED')
    const m=await tx.organizationMembership.findFirst({
      where:{id:input.membershipId,organizationId:input.organizationId,
        validFrom:{lte:new Date()},validUntil:null},
      select:{userId:true},
    })
    if(!m)refuse('EDUCATION_MEMBERSHIP_REQUIRED')
    const user=await tx.user.findUnique({where:{id:m.userId},
      select:{id:true,accountDomain:true,role:true,isActive:true,isFrozen:true,
        mustChangePassword:true,expiresAt:true}})
    if(!user||user.accountDomain!=='SCHOOL'||!['TEACHER','ADMIN'].includes(user.role)
      ||!user.isActive||user.isFrozen||user.mustChangePassword
      ||(user.expiresAt&&user.expiresAt<=new Date()))
      refuse('EDUCATION_ADMIN_INELIGIBLE')
    const existing=await tx.educationProductRoleGrant.findFirst({where:{
      organizationId:input.organizationId,membershipId:input.membershipId,
      product:'HUITEACHER',role:'PRODUCT_ADMIN',revokedAt:null}})
    if(existing)return {grantId:existing.id,unchanged:true}
    const id=randomUUID()
    const row=await tx.educationProductRoleGrant.create({data:{
      id,organizationId:input.organizationId,membershipId:input.membershipId,
      product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:input.actorUserId}})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'EDUCATION_PRODUCT_ADMIN_GRANTED',
      targetType:'MEMBERSHIP',targetId:input.membershipId,domainEventId:randomUUID(),
      payload:{product:'HUITEACHER',grantId:id}})
    return {grantId:row.id,unchanged:false}
  })
}

export async function revokeEducationProductAdmin(input:{
  actorUserId:string;organizationId:string;grantId:string
}){
  return prisma.$transaction(async tx=>{
    await assertCurrentSystemAdmin(tx,input.actorUserId)
    await currentSchool(tx,input.organizationId)
    const target=await tx.educationProductRoleGrant.findFirst({where:{
      id:input.grantId,organizationId:input.organizationId,
      product:'HUITEACHER',role:'PRODUCT_ADMIN',revokedAt:null}})
    if(!target)refuse('EDUCATION_ADMIN_GRANT_NOT_FOUND','管理授权不存在',404)
    const [active]=await tx.$queryRaw<Array<{n:number}>>`
      SELECT count(*)::int AS n FROM "education_product_role_grants" g
      JOIN "organization_memberships" m
        ON m."organization_id"=g."organization_id"
        AND m."id"=g."membership_id"
        AND m."valid_from"<=statement_timestamp()
        AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
      WHERE g."organization_id"=${input.organizationId}
        AND g."product"='HUITEACHER' AND g."role"='PRODUCT_ADMIN'
        AND g."revoked_at" IS NULL
    `
    if((active?.n??0)<=1)refuse('EDUCATION_LAST_ADMIN','不能移除最后一名当前产品管理员')
    await tx.educationProductRoleGrant.update({where:{id:target.id},
      data:{revokedAt:new Date(),revokedByUserId:input.actorUserId}})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'EDUCATION_PRODUCT_ADMIN_REVOKED',
      targetType:'MEMBERSHIP',targetId:target.membershipId,domainEventId:randomUUID(),
      payload:{product:'HUITEACHER',grantId:target.id}})
    return {revoked:true,grantId:target.id}
  })
}
