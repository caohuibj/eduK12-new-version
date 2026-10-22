import {addPrivateScaleRunTrack} from '../education-tools/private-tool.run-adapter'
import {listEducationLibraryResourcePage} from '../scale-library-governance/education-catalog'
import {canonicalHash} from '../assessment-runtime/canonical'
import { prisma } from '../../config/database'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { addAssessmentRunTrackDraft } from '../assessment-run/repository'
import { previewAssessmentRun,publishAssessmentRun } from '../assessment-run/publish'
import { readAssessmentRunProgress } from '../assessment-run/progress'
import { closeAssessmentRun,cancelAssessmentRun } from '../assessment-run/lifecycle'
import {
  productionRunResourceAuthorityRegistry,
  assertRunTrackNarrowing,type RunResourceRef,type RunTrackNarrowingRequest,
} from '../assessment-run/resourceAuthority'
import { assertRegisteredResourceUse } from '../assessment-run/registeredResources'
import { teacherFormResourceId } from './formRunResource'
import {teacherResourceMinimum,teacherPrivacyV2Enabled} from './privacyV2'
import { teacherScaleResource,listTeacherScaleCatalog } from './scaleLicense.service'
import { assertCurrentRunManagerBoundary,assertCurrentRunPublisherBoundary } from '../assessment-run/resourceBoundary'

export class HuiteacherRunError extends Error{
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='HuiteacherRunError'
  }
}
const fail=(code:string,statusCode=409):never=>{throw new HuiteacherRunError(code,statusCode)}

