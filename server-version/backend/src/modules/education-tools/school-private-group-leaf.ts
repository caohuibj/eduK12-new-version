import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compileScaleRuntime} from '../assessment-runtime/compiler'
import {scaleDefinitionSchema} from '../scale/scale-definition'
import {getContentReleaseBatch} from '../measurement-content/repository'
import type {CanonicalUnitResultCoreV1} from '../assessment-runtime/unit-result'
import {trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {projectRelationalRunPolicy,type RunResourcePolicy} from '../assessment-run/resourceAuthority'
import {resolveSelfGroupLeafIdentity,type SelfGroupParentIdentity,type SelfGroupLeafIdentity} from '../assessment-policy/self-group-contract'
import {validateResultDisclosureContract,type ResultDisclosureContractV1} from '../assessment-policy/result-disclosure'
import {reportingFail,type ReportingLeafSourceV2} from '../reporting/types'
import {resolveSchoolPrivateGroupHistory} from './school-private-group-history'
import {educationCompositionPolicyBindingSchema} from './private-tool.composition-contracts'

export type SchoolGroupTrackScope={organizationId:string;runId:string;trackId:string}
export type SchoolPrivateGroupDisclosureSource={
 parent:SelfGroupParentIdentity
 leaves:Array<{slotKey:string;instrumentKey:string;instrumentVersion:string;sourceDefinitionHash:string;contract:ResultDisclosureContractV1;
  metricUnits:Record<string,{measurement:string;runtime:string}>}>
}
const hidden=():never=>reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)

/** Private request-local source metadata only, not actor authorization/cache.
 * Resolve once for the selected Track, then bind all its selected canonical
 * samples without per-person/per-metric queries or additional FINAL decrypts. */
