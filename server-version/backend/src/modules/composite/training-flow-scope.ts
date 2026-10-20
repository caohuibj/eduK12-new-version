import { assertTrainingMaterialAssignment } from './training-material-allocation'
import { createHash } from 'node:crypto'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { loadFrozenActiveSlotSet, formSectionSlotKey, compositeItemSlotKey } from '../assessment-runtime/slot-set'
import { readFormSectionCollectionFacts } from '../assessment-runtime/form-facts'
import { assertTypedCompositeFormFacts } from '../assessment-runtime/typed-form-facts'
import { mapCompositeSection } from '../assessment-runtime/form-section-definition'
import { loadStoredCanonicalUnitResults } from '../assessment-runtime/compact-assessment-storage'
import { onlineSituationalCanonicalTaskSatisfaction } from '../situational/situational-task-satisfaction'
import { buildTrainingFlowUnits } from './training-flow-definition'
import { scanTrainingFlow, trainingFlowUnitKey, trainingFlowItemKey, TRAINING_FLOW_POLICY } from '../assessment-core/flow/training'
import { compositeForbidden } from './composite.errors'

export const TRAINING_FLOW_DEFINITION_SELECT = { trainingFlowDraft:true, trainingFlowFrozen:true, trainingFlowDigest:true } as const
/** Public discovery never falls back to the candidate union on a partial projection. */
export const hasTrainingFlowDefinitionMarkers=(definition:any):boolean=>Object.keys(TRAINING_FLOW_DEFINITION_SELECT).some(key=>definition?.[key]!==null)
export const TRAINING_FLOW_PARENT_SELECT = { trainingFlowSnapshotEncrypted:true, trainingFlowSnapshotHash:true, trainingFlowPathEncrypted:true, trainingFlowPathHash:true } as const
export function trainingFlowMarkerState(parent:any, definition:any=parent?.compositeAssessment):'LEGACY'|'FLOW'|'UNKNOWN' {
  const values=[...Object.keys(TRAINING_FLOW_PARENT_SELECT).map(k=>parent?.[k]),...Object.keys(TRAINING_FLOW_DEFINITION_SELECT).map(k=>definition?.[k])]
  return values.some(v=>v===undefined)?'UNKNOWN':values.every(v=>v===null)?'LEGACY':'FLOW'
}
export type TrainingFlowScopeOptions={db?:any;snapshotRows?:any[];frozenSlots?:Awaited<ReturnType<typeof loadFrozenActiveSlotSet>>;allowAdvance?:boolean}
/** Only after parent ownership authorization. No global authorization cache. All
 * accepted facts are fetched in one batch and exact immutable source bindings
 * are checked before any compact canonical body is expanded. */
