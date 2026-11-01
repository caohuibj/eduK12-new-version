import {canonicalHash} from '../assessment-runtime/canonical'
import {parseCognitiveResultSnapshot} from '../cognitive/v2/result-snapshot'
import {projectThreeLayerReport} from '../cognitive/v2/report'
import type {CognitiveResultSnapshot,CognitiveScoreResult} from '../cognitive/v2/types'
import {projectFrozenCognitiveDisclosure} from '../bundle-product/cognitive-disclosure'
import {trainingCognitiveMetricKeys} from '../composite/training-metric-disclosure'
import {DISCLOSURE_PRESETS} from '../scale/policy/disclosure'
import {parseFrozenSurveyCognitive,type FrozenSurveyCognitive} from './cognitive.definition'
import type {FrozenSurveyCognitiveProfile} from './cognitive-profile.definition'
import type {ResearchFrozenUnit} from './publication.service'
import type {FrozenUnitResult} from './final.compute'

/** Original whole-package and exact profile report binding. This is not a grant;
 * publication/FINAL/read callers retain their existing current authority checks. */
export type FrozenSurveyBundleCognitiveReport={definitionHash:string;artifactHash:string;selectors:string[];reportEnabled:true}
export function assertSurveyCognitiveTrialBudget(frozen:FrozenSurveyCognitive,count:number){
 const maximum=frozen.schemaVersion===2?frozen.maxTrials:120
 const span=frozen.schemaVersion===2&&['digitbackward','corsi'].includes(frozen.sessionSnapshot.testType)
 if(!Number.isSafeInteger(count)||count<1||count>maximum||!span&&count!==maximum)throw Error('SURVEY_COGNITIVE_TRIAL_BUDGET')
 // The original authoritative span scorer, not this ceiling, verifies terminal levels.
}
/** At accepted FINAL only: the existing report renderer consumes the same frozen
 * definitions and authoritative score. No current reference or registry fallback. */
export function buildSurveyCognitiveReportSnapshot(frozen:FrozenSurveyCognitiveProfile,scored:CognitiveScoreResult,completedAt:Date,trials:unknown[]):CognitiveResultSnapshot{
 const s=frozen.sessionSnapshot,r=frozen.artifact.resolvedReport
 const report=projectThreeLayerReport({testType:s.testType,configVersion:s.configVersion,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,
  protocolSignature:s.protocolSignature,profile:frozen.artifact.identity.profile,participantPresentation:r.participantPresentation,reportCaveats:r.reportCaveats,
  trials,config:s.config as Record<string,unknown>,definition:r.v2ReportDefinition!,metrics:scored.metrics,score:scored,metricDefinitions:r.v2MetricDefinitions!,qualityDefinitions:r.v2QualityDefinitions!})
 return parseCognitiveResultSnapshot({schemaVersion:1,completedAt:completedAt.toISOString(),testType:s.testType,configVersion:s.configVersion,engineVersion:s.engineVersion,
  scoringVersion:s.scoringVersion,protocolSignature:s.protocolSignature,profile:frozen.artifact.identity.profile,metrics:scored.metrics,quality:scored.quality,references:[],report:JSON.parse(JSON.stringify(report)),assessmentContext:null})
}
export function surveyBundleCognitiveKeys(unit:ResearchFrozenUnit):string[]{
 const binding=unit.nativeBundleCognitiveReport,frozen=parseFrozenSurveyCognitive(unit.compiledDefinition)
 if(!binding||!binding.reportEnabled||unit.sourceProvenance?.reportConfigured!==true||unit.sourceProvenance.reportAudience!==undefined&&unit.sourceProvenance.reportAudience!=='student'||frozen.schemaVersion!==2||binding.artifactHash!==frozen.artifactHash)return []
 const ceiling=trainingCognitiveMetricKeys(frozen.artifact.resolvedReport)
 return binding.selectors.filter(k=>ceiling.has(k))
}
/** A verified child receipt was copied into this immutable FINAL. Reads use only
 * its saved report and exact frozen identity; no rescoring or report reconstruction. */
export function readSurveyBundleCognitiveReport(unit:ResearchFrozenUnit,result:FrozenUnitResult){
 try{
  if(unit.kind!=='COGNITIVE'||result.kind!=='COGNITIVE'||result.notExecuted||result.instrumentKey!==unit.instrumentKey||result.sourceDigest!==unit.sourceDigest||result.scoringDigest!==unit.scoringDigest||!result.childReference||!result.measurement)return null
  const frozen=parseFrozenSurveyCognitive(unit.compiledDefinition),keys=surveyBundleCognitiveKeys(unit)
  if(frozen.schemaVersion!==2||!keys.length||result.measurement.measurementDigest!==frozen.measurementDigest||result.childReference.measurementDigest!==frozen.measurementDigest)return null
  const saved=(result.privateScoring as {nativeCognitive?:{snapshot:unknown;snapshotHash:string;receiptHash:string}})?.nativeCognitive
  if(!saved||saved.receiptHash!==result.childReference.resultHash)return null
  const snapshot=parseCognitiveResultSnapshot(saved.snapshot),i=frozen.artifact.identity
  if(canonicalHash(snapshot)!==saved.snapshotHash||snapshot.testType!==i.testType||snapshot.configVersion!==i.configVersion||snapshot.engineVersion!==i.engineVersion||snapshot.scoringVersion!==i.scoringVersion||snapshot.profile!==i.profile||snapshot.protocolSignature!==i.protocolSignature)return null
  const projected=new Map(result.measurement.metrics.map(m=>[m.key,m.value]))
  if(keys.some(k=>typeof snapshot.metrics[k]==='number'&&snapshot.metrics[k]!==projected.get(k)))return null
  const capabilities=DISCLOSURE_PRESETS.NONE()
  capabilities.numericScores=true;capabilities.individualInterpretations=true;capabilities.resultQualityDetails=true
  const disclosure=projectFrozenCognitiveDisclosure({result:snapshot,report:frozen.artifact.resolvedReport,selectors:keys,
   verified:{metricKeys:new Set(keys),referenceMetricKeys:new Set(),capabilities}})
  return {result:snapshot,disclosure}
 }catch{return null}
}