export async function loadSchoolPrivateGroupDisclosure(tx:Prisma.TransactionClient,scope:SchoolGroupTrackScope):Promise<SchoolPrivateGroupDisclosureSource|null>{
 const [row]=await tx.$queryRaw<Array<{family:string;key:string;version:string;policy:RunResourcePolicy;hash:string}>>(Prisma.sql`
  SELECT t.resource_family AS family,t.resource_key AS key,t.resource_version AS version,t.frozen_resource_policy AS policy,t.resource_policy_hash AS hash
  FROM assessment_run_tracks t JOIN assessment_runs r ON r.id=t.run_id AND r.organization_id=t.organization_id
  JOIN organizations org ON org.id=t.organization_id AND org.product_domain='SCHOOL'
  JOIN campus_activity_runs school ON school.run_id=r.id AND school.organization_id=t.organization_id
  WHERE t.organization_id=${scope.organizationId} AND t.run_id=${scope.runId} AND t.id=${scope.trackId}
   AND r.status IN ('PUBLISHED','CLOSED') AND NOT EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links teacher
    WHERE teacher.run_id=r.id AND teacher.organization_id=t.organization_id)`)
 if(!row||!row.key.startsWith('private-scale:SCHOOL:')&&!row.key.startsWith('education-composition:SCHOOL:'))return null
 if(row.policy?.resultDisclosure?.policyKey!=='EDUCATION_SELF_GROUP_V2')return null
 if(canonicalHash(row.policy)!==row.hash)return hidden()
 const entry=await resolveSchoolPrivateGroupHistory(tx,{resourceKind:row.family,resourceKey:row.key,resourceVersion:row.version})
 if(!entry||entry.releaseStatus!=='PUBLISHED'||!entry.launchTarget)return hidden()
 const composition='educationComposition' in entry?educationCompositionPolicyBindingSchema.parse(entry.educationComposition):null
 const expected={...projectRelationalRunPolicy(entry),...(composition?{educationComposition:composition}:{})}
 if(canonicalHash(expected)!==row.hash)return hidden()
 const runtime=await tx.compositeAssessment.findUnique({where:{id:entry.launchTarget.compositeAssessmentId},select:{
  id:true,trainingContentSnapshot:true,trainingContentSnapshotHash:true,
  items:{select:{id:true,scale:{select:{id:true,code:true,instrumentVersion:true,definitionHash:true,definition:true}}}},
 }})
 if(!runtime||canonicalHash(runtime.trainingContentSnapshot)!==runtime.trainingContentSnapshotHash)return hidden()
 const snapshot=trainingContentSnapshotSchema.parse(runtime.trainingContentSnapshot)
 if(snapshot.compositeId!==runtime.id)return hidden()
 const releases=await getContentReleaseBatch(tx,snapshot.units.filter(unit=>unit.family==='SCALE').map(unit=>unit.measurement.releaseId))
 const leaves:SchoolPrivateGroupDisclosureSource['leaves']=[]
 for(const unit of snapshot.units){
  if(unit.family!=='SCALE')continue
  const item=runtime.items.find(item=>item.id===unit.itemId),scale=item?.scale
  if(!scale||scale.id!==unit.source.id||!scale.code||!scale.instrumentVersion||!scale.definitionHash)return hidden()
  let contract=entry.resultDisclosure!
  if(composition){
   const block=snapshot.educationBinding?.manifest.find(block=>block.itemIds.includes(unit.itemId))
   const rule=composition.unitReports.find(rule=>rule.blockId===block?.blockId)
   if(!block||block.kind!=='SCALE'||block.itemIds.length!==1||!rule||rule.versionId!==block.versionId||rule.contentHash!==block.contentHash)return hidden()
   if(!rule.groupDisclosure)continue
   contract=rule.groupDisclosure
  }
  contract=validateResultDisclosureContract(contract)
  // The full frozen parent contract remains an independent ceiling, even if
  // different blocks happen to emit the same score key.
  for(const audience of ['PROFESSIONAL','TEACHER','ORGANIZATION'] as const){
   const parentRule=entry.resultDisclosure!.audiences[audience],leafRule=contract.audiences[audience]
   if(leafRule.mode.includes('AGGREGATE')&&(!parentRule.mode.includes('AGGREGATE')
    ||leafRule.metricKeys.some(key=>!parentRule.metricKeys.includes(key))))return hidden()
  }
  const definition=scaleDefinitionSchema.parse(scale.definition),sourceDefinitionHash=canonicalHash(definition)
  const compiled=compileScaleRuntime({instrumentKey:scale.code,instrumentVersion:scale.instrumentVersion,definition,sourceDefinitionHash})
  const release=releases.get(unit.measurement.releaseId)
  if(!release||release.layer!=='MEASUREMENT'||release.family!=='SCALE'||release.status==='REVOKED'
   ||release.contentHash!==unit.measurement.contentHash)return hidden()
  const metricUnits:Record<string,{measurement:string;runtime:string}>={}
  for(const metric of release.content.metrics){
   const runtimeUnit=compiled.metricDefinitions[metric.metricKey]?.unit
   // Existing Scale C calls raw points "points" while its compiler/FINAL uses
   // the generic label "score". This exact label projection changes no number
   // and does not permit another physical unit or a cognitive protocol alias.
   if(metric.unit!=='points'||runtimeUnit!=='score')return hidden()
   metricUnits[metric.metricKey]={measurement:metric.unit,runtime:runtimeUnit}
  }
  leaves.push({slotKey:'scale:'+unit.itemId,instrumentKey:scale.code,instrumentVersion:scale.instrumentVersion,
   sourceDefinitionHash,contract,metricUnits})
 }
 return {parent:{resourceKind:entry.applicability.resourceKind,resourceKey:row.key,resourceVersion:row.version,entryHash:canonicalHash(entry)},leaves}
}

/** Metadata-only reads revalidate a previously stored artifact's exact slot
 * and source. Generation/discovery must ALSO pass its actual canonical core.
 * No simulated core is used to turn a metadata read into a FINAL proof. */
export function schoolPrivateGroupLeafDisclosure(source:SchoolPrivateGroupDisclosureSource,leaf:ReportingLeafSourceV2,core?:CanonicalUnitResultCoreV1){
 const selected=source.leaves.find(candidate=>candidate.slotKey===leaf.slotKey)
 if(!selected||selected.instrumentKey!==leaf.instrumentKey||selected.instrumentVersion!==leaf.instrumentVersion||leaf.unitType!=='SCALE')return hidden()
 let identity:SelfGroupLeafIdentity|null=null
 if(core){try{identity=resolveSelfGroupLeafIdentity({parent:source.parent,leaf,core})}catch{return hidden()}}
 if(core&&core.sourceDefinitionHash!==selected.sourceDefinitionHash)return hidden()
 if(core&&core.metrics.some(metric=>!selected.metricUnits[metric.key]||metric.unit!==selected.metricUnits[metric.key].runtime))return hidden()
 return {contract:selected.contract,identity,metricUnits:selected.metricUnits}
}
