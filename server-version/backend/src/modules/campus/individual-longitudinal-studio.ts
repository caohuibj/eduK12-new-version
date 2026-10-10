import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { resolveOrganizationAccessContext,contextHasCapability } from '../organization/access'
import { assertIndividualLongitudinalAccess } from '../reporting/individualAuthorization'
import { listIndividualSources,generateIndividualLongitudinal } from '../reporting/individualService'
import { listPublishedReportingSpecs } from '../reporting/discovery'
import { getPublishedReportingSpec } from '../reporting/spec'
import { readOrganizationReportingArtifact } from '../reporting/pr4Service'
import { reportingFail,type ReportingIndividualLongitudinalSpecV1 } from '../reporting/types'
import { campusStudentReference } from './studentReference'

type IndividualSource={runId:string;trackId:string;runName:string;resource:{family:string;key:string;version:string}}
type AuthorizedSubject={userId:string}
const hidden=():never=>reportingFail('CAMPUS_LONGITUDINAL_NOT_FOUND','campus longitudinal report unavailable',404)

async function professional(actor:AuthenticatedPrincipal,organizationId:string){
  if(actor.accountDomain!=='SCHOOL'||!['TEACHER','ADMIN'].includes(actor.role))return hidden()
  const access=await resolveOrganizationAccessContext({principal:actor,organizationId})
  if(!access||access.productDomain!=='SCHOOL'||access.organizationStatus!=='ACTIVE'
    ||!access.membershipId||!access.personas.includes('COUNSELOR')
    ||!contextHasCapability(access,'PSYCHOLOGY_STAFF')
    ||access.explicitDenies.some(x=>['*','REPORT_READ','REPORT_MEMBER_READ',
      'ORG_INDIVIDUAL_REPORT_V1','PSYCHOLOGY_STAFF'].includes(x)))return hidden()
  return {principal:{userId:actor.userId,platformRole:actor.platformRole},membershipId:access.membershipId}
}

/** Current CLIENT plus independently current, class-approved SCHOOL STUDENT.
 * Query never selects login names or student numbers, and is bounded.
 */
async function subjects(actor:AuthenticatedPrincipal,organizationId:string){
  const user=await professional(actor,organizationId)
  const rows=await prisma.$queryRaw<AuthorizedSubject[]>`
    SELECT DISTINCT child.user_id AS "userId"
    FROM organization_counselor_client_relationships relation
    JOIN organization_memberships child ON child.id=relation.client_membership_id
      AND child.organization_id=relation.organization_id
      AND child.valid_from<=statement_timestamp()
      AND (child.valid_until IS NULL OR child.valid_until>statement_timestamp())
    JOIN users u ON u.id=child.user_id AND u.account_domain='SCHOOL'
      AND u.role='STUDENT' AND u.is_active=TRUE AND u.is_frozen=FALSE
    JOIN organization_persona_grants client ON client.organization_id=child.organization_id
      AND client.membership_id=child.id AND client.persona='CLIENT' AND client.revoked_at IS NULL
    JOIN organization_persona_grants student ON student.organization_id=child.organization_id
      AND student.membership_id=child.id AND student.persona='STUDENT' AND student.revoked_at IS NULL
    JOIN campus_student_enrollments e ON e.organization_id=child.organization_id
      AND e.user_id=child.user_id AND e.status='APPROVED'
    JOIN campus_class_admissions admission ON admission.organization_id=e.organization_id
      AND admission.class_unit_id=e.class_unit_id AND admission.status='APPROVED'
    JOIN organization_student_class_assignments sc ON sc.organization_id=child.organization_id
      AND sc.membership_id=child.id AND sc.class_unit_id=e.class_unit_id
      AND sc.valid_from<=statement_timestamp()
      AND (sc.valid_until IS NULL OR sc.valid_until>statement_timestamp())
    JOIN organization_memberships counselor ON counselor.id=relation.counselor_membership_id
      AND counselor.organization_id=relation.organization_id
      AND counselor.user_id=${actor.userId}
      AND counselor.valid_from<=statement_timestamp()
      AND (counselor.valid_until IS NULL OR counselor.valid_until>statement_timestamp())
    WHERE relation.organization_id=${organizationId}
      AND relation.counselor_membership_id=${user.membershipId}
      AND relation.valid_from<=statement_timestamp()
      AND (relation.valid_until IS NULL OR relation.valid_until>statement_timestamp())
      AND NOT EXISTS(SELECT 1 FROM organization_access_denies d
        WHERE d.organization_id=relation.organization_id
          AND d.user_id IN (${actor.userId},child.user_id) AND d.lifted_at IS NULL
          AND d.permission IN ('*','REPORT_READ','REPORT_MEMBER_READ','ORG_INDIVIDUAL_REPORT_V1'))
    ORDER BY "userId" LIMIT 101
  `
  return {principal:user.principal,rows:rows.slice(0,100),truncated:rows.length>100}
}

