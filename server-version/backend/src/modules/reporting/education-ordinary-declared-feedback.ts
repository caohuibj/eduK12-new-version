import { readCompositeFinalUnitSnapshots } from '../assessment-runtime/composite-final.bridge'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {compositeItemSlotKey,loadFrozenActiveSlotSet} from '../assessment-runtime/slot-set'
import {loadStoredCanonicalUnitResults} from '../assessment-runtime/compact-assessment-storage'
import {trainingBoundContent,decodeTrainingReferenceBinding} from '../composite/training-reference-binding'
import {decodeTrainingFinalReceipt} from '../composite/training-content-final'
import {getContentReleaseBatch} from '../measurement-content/repository'
import {readSealedCompositionContent} from '../education-tools/private-tool.composition-content'
import {readFrozenCompositionIdentity,type FrozenCompositionIdentity} from '../assessment-run/educationCompositionExecution'
import type {RunResourcePolicy} from '../assessment-run/resourceAuthority'
import type {ResultDisclosureContractV1} from '../assessment-policy/result-disclosure'
import {projectEducationDeclaredUnitReports,type EducationAssessmentUnitReport} from './education-assessment-report.projector'
import {readNativeEducationScaleFeedback,type NativeEducationFeedbackSource,type PreloadedNativeEducationScaleData} from './education-native-scale-feedback'
import type {projectEducationScaleIndividualReport} from './education-scale-report.projector'
import {reportingFail} from './types'

export type OrdinaryStoredContent=Pick<Parameters<typeof decodeTrainingFinalReceipt>[0],
 'trainingContentBinding'|'trainingContentBindingHash'|'trainingReferenceBinding'|'trainingReferenceBindingHash'|
 'trainingContentInterpretationEncrypted'|'trainingContentInterpretationHash'|'aggregateInputHash'>
export type PreMaterializedEducationDeclaredUnit={
 blockId:string
 itemId:string
 versionId:string
 contentHash:string
 metricKeysHash:string
 report:EducationAssessmentUnitReport
}
export type PreMaterializedEducationNativeScaleUnit={
 blockId:string
 itemId:string
 scaleId:string
 versionId:string
 contentHash:string
 sourceDefinitionHash:string
 metricKeysHash:string
 report:ReturnType<typeof projectEducationScaleIndividualReport>
}
export type PreMaterializedEducationWholeFeedbackV2={
 schemaVersion:2
 kind:'EDUCATION_WHOLE_FEEDBACK_V2'
 attemptId:string
 attemptEpoch:number
 aggregateInputHash:string
 compositeId:string
 manifestHash:string
 policyHash:string
 interpretationHash:string|null
 releaseIds:string[]
 declared:PreMaterializedEducationDeclaredUnit[]
 nativeScales?:PreMaterializedEducationNativeScaleUnit[]
}
function hidden():never{return reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)}
/** Author/data ACL and current per-block ceilings have already been resolved.
 * Load allowed declarative facts once, consume saved FINAL interpretation, and
 * reuse the same pure participant projector as other education deliveries. */
