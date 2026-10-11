import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { validateScaleDefinition,hashScaleDefinition } from '../scale/scale-definition'
import { assertCurrentSystemAdmin } from '../../services/accountAuthorityService'
import { appendAudit } from '../organization/service'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'

export class TeacherScaleLicenseError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='TeacherScaleLicenseError'
  }
}
const deny=(code:string,status=409):never=>{throw new TeacherScaleLicenseError(code,status)}
type Db=Prisma.TransactionClient|typeof prisma
export const teacherScaleResource=(ref:{family:string;key:string;version:string})=>
  ref.family==='SCALE'&&/^teacher-scale:[a-f0-9-]{36}:INDIVIDUAL$/.test(ref.key)

/** Check the exact independently reviewed resource, not just its label/key.
 * This does NOT change or expose any pre-existing Student scale package.
 */
export async function releasedTeacherScaleEntry(db:Db,ref:{
  family:string;key:string;version:string
}){
  if(!teacherScaleResource(ref))deny('HUITEACHER_SCALE_IDENTITY_INVALID',403)
  const rows=await db.$queryRaw<Array<{
    id:string;scaleId:string;definitionHash:string;resourceKey:string;
    status:string;entry:Record<string,any>;entryHash:string;
    createdByUserId:string;reviewedByUserId:string|null;
    scaleStatus:string;scaleHash:string;scaleDefinition:unknown
  }>>`
    SELECT r."id",r."scale_id" AS "scaleId",
      r."definition_hash" AS "definitionHash",
      r."resource_key" AS "resourceKey",r."status",
      r."entry",r."entry_hash" AS "entryHash",
      r."created_by_user_id" AS "createdByUserId",
      r."reviewed_by_user_id" AS "reviewedByUserId",
      scale."status" AS "scaleStatus",scale."definition_hash" AS "scaleHash",
      scale."definition" AS "scaleDefinition"
    FROM "registered_assessment_resources" r
    JOIN "scales" scale ON scale."id"=r."scale_id"
    WHERE r."resource_key"=${ref.key}
      AND r."resource_version"=${ref.version}
      AND r."status"='PUBLISHED'
    LIMIT 1
    FOR SHARE OF r,scale
  `
  const r=rows[0]
  if(!r||r.scaleStatus!=='PUBLISHED'||r.scaleHash!==r.definitionHash
    ||!r.reviewedByUserId||r.reviewedByUserId===r.createdByUserId
    ||canonicalHash(r.entry)!==r.entryHash
    ||r.entry?.applicability?.resourceKind!=='SCALE'
    ||r.entry?.applicability?.resourceKey!==ref.key
    ||r.entry?.applicability?.resourceVersion!==ref.version
    ||r.entry?.applicability?.analysisMode!=='INDIVIDUAL_ONLY'
    ||JSON.stringify(r.entry?.applicability?.subjectRoles)!=='["TEACHER"]'
    ||JSON.stringify(r.entry?.applicability?.respondentRoles)!=='["TEACHER"]'
    ||r.entry?.resultDisclosure?.audiences?.ORGANIZATION?.mode!=='NONE')
    deny('HUITEACHER_SCALE_RELEASE_INVALID',403)
  const checked=validateScaleDefinition(r.scaleDefinition,{
    instrumentClass:'CUSTOM_DESCRIPTIVE',forPublish:true,
  })
  const def=checked.definition
  if(!def||checked.issues.some(x=>x.severity==='error')
    ||def.respondentType!=='teacher_self_report'
    ||def.license.status!=='self_authored'||def.license.redistribution!=='allowed'
    ||def.referencePolicy.type!=='none'||hashScaleDefinition(def)!==r.definitionHash)
    deny('HUITEACHER_SCALE_SOURCE_INVALID',403)
  return r
}

/** License is a deliberately scoped platform action; never implicitly inherited
 * from Org Admin or an unrelated Training material grant.
 */
