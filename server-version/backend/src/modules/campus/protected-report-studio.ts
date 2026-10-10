import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { resolveOrganizationAccessContext, contextHasCapability } from '../organization/access'
import { listProtectedReportingSources, listPublishedReportingSpecs } from '../reporting/discovery'
import { getPublishedReportingSpec } from '../reporting/spec'
import { generateOrganizationProtectedFeedback, readOrganizationReportingArtifact } from '../reporting/pr4Service'
import { reportingFail } from '../reporting/types'
import { campusStudentReference } from './studentReference'

const hidden=():never=>reportingFail('CAMPUS_PROTECTED_REPORT_NOT_FOUND','protected report unavailable',404)
export const CAMPUS_PROTECTED_MIN_N=5

async function counselorPrincipal(actor:AuthenticatedPrincipal,organizationId:string){
  if(actor.accountDomain!=='SCHOOL'||!['TEACHER','ADMIN'].includes(actor.role))return hidden()
  const access=await resolveOrganizationAccessContext({principal:actor,organizationId})
  if(!access || access.productDomain!=='SCHOOL' || access.organizationStatus!=='ACTIVE'
    || !access.membershipId || !access.personas.includes('COUNSELOR')
    || !contextHasCapability(access,'PSYCHOLOGY_STAFF')
    || access.explicitDenies.some(d=>['*','REPORT_READ','REPORT_MEMBER_READ',
      'ORG_PROTECTED_FEEDBACK_V1','PSYCHOLOGY_STAFF'].includes(d)))return hidden()
  return {userId:actor.userId,platformRole:actor.platformRole}
}

export function assertReviewedCampusProtectedSpec(input:{
  analysisKind:string;minimumRespondentN?:number;minimumContributorN?:number;
  metricRules?:Array<{minimumMetricN?:number}>
}){
  if(input.analysisKind!=='PROTECTED_FEEDBACK'||(input.minimumRespondentN??0)<CAMPUS_PROTECTED_MIN_N
    ||(input.minimumContributorN??0)<CAMPUS_PROTECTED_MIN_N
    ||!input.metricRules?.length
    ||input.metricRules.some(r=>(r.minimumMetricN??0)<CAMPUS_PROTECTED_MIN_N)){
    reportingFail('CAMPUS_PROTECTED_REVIEW_REQUIRED','protected student summary requires approved minimums',409)
  }
}

async function publishedProtectedSpec(specId:string){
  const spec=await getPublishedReportingSpec(specId)
  if(spec.definition.analysisKind!=='PROTECTED_FEEDBACK')return hidden()
  assertReviewedCampusProtectedSpec(spec.definition)
  return spec
}

type SafeCandidate={runId:string;trackId:string;runName:string;
  subjectReference:string;subjectUserId:string;relationshipKind:string;
  perspective:'SELF_REPORT'|'OBSERVER_REPORT'|'RELATIONAL_EXPERIENCE';
  resource:{family:string;key:string;version:string}}

/** Honor the current CLIENT scope from discovery, then independently require
 * an approved SCHOOL student. Never ship user IDs or membership IDs to the UI.
 */
