import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compositeItemSlotKey} from '../assessment-runtime/slot-set'
import {loadStoredCanonicalUnitResults} from '../assessment-runtime/compact-assessment-storage'
import {decodeTrainingFinalReceipt} from '../composite/training-content-final'
import {trainingBoundContent} from '../composite/training-reference-binding'
import {loadTrainingMetricDisclosure,trainingCognitiveMetricKeys,type TrainingMetricDisclosure} from '../composite/training-metric-disclosure'
import {decryptCognitivePayload} from '../cognitive/cognitive.security'
import {readFrozenReport,type FrozenReportSnapshot} from '../cognitive/profile-freeze'
import {parseCognitiveResultSnapshot} from '../cognitive/v2/result-snapshot'
import type {CognitiveResultSnapshot} from '../cognitive/v2/types'
import {DISCLOSURE_PRESETS,intersectDisclosureCapabilities} from '../scale/policy/disclosure'
import type {DisclosureCapabilitiesV1} from '../scale/policy/types'
import type {DerivedPackage} from '../assessment-bundle/onboarding/contract'
import type {BundleReportAudienceV1,BundleReportFactsV1} from '../assessment-bundle/types'
import type {BundleBindings} from './instance'

export interface BundleCognitiveDisclosure {metricKeys:ReadonlySet<string>;capabilities:DisclosureCapabilitiesV1}
const denied=():BundleCognitiveDisclosure=>({metricKeys:new Set(),capabilities:DISCLOSURE_PRESETS.NONE()})

/** Reuse the saved participant/professional report's actual visible dictionary,
 * not every raw metric or the current registry. Training's identity proof is
 * necessary but its FULL_REPORT ceiling alone is not a Bundle disclosure grant. */
export function projectFrozenCognitiveDisclosure(input:{
 result:CognitiveResultSnapshot;report:FrozenReportSnapshot|null;selectors:readonly string[];verified:TrainingMetricDisclosure
}):BundleCognitiveDisclosure {
 const {result,report,verified}=input,view=result.report
 const method=view.method as Record<string,unknown>|undefined
 if(!report||!Array.isArray(view.headline)||!Array.isArray(view.user)||!Array.isArray(view.detail)||!Array.isArray(view.quality)
  ||!['interpretable','limited','invalid'].includes(String(view.qualityState))||!method
  ||method.testType!==result.testType||method.configVersion!==result.configVersion||method.engineVersion!==result.engineVersion
  ||method.scoringVersion!==result.scoringVersion||method.profile!==result.profile||method.protocolSignature!==result.protocolSignature
  ||report.profile!==result.profile)return denied()
 const ceiling=trainingCognitiveMetricKeys(report),selected=new Set(input.selectors),keys=new Set<string>()
 for(const item of [...view.headline,...view.user,...view.detail]){
  if(!item||typeof item!=='object'||typeof item.key!=='string'||!ceiling.has(item.key)||!selected.has(item.key)||!verified.metricKeys.has(item.key))continue
  const value=result.metrics[item.key]
  if(typeof value==='number'&&Number.isFinite(value)&&item.value===value)keys.add(item.key)
 }
 const reading=view.reading as {interpretation?:{state?:string}}|undefined
 const mask=DISCLOSURE_PRESETS.NONE()
 mask.numericScores=keys.size>0
 mask.individualInterpretations=keys.size>0&&result.quality.state==='interpretable'&&view.qualityState==='interpretable'
  &&typeof view.conclusion==='string'&&reading?.interpretation?.state!=='withheld'
 mask.resultQualityDetails=Array.isArray(view.quality)
 // Norms, score-derived labels, items, methods and educational material stay
 // closed. The existing schema3 projector separately authorizes Bundle text.
 return {metricKeys:keys,capabilities:intersectDisclosureCapabilities(verified.capabilities,mask)}
}

type Parent=Parameters<typeof decodeTrainingFinalReceipt>[0]&{status:string}
/** Internal reader only: callers retain ownership/feedback access checks. The
 * actual admission binding and accepted FINAL receipt supply the Training unit;
 * no synthetic Training context, raw trials, new grants or rescoring enter here. */