async function activeLink(input:{
  organizationId:string;eventId:string;actorUserId:string
}){
  const scope=await resolveEducationProductMemberScope({
    actorUserId:input.actorUserId,organizationId:input.organizationId,
    product:'HUITEACHER',
  })
  if(!scope?.productAdmin)fail('HUITEACHER_RUN_ADMIN_REQUIRED',403)
  const rows=await prisma.$queryRaw<Array<{
    runId:string;eventStatus:string;runStatus:string;runVersion:number
  }>>`
    SELECT link."run_id" AS "runId",event."status" AS "eventStatus",
      run."status" AS "runStatus",run."version" AS "runVersion"
    FROM "huiteacher_evaluation_run_links" link
    JOIN "huiteacher_evaluation_events" event
      ON event."id"=link."event_id"
      AND event."organization_id"=link."organization_id"
    JOIN "assessment_runs" run
      ON run."id"=link."run_id" AND run."organization_id"=link."organization_id"
    WHERE link."organization_id"=${input.organizationId}
      AND link."event_id"=${input.eventId}
    LIMIT 1
  `
  const link=rows[0]
  if(!link)fail('HUITEACHER_RUN_NOT_FOUND',404)
  await assertCurrentRunManagerBoundary({
    actorUserId:input.actorUserId,organizationId:input.organizationId,
    runId:link.runId,
  })
  return link
}
type Key={organizationId:string;eventId:string;actorUserId:string}
export async function addTeacherRunTrack(input:Key&{
  resource:RunResourceRef;subjectSelector:unknown;respondentSelector:unknown;
  requestedPolicy:RunTrackNarrowingRequest
}){
  const link=await activeLink(input)
  if(link.eventStatus!=='DRAFT'||link.runStatus!=='DRAFT')
    fail('HUITEACHER_RUN_NOT_DRAFT')
  // A configured STUDENT->TEACHER Run can only receive the exact immutable
  // student Form track created by the protected student evaluation adapter.
  const studentConfig=await prisma.huiteacherStudentEvaluationConfig.findUnique({
    where:{organizationId_eventId:{organizationId:input.organizationId,eventId:input.eventId}},
    select:{id:true},
  })
  if(studentConfig)fail('HUITEACHER_STUDENT_EVAL_TRACK_READONLY',403)
  // A normal School diagnosis must invite the whole current Teacher cohort.
  // Narrow actor selectors are an independently trusted disclosure workflow,
  // not a knob in the ordinary group Form task API.
  if(input.resource.family==='FORM'){
    const whole=(selection:unknown)=>
      !!selection&&typeof selection==='object'&&!Array.isArray(selection)
      &&Object.keys(selection as Record<string,unknown>).length===1
      &&(selection as Record<string,unknown>).kind==='ALL_CURRENT'
    if(!whole(input.subjectSelector)||!whole(input.respondentSelector))
      fail('HUITEACHER_FORM_REQUIRES_WHOLE_COHORT',403)
  }
  const policy=await productionRunResourceAuthorityRegistry.resolveExact(input.resource)
  productionRunResourceAuthorityRegistry.assertStartSupported(input.resource.family)
  // Teacher products cannot silently recruit School psychological self-assessments.
  // Released content must explicitly permit a Teacher subject, and the request
  // can only narrow an exact frozen resource policy.
  if(input.resource.family==='FORM'&&!teacherFormResourceId(input.resource))
    fail('HUITEACHER_FORM_REQUIRES_TEACHER_RELEASE',403)
  if(input.resource.family==='SCALE'&&(!(teacherScaleResource(input.resource)||input.resource.key.startsWith('library-scale:'))
    ||input.requestedPolicy.analysisMode!=='INDIVIDUAL_ONLY'))
    fail('HUITEACHER_PERSONAL_SCALE_RELEASE_REQUIRED',403)
  if(!['FORM','SCALE'].includes(input.resource.family))
    fail('HUITEACHER_RESOURCE_KIND_UNSUPPORTED',403)
  if(!policy.subjectRoles.includes('TEACHER')
    ||!input.requestedPolicy.subjectRoles.includes('TEACHER'))
    fail('HUITEACHER_RESOURCE_TARGET_UNSUPPORTED',403)
  const requestedPolicy=input.resource.family==='FORM'
    &&teacherFormResourceId(input.resource)&&teacherPrivacyV2Enabled()
    ?{...input.requestedPolicy,minimumRespondents:teacherResourceMinimum()}
    :input.requestedPolicy
  assertRunTrackNarrowing(policy,requestedPolicy)
  await assertRegisteredResourceUse(input.resource,input.actorUserId,prisma,false,{organizationId:input.organizationId,runId:link.runId})
  return addAssessmentRunTrackDraft({
    actorUserId:input.actorUserId,
    organizationId:input.organizationId,runId:link.runId,
    resource:input.resource,subjectSelector:input.subjectSelector,
    respondentSelector:input.respondentSelector,requestedPolicy,
  })
}
/** Product route identity is kept separate from the strict client draft DTO. */
export async function addTeacherPrivateRunTrack(input:Key,raw:unknown){
  const link=await activeLink(input)
  if(link.eventStatus!=='DRAFT'||link.runStatus!=='DRAFT')fail('HUITEACHER_RUN_NOT_DRAFT')
  return addPrivateScaleRunTrack({organizationId:input.organizationId,runId:link.runId,actorUserId:input.actorUserId,
    parent:{kind:'TEACHER_EVENT',id:input.eventId}},raw)
}
export async function previewTeacherRun(input:Key&{expectedVersion:number}){
  const link=await activeLink(input)
  if(!['DRAFT','OPEN'].includes(link.eventStatus)||link.runStatus!=='DRAFT')
    fail('HUITEACHER_RUN_PREVIEW_FORBIDDEN')
  return previewAssessmentRun({
    organizationId:input.organizationId,runId:link.runId,
    actorUserId:input.actorUserId,expectedVersion:input.expectedVersion,
  })
}
export async function publishTeacherRun(input:Key&{expectedVersion:number}){
  const link=await activeLink(input)
  if(link.eventStatus!=='OPEN'||link.runStatus!=='DRAFT')
    fail('HUITEACHER_RUN_EVENT_MUST_BE_OPEN')
  await assertCurrentRunPublisherBoundary({
    actorUserId:input.actorUserId,organizationId:input.organizationId,runId:link.runId,
  })
  return publishAssessmentRun({
    organizationId:input.organizationId,runId:link.runId,
    actorUserId:input.actorUserId,expectedVersion:input.expectedVersion,
  })
}
export async function progressTeacherRun(input:Key){
  const link=await activeLink(input)
  const progress=await readAssessmentRunProgress(input.organizationId,link.runId)
  // Manager dashboard receives only aggregate states, never individual
  // execution IDs, runtime binding refs, or sortable respondent timestamps.
  return {runId:progress.runId,total:progress.total,counts:progress.counts}
}
export async function closeTeacherRun(input:Key){
  const link=await activeLink(input)
  if(link.eventStatus!=='OPEN'||link.runStatus!=='PUBLISHED')
    fail('HUITEACHER_RUN_CLOSE_FORBIDDEN')
  return closeAssessmentRun({organizationId:input.organizationId,runId:link.runId})
}
export async function cancelTeacherRun(input:Key){
  const link=await activeLink(input)
  if(!['DRAFT','OPEN'].includes(link.eventStatus)
    ||!['DRAFT','PUBLISHED'].includes(link.runStatus))
    fail('HUITEACHER_RUN_CANCEL_FORBIDDEN')
  return cancelAssessmentRun({organizationId:input.organizationId,runId:link.runId})
}

export async function listTeacherAvailableScales(input:Key&{cursor?:string}){
  await activeLink(input)
  const legacy=input.cursor?{list:[],truncated:false}:await listTeacherScaleCatalog(input)
  const catalog=await prisma.$transaction(tx=>listEducationLibraryResourcePage(tx,{product:'TEACHER',organizationId:input.organizationId,actorId:input.actorUserId,workflow:{kind:'EVENT',id:input.eventId},cursor:input.cursor}))
  return {list:[...legacy.list,...catalog.entries.map(entry=>({id:entry.applicability.resourceKey,key:entry.applicability.resourceKey,version:entry.applicability.resourceVersion,title:entry.title,hash:canonicalHash(entry),visibilityPolicyKey:entry.applicability.visibilityPolicyKey,personalReportAvailable:entry.resultDisclosure?.audiences.RESPONDENT.mode==='INDIVIDUAL_SUMMARY'}))],truncated:legacy.truncated,nextCursor:catalog.nextCursor}
}

