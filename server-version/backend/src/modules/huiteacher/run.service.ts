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
  const policy=await productionRunResourceAuthorityRegistry.resolveExact(input.resource)
  productionRunResourceAuthorityRegistry.assertStartSupported(input.resource.family)
  // Teacher products cannot silently recruit School psychological self-assessments.
  // Released content must explicitly permit a Teacher subject, and the request
  // can only narrow an exact frozen resource policy.
  if(!policy.subjectRoles.includes('TEACHER')
    ||!input.requestedPolicy.subjectRoles.includes('TEACHER'))
    fail('HUITEACHER_RESOURCE_TARGET_UNSUPPORTED',403)
  assertRunTrackNarrowing(policy,input.requestedPolicy)
  await assertRegisteredResourceUse(input.resource,input.actorUserId)
  return addAssessmentRunTrackDraft({
    organizationId:input.organizationId,runId:link.runId,
    resource:input.resource,subjectSelector:input.subjectSelector,
    respondentSelector:input.respondentSelector,requestedPolicy:input.requestedPolicy,
  })
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
  return readAssessmentRunProgress(input.organizationId,link.runId)
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
