import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { validateSurveyDraft } from '../survey/builder.definition'
import type { RunResourcePolicy,RunResourceRef } from '../assessment-run/resourceAuthority'
import type { ResultDisclosureContractV1 } from '../assessment-policy/result-disclosure'

export const TEACHER_FORM_RESOURCE_PREFIX='huiteacher-form:' as const
export const TEACHER_FORM_RUNTIME_KIND='HUITEACHER_FORM_V2' as const
export const TEACHER_FORM_MIN_RESPONDENTS=10 as const
type Db=typeof prisma|Prisma.TransactionClient

export class TeacherFormResourceError extends Error{
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='TeacherFormResourceError'
  }
}
const deny=(code:string,status=409):never=>{throw new TeacherFormResourceError(code,status)}

export const teacherFormResourceRef=(id:string,digest:string):RunResourceRef=>({
  family:'FORM',key:TEACHER_FORM_RESOURCE_PREFIX+id,version:digest,
})
export const teacherFormResourceId=(ref:RunResourceRef):string|null=>{
  if(ref.family!=='FORM'||!ref.key.startsWith(TEACHER_FORM_RESOURCE_PREFIX))return null
  const id=ref.key.slice(TEACHER_FORM_RESOURCE_PREFIX.length)
  return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)?id:null
}
const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
const completed={mode:'COMPLETION_ONLY' as const,metricKeys:[],longitudinalMetricKeys:[]}
const aggregate={mode:'ORGANIZATION_AGGREGATE' as const,metricKeys:[],longitudinalMetricKeys:[]}
const disclosure:ResultDisclosureContractV1={
  schemaVersion:1,policyKey:'HUITEACHER_FORM_GROUP_V1',
  minimumRespondents:TEACHER_FORM_MIN_RESPONDENTS,
  audiences:{RESPONDENT:completed,SUBJECT:completed,TEACHER:none,
    PARENT:none,PROFESSIONAL:none,ORGANIZATION:aggregate,RESEARCH:none},
}
export interface ResolvedTeacherForm{
  id:string;organizationId:string;definitionDigest:string;definition:unknown;
  title:string;revision:number
}
/** Released teacher Form is unscored. No Survey Researcher project is accessed. */
export async function resolvePublishedTeacherForm(ref:RunResourceRef,db:Db=prisma)
  :Promise<ResolvedTeacherForm>{
  const formId=teacherFormResourceId(ref)
  if(!formId)deny('TEACHER_FORM_RESOURCE_KEY_INVALID',400)
  const row=await db.huiteacherFormInstrument.findUnique({
    where:{id:formId},
    select:{id:true,organizationId:true,definitionDigest:true,
      definition:true,status:true,title:true,revision:true},
  })
  if(!row||row.status!=='PUBLISHED'||row.definitionDigest!==ref.version)
    deny('TEACHER_FORM_RESOURCE_NOT_RELEASED',404)
  const validated=validateSurveyDraft('FORM',row.definition,true)
  if(!validated.definition||validated.issues.some(x=>x.severity==='error')
    ||validated.digest!==row.definitionDigest)
    deny('TEACHER_FORM_RESOURCE_INTEGRITY')
  // Teacher has no access to Survey project media. Do not permit authored
  // images whose attachment authority belongs to the Survey research realm.
  if(validated.definition.kind!==undefined)deny('TEACHER_FORM_RESOURCE_KIND')
  if(validated.definition.pages.some(page=>page.questions.some(q=>q.image)))
    deny('TEACHER_FORM_MEDIA_UNSUPPORTED',403)
  return row
}

export async function resolveTeacherFormResourcePolicy(ref:RunResourceRef,db:Db=prisma)
  :Promise<RunResourcePolicy>{
  const form=await resolvePublishedTeacherForm(ref,db)
  return {
    family:'FORM',key:ref.key,version:ref.version,
    scientificMaturity:'PILOT',applicabilityHash:canonicalHash({
      product:'HUITEACHER',kind:'UNSCORED_FORM_V2',formId:form.id,
      orgId:form.organizationId,digest:form.definitionDigest,revision:form.revision,
    }),
    subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],
    relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],
    analysisMode:'COHORT_AGGREGATE',
    visibilityPolicyKey:'HUITEACHER_FORM_GROUP_V1',
    minimumRespondents:TEACHER_FORM_MIN_RESPONDENTS,
    resultDisclosure:disclosure,
    initiationModes:['ORG_ASSIGN'],
    runtimeLaunchTarget:{kind:TEACHER_FORM_RUNTIME_KIND,ref:form.id},
  }
}

/**
 * Run may consume only this school's immutable Form, and only when the Run
 * was atomically created by the matching Teacher evaluation event.
 * Legacy/School Run routes may not launder Teacher content into School.
 */
export async function assertTeacherFormRunUse(db:Prisma.TransactionClient,input:{
  organizationId:string;runId:string;ref:RunResourceRef
}):Promise<void>{
  const form=await resolvePublishedTeacherForm(input.ref,db)
  if(form.organizationId!==input.organizationId)
    deny('TEACHER_FORM_CROSS_SCHOOL_FORBIDDEN',403)
  const links=await db.$queryRaw<Array<{id:string}>>`
    SELECT form."id" FROM "huiteacher_evaluation_run_links" link
    JOIN "huiteacher_evaluation_events" event
      ON event."organization_id"=link."organization_id"
      AND event."id"=link."event_id"
      AND event."status" IN ('DRAFT','OPEN')
    JOIN "huiteacher_form_instruments" form
      ON form."organization_id"=link."organization_id"
      AND form."id"=${form.id}
      AND form."definition_digest"=${form.definitionDigest}
      AND form."status"='PUBLISHED'
    JOIN "education_product_entitlements" entitlement
      ON entitlement."organization_id"=link."organization_id"
      AND entitlement."product"='HUITEACHER'
      AND entitlement."status"='ACTIVE'
    WHERE link."organization_id"=${input.organizationId}
      AND link."run_id"=${input.runId}
    FOR SHARE OF form,entitlement,event
  `
  if(!links.length)deny('TEACHER_FORM_RUN_SCOPE_FORBIDDEN',403)
}
