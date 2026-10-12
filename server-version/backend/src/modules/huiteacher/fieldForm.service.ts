import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {appendAudit} from '../organization/service'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {resolvePublishedTeacherForm,teacherFormResourceRef} from './formRunResource'
import type {FormDraft} from '../survey/builder.definition'

type Tx=Prisma.TransactionClient
export class HuiteacherFieldFormError extends Error{
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherFieldFormError'
  }
}
const deny=(code:string,status=409):never=>{throw new HuiteacherFieldFormError(code,status)}
const FIELD_KINDS=['CLASSROOM','MEETING','TEACHING_RESEARCH','FIELD_VISIT']
export async function bindHuiteacherFieldForm(input:{
  actorUserId:string;organizationId:string;eventId:string;formId:string
}){
  return prisma.$transaction(async tx=>{
    const scope=await resolveEducationProductMemberScope({
      actorUserId:input.actorUserId,organizationId:input.organizationId,
      product:'HUITEACHER',
    },tx)
    if(!scope?.productAdmin)deny('HUITEACHER_FIELD_FORM_MANAGER_REQUIRED',403)
    const rows=await tx.$queryRaw<Array<{kind:string;status:string}>>`
      SELECT "kind","status" FROM "huiteacher_evaluation_events"
      WHERE "organization_id"=${input.organizationId} AND "id"=${input.eventId}
      FOR SHARE
    `
    const event=rows[0]
    if(!event||!FIELD_KINDS.includes(event.kind)||event.status!=='DRAFT')
      deny('HUITEACHER_FIELD_FORM_EVENT_NOT_DRAFT')
    const f=await tx.huiteacherFormInstrument.findFirst({where:{
      id:input.formId,organizationId:input.organizationId,status:'PUBLISHED',
    },select:{id:true,definitionDigest:true}})
    if(!f)deny('HUITEACHER_FIELD_FORM_NOT_PUBLISHED',404)
    const released=await resolvePublishedTeacherForm(
      teacherFormResourceRef(f.id,f.definitionDigest),tx)
    if(released.organizationId!==input.organizationId)
      deny('HUITEACHER_FIELD_FORM_DIFFERENT_SCHOOL',403)
    const linked=await tx.huiteacherFieldEventForm.findUnique({
      where:{organizationId_eventId:{
        organizationId:input.organizationId,eventId:input.eventId,
      }},
    })
    if(linked)deny('HUITEACHER_FIELD_FORM_ALREADY_BOUND')
    await tx.huiteacherFieldEventForm.create({data:{
      organizationId:input.organizationId,eventId:input.eventId,
      formId:released.id,definitionDigest:released.definitionDigest,
      assignedByUserId:input.actorUserId,
    }})
    await appendAudit(tx,{organizationId:input.organizationId,
      actorUserId:input.actorUserId,action:'HUITEACHER_FIELD_FORM_FROZEN',
      targetType:'EVALUATION_EVENT',targetId:input.eventId,
      domainEventId:randomUUID(),payload:{formId:released.id,
        definitionDigest:released.definitionDigest},
    })
    return {formId:released.id,title:released.title,
      definitionDigest:released.definitionDigest}
  })
}
export const readBoundHuiteacherFieldForm=async(tx:Tx,input:{
  organizationId:string;eventId:string
})=>{
  const bind=await tx.huiteacherFieldEventForm.findUnique({
    where:{organizationId_eventId:input},
  })
  if(!bind)return null
  const release=await resolvePublishedTeacherForm(
    teacherFormResourceRef(bind.formId,bind.definitionDigest),tx)
  if(release.organizationId!==input.organizationId)
    deny('HUITEACHER_FIELD_FORM_SCOPE_INVALID',403)
  return {formId:release.id,title:release.title,
    definitionDigest:release.definitionDigest,definition:release.definition as FormDraft}
}
/** Only an accepted event observer may read the frozen field form.
 * No Survey researcher rights and no raw answers are returned.
 */
export async function readInvitedHuiteacherFieldForm(input:{
  invitationId:string;actorUserId:string
}){
  return prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<Array<{orgId:string;eventId:string}>>`
      SELECT grant_row."organization_id" AS "orgId",
        grant_row."event_id" AS "eventId"
      FROM "huiteacher_observer_grants" grant_row
      JOIN "huiteacher_evaluation_events" event
        ON event."organization_id"=grant_row."organization_id"
        AND event."id"=grant_row."event_id" AND event."status"='OPEN'
      JOIN "education_product_entitlements" entitlement
        ON entitlement."organization_id"=event."organization_id"
        AND entitlement."product"='HUITEACHER'
        AND entitlement."status"='ACTIVE'
      JOIN "organizations" org
        ON org."id"=event."organization_id"
        AND org."status"='ACTIVE' AND org."product_domain"='SCHOOL'
      JOIN "users" actor ON actor."id"=grant_row."observer_user_id"
        AND actor."account_domain"='SCHOOL'
        AND actor."role" IN ('TEACHER','ADMIN')
        AND actor."teacher_approved"=TRUE AND actor."is_active"=TRUE
        AND actor."is_frozen"=FALSE AND actor."must_change_password"=FALSE
        AND (actor."expires_at" IS NULL OR actor."expires_at">statement_timestamp())
      WHERE grant_row."id"=${input.invitationId}
        AND grant_row."observer_user_id"=${input.actorUserId}
        AND grant_row."status"='ACCEPTED'
        AND grant_row."revoked_at" IS NULL
        AND grant_row."expires_at">statement_timestamp()
      FOR SHARE OF grant_row
    `
    const grant=rows[0]
    if(!grant)deny('HUITEACHER_FIELD_FORM_OBSERVER_REQUIRED',403)
    const released=await readBoundHuiteacherFieldForm(tx,{
      organizationId:grant.orgId,eventId:grant.eventId,
    })
    if(!released)return null
    return {formId:released.formId,title:released.title,
      definitionDigest:released.definitionDigest,pages:released.definition.pages}
  })
}
