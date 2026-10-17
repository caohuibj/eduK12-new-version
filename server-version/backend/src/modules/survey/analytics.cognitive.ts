import {canonicalHash} from '../assessment-runtime/canonical'
import type {TrialEnvelope} from '../cognitive/v2/types'
import type {GonogoTrial} from '../cognitive/schemas/gonogo.trial'
import {parseFrozenSurveyCognitive,type SurveyCognitiveReference} from './cognitive.definition'
import type {ResearchFrozenUnit} from './publication.service'
import type {FrozenUnitResult} from './final.compute'
import type {FrozenScoreObservation,SurveyMeasurementIdentity} from './analytics.cohorts'
import {SurveyAnalyticsError} from './analytics.read'

/** Initial interactive budgets, not a claim about tested system capacity. */
export const COGNITIVE_TRIAL_PAGE_ROWS=1000
export const COGNITIVE_TRIAL_PAGE_BYTES=768*1024
export interface CognitiveExportChild {
  reference:SurveyCognitiveReference
  sessionId:string
  completedAt:Date|string
  result:{schemaVersion:1;sessionId:string;projectId:string;waveId:string;attemptId:string;
    publicationId:string;slotKey:string;epoch:number;measurementDigest:string;
    configHash:string;protocolSignature:string;testType:string;configVersion:string;
    engineVersion:string;scoringVersion:string;timingPolicy:string;
    metrics:Record<string,unknown>;quality:{state:string;flags:Record<string,boolean>;reasons:string[]};
    audit:{trialCount:number;[key:string]:unknown};administrationProvenance:unknown;restartCount:number}
  raw?:{schemaVersion:1;attemptEpoch:number;trials:TrialEnvelope[];administrationProvenance?:unknown}
  randomSeed?:string
}
export type CognitiveSourceMeta=Pick<FrozenScoreObservation,'projectId'|'waveId'|'waveOrdinal'|
  'attemptId'|'researchCode'|'completedAt'|'sourceFinalHash'|'completionStatus'> & {publicationId:string;publicationVersion:number}
export interface CognitiveTrialObservation extends CognitiveSourceMeta {
  sourceVerified:true;instrumentKey:string;sourceResultHash:string;epoch:number;
  measurementDigest:string;configHash:string;protocolSignature:string;
  engineVersion:string;scoringVersion:string;configVersion:string;timingPolicy:string;
  randomSeed:string;randomizationVersion:string;restartCount:number;childCompletedAt:string;
  phase:string;trialIndex:number;condition:string|null;stimulusCode:string;
  responded:boolean;response:string|null;rtMs:number|null;rtMissingReason:string|null;
  startedAtPerfMs:number;endedAtPerfMs:number;durationMs:number;
  timeout:boolean;premature:boolean;interrupted:boolean;qualityEvents:string[];
  qualityStatus:string;qualityFlags:Record<string,boolean>;qualityReasons:string[];
  administrationProvenance:unknown
}
function invalid(message:string):never{throw new SurveyAnalyticsError(409,message)}
/** Own a validated frozen copy for one source projection. Neither participant
 * authority nor child results are cached, and every child binding is rechecked. */
