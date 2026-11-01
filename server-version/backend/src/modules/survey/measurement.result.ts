import {canonicalHash} from '../assessment-runtime/canonical'
import { readSurveyBundleCognitiveReport,surveyBundleCognitiveKeys } from './cognitive-bundle-report'
import { parseCompiledInstrumentRuntime } from '../assessment-runtime/compiler'
import { projectStoredMeasurement,projectMeasurementReport } from '../assessment-runtime/measurement-result'
import { parseFrozenSurveyCognitive } from './cognitive.definition'
import type { LoadedSurveyCognitiveResult } from './cognitive.results'
import type { ResearchFrozenUnit } from './publication.service'
import type { FrozenUnitResult } from './final.compute'

/** Converts an already verified authoritative child into a compact parent
 * projection. Raw trials remain exclusively in the child result. */
export function cognitiveParentUnit(unit:ResearchFrozenUnit,loaded:LoadedSurveyCognitiveResult):FrozenUnitResult{
  const frozen=parseFrozenSurveyCognitive(unit.compiledDefinition)
  const stored=loaded.result
  if(frozen.schemaVersion===2&&(stored.profileArtifactHash!==frozen.artifactHash||stored.profile!==frozen.artifact.identity.profile||stored.configHash!==frozen.sessionSnapshot.configHash||stored.protocolSignature!==frozen.sessionSnapshot.protocolSignature))throw new Error('原认知结果与冻结 profile 不一致')
  const definitions=parseCompiledInstrumentRuntime(frozen.sessionSnapshot.compiledRuntime).metricDefinitions
  const measurement=projectStoredMeasurement({identity:{schemaVersion:1,kind:'COGNITIVE',
    sourceDigest:unit.sourceDigest,scoringDigest:unit.scoringDigest,
    engineVersion:stored.engineVersion,scoringVersion:stored.scoringVersion,
    protocolDigest:stored.protocolSignature},measurementDigest:frozen.measurementDigest,
    storedResult:stored,metricUnits:Object.fromEntries(Object.entries(definitions).flatMap(([k,v])=>typeof v.unit==='string'?[[k,v.unit]]:[]))})
  return {instrumentKey:unit.instrumentKey,kind:'COGNITIVE',sourceDigest:unit.sourceDigest,
    scoringDigest:unit.scoringDigest,rawAnswers:{},missing:[],childReference:loaded.reference,
    privateScoring:{metrics:measurement.metrics,quality:measurement.quality,...(stored.reportSnapshot?{nativeCognitive:{snapshot:stored.reportSnapshot,snapshotHash:canonicalHash(stored.reportSnapshot),receiptHash:loaded.reference.resultHash}}:{})},measurement}
}
const feedbackLabels={hitRate:'Go 命中率',goMedianRtMs:'Go 正确反应中位时长'} as const
/** Independent fixed product allowlist, intersected with the frozen author
 * choice. Never disclose raw/seed/config/scoring/audit to a participant. */
export function surveyCognitiveMetricDisclosure(unit:ResearchFrozenUnit,collectionClosed:boolean){
  const frozen=parseFrozenSurveyCognitive(unit.compiledDefinition)
  if(unit.sourceProvenance?.reportConfigured===false)return null
  if(unit.nativeBundleCognitiveReport&&frozen.schemaVersion===2)return {frozen,keys:surveyBundleCognitiveKeys(unit),pending:false}
  if(frozen.feedback.mode!=='DESCRIPTIVE')return null
  return {frozen,keys:frozen.feedback.metricKeys.filter(key=>Object.prototype.hasOwnProperty.call(feedbackLabels,key)),pending:frozen.feedback.release==='AFTER_COLLECTION'&&!collectionClosed}
}
export function cognitiveParticipantFeedback(unit:ResearchFrozenUnit,result:FrozenUnitResult,
  collectionClosed:boolean){
  if(result.notExecuted)return null
  const access=surveyCognitiveMetricDisclosure(unit,collectionClosed)
  if(!access)return null
  if(access.pending)return {pending:true as const}
  const {frozen,keys}=access
  if(unit.nativeBundleCognitiveReport){
    const allowed=readSurveyBundleCognitiveReport(unit,result)
    if(!allowed)return null
    const view=allowed.result.report,items=[...view.headline as Array<{key:string;label:string;unit:string;value:number}>,...view.user as Array<{key:string;label:string;unit:string;value:number}>,...view.detail as Array<{key:string;label:string;unit:string;value:number}>]
    return {pending:false as const,instrumentKey:unit.instrumentKey,title:unit.title,measurementDigest:frozen.measurementDigest,maturity:'PILOT' as const,
      metrics:[...allowed.disclosure.metricKeys].map(key=>{const item=items.find(v=>v.key===key)!;return {key,label:item.label,value:item.value,unit:item.unit,status:'OK' as const}}),quality:result.measurement!.quality}
  }
  if(!result.measurement||result.measurement.measurementDigest!==frozen.measurementDigest)
    throw new Error('Stored participant measurement projection mismatch')
  const report=projectMeasurementReport(result.measurement,'PARTICIPANT',keys)
  return {pending:false as const,instrumentKey:unit.instrumentKey,title:unit.title,
    measurementDigest:report.measurementDigest,maturity:'PILOT' as const,
    metrics:report.metrics.map(metric=>({key:metric.key,label:feedbackLabels[metric.key as keyof typeof feedbackLabels],
      value:metric.value,unit:metric.unit,status:metric.status})),quality:report.quality}
}