export async function loadBundleCognitiveDisclosures(db:Prisma.TransactionClient,input:{
 parent:Parent;bindings:BundleBindings;pack:DerivedPackage;facts:BundleReportFactsV1;audience:BundleReportAudienceV1
}):Promise<Map<string,BundleCognitiveDisclosure>> {
 const slots=input.bindings.slots.filter(s=>s.unitType==='COGNITIVE'),out=new Map(slots.map(s=>[s.slotKey,denied()]))
 if(!slots.length||input.parent.status!=='COMPLETED'||input.audience==='parent')return out
 let bound:ReturnType<typeof trainingBoundContent>,receipt:ReturnType<typeof decodeTrainingFinalReceipt>
 try{bound=trainingBoundContent(input.parent);receipt=decodeTrainingFinalReceipt(input.parent)}catch{return out}
 if(!bound||!receipt)return out
 const rows=await db.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:input.parent.id,attemptEpoch:input.parent.attemptEpoch,
  slotKey:{in:slots.map(s=>compositeItemSlotKey(s.itemId,'COGNITIVE'))}},select:{compositeAttemptId:true,attemptEpoch:true,slotKey:true,
  unitType:true,terminalState:true,payloadKind:true,canonicalResultEncrypted:true,sourceType:true,sourceAttemptId:true,sourceSubmissionId:true}})
 for(const slot of slots){
  try{
   const unit=bound.units.find(u=>u.itemId===slot.itemId&&u.family==='COGNITIVE')
   const declaration=input.pack.manifest.definition.slots.find(s=>s.slotKey===slot.slotKey&&s.unitType==='COGNITIVE')
   const dependency=input.pack.manifest.cognitiveDependencies.find(d=>d.slotKey===slot.slotKey)
   const matches=rows.filter(r=>r.slotKey===compositeItemSlotKey(slot.itemId,'COGNITIVE')),row=matches[0]
   if(!unit||!declaration||!dependency||matches.length!==1||!row||row.compositeAttemptId!==input.parent.id||row.attemptEpoch!==input.parent.attemptEpoch
    ||row.unitType!=='COGNITIVE'||row.terminalState!=='COMPLETED'||row.payloadKind!=='UNIT_RESULT'||!row.canonicalResultEncrypted)continue
   const [envelope]=await loadStoredCanonicalUnitResults([row.canonicalResultEncrypted],db)
   const source=envelope.persistenceProvenance,core=envelope.core
   if(envelope.resultHash!==receipt.sources.find(s=>s.itemId===unit.itemId)?.resultHash||core.unitType!=='COGNITIVE'
    ||source.sourceType!==row.sourceType||source.sourceAttemptId!==row.sourceAttemptId||(source.sourceSubmissionId??null)!==(row.sourceSubmissionId??null))continue
   // Existing exact parent/item/assignment/config/submission/core checks, including
   // the already supported COURSE wrapper alias, run before reading its report.
   const verified=await loadTrainingMetricDisclosure(db,{parent:input.parent,unit,source:row,core,
    audience:input.audience==='student'?'participant':input.audience==='admin'?'researcher':'teacher'})
   const child=await db.cognitiveSession.findUnique({where:{id:row.sourceAttemptId},select:{
    testType:true,configVersion:true,engineVersion:true,scoringVersion:true,resultSnapshotEncrypted:true,
    assignment:{select:{profile:true,resolvedReportSnapshotEncrypted:true}}}})
   if(!child?.resultSnapshotEncrypted||!child.assignment)continue
   const result=parseCognitiveResultSnapshot(decryptCognitivePayload(child.resultSnapshotEncrypted))
   const hash=envelope.bundleBridge?.sourceResultHash
   const evidence=input.facts.evidence.filter(e=>e.source.kind==='COGNITIVE_METRIC'&&e.source.slotKey===slot.slotKey)
   if(!hash||canonicalHash(result)!==hash||!evidence.length||evidence.some(e=>e.source.kind!=='COGNITIVE_METRIC'||e.source.sourceResultHash!==hash)
    ||child.testType!==declaration.instrumentKey||child.configVersion!==declaration.instrumentVersion
    ||child.engineVersion!==dependency.engineVersion||child.scoringVersion!==dependency.scoringVersion||child.assignment.profile!==dependency.profile
    ||result.testType!==child.testType||result.configVersion!==child.configVersion||result.engineVersion!==child.engineVersion||result.scoringVersion!==child.scoringVersion
    ||result.profile!==dependency.profile||result.protocolSignature!==core.scientificProvenance.protocolSignature)continue
   out.set(slot.slotKey,projectFrozenCognitiveDisclosure({result,report:readFrozenReport(child.assignment.resolvedReportSnapshotEncrypted),
    selectors:declaration.valueSelectors??[],verified}))
  }catch{
   // One unreadable or mismatched task withholds its dependent rows, preserving
   // the other task and questionnaire. No live-definition fallback is allowed.
  }
 }
 return out
}