export function prepareCognitiveProjection(frozen:ResearchFrozenUnit){
  const definition=parseFrozenSurveyCognitive(structuredClone(frozen.compiledDefinition))
  const instrumentKey=frozen.instrumentKey,scoringDigest=frozen.scoringDigest
  const session=definition.sessionSnapshot
  // parseFrozenSurveyCognitive already validates this runtime and its hash.
  if(!session.compiledRuntime||scoringDigest!==definition.measurementDigest)invalid('认知冻结计分定义不可核验')
  const columns:readonly SurveyMeasurementIdentity[]=Object.freeze(Object.values(session.compiledRuntime.metricDefinitions)
    .filter(metric=>metric.valueType==='number'||metric.valueType==='integer')
    .map(metric=>{
      if(typeof metric.unit!=='string'||!metric.unit)invalid('认知冻结指标单位缺失')
      return Object.freeze({instrumentKey,scoreKey:metric.key,
      scoringDigest:scoringDigest!,responseSignature:definition.measurementDigest,
      respondentType:'research_task_performance',unit:metric.unit,
      provenance:Object.freeze({kind:'COGNITIVE' as const,measurementDigest:definition.measurementDigest,
        scoringVersion:session.scoringVersion,configHash:session.configHash,
        protocolSignature:session.protocolSignature,engineVersion:session.engineVersion,
        timingPolicy:definition.timingPolicy,devicePolicy:definition.devicePolicy})})
    }))
  /** The authorized storage adapter verifies ciphertext and all parent bindings.
   * This extra projection check binds the frozen measurement and parent receipt.
   * Never invoke a scorer during analytics, report or export reads. */
  function scoresFromChild(unit:FrozenUnitResult,
    child:CognitiveExportChild,meta:CognitiveSourceMeta):FrozenScoreObservation[]{
    const result=child.result
    const expected={projectId:meta.projectId,waveId:meta.waveId,attemptId:meta.attemptId,
      publicationId:meta.publicationId,slotKey:instrumentKey,
      measurementDigest:definition.measurementDigest,configHash:definition.sessionSnapshot.configHash,
      protocolSignature:definition.sessionSnapshot.protocolSignature,
      engineVersion:definition.sessionSnapshot.engineVersion,scoringVersion:definition.sessionSnapshot.scoringVersion}
    if(!unit.childReference||canonicalHash(unit.childReference)!==canonicalHash(child.reference)
      ||canonicalHash(result)!==child.reference.resultHash||child.reference.epoch!==result.epoch
      ||child.sessionId!==result.sessionId||Object.entries(expected).some(([key,value])=>result[key as keyof typeof result]!==value))
      invalid('认知子结果与整轮 FINAL 或测量版本不一致')
    const stored=(unit.privateScoring as {metrics?:{key:string;value:number|null;unit:string|null}[]}|null)?.metrics
    if(!Array.isArray(stored)||stored.length!==columns.length)
      invalid('认知整轮 FINAL 指标投影缺失或重复')
    const storedByKey=new Map(stored.map(metric=>[metric.key,metric]))
    if(storedByKey.size!==stored.length)invalid('认知整轮 FINAL 指标投影缺失或重复')
    return columns.map(measurement=>{
      const raw=result.metrics[measurement.scoreKey]
      const value=typeof raw==='number'&&Number.isFinite(raw)?raw:null
      const parent=storedByKey.get(measurement.scoreKey)
      if(!parent||parent.value!==value||parent.unit!==measurement.unit)
        invalid('认知整轮 FINAL 指标与权威子结果不一致')
      return {...meta,sourceVerified:true,measurement,value,
        missingReason:value===null?'SHOWN_MISSING':null,status:value===null?'NOT_CALCULABLE':'OK',
        quality:{status:result.quality.state,flags:{...result.quality.flags},reasons:[...result.quality.reasons]},
        sourceResultHash:child.reference.resultHash,epoch:child.reference.epoch}
    })
  }
  /** Iterate only the immutable child's raw trials; parent FINAL contains none. */
  function* trialRows(child:CognitiveExportChild,
    meta:CognitiveSourceMeta):Generator<CognitiveTrialObservation>{
    const result=child.result
    if(!child.raw||!child.randomSeed||child.raw.attemptEpoch!==child.reference.epoch
      ||child.raw.trials.length!==result.audit.trialCount)invalid('认知权威试次来源缺失或 epoch 不一致')
    const childCompletedAt=new Date(child.completedAt).toISOString()
    for(const trial of child.raw.trials){
      const payload=trial.payload as GonogoTrial
      if(!payload||!['go','nogo'].includes(payload.trialType)||typeof payload.responded!=='boolean'
        ||(payload.rtMs!==null&&(!Number.isFinite(payload.rtMs)||payload.rtMs<0))
        ||payload.responded!==(payload.rtMs!==null))invalid('认知冻结试次响应或时长无效')
      yield {...meta,sourceVerified:true,instrumentKey,
        sourceResultHash:child.reference.resultHash,epoch:child.reference.epoch,
        measurementDigest:definition.measurementDigest,configHash:result.configHash,
        protocolSignature:result.protocolSignature,engineVersion:result.engineVersion,
        scoringVersion:result.scoringVersion,configVersion:result.configVersion,timingPolicy:result.timingPolicy,
        randomSeed:child.randomSeed,randomizationVersion:definition.sessionSnapshot.protocol.randomizationAlgorithmVersion,
        restartCount:result.restartCount,childCompletedAt,
        phase:trial.phase,trialIndex:trial.trialIndex,condition:trial.condition??null,
        stimulusCode:payload.trialType,responded:payload.responded,response:payload.responded?'RESPONDED':null,
        rtMs:payload.rtMs,rtMissingReason:payload.rtMs!==null?null:payload.trialType==='nogo'?'NO_GO_WITHHELD':'GO_OMISSION',
        startedAtPerfMs:trial.startedAtPerfMs,endedAtPerfMs:trial.endedAtPerfMs,durationMs:trial.durationMs,
        timeout:trial.flags.timeout,premature:trial.flags.premature,interrupted:payload.interrupted,
        qualityEvents:[...trial.qualityEvents],qualityStatus:result.quality.state,
        qualityFlags:{...result.quality.flags},qualityReasons:[...result.quality.reasons],
        administrationProvenance:child.raw.administrationProvenance??result.administrationProvenance}
    }
  }
  return Object.freeze({columns,scoresFromChild,trialRows})
}
export function cognitiveMeasurementColumns(frozen:ResearchFrozenUnit):SurveyMeasurementIdentity[]{
  return [...prepareCognitiveProjection(frozen).columns]
}
export function cognitiveScoresFromChild(frozen:ResearchFrozenUnit,unit:FrozenUnitResult,
  child:CognitiveExportChild,meta:CognitiveSourceMeta):FrozenScoreObservation[]{
  return prepareCognitiveProjection(frozen).scoresFromChild(unit,child,meta)
}
export function* cognitiveTrialRows(frozen:ResearchFrozenUnit,child:CognitiveExportChild,
  meta:CognitiveSourceMeta):Generator<CognitiveTrialObservation>{
  yield* prepareCognitiveProjection(frozen).trialRows(child,meta)
}
export function pageCognitiveTrialRows(rows:Iterable<CognitiveTrialObservation>,offset:number,
  bounds={maxRows:COGNITIVE_TRIAL_PAGE_ROWS,maxBytes:COGNITIVE_TRIAL_PAGE_BYTES}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(bounds.maxRows)||bounds.maxRows<1
    ||bounds.maxRows>COGNITIVE_TRIAL_PAGE_ROWS||!Number.isSafeInteger(bounds.maxBytes)||bounds.maxBytes<1
    ||bounds.maxBytes>COGNITIVE_TRIAL_PAGE_BYTES)throw new SurveyAnalyticsError(400,'认知试次分页边界无效')
  const selected:CognitiveTrialObservation[]=[]
  let index=0,bytes=0,hasNext=false
  for(const row of rows){
    if(index++<offset)continue
    // Includes conservative CSV quoting overhead and serialized provenance.
    const size=Buffer.byteLength(JSON.stringify(row),'utf8')*2+256
    if(size>bounds.maxBytes)throw new SurveyAnalyticsError(413,'单条认知试次超过导出字节上限')
    if(selected.length===bounds.maxRows||bytes+size>bounds.maxBytes){hasNext=true;break}
    bytes+=size;selected.push(row)
  }
  if(offset>index)invalid('认知试次分页位置已越过权威结果')
  return {rows:selected,nextOffset:hasNext?offset+selected.length:null,estimatedBytes:bytes}
}