export async function readOrdinaryDeclaredFeedback(tx:Prisma.TransactionClient,input:{identity:FrozenCompositionIdentity;
 parent:OrdinaryStoredContent&{id:string;attemptEpoch:number;contextSnapshotHash:string|null;publicationHash?:string|null};
 slots?:Awaited<ReturnType<typeof loadFrozenActiveSlotSet>>;blockIds:ReadonlySet<string>;
 onReleaseIds?:(releaseIds:string[])=>void}){
 const output=new Map<string,EducationAssessmentUnitReport>()
 if(!input.blockIds.size)return output
 const {identity}=input,parent={...input.parent,compositeAssessmentId:identity.compositeId}
 const isWholeV2=Boolean(input.parent.publicationHash)
 const binding=trainingBoundContent(parent),receipt=decodeTrainingFinalReceipt(parent),references=decodeTrainingReferenceBinding(parent)
 if(!binding||!receipt||!binding.educationComposition||binding.publicationHash!==identity.binding.manifestHash
  ||canonicalHash(binding.educationComposition.origin)!==canonicalHash(identity.origin))hidden()
 const sealed=await readSealedCompositionContent(tx,{compositeId:identity.compositeId,ownerId:identity.origin.ownerUserId,anchor:binding.educationComposition})
 const blocks=identity.manifest.filter(block=>input.blockIds.has(block.blockId))
 const bindingUnitsByItemId=new Map(binding.units.map(unit=>[unit.itemId,unit]))
 const expected=blocks.map(block=>{
  const unit=bindingUnitsByItemId.get(block.itemIds[0]),actual=unit&&sealed.units.get(unit.itemId)
  if(!unit?.source.educationStandard||!actual||canonicalHash(unit)!==canonicalHash(actual)||unit.source.educationStandard.releaseId!==block.versionId
   ||unit.source.educationStandard.combinationHash!==block.contentHash)hidden()
  return {block,unit,slotKey:compositeItemSlotKey(unit.itemId,'SCALE')}
 })
 const refUnitsByItemId=new Map((references?.units??[]).map(selected=>[selected.itemId,selected]))
 const releaseIds=[...new Set(expected.flatMap(({unit})=>[unit.measurement.releaseId,...(unit.report?[unit.report.releaseId]:[]),
  ...(refUnitsByItemId.get(unit.itemId)?.references.flatMap(ref=>ref.status==='SELECTED'?[ref.releaseId]:[])??[])]))]
 input.onReleaseIds?.(releaseIds)
 const slotKeys=expected.map(e=>e.slotKey)
 const v2UnitRead = isWholeV2
  ? await readCompositeFinalUnitSnapshots(
      tx,
      [{ attemptId: parent.id, attemptEpoch: parent.attemptEpoch }],
      { slotKeys },
    )
  : { loadedFactsByKey: new Map(), byAttemptKey: new Map(), snapshots: [] }
 const hasV2Final = v2UnitRead.loadedFactsByKey.has(`${parent.id}:${parent.attemptEpoch}`)
 const releases = await getContentReleaseBatch(tx, releaseIds)
 const facts = new Map<string, Awaited<ReturnType<typeof loadStoredCanonicalUnitResults>>[number]>()
 if (hasV2Final) {
  if (v2UnitRead.snapshots.length !== expected.length) hidden()
  const expectedBySlotKey = new Map(expected.map(entry => [entry.slotKey, entry]))
  for (const snap of v2UnitRead.snapshots) {
   const unit = expectedBySlotKey.get(snap.slotKey)?.unit
   if (!unit || !snap.canonicalEnvelope || snap.canonicalEnvelope.core.contextHash !== (parent.contextSnapshotHash ?? null)) hidden()
   facts.set(unit.itemId, snap.canonicalEnvelope)
  }
 } else {
  if (!input.slots) hidden()
  const rows = await tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,slotKey:{in:slotKeys}}})
  if(rows.length!==expected.length||new Set(rows.map(row=>row.slotKey)).size!==rows.length)hidden()
  const slotsByKey=new Map(input.slots.slots.map(slot=>[slot.slotKey,slot]))
  for(const row of rows){
   const slot=slotsByKey.get(row.slotKey)
   if(!slot||row.terminalState!=='COMPLETED'||row.payloadKind!=='UNIT_RESULT'||!row.canonicalResultEncrypted||row.unitType!==slot.unitType
    ||row.sourceDefinitionHash!==slot.sourceDefinitionIdentity.hash)hidden()
  }
  const envelopes=await loadStoredCanonicalUnitResults(rows.map(row=>row.canonicalResultEncrypted!),tx)
  const expectedBySlotKey=new Map(expected.map(entry=>[entry.slotKey,entry]))
  for(const [index,row] of rows.entries()){
   const envelope=envelopes[index],unit=expectedBySlotKey.get(row.slotKey)!.unit
   if(!envelope||envelope.core.unitType!==row.unitType||envelope.core.sourceDefinitionHash!==row.sourceDefinitionHash
    ||envelope.core.compiledRuntimeHash!==row.compiledRuntimeHash||envelope.core.contextHash!==parent.contextSnapshotHash
    ||envelope.persistenceProvenance.sourceType!==row.sourceType||envelope.persistenceProvenance.sourceAttemptId!==row.sourceAttemptId
    ||(envelope.persistenceProvenance.sourceSubmissionId??null)!==(row.sourceSubmissionId??null))hidden()
   facts.set(unit.itemId,envelope)
  }
 }
 if (!receipt) hidden()
 const ceilingsByBlockId=new Map(identity.binding.unitReports.map(ceiling=>[ceiling.blockId,ceiling]))
 for(const {block,unit} of expected){
  const ceiling=ceilingsByBlockId.get(block.blockId)!
  const reports=projectEducationDeclaredUnitReports({product:identity.origin.entry,binding,receipt,references,releases,facts,
   metricKeys:new Set(ceiling.respondent.metricKeys),disclosureByItem:new Map([[unit.itemId,unit.source.educationStandard!.respondentDisclosure]]),units:[{itemId:unit.itemId,family:unit.family,measurement:unit.measurement,report:unit.report??null,
    references:(unit.referencePolicy?.choices??[]).map(choice=>({releaseId:choice.releaseId,contentHash:choice.contentHash}))}]})
  output.set(unit.itemId,reports[0])
 }
 return output
}