async function currentStudentCandidates(principal:{userId:string;platformRole:'SYSTEM_ADMIN'|'STANDARD'},
  organizationId:string):Promise<{list:SafeCandidate[];truncated:boolean}>{
  const data=await listProtectedReportingSources({principal,organizationId})
  const candidates=data.list.filter(s=>s.runStatus==='CLOSED')
  const ids=[...new Set(candidates.map(s=>s.subject.userId))]
  if(!ids.length)return {list:[],truncated:data.truncated}
  const approved=await prisma.$queryRaw<Array<{userId:string}>>(Prisma.sql`
    SELECT DISTINCT u.id AS "userId" FROM users u
    JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=${organizationId}
      AND m.valid_from<=statement_timestamp()
      AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
    JOIN organization_persona_grants p ON p.organization_id=m.organization_id
      AND p.membership_id=m.id AND p.persona='STUDENT' AND p.revoked_at IS NULL
    JOIN campus_student_enrollments e ON e.organization_id=m.organization_id
      AND e.user_id=u.id AND e.status='APPROVED'
    JOIN campus_class_admissions admission ON admission.organization_id=e.organization_id
      AND admission.class_unit_id=e.class_unit_id AND admission.status='APPROVED'
    WHERE u.id IN (${Prisma.join(ids)}) AND u.account_domain='SCHOOL'
      AND u.role='STUDENT' AND u.is_active=TRUE AND u.is_frozen=FALSE
  `)
  const allowed=new Set(approved.map(u=>u.userId))
  const current=candidates.filter(s=>allowed.has(s.subject.userId))
  if(!current.length)return {list:[],truncated:data.truncated}
  // Only the CLOSED Activity's existing Run can be a reporting source.
  const unique=[...new Set(current.map(s=>s.runId))]
  const bound=await prisma.$queryRaw<Array<{runId:string}>>(Prisma.sql`
    SELECT DISTINCT ar.run_id AS "runId" FROM campus_activity_runs ar
    JOIN campus_activities activity ON activity.organization_id=ar.organization_id
      AND activity.course_id=ar.course_id AND activity.status='CLOSED'
    JOIN assessment_runs run ON run.id=ar.run_id AND run.organization_id=ar.organization_id
      AND run.status='CLOSED'
    WHERE ar.organization_id=${organizationId} AND ar.run_id IN (${Prisma.join(unique)})
  `)
  const permittedRuns=new Set(bound.map(r=>r.runId))
  return {list:current.filter(s=>permittedRuns.has(s.runId)).map(s=>({
    runId:s.runId,trackId:s.trackId,runName:s.runName,
    subjectReference:campusStudentReference(organizationId,s.subject.userId),
    subjectUserId:s.subject.userId,relationshipKind:s.relationshipKind,
    perspective:s.perspective,resource:s.resource,
  })),truncated:data.truncated}
}

export async function listCampusProtectedReportCatalog(actor:AuthenticatedPrincipal,organizationId:string){
  const principal=await counselorPrincipal(actor,organizationId)
  const [specs,sources]=await Promise.all([
    listPublishedReportingSpecs({principal,organizationId,analysisKind:'PROTECTED_FEEDBACK',
      page:1,pageSize:40}),
    currentStudentCandidates(principal,organizationId),
  ])
  const qualified=specs.list.filter(s=>s.analysisKind==='PROTECTED_FEEDBACK'
    &&(s.privacy.minimumRespondentN??0)>=CAMPUS_PROTECTED_MIN_N
    &&(s.privacy.minimumContributorN??0)>=CAMPUS_PROTECTED_MIN_N)
  return {
    specs:qualified.map(s=>({specId:s.specId,title:s.specKey,version:s.version})),
    sources:sources.list.map(({subjectUserId,...safe})=>safe),
    truncated:sources.truncated||specs.total>40,
  }
}

export async function generateCampusProtectedReport(input:{
  actor:AuthenticatedPrincipal;organizationId:string;runId:string;trackId:string;
  subjectReference:string;relationshipKind:string;
  perspective:'SELF_REPORT'|'OBSERVER_REPORT'|'RELATIONAL_EXPERIENCE';specId:string
}){
  const principal=await counselorPrincipal(input.actor,input.organizationId)
  await publishedProtectedSpec(input.specId)
  const entries=await currentStudentCandidates(principal,input.organizationId)
  const match=entries.list.filter(s=>s.runId===input.runId&&s.trackId===input.trackId
    &&s.subjectReference===input.subjectReference&&s.relationshipKind===input.relationshipKind
    &&s.perspective===input.perspective)
  if(match.length!==1)return hidden()
  const result=await generateOrganizationProtectedFeedback({
    principal,organizationId:input.organizationId,runId:input.runId,trackId:input.trackId,
    subjectUserId:match[0].subjectUserId,relationshipKind:match[0].relationshipKind,
    perspective:match[0].perspective,specId:input.specId,
  })
  // Do not return the generation service's internal source references, counts
  // or metric values here. Read again through the professional disclosure.
  const authorized=await readOrganizationReportingArtifact({
    principal,organizationId:input.organizationId,artifactId:result.artifactId,
  })
  await counselorPrincipal(input.actor,input.organizationId)
  return {artifactId:authorized.artifactId,subjectReference:match[0].subjectReference,
    status:(authorized.projection as {state?:string}).state==='present'
      ?'AVAILABLE' as const:'WITHHELD' as const}
}