async function resolveTrainingFlowScopeAndCandidate(attempt:any, composite:any=attempt.compositeAssessment, options:TrainingFlowScopeOptions={}) {
  const mode=trainingFlowMarkerState(attempt,composite)
  if(mode==='LEGACY')return null
  if(mode==='UNKNOWN')throw compositeForbidden('流程来源标志未完整加载')
  const fail=():never=>{throw compositeForbidden('流程冻结配置或已接受事实不一致')}
  const db=options.db??prisma
  if(attempt.runtimeGeneration!=='UNIFIED_V1'||attempt.deliveryMode!=='FINAL_ONLY'||!composite.trainingFlowFrozen||!composite.trainingFlowDigest||!attempt.trainingFlowSnapshotEncrypted||!attempt.trainingFlowSnapshotHash)fail()
  if(composite.trainingVariantDraft!=null||composite.trainingVariantFrozen!=null||attempt.trainingVariantAllocationHash!=null)fail()
  const config=composite.trainingFlowFrozen
  if(config.flowDigest!==composite.trainingFlowDigest)fail()
  const units=buildTrainingFlowUnits(composite)
  const {flowDigest,...frozenDefinition}=config
  if(canonicalHash(frozenDefinition)!==flowDigest||canonicalHash(JSON.parse(JSON.stringify(units)))!==config.unionDigest||canonicalHash(config.policy)!==canonicalHash(TRAINING_FLOW_POLICY))fail()
  const frozenSlots=options.frozenSlots??await loadFrozenActiveSlotSet(attempt.frozenActiveSlotSetEncrypted,db)
  if(frozenSlots.snapshotHash!==attempt.frozenActiveSlotSetHash||frozenSlots.attemptEpoch!==attempt.attemptEpoch)fail()
  const snapshot=decryptUnifiedRuntimePayload<any>(attempt.trainingFlowSnapshotEncrypted)
  if(canonicalHash(snapshot)!==attempt.trainingFlowSnapshotHash||snapshot.compositeId!==composite.id||snapshot.publishedAt!==new Date(composite.publishedAt).toISOString()||snapshot.attemptId!==attempt.id||snapshot.attemptEpoch!==attempt.attemptEpoch||snapshot.flowDigest!==config.flowDigest||snapshot.slotSetHash!==frozenSlots.snapshotHash)fail()
  const materialAssignment=config.schemaVersion===2?assertTrainingMaterialAssignment(snapshot.materialAssignment,config,attempt,composite):null
  if(config.schemaVersion===2?snapshot.schemaVersion!==2:(config.schemaVersion!==1||snapshot.schemaVersion!==1||snapshot.materialAssignment!==undefined))fail()
  const unitSlots=new Map<string,string>()
  const itemKeys=new Map<string,string>(),sectionKeys=new Map<string,string>()
  for(const section of composite.formSections??[]){const key=trainingFlowUnitKey(section.id);unitSlots.set(key,formSectionSlotKey(section.id));sectionKeys.set(key,section.id)}
  for(const item of composite.items??[])if(item.type!=='FORM'){const key=trainingFlowItemKey(item.id);unitSlots.set(key,compositeItemSlotKey(item.id,item.type));itemKeys.set(key,item.id)}
  const slotsByKey=new Map(frozenSlots.slots.map(s=>[s.slotKey,s]))
  if(unitSlots.size!==frozenSlots.slots.length||[...unitSlots.values()].some(k=>!slotsByKey.has(k)))fail()
  const snapshots:any[]=options.snapshotRows??await db.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:attempt.id,attemptEpoch:attempt.attemptEpoch}})
  const bySlot=new Map<string,any>()
  for(const row of snapshots){
    const slot=slotsByKey.get(row.slotKey)
    if(!slot)throw compositeForbidden('未知候选槽位')
    if(bySlot.has(row.slotKey)||row.compositeAttemptId!==attempt.id||row.attemptEpoch!==attempt.attemptEpoch||row.terminalState!=='COMPLETED'||row.unitType!==slot.unitType||row.sourceDefinitionHash!==slot.sourceDefinitionIdentity.hash)fail()
    if(slot.unitType==='FORM_SECTION'?(row.payloadKind!=='COLLECTION_FACTS'||!row.collectionFactsEncrypted):(row.payloadKind!=='UNIT_RESULT'||!row.canonicalResultEncrypted||row.compiledRuntimeHash!==slot.sourceBinding.compiledRuntimeHash))fail()
    bySlot.set(row.slotKey,row)
  }
  const cipherHash=(value:unknown)=>typeof value==='string'?createHash('sha256').update(value).digest('hex'):null
  const snapshotHeadersDigest=canonicalHash(snapshots.map(row=>({id:row.id,slotKey:row.slotKey,attemptEpoch:row.attemptEpoch,sourceType:row.sourceType,sourceAttemptId:row.sourceAttemptId,sourceSubmissionId:row.sourceSubmissionId??null,sourceDefinitionHash:row.sourceDefinitionHash,compiledRuntimeHash:row.compiledRuntimeHash??null,terminalState:row.terminalState,payloadKind:row.payloadKind,canonicalCipherHash:cipherHash(row.canonicalResultEncrypted),collectionCipherHash:cipherHash(row.collectionFactsEncrypted)})).sort((a,b)=>a.slotKey.localeCompare(b.slotKey)))
  const stored=attempt.trainingFlowPathEncrypted?decryptUnifiedRuntimePayload<any>(attempt.trainingFlowPathEncrypted):null
  if((stored===null)!==(attempt.trainingFlowPathHash==null))fail()
  if(!stored&&(attempt.status==='COMPLETED'||snapshots.length>0)&&!options.allowAdvance)fail()
  if(stored&&(canonicalHash(stored)!==attempt.trainingFlowPathHash||stored.attemptId!==attempt.id||stored.attemptEpoch!==attempt.attemptEpoch||stored.compositeId!==composite.id||stored.configDigest!==config.flowDigest||stored.slotSetHash!==frozenSlots.snapshotHash||stored.contextSnapshotHash!==(attempt.contextSnapshotHash??null)||stored.publishedAt!==new Date(composite.publishedAt).toISOString()))fail()
  if(stored&&(materialAssignment?stored.schemaVersion!==2||stored.assignmentHash!==materialAssignment.assignmentHash:stored.schemaVersion!==1||stored.assignmentHash!==undefined))fail()
  const compute=async()=>{
  const native=snapshots.filter(r=>r.payloadKind==='UNIT_RESULT')
  // The parent-owned, current-epoch snapshot source ID is checked again against
  // each decoded canonical envelope; SCF2 is resolved through this same db.
  const envelopes=await loadStoredCanonicalUnitResults(native.map(r=>r.canonicalResultEncrypted),db)
  const nativeFacts=new Map(native.map((row,i)=>[row.slotKey,{row,envelope:envelopes[i]}]))
  const facts:Record<string,any>={}
  for(const [key,slotKey]of unitSlots){
    const row=bySlot.get(slotKey)
    if(!row){facts[key]={status:'PENDING'};continue}
    const sectionId=sectionKeys.get(key)
    if(sectionId){
      const section=mapCompositeSection(composite.formSections.find((s:any)=>s.id===sectionId))
      if(row.sourceType!=='COMPOSITE_FORM_SECTION')fail()
      const body=readFormSectionCollectionFacts(decryptUnifiedRuntimePayload(row.collectionFactsEncrypted))
      const qualification=assertTypedCompositeFormFacts(section,body)
      const answers:Record<string,unknown>={},unavailableItemKeys:string[]=[]
      for(const fact of body.items){const item=section.items.find(i=>i.id===fact.key);const stable=(item as any)?.formDefinition?.itemKey;if(stable){answers[stable]=('state'in fact&&fact.state!=='ANSWERED')?null:fact.value;if('state'in fact&&fact.state==='NOT_SHOWN')unavailableItemKeys.push(stable)}}
      const substantive=body.items.some(f=>('state'in f?f.state==='ANSWERED':true)&&f.value!==null&&f.value!==''&&(!Array.isArray(f.value)||f.value.length>0))
      facts[key]={status:'ACCEPTED',answers,unavailableItemKeys,acceptedHash:canonicalHash(body),requirementSatisfied:qualification!=='NOT_SATISFIED',hasValidMeasurement:substantive}
    }else{
      const entry=nativeFacts.get(slotKey)!,core=entry.envelope.core, provenance=entry.envelope.persistenceProvenance
      if(core.unitType!==row.unitType||core.sourceDefinitionHash!==row.sourceDefinitionHash||core.compiledRuntimeHash!==row.compiledRuntimeHash||provenance.sourceAttemptId!==row.sourceAttemptId||provenance.sourceType!==row.sourceType||(provenance.sourceSubmissionId??null)!==(row.sourceSubmissionId??null)||core.instrumentKey!==slotsByKey.get(slotKey)!.sourceDefinitionIdentity.key||core.instrumentVersion!==slotsByKey.get(slotKey)!.sourceDefinitionIdentity.version||core.contextHash!==(attempt.contextSnapshotHash??null))fail()
      const qualification=onlineSituationalCanonicalTaskSatisfaction(core)
      const valid=qualification!=='NOT_SATISFIED'&&core.quality.status!=='invalid'&&core.metrics.some(m=>m.value!==null&&m.quality!=='not_calculable')
      facts[key]={status:'ACCEPTED',acceptedHash:entry.envelope.resultHash,requirementSatisfied:valid,hasValidMeasurement:valid}
    }
  }
  return scanTrainingFlow(config,units,facts,materialAssignment??undefined)
  }
  let path:Awaited<ReturnType<typeof compute>>
  if(stored&&stored.snapshotHeadersDigest===snapshotHeadersDigest){
    path=stored.path
    const {pathDigest,...body}=path
    if(materialAssignment&&(path.schemaVersion!==2||path.assignmentHash!==materialAssignment.assignmentHash||path.flowDigest!==config.flowDigest||path.unionDigest!==config.unionDigest))fail()
    if(canonicalHash(body)!==pathDigest||!Array.isArray(path.reachedInstrumentKeys)||!Array.isArray(path.acceptedInstrumentKeys)||!Array.isArray(path.skipped))fail()
  }else{
    if(stored&&!options.allowAdvance)fail()
    path=await compute()
  }
  const reached=new Set(path.reachedInstrumentKeys)
  // Reject injected accepted facts in a skipped/future branch, even if they are
  // valid native facts in isolation. No path can grant its own predecessor.
  for(const [key,slot]of unitSlots)if(bySlot.has(slot)&&!reached.has(key))fail()
  const sectionIds=new Set<string>([...sectionKeys].filter(([key])=>reached.has(key)).map(([,id])=>id))
  const itemIds=new Set<string>([...itemKeys].filter(([key])=>reached.has(key)).map(([,id])=>id))
  for(const section of composite.formSections??[])if(sectionIds.has(section.id))for(const item of section.items??[])itemIds.add(item.id)
  const reachedSlotKeys=new Set([...reached].map(k=>unitSlots.get(k)!))
  const executedSlotKeys=new Set([...unitSlots].filter(([,slot])=>bySlot.has(slot)).map(([,slot])=>slot))
  const skippedSlotKeys=new Set(path.skipped.map((entry:any)=>unitSlots.get(entry.instrumentKey)!).filter(Boolean))
  const terminal=path.currentInstrumentKey==null&&path.taskSatisfaction!=='PENDING'
  const evidence={schemaVersion:config.schemaVersion,...(materialAssignment?{assignmentHash:materialAssignment.assignmentHash}:{}),compositeId:composite.id,publishedAt:new Date(composite.publishedAt).toISOString(),attemptId:attempt.id,attemptEpoch:attempt.attemptEpoch,configDigest:config.flowDigest,slotSetHash:frozenSlots.snapshotHash,contextSnapshotHash:attempt.contextSnapshotHash??null,snapshotHeadersDigest,path}
  const pathHash=canonicalHash(evidence)
  if(!options.allowAdvance&&attempt.trainingFlowPathHash!=null&&attempt.trainingFlowPathHash!==pathHash)fail()
  const scope={config,materialAssignment,path,pathHash,evidence,itemIds,sectionIds,reachedSlotKeys,executedSlotKeys,skippedSlotKeys,terminal,snapshots,frozenSlots,
    aggregatePathPolicy:{kind:'TRAINING_FLOW_V1' as const,terminal,reachedSlotKeys:[...reachedSlotKeys],executedSlotKeys:[...executedSlotKeys]}}
  return {scope,candidate:snapshot}
}