/** Pre-materialize immutable respondent scale feedback (both STANDARD_SCALE declared
 * reports and PRIVATE_VERSION / LIBRARY_SCALE native projections) in the report worker
 * so GET /feedback avoids re-decrypting 9 scale snapshots, admissions, and facts on
 * the API event loop. Live authority, revocation, receiptOnly and release-status
 * checks still execute on every GET /feedback read. */
export async function materializeEducationWholeFeedbackForWorker(
 db:Prisma.TransactionClient,
 input:{attemptId:string;attemptEpoch:number;aggregateInputHash:string;preloaded?:PreloadedNativeEducationScaleData},
):Promise<PreMaterializedEducationWholeFeedbackV2|null>{
 const [row]=await db.$queryRaw<Array<{
  organizationId:string;key:string;version:string;policy:RunResourcePolicy;policyHash:string;
  userId:string|null;subjectUserId:string|null;respondentUserId:string|null;
  contextSnapshotHash:string|null;frozenSlots:string|null;frozenSlotsHash:string|null;
  contentState:OrdinaryStoredContent|null;
 }>>(Prisma.sql`
  SELECT e.organization_id AS "organizationId",t.resource_key AS key,t.resource_version AS version,
   t.frozen_resource_policy AS policy,t.resource_policy_hash AS "policyHash",
   p.user_id AS "userId",p.subject_user_id AS "subjectUserId",p.respondent_user_id AS "respondentUserId",
   p.context_snapshot_hash AS "contextSnapshotHash",
   p.frozen_active_slot_set_encrypted AS "frozenSlots",
   p.frozen_active_slot_set_hash AS "frozenSlotsHash",
   jsonb_build_object(
    'trainingContentBinding',p.training_content_binding,
    'trainingContentBindingHash',p.training_content_binding_hash,
    'trainingReferenceBinding',p.training_reference_binding,
    'trainingReferenceBindingHash',p.training_reference_binding_hash,
    'trainingContentInterpretationEncrypted',p.training_content_interpretation_encrypted,
    'trainingContentInterpretationHash',p.training_content_interpretation_hash,
    'aggregateInputHash',p.aggregate_input_hash
   ) AS "contentState"
  FROM composite_assessment_attempts p
  JOIN assessment_run_executions e ON e.runtime_binding_kind='COMPOSITE' AND e.runtime_binding_ref=p.id
   AND e.subject_actor_snapshot_id=e.respondent_actor_snapshot_id
  JOIN assessment_run_tracks t ON t.id=e.track_id AND t.run_id=e.run_id AND t.organization_id=e.organization_id
   AND t.resource_family='BUNDLE' AND t.resource_key LIKE 'education-composition:%'
  WHERE p.id=${input.attemptId} AND p.attempt_epoch=${input.attemptEpoch}
   AND p.status='COMPLETED' AND NOT COALESCE(p.receipt_only,FALSE)
   AND p.aggregate_input_hash=${input.aggregateInputHash}
  LIMIT 1
 `)
 if(!row||!row.frozenSlots||!row.frozenSlotsHash)return null
 const identity=await readFrozenCompositionIdentity(db,row)
 const declaredBlocks=new Set<string>()
 const nativeSources:Array<{block:FrozenCompositionIdentity['manifest'][number];source:NativeEducationFeedbackSource;metricKeysHash:string}>=[]
 const ceilingsByBlockId=new Map(identity.binding.unitReports.map(unit=>[unit.blockId,unit]))
 const none={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
 for(const block of identity.manifest){
  if(block.kind!=='SCALE'||block.itemIds.length!==1)continue
  const ceiling=ceilingsByBlockId.get(block.blockId)
  if(!ceiling||ceiling.versionId!==block.versionId||ceiling.contentHash!==block.contentHash)return null
  if(ceiling.respondent.mode!=='INDIVIDUAL_SUMMARY')continue
  if(block.sourceProvider==='STANDARD_SCALE'){
   declaredBlocks.add(block.blockId)
   continue
  }
  if(!row.userId||row.userId!==row.subjectUserId||row.userId!==row.respondentUserId)return null
  const unit=identity.units.find(candidate=>candidate.itemId===block.itemIds[0]&&candidate.versionId===block.versionId)
  if(!unit||unit.family!=='SCALE'||!unit.scaleId)return null
  const contract:ResultDisclosureContractV1={schemaVersion:1,policyKey:'EDUCATION_PRIVATE_TOOL_V1',minimumRespondents:null,
   audiences:{RESPONDENT:ceiling.respondent,SUBJECT:none,TEACHER:none,PARENT:none,PROFESSIONAL:none,ORGANIZATION:none,RESEARCH:none}}
  nativeSources.push({
   block,
   metricKeysHash:canonicalHash(ceiling.respondent.metricKeys),
   source:{
    itemId:unit.itemId,scaleId:unit.scaleId,title:block.title,sourceDefinitionHash:unit.definitionHash,resultDisclosure:contract,
    ...(block.sourceProvider==='LIBRARY_SCALE'
     ? {approvedLibrary:{approvedSnapshotHash:block.contentHash}}
     : {privateVersion:{versionId:block.versionId,contentHash:block.contentHash}}),
   },
  })
 }
 if(!declaredBlocks.size&&!nativeSources.length)return null
 if(declaredBlocks.size&&!row.contentState?.trainingContentInterpretationHash)return null
 const slots=await loadFrozenActiveSlotSet(row.frozenSlots,db)
 if(!slots||slots.snapshotHash!==row.frozenSlotsHash||slots.attemptEpoch!==input.attemptEpoch)return null
 let releaseIds:string[]=[]
 const [renderedDeclared,renderedNative]=await Promise.all([
  declaredBlocks.size
   ? readOrdinaryDeclaredFeedback(db,{
      identity,
      parent:{...row.contentState!,id:input.attemptId,attemptEpoch:input.attemptEpoch,contextSnapshotHash:row.contextSnapshotHash},
      slots,
      blockIds:declaredBlocks,
      onReleaseIds:ids=>{releaseIds=ids},
     })
   : Promise.resolve(new Map<string,EducationAssessmentUnitReport>()),
  nativeSources.length
   ? readNativeEducationScaleFeedback(db,{
      actorUserId:row.userId!,
      parent:{
       id:input.attemptId,status:'COMPLETED',userId:row.userId!,subjectUserId:row.subjectUserId!,respondentUserId:row.respondentUserId!,
       attemptEpoch:input.attemptEpoch,contextSnapshotHash:row.contextSnapshotHash,
       frozenActiveSlotSetEncrypted:row.frozenSlots,frozenActiveSlotSetHash:row.frozenSlotsHash,
      },
      sources:nativeSources.map(entry=>entry.source),
      slotSet:slots,
      preloaded:input.preloaded,
     })
   : Promise.resolve(new Map<string,ReturnType<typeof projectEducationScaleIndividualReport>>()),
 ])
 const declared:PreMaterializedEducationDeclaredUnit[]=[]
 for(const block of identity.manifest){
  if(!declaredBlocks.has(block.blockId))continue
  const itemId=block.itemIds[0]
  const report=renderedDeclared.get(itemId)
  const ceiling=ceilingsByBlockId.get(block.blockId)
  if(!report||!ceiling)return null
  declared.push({
   blockId:block.blockId,
   itemId,
   versionId:block.versionId,
   contentHash:block.contentHash,
   metricKeysHash:canonicalHash(ceiling.respondent.metricKeys),
   report,
  })
 }
 const nativeScales:PreMaterializedEducationNativeScaleUnit[]=[]
 for(const entry of nativeSources){
  const report=renderedNative.get(entry.source.itemId)
  if(!report)return null
  nativeScales.push({
   blockId:entry.block.blockId,
   itemId:entry.source.itemId,
   scaleId:entry.source.scaleId,
   versionId:entry.block.versionId,
   contentHash:entry.block.contentHash,
   sourceDefinitionHash:entry.source.sourceDefinitionHash,
   metricKeysHash:entry.metricKeysHash,
   report,
  })
 }
 return {
  schemaVersion:2,
  kind:'EDUCATION_WHOLE_FEEDBACK_V2',
  attemptId:input.attemptId,
  attemptEpoch:input.attemptEpoch,
  aggregateInputHash:input.aggregateInputHash,
  compositeId:identity.compositeId,
  manifestHash:identity.binding.manifestHash,
  policyHash:row.policyHash,
  interpretationHash:row.contentState?.trainingContentInterpretationHash??null,
  releaseIds,
  declared,
  ...(nativeScales.length?{nativeScales}:{}),
 }
}

function parsePreMaterializedEnvelope(input:{
 preMaterializedReport:string|null|undefined
 identity:FrozenCompositionIdentity
 own:{parentId:string;attemptEpoch:number;policyHash:string;contentState:OrdinaryStoredContent|null}
 requireInterpretationHash:boolean
}):PreMaterializedEducationWholeFeedbackV2|null{
 if(!input.preMaterializedReport)return null
 const contentState=input.own.contentState
 if(!contentState?.aggregateInputHash)return null
 if(input.requireInterpretationHash&&!contentState.trainingContentInterpretationHash)return null
 let payload:PreMaterializedEducationWholeFeedbackV2
 try{
  payload=decryptUnifiedRuntimePayload<PreMaterializedEducationWholeFeedbackV2>(input.preMaterializedReport)
 }catch{
  return null
 }
 if(!payload||payload.schemaVersion!==2||payload.kind!=='EDUCATION_WHOLE_FEEDBACK_V2'
  ||payload.attemptId!==input.own.parentId
  ||payload.attemptEpoch!==input.own.attemptEpoch
  ||payload.aggregateInputHash!==contentState.aggregateInputHash
  ||payload.compositeId!==input.identity.compositeId
  ||payload.manifestHash!==input.identity.binding.manifestHash
  ||payload.policyHash!==input.own.policyHash
  ||!Array.isArray(payload.declared)||!Array.isArray(payload.releaseIds))return null
 const currentInterp=contentState.trainingContentInterpretationHash??null
 if((input.requireInterpretationHash||payload.interpretationHash!==null)&&payload.interpretationHash!==currentInterp)return null
 return payload
}

/** Verify pre-materialized declared feedback against live readOwn authority,
 * frozen composition identity, current disclosure ceilings, and live release
 * revocation status. Any mismatch returns null to trigger live re-projection. */
export async function tryReadPreMaterializedDeclaredFeedback(
 db:Prisma.TransactionClient,
 input:{
  preMaterializedReport:string|null|undefined
  identity:FrozenCompositionIdentity
  own:{parentId:string;attemptEpoch:number;policyHash:string;contentState:OrdinaryStoredContent|null}
  declaredBlocks:ReadonlySet<string>
 },
):Promise<Map<string,EducationAssessmentUnitReport>|null>{
 if(!input.declaredBlocks.size)return null
 const payload=parsePreMaterializedEnvelope({...input,requireInterpretationHash:true})
 if(!payload)return null
 const byBlockId=new Map(payload.declared.map(unit=>[unit.blockId,unit]))
 const ceilingsByBlockId=new Map(input.identity.binding.unitReports.map(unit=>[unit.blockId,unit]))
 const output=new Map<string,EducationAssessmentUnitReport>()
 for(const block of input.identity.manifest){
  if(!input.declaredBlocks.has(block.blockId))continue
  const cached=byBlockId.get(block.blockId)
  const ceiling=ceilingsByBlockId.get(block.blockId)
  if(!cached||!ceiling||block.itemIds.length!==1||cached.itemId!==block.itemIds[0]
   ||cached.versionId!==block.versionId||cached.contentHash!==block.contentHash
   ||cached.metricKeysHash!==canonicalHash(ceiling.respondent.metricKeys))return null
  output.set(cached.itemId,cached.report)
 }
 if(output.size!==input.declaredBlocks.size)return null
 if(payload.releaseIds.length){
  // Live status check via cached header-only batch read: if any underlying
  // measurement/report/reference release was revoked after materialization,
  // fall back to live re-projection so revocation takes effect immediately.
  const liveReleases=await getContentReleaseBatch(db,payload.releaseIds)
  if(liveReleases.size!==new Set(payload.releaseIds).size)return null
  for(const release of liveReleases.values()){
   if(release.status==='REVOKED')return null
  }
 }
 return output
}

/** Verify pre-materialized native (PRIVATE_VERSION / LIBRARY_SCALE) education scale
 * feedback against live readOwn authority, frozen composition identity, source definition
 * hashes, and current disclosure ceilings. Any mismatch returns null for live fallback. */
export function tryReadPreMaterializedNativeScaleFeedback(input:{
 preMaterializedReport:string|null|undefined
 identity:FrozenCompositionIdentity
 own:{parentId:string;attemptEpoch:number;policyHash:string;contentState:OrdinaryStoredContent|null}
 sources:readonly NativeEducationFeedbackSource[]
}):Map<string,ReturnType<typeof projectEducationScaleIndividualReport>>|null{
 if(!input.sources.length)return null
 const payload=parsePreMaterializedEnvelope({...input,requireInterpretationHash:false})
 if(!payload||!Array.isArray(payload.nativeScales)||!payload.nativeScales.length)return null
 const byItemId=new Map(payload.nativeScales.map(unit=>[unit.itemId,unit]))
 const ceilingsByBlockId=new Map(input.identity.binding.unitReports.map(unit=>[unit.blockId,unit]))
 const blockByItemId=new Map<string,FrozenCompositionIdentity['manifest'][number]>()
 for(const block of input.identity.manifest){
  if(block.kind==='SCALE'&&block.itemIds.length===1)blockByItemId.set(block.itemIds[0],block)
 }
 const output=new Map<string,ReturnType<typeof projectEducationScaleIndividualReport>>()
 for(const source of input.sources){
  const cached=byItemId.get(source.itemId)
  const block=blockByItemId.get(source.itemId)
  const ceiling=block?ceilingsByBlockId.get(block.blockId):undefined
  if(!cached||!block||!ceiling||cached.blockId!==block.blockId||cached.scaleId!==source.scaleId
   ||cached.versionId!==block.versionId||cached.contentHash!==block.contentHash
   ||cached.sourceDefinitionHash!==source.sourceDefinitionHash
   ||cached.metricKeysHash!==canonicalHash(ceiling.respondent.metricKeys))return null
  output.set(source.itemId,cached.report)
 }
 return output.size===input.sources.length?output:null
}