const sourceKey=(s:{runId:string;trackId:string})=>s.runId+':'+s.trackId
async function resolveSubject(actor:AuthenticatedPrincipal,organizationId:string,reference:string){
  const pool=await subjects(actor,organizationId)
  const matching=pool.rows.filter(r=>campusStudentReference(organizationId,r.userId)===reference)
  if(matching.length!==1)return hidden()
  const subjectUserId=matching[0].userId
  await assertIndividualLongitudinalAccess({
    principal:pool.principal,organizationId,subjectUserId,
  })
  return {principal:pool.principal,subjectUserId}
}

export function assertCampusLongitudinalComparability(input:{
  spec:ReportingIndividualLongitudinalSpecV1
  sources:IndividualSource[]
}){
  const {sources:items,spec}=input
  if(items.length<2||items.length>8||!spec.metricRules.length||!spec.comparabilityRules.length
    ||new Set(items.map(s=>s.runId)).size!==items.length
    ||items.some(s=>s.resource.family!==items[0].resource.family
      ||s.resource.key!==items[0].resource.key ||s.resource.family==='COGNITIVE'))
    reportingFail('CAMPUS_LONGITUDINAL_COMPARABILITY_REQUIRED',
      'longitudinal requires distinct scientifically comparable school measurements',409)
  for(const metric of spec.metricRules){
    if(metric.sourceFamily!==items[0].resource.family||metric.sourceResourceKey!==items[0].resource.key)
      reportingFail('CAMPUS_LONGITUDINAL_COMPARABILITY_REQUIRED','metric source does not match',409)
    for(let i=1;i<items.length;i++){
      const prev=items[i-1].resource,next=items[i].resource
      const match=spec.comparabilityRules.find(r=>r.metricId===metric.metricId
        &&r.resourceFamily===prev.family&&r.resourceKey===prev.key
        &&r.fromVersion===prev.version&&r.toVersion===next.version)
      if(!match||!['EXACT','COMPATIBLE','LINKED','LIMITED'].includes(match.level)
        ||!match.evidenceRef||!/^[0-9a-f]{64}$/.test(match.evidenceHash))
        reportingFail('CAMPUS_LONGITUDINAL_COMPARABILITY_REQUIRED',
          'every metric and version pair requires reviewed comparability evidence',409)
    }
  }
}

