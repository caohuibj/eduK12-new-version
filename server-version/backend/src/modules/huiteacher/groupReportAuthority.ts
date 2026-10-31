import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {resolveEducationProductMemberScope} from '../organization/educationProductAccess'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compositeItemSlotKey} from '../assessment-runtime/slot-set'
import {isSelfGroupV2Entry} from '../assessment-policy/self-group-contract'
import {validateResultDisclosureContract} from '../assessment-policy/result-disclosure'
import {resolveHistoricalRelationalEntry} from '../assessment-run/registeredResources'
import {reportingFail,type ReportingLeafSourceV2} from '../reporting/types'
import {teacherNativeGroupTrack,teacherNativeLeafContract} from './nativeGroupSource'
const hidden=():never=>reportingFail('REPORT_NOT_FOUND','Teacher group report unavailable',404)
type Source={organizationId:string;runId:string;trackId:string}

/** Product administration remains an actual current grant. An internal product
 * tag selects this existing boundary; neither generic teacher persona nor a
 * caller-provided audience grants organization report access. */
export async function assertTeacherGroupAuthority(input:{actorUserId:string;organizationId:string;runIds?:string[]},db:Prisma.TransactionClient|typeof prisma=prisma){
 const scope=await resolveEducationProductMemberScope({...input,product:'HUITEACHER'},db)
 if(!scope?.productAdmin)hidden()
 const denied=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM organization_access_denies WHERE organization_id=${input.organizationId} AND user_id=${input.actorUserId}
  AND lifted_at IS NULL AND permission IN ('*','REPORT_READ','ORG_GROUP_REPORT_V1') LIMIT 1`
 if(denied.length)hidden()
 const ids=[...new Set(input.runIds??[])]
 if(ids.length){
  const rows=await db.$queryRaw<Array<{runId:string}>>(Prisma.sql`SELECT l.run_id AS "runId" FROM huiteacher_evaluation_run_links l
   JOIN huiteacher_evaluation_events e ON e.id=l.event_id AND e.organization_id=l.organization_id
   JOIN assessment_runs r ON r.id=l.run_id AND r.organization_id=l.organization_id
   WHERE l.organization_id=${input.organizationId} AND l.run_id=ANY(${ids}::text[])`)
  if(rows.length!==ids.length)hidden()
 }
 return scope
}

/** Content-only resolution from the frozen real Teacher parent. No individual
 * results are materialized on artifact reads. Original and library Scale use
 * the same single-item C binding; native multi-item resources retain their own
 * per-leaf adapter and are not inferred from a parent-wide union of keys. */
export async function teacherScaleLeafContract(source:Source,leaf:ReportingLeafSourceV2,db:Prisma.TransactionClient|typeof prisma=prisma){
 const [track]=await db.$queryRaw<Array<{key:string;version:string;family:string;policy:any;hash:string}>>(Prisma.sql`
  SELECT t.resource_key AS key,t.resource_version AS version,t.resource_family AS family,t.frozen_resource_policy AS policy,t.resource_policy_hash AS hash
  FROM assessment_run_tracks t JOIN huiteacher_evaluation_run_links l ON l.run_id=t.run_id AND l.organization_id=t.organization_id
  WHERE t.organization_id=${source.organizationId} AND t.run_id=${source.runId} AND t.id=${source.trackId}`)
 if(!track)return null
 if(track.family==='BUNDLE'&&track.key.startsWith('education-composition:TEACHER:')){
  const {loadSchoolPrivateGroupDisclosure,schoolPrivateGroupLeafDisclosure}=await import('../education-tools/school-private-group-leaf')
  const exact=await loadSchoolPrivateGroupDisclosure(db,source)
  if(!exact)hidden()
  return schoolPrivateGroupLeafDisclosure(exact!,leaf).contract
 }
 if(teacherNativeGroupTrack(track))return teacherNativeLeafContract(source,track,leaf,db)
 if(track.family!=='SCALE'||leaf.unitType!=='SCALE'||!track.key.endsWith(':GROUP')
  ||!['teacher-scale:','library-scale:'].some(prefix=>track.key.startsWith(prefix)))return null
 if(canonicalHash(track.policy)!==track.hash)hidden()
 const entry=await resolveHistoricalRelationalEntry({resourceKind:'SCALE',resourceKey:track.key,resourceVersion:track.version},db)
 if(!entry||!isSelfGroupV2Entry(entry)||canonicalHash(entry.resultDisclosure)!==canonicalHash(track.policy.resultDisclosure))hidden()
 const [unit]=await db.$queryRaw<Array<{id:string;code:string;version:string;compositeId:string}>>(Prisma.sql`
  SELECT item.id,s.code,s.instrument_version AS version,r.composite_id AS "compositeId"
  FROM registered_assessment_resources r JOIN scales s ON s.id=r.scale_id AND s.definition_hash=r.definition_hash
  JOIN composite_assessment_items item ON item.composite_assessment_id=r.composite_id AND item.scale_id=s.id AND item.type='SCALE'
  WHERE r.resource_key=${track.key} AND r.resource_version=${track.version} AND r.status IN ('PUBLISHED','RETIRED')`)
 if(!unit||leaf.instrumentKey!==unit.code||leaf.instrumentVersion!==unit.version||leaf.slotKey!==compositeItemSlotKey(unit.id,'SCALE'))hidden()
 const [header]=await db.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT snap.id FROM assessment_run_executions e
  JOIN composite_assessment_attempts p ON p.id=e.runtime_binding_ref AND p.composite_assessment_id=${unit.compositeId} AND p.status='COMPLETED'
  JOIN assessment_unit_snapshots snap ON snap.composite_attempt_id=p.id AND snap.attempt_epoch=p.attempt_epoch
   AND snap.slot_key=${leaf.slotKey} AND snap.unit_type='SCALE' AND snap.terminal_state='COMPLETED' AND snap.payload_kind='UNIT_RESULT'
   AND snap.compiled_runtime_hash=${leaf.compiledRuntimeHash}
  WHERE e.organization_id=${source.organizationId} AND e.run_id=${source.runId} AND e.track_id=${source.trackId} AND e.status='COMPLETED' LIMIT 1`)
 if(!header)hidden()
 return validateResultDisclosureContract(entry!.resultDisclosure)
}