export async function resolveTrainingFlowScope(attempt:any, composite:any=attempt.compositeAssessment, options:TrainingFlowScopeOptions={}) {
  return (await resolveTrainingFlowScopeAndCandidate(attempt,composite,options))?.scope??null
}

/** Internal child materializer only: consume immediately under the same parent
 * lock. Candidate identity/hash/epoch/publication were checked above. No cache,
 * caller-supplied proof, or candidate field on the ordinary scope/DTO path. */
export const resolveTrainingFlowScopeForMaterialization=resolveTrainingFlowScopeAndCandidate

/** Safe report provenance; never exposes future candidate identities or conditions. */
export const trainingFlowProvenance=(flow:NonNullable<Awaited<ReturnType<typeof resolveTrainingFlowScope>>>)=>({schemaVersion:1,...(flow.materialAssignment?{materialAssignment:{assignmentHash:flow.materialAssignment.assignmentHash,configDigest:flow.materialAssignment.configDigest,groupKey:flow.materialAssignment.groupKey,materialDigest:flow.materialAssignment.materialDigest}}:{}),configDigest:flow.config.flowDigest,pathHash:flow.pathHash,termination:flow.path.termination,taskSatisfaction:flow.path.taskSatisfaction,executedUnitCount:flow.executedSlotKeys.size,skippedUnitCount:flow.skippedSlotKeys.size})