async function permittedSources(
  actor:AuthenticatedPrincipal,organizationId:string,reference:string,
){
  const access=await resolveSubject(actor,organizationId,reference)
  const available=await listIndividualSources({
    principal:access.principal,organizationId,subjectUserId:access.subjectUserId,
    page:1,pageSize:50,
  })
  if(!available.list.length)return {...access,sources:[] as IndividualSource[],truncated:false}
  const all=available.list.filter(s=>s.resource.family!=='COGNITIVE')
  if(!all.length)return {...access,sources:[] as IndividualSource[],truncated:!!available.nextPage}
  const eligible=await prisma.$queryRaw<Array<{runId:string;trackId:string}>>(Prisma.sql`
    SELECT DISTINCT run.id AS "runId",track.id AS "trackId"
    FROM assessment_run_tracks track
    JOIN assessment_runs run ON run.id=track.run_id
      AND run.organization_id=track.organization_id
      AND run.status='CLOSED' AND run.closed_at<=statement_timestamp()-interval '24 hours'
    JOIN campus_activity_runs ar ON ar.run_id=run.id AND ar.organization_id=run.organization_id
    JOIN campus_activities activity ON activity.organization_id=ar.organization_id
      AND activity.course_id=ar.course_id AND activity.status='CLOSED'
      AND activity.closed_at<=statement_timestamp()-interval '24 hours'
    JOIN assessment_run_executions execution ON execution.organization_id=track.organization_id
      AND execution.run_id=track.run_id AND execution.track_id=track.id
      AND execution.status='COMPLETED'
    JOIN assessment_run_actor_snapshots s ON s.organization_id=execution.organization_id
      AND s.run_id=execution.run_id AND s.id=execution.subject_actor_snapshot_id
      AND s.user_id=${access.subjectUserId} AND s.actor_role='STUDENT'
      AND s.provenance_kind='ORG_MEMBER' AND s.membership_id IS NOT NULL
    JOIN assessment_run_actor_snapshots respondent ON respondent.id=execution.respondent_actor_snapshot_id
      AND respondent.organization_id=execution.organization_id AND respondent.run_id=execution.run_id
      AND respondent.user_id=s.user_id AND respondent.membership_id=s.membership_id
      AND respondent.actor_role='STUDENT'
    JOIN assessment_run_relationship_snapshots rel ON rel.id=execution.relationship_snapshot_id
      AND rel.organization_id=execution.organization_id AND rel.run_id=execution.run_id
      AND rel.relationship_kind='SELF'
    WHERE track.organization_id=${organizationId}
      AND (${Prisma.join(all.map(s=>Prisma.sql`(run.id=${s.runId} AND track.id=${s.trackId})`),' OR ')})
  `)
  const keys=new Set(eligible.map(sourceKey))
  const list=all.filter(s=>keys.has(sourceKey(s)))
  await assertIndividualLongitudinalAccess({
    principal:access.principal,organizationId,subjectUserId:access.subjectUserId,
  })
  return {...access,sources:list,truncated:!!available.nextPage}
}

async function reviewedSpec(specId:string){
  const spec=await getPublishedReportingSpec(specId)
  if(spec.definition.analysisKind!=='INDIVIDUAL_LONGITUDINAL'||!spec.definition.metricRules.length
    ||!spec.definition.comparabilityRules.length)return hidden()
  return spec.definition
}

export async function listCampusIndividualLongitudinalCatalog(
  actor:AuthenticatedPrincipal,organizationId:string,
){
  const state=await subjects(actor,organizationId)
  const published=await listPublishedReportingSpecs({
    principal:state.principal,organizationId,analysisKind:'INDIVIDUAL_LONGITUDINAL',
    page:1,pageSize:40,
  })
  const candidates=published.list.filter(s=>s.analysisKind==='INDIVIDUAL_LONGITUDINAL')
  return {subjects:state.rows.map(r=>({
    reference:campusStudentReference(organizationId,r.userId),
  })),specs:candidates.map(s=>({
    specId:s.specId,title:s.specKey,version:s.version,
  })),truncated:state.truncated||published.total>40}
}

export async function listCampusIndividualLongitudinalSources(input:{
  actor:AuthenticatedPrincipal;organizationId:string;subjectReference:string,
}){
  const data=await permittedSources(input.actor,input.organizationId,input.subjectReference)
  return {sources:data.sources,truncated:data.truncated}
}

export async function generateCampusIndividualLongitudinal(input:{
  actor:AuthenticatedPrincipal;organizationId:string;subjectReference:string
  specId:string;sources:Array<{runId:string;trackId:string}>
}){
  const options=await permittedSources(input.actor,input.organizationId,input.subjectReference)
  const selected=input.sources.map(s=>options.sources.find(a=>sourceKey(a)===sourceKey(s)))
  if(selected.some(s=>!s))return hidden()
  const safe=selected as IndividualSource[]
  const definition=await reviewedSpec(input.specId)
  assertCampusLongitudinalComparability({spec:definition,sources:safe})
  const result=await generateIndividualLongitudinal({
    principal:options.principal,organizationId:input.organizationId,
    subjectUserId:options.subjectUserId,sources:input.sources,
    specId:input.specId,
    referenceResolutionMode:'ORIGINAL',
  })
  const current=await readOrganizationReportingArtifact({
    principal:options.principal,organizationId:input.organizationId,artifactId:result.artifactId,
  })
  await resolveSubject(input.actor,input.organizationId,input.subjectReference)
  return {artifactId:current.artifactId,subjectReference:input.subjectReference,
    status:'AVAILABLE' as const,
    note:'专业纵向报告已生成，须在专业报告工作台按最新授权重新读取；这里不会返回分数或因果解释。'}
}
