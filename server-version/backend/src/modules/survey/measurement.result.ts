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
  const definitions=parseCompiledInstrumentRuntime(frozen.sessionSnapshot.compiledRuntime).metricDefinitions
  const measurement=projectStoredMeasurement({identity:{schemaVersion:1,kind:'COGNITIVE',
    sourceDigest:unit.sourceDigest,scoringDigest:unit.scoringDigest,
    engineVersion:stored.engineVersion,scoringVersion:stored.scoringVersion,
    protocolDigest:stored.protocolSignature},measurementDigest:frozen.measurementDigest,
    storedResult:stored,metricUnits:Object.fromEntries(Object.entries(definitions).flatMap(([k,v])=>typeof v.unit==='string'?[[k,v.unit]]:[]))})
  return {instrumentKey:unit.instrumentKey,kind:'COGNITIVE',sourceDigest:unit.sourceDigest,
    scoringDigest:unit.scoringDigest,rawAnswers:{},missing:[],childReference:loaded.reference,
    privateScoring:{metrics:measurement.metrics,quality:measurement.quality},measurement}
}
const feedbackLabels={hitRate:'Go 命中率',goMedianRtMs:'Go 正确反应中位时长'} as const
/** Independent fixed product allowlist, intersected with the frozen author
 * choice. Never disclose raw/seed/config/scoring/audit to a participant. */
export function surveyCognitiveMetricDisclosure(unit:ResearchFrozenUnit,collectionClosed:boolean){
  const frozen=parseFrozenSurveyCognitive(unit.compiledDefinition)
  if(unit.sourceProvenance?.reportConfigured===false)return null
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
  if(!result.measurement||result.measurement.measurementDigest!==frozen.measurementDigest)
    throw new Error('Stored participant measurement projection mismatch')
  const report=projectMeasurementReport(result.measurement,'PARTICIPANT',keys)
  return {pending:false as const,instrumentKey:unit.instrumentKey,title:unit.title,
    measurementDigest:report.measurementDigest,maturity:'PILOT' as const,
    metrics:report.metrics.map(metric=>({key:metric.key,label:feedbackLabels[metric.key as keyof typeof feedbackLabels],
      value:metric.value,unit:metric.unit,status:metric.status})),quality:report.quality}
}