export async function changeTeacherScaleLicense(input:{
  organizationId:string;resourceId:string;actorUserId:string;
  action:'GRANT'|'REVOKE'
}){
  return prisma.$transaction(async tx=>{
    await assertCurrentSystemAdmin(tx,input.actorUserId)
    await tx.$queryRaw`SELECT "id" FROM "organizations"
      WHERE "id"=${input.organizationId} AND "status"='ACTIVE'
        AND "product_domain"='SCHOOL' FOR UPDATE`
    const ent=await tx.educationProductEntitlement.findUnique({
      where:{organizationId_product:{
        organizationId:input.organizationId,product:'HUITEACHER',
      }},
    })
    if(ent?.status!=='ACTIVE')deny('HUITEACHER_LICENSE_PRODUCT_INACTIVE',403)
    const row=await tx.$queryRaw<Array<{resourceKey:string;resourceVersion:string}>>`
      SELECT "resource_key" AS "resourceKey",
        "resource_version" AS "resourceVersion"
      FROM "registered_assessment_resources"
      WHERE "id"=${input.resourceId} FOR SHARE
    `
    if(!row.length)deny('HUITEACHER_SCALE_NOT_FOUND',404)
    if(input.action==='GRANT')await releasedTeacherScaleEntry(tx,{
      family:'SCALE',key:row[0].resourceKey,version:row[0].resourceVersion,
    })
    const key={organizationId:input.organizationId,resourceId:input.resourceId}
    const current=await tx.educationTeacherScaleLicense.findUnique({
      where:{organizationId_resourceId:key},
    })
    if(!current&&input.action==='REVOKE')deny('HUITEACHER_LICENSE_NOT_FOUND',404)
    const active=input.action==='GRANT'
    if(current?.status===(active?'ACTIVE':'REVOKED'))
      return {status:current.status,revision:current.revision,unchanged:true}
    const result=current
      ?await tx.educationTeacherScaleLicense.update({
        where:{organizationId_resourceId:key},
        data:{status:active?'ACTIVE':'REVOKED',
          revokedAt:active?null:new Date(),revision:{increment:1},
          grantedByUserId:active?input.actorUserId:current.grantedByUserId},
      })
      :await tx.educationTeacherScaleLicense.create({data:{
        ...key,status:'ACTIVE',grantedByUserId:input.actorUserId,
      }})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,
      action:'HUITEACHER_SCALE_LICENSE_'+input.action,
      targetType:'RELEASED_RESOURCE',targetId:input.resourceId,
      domainEventId:randomUUID(),
      payload:{scope:'HUITEACHER',resourceKey:row[0].resourceKey,
        revision:result.revision},
    })
    return {status:result.status,revision:result.revision,unchanged:false}
  })
}

export async function assertTeacherScaleRunUse(db:Db,input:{
  organizationId:string;runId:string;resource:{
    family:string;key:string;version:string
  }
}){
  const entry=await releasedTeacherScaleEntry(db,input.resource)
  const licenses=await db.$queryRaw<Array<{id:string}>>`
    SELECT license."resource_id" AS "id"
    FROM "education_teacher_scale_licenses" license
    JOIN "education_product_entitlements" ent
      ON ent."organization_id"=license."organization_id"
      AND ent."product"='HUITEACHER' AND ent."status"='ACTIVE'
    JOIN "huiteacher_evaluation_run_links" link
      ON link."organization_id"=license."organization_id"
      AND link."run_id"=${input.runId}
    JOIN "huiteacher_evaluation_events" event
      ON event."organization_id"=link."organization_id"
      AND event."id"=link."event_id"
      AND event."status" IN ('DRAFT','OPEN')
    WHERE license."organization_id"=${input.organizationId}
      AND license."resource_id"=${entry.id}
      AND license."status"='ACTIVE'
    LIMIT 1
    FOR SHARE OF license,ent,event
  `
  if(!licenses.length)deny('HUITEACHER_SCALE_NOT_LICENSED_FOR_RUN',403)
}

/** Manager may see a licensed resource's title and exact version only.
 * Published content does not imply individual teacher report visibility.
 */
export async function listTeacherScaleCatalog(input:{
  organizationId:string;actorUserId:string
}){
  const current=await resolveEducationProductMemberScope({
    actorUserId:input.actorUserId,organizationId:input.organizationId,
    product:'HUITEACHER',
  })
  if(!current?.productAdmin)deny('HUITEACHER_SCALE_CATALOG_FORBIDDEN',403)
  const rows=await prisma.$queryRaw<Array<{
    id:string;key:string;version:string;title:string;hash:string
  }>>`
    SELECT resource."id",resource."resource_key" AS "key",
      resource."resource_version" AS "version",
      resource."entry"->>'title' AS "title",
      resource."entry_hash" AS "hash"
    FROM "education_teacher_scale_licenses" license
    JOIN "registered_assessment_resources" resource
      ON resource."id"=license."resource_id"
      AND resource."status"='PUBLISHED'
      AND resource."resource_key" LIKE 'teacher-scale:%:INDIVIDUAL'
    WHERE license."organization_id"=${input.organizationId}
      AND license."status"='ACTIVE'
    ORDER BY resource."created_at" DESC,resource."id"
    LIMIT 101
  `
  return {list:rows.slice(0,100),truncated:rows.length>100}
}
