import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compositeItemSlotKey} from '../assessment-runtime/slot-set'
import {relationalEntryToRunPolicy} from '../assessment-run/resourceAuthority'
import {isSelfGroupV2Entry} from '../assessment-policy/self-group-contract'
import {validateResultDisclosureContract} from '../assessment-policy/result-disclosure'
import {readEducationAssessmentDeliveryIdentity} from '../education-tools/assessment-resource.repository'
import {reportingFail,type ReportingLeafSourceV2} from '../reporting/types'

type Source={organizationId:string;runId:string;trackId:string}
type Track={key:string;version:string;family:string;policy:unknown;hash:string}
const hidden=():never=>reportingFail('REPORT_NOT_FOUND','Teacher group leaf unavailable',404)
export function teacherNativeGroupTrack(track:Pick<Track,'key'|'version'|'family'>){
 return ['COGNITIVE','SITUATIONAL','BUNDLE'].includes(track.family)&&track.version==='2.0.0'&&track.key.startsWith('education-assessment:TEACHER:')
}

/** Identity-only content adapter after actual Teacher event/Run authorization.
 * The existing delivery reader verifies the published parent, exact immutable
 * C pointers and frozen slot map. No raw trials or canonical values are read. */
export async function teacherNativeLeafContract(source:Source,track:Track,leaf:ReportingLeafSourceV2,db:Prisma.TransactionClient|typeof prisma=prisma){
 if(!teacherNativeGroupTrack(track))return null
 if(canonicalHash(track.policy)!==track.hash)hidden()
 const identity=await readEducationAssessmentDeliveryIdentity(db,{resourceKey:track.key,version:track.version,purpose:'HISTORY'})
 if(identity.origin.product!=='TEACHER'||identity.origin.organizationId!==source.organizationId
  ||identity.origin.family!==track.family||!isSelfGroupV2Entry(identity.entry)
  ||canonicalHash(relationalEntryToRunPolicy(identity.entry))!==track.hash)hidden()
 const unit=identity.origin.units.find(unit=>compositeItemSlotKey(unit.itemId,unit.family==='SJT'?'SITUATIONAL':unit.family)===leaf.slotKey)
 if(!unit||(unit.family==='SJT'?'SITUATIONAL':unit.family)!==leaf.unitType)hidden()
 const item=identity.runtime.items.find(item=>item.id===unit!.itemId)!
 const measurement=identity.releases.get(unit!.measurement.releaseId)!
 if(measurement.layer!=='MEASUREMENT')return hidden()
 const key=unit!.family==='COGNITIVE'?measurement.content.runnerKey:unit!.family==='SJT'?item.situationalInstrumentKey:item.scale?.code
 const version=unit!.family==='COGNITIVE'?measurement.content.runnerVersion:unit!.family==='SJT'?item.situationalInstrumentVersion:item.scale?.instrumentVersion
 if(leaf.instrumentKey!==key||leaf.instrumentVersion!==version)hidden()
 const [header]=await db.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT snap.id FROM assessment_run_executions e
  JOIN composite_assessment_attempts p ON p.id=e.runtime_binding_ref AND e.runtime_binding_kind='COMPOSITE'
   AND p.composite_assessment_id=${identity.origin.runtimeCompositeId} AND p.status='COMPLETED'
  JOIN assessment_unit_snapshots snap ON snap.composite_attempt_id=p.id AND snap.attempt_epoch=p.attempt_epoch
   AND snap.slot_key=${leaf.slotKey} AND snap.unit_type=${leaf.unitType}::"AssessmentUnitType" AND snap.terminal_state='COMPLETED'
   AND snap.payload_kind='UNIT_RESULT' AND snap.compiled_runtime_hash=${leaf.compiledRuntimeHash}
  WHERE e.organization_id=${source.organizationId} AND e.run_id=${source.runId} AND e.track_id=${source.trackId} AND e.status='COMPLETED' LIMIT 1`)
 if(!header)hidden()
 return validateResultDisclosureContract(unit!.groupDisclosure)
}
