import {randomUUID} from 'node:crypto'
import type {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {readFrozenPrivacyForRun} from '../report-privacy/snapshot.service'
import type {PrivacyOptions,PrivacyScenario} from '../report-privacy/schema'
import {parseFrozenTeacherOptions,teacherPrivacyV2Enabled,teacherReportMinimum} from './privacyV2'

export type TeacherReportScenario=Extract<PrivacyScenario,
  'TEACHER_STUDENT_EVALUATION'|'TEACHER_ADULT_FORM_GROUP'>
type Tx=Prisma.TransactionClient

export class TeacherReportReleaseError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='TeacherReportReleaseError'
  }
}
const reject=(code:string,status=409):never=>{throw new TeacherReportReleaseError(code,status)}
export async function teacherFrozenPolicy(tx:Tx,input:{
  organizationId:string;runId:string;scenario:TeacherReportScenario
}){
  const frozen=await readFrozenPrivacyForRun(tx,{
    organizationId:input.organizationId,runId:input.runId,
    product:'HUITEACHER',scenario:input.scenario})
  if(frozen.mode==='LEGACY_STRICT')return null
  // If the reporting gate is subsequently disabled, do not reinterpret new
  // V2 Runs under legacy-only rules or convert them to old ledgers.
  if(!teacherPrivacyV2Enabled())reject('TEACHER_REPORT_V2_DISABLED',503)
  const options=(()=>{
    try{return parseFrozenTeacherOptions(frozen.effective,input.scenario)}
    catch{return reject('TEACHER_REPORT_V2_POLICY_INVALID')}
  })()
  return {options,policySnapshotId:frozen.policySnapshotId,
    fingerprint:frozen.fingerprint}
}
export function teacherScopeKey(input:{
  organizationId:string;runId:string;eventId:string;formId:string;
  scenario:TeacherReportScenario
}){
  return canonicalHash({kind:'TEACHER_GROUP_REPORT_V2',...input})
}
export async function readReleasedTeacherReport(tx:Tx,input:{
  organizationId:string;runId:string;scopeKey:string;policySnapshotId:string;
  reportKind:TeacherReportScenario
}){
  const row=await tx.educationReportReleaseRecord.findUnique({
    where:{organizationId_reportScopeKey:{
      organizationId:input.organizationId,reportScopeKey:input.scopeKey}},
  })
  if(!row)return null
  if(row.policySnapshotId!==input.policySnapshotId
    ||row.sourceRunId!==input.runId||row.reportKind!==input.reportKind
    ||row.audience!=='AUTHORIZED_HUITEACHER_AGGREGATE'
    ||!row.reportProjection
    ||row.reportDigest!==canonicalHash(row.reportProjection))
    reject('TEACHER_REPORT_V2_RELEASE_INTEGRITY')
  return row.reportProjection
}
export async function recordTeacherReportRelease(tx:Tx,input:{
  organizationId:string;runId:string;scopeKey:string;
  policySnapshotId:string;scenario:TeacherReportScenario;
  actorUserId:string;populationDigest:string;projection:Record<string,unknown>;
}){
  const existing=await readReleasedTeacherReport(tx,{
    ...input,reportKind:input.scenario})
  if(existing)return existing
  const projectionJson=input.projection as Prisma.InputJsonValue
  await tx.educationReportReleaseRecord.create({data:{
    id:randomUUID(),organizationId:input.organizationId,
    reportScopeKey:input.scopeKey,policySnapshotId:input.policySnapshotId,
    sourceRunId:input.runId,reportKind:input.scenario,
    audience:'AUTHORIZED_HUITEACHER_AGGREGATE',
    reportDigest:canonicalHash(input.projection),
    effectivePopulationDigest:input.populationDigest,
    releasedByUserId:input.actorUserId,reportProjection:projectionJson,
  }})
  return input.projection
}


/** Comparing aggregates of different Form definitions is not a valid
 * subtraction attack. In enhanced mode, guard only another release of the
 * exact same immutable Form definition; keep the legacy same-Form fence.
 */
export async function hasConflictingComparableTeacherFormHistory(
  tx:Tx,input:{organizationId:string;runId:string;definitionDigest:string;
    populationDigest:string},
):Promise<boolean>{
  const rows=await tx.$queryRaw<Array<{conflict:boolean}>>`
    SELECT EXISTS(
      SELECT 1 FROM education_report_release_records release
      WHERE release.organization_id=${input.organizationId}
        AND release.report_kind='TEACHER_ADULT_FORM_GROUP'
        AND release.source_run_id<>${input.runId}
        AND release.report_projection->>'definitionDigest'=${input.definitionDigest}
        AND release.effective_population_digest IS DISTINCT FROM ${input.populationDigest}
    ) AS "conflict"
  `
  return rows[0]?.conflict===true
}

/** Serialize immutable disclosures by organization, not by Run, because
 * enhanced privacy guards compare across Runs, Forms and past disclosures. */
export async function lockTeacherDisclosure(tx:Tx,organizationId:string){
  // Transaction-scoped advisory lock serializes only Teacher report releases.
  // Do not hold the Organization FOR UPDATE row for up to 2,500 decrypted
  // FINALS: that would unnecessarily block ordinary student/teacher writes.
  const lock=await tx.$queryRaw<Array<{locked:boolean}>>`
    SELECT pg_try_advisory_xact_lock(
      hashtextextended('TEACHER_REPORT_V2:'||${organizationId},0)
    ) AS "locked"
  `
  if(lock[0]?.locked!==true)reject('TEACHER_REPORT_RELEASE_BUSY',409)
  const rows=await tx.$queryRaw<Array<{id:string}>>`
    SELECT id FROM organizations WHERE id=${organizationId}
      AND status='ACTIVE' AND product_domain='SCHOOL'
  `
  if(rows.length!==1)reject('TEACHER_REPORT_SCHOOL_INACTIVE',403)
}
/** Existing content minimum in the frozen Track cannot be lowered by a new
 * user setting. 5 applies only to a Run published under the reviewed new path. */
export async function teacherTrackMinimum(tx:Tx,input:{
  organizationId:string;runId:string;resourceKey:string;resourceVersion:string
}){
  const rows=await tx.$queryRaw<Array<{minimum:number|null}>>`
    SELECT (track.requested_policy->>'minimumRespondents')::int AS "minimum"
    FROM assessment_run_tracks track
    WHERE track.organization_id=${input.organizationId}
      AND track.run_id=${input.runId}
      AND track.resource_key=${input.resourceKey}
      AND track.resource_version=${input.resourceVersion}
  `
  const minimum=rows.length===1?rows[0].minimum:null
  if(typeof minimum==='number')return minimum
  return reject('TEACHER_REPORT_TRACK_INTEGRITY')
}
export async function teacherReportFloor(tx:Tx,input:{
  organizationId:string;runId:string;resourceKey:string;resourceVersion:string;
  options:PrivacyOptions;
}){
  return teacherReportMinimum(input.options,await teacherTrackMinimum(tx,input))
}
