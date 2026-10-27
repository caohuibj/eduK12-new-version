import type { AuthoritativeScorerInput,CognitiveScoreResult } from '../../v2/types'
import { parseSessionConfigSnapshot } from '../../v2/session-snapshot'
import { computeConfigSnapshotHash,computeProtocolSignature } from '../../v2/canonical'
import { parseTrialEnvelope } from '../../v2/trial-envelope'
import { ANT_IDENTITY,ANT_PROTOCOL,ANT_GUIDED_IDENTITY,ANT_GUIDED_PROTOCOL,CUES,FLANKERS,INPUTS,antPlan,
  type AntConfig,type AntTrial,type Input,type Cue,type Flanker } from './protocol'
import { parseAntConfig,parseAntGuidedConfig,parseAntTrial } from './schema'

interface Tally { observed:number; valid:number; correct:number }
interface RtTally { count:number; sumMs:number; meanMs:number|null }
export interface ConditionRecord extends Tally { expected:number; accuracy:number|null }
export interface AntMetrics {
  expectedTrialCount:number; receivedTrialCount:number; validTrialCount:number; excludedTrialCount:number;
  excludedTrialReasons:Record<string,string[]>; accuracy:number|null;
  cueRecords:Record<Cue,ConditionRecord>; flankerRecords:Record<Flanker,ConditionRecord>;
  inputSourcesObserved:Input[];
  correctRtByInput:Record<Input,{cue:Record<Cue,RtTally>;flanker:Record<Flanker,RtTally>}>;
  differencesByInput:Record<Input,{alerting:number|null;orienting:number|null;conflict:number|null}>;
}
export const ANT_COSTS={alerting:['none','double'],orienting:['central','spatial_valid'],
  conflict:['incongruent','congruent']} as const
const tally=():Tally=>({observed:0,valid:0,correct:0})
const rt=():RtTally=>({count:0,sumMs:0,meanMs:null})
const record=<K extends string,V>(keys:readonly K[],value:()=>V):Record<K,V>=>
  Object.fromEntries(keys.map(key=>[key,value()])) as Record<K,V>
const equalTime=(a:number,b:number)=>Math.abs(a-b)<0.001

/** Pure descriptive scorer. No client-provided correctness, RT, score or aggregate is trusted. */
function scoreAntIdentity(input:AuthoritativeScorerInput<AntConfig,AntTrial>,id:typeof ANT_IDENTITY|typeof ANT_GUIDED_IDENTITY,
  protocol:typeof ANT_PROTOCOL,parseConfig:(value:unknown)=>AntConfig):CognitiveScoreResult {
  const session=parseSessionConfigSnapshot<AntConfig>(input.session)
  if(session.testType!==id.testType||session.engineVersion!==id.engineVersion
    ||session.scoringVersion!==id.scoringVersion||session.configVersion!==id.configVersion
    ||session.protocolSignature!==computeProtocolSignature(protocol)||session.runtimeGeneration)
    throw new Error('Unsupported frozen ANT identity/protocol/runtime')
  const config=parseConfig(input.config)
  parseConfig(session.config)
  if(computeConfigSnapshotHash(config)!==computeConfigSnapshotHash(session.config))
    throw new Error('ANT input config differs from frozen session')
  const plan=antPlan(config,input.randomSeed)
  if(input.trials.length>plan.length)throw new Error('ANT trial budget exceeded')
  const cues=record(CUES,tally),flankers=record(FLANKERS,tally)
  const byInput=record(INPUTS,()=>({cue:record(CUES,rt),flanker:record(FLANKERS,rt)}))
  const observedInputs=new Set<Input>(),exclusions:Record<string,string[]>={}
  let previous:AntTrial|undefined,valid=0,correct=0
  for(let index=0;index<input.trials.length;index++) {
    const envelope=parseTrialEnvelope<AntTrial>(input.trials[index]),trial=parseAntTrial(envelope.payload)
    if(envelope.phase!=='test'||envelope.trialIndex!==index||trial.trialIndex!==index)
      throw new Error('ANT requires contiguous formal records; practice is separate')
    for(const key of Object.keys(plan[index]) as (keyof typeof plan[number])[])
      if(trial[key]!==plan[index][key])throw new Error('ANT stimulus truth differs from frozen seed/order')
    if(!equalTime(envelope.startedAtPerfMs,trial.startedAtPerfMs)
      ||!equalTime(envelope.endedAtPerfMs,trial.endedAtPerfMs)
      ||!equalTime(envelope.durationMs,trial.endedAtPerfMs-trial.startedAtPerfMs))
      throw new Error('ANT envelope clock differs from raw clock')
    const known=[trial.startedAtPerfMs,trial.cueOnsetPerfMs,trial.cueOffsetPerfMs,
      trial.targetOnsetPerfMs,trial.targetOffsetPerfMs,trial.endedAtPerfMs].filter((t):t is number=>t!==null)
    if(known.some((t,i)=>i>0&&t<known[i-1]))throw new Error('ANT phase clock out of order')
    for(const events of [trial.events,trial.interruptions])for(let i=0;i<events.length;i++) {
      const time=events[i].atPerfMs
      if(time<trial.startedAtPerfMs||time>trial.endedAtPerfMs||(i>0&&time<events[i-1].atPerfMs))
        throw new Error('ANT event clock out of order')
    }
    const onset=trial.targetOnsetPerfMs
    const first=onset===null?-1:trial.events.findIndex(event=>!event.repeat&&!event.held
      &&event.atPerfMs>=onset&&event.atPerfMs<onset+config.responseWindowMs)
    if(trial.responseIndex!==(first<0?null:first))throw new Error('ANT response must be the first eligible input')
    const response=first<0?null:trial.events[first]
    if(response&&trial.targetOffsetPerfMs!==null&&response.atPerfMs>trial.targetOffsetPerfMs)
      throw new Error('ANT response occurred after stimulus removal')
    const premature=trial.events.some(e=>!e.repeat&&!e.held&&(onset===null||e.atPerfMs<onset))
    const windowCompleted=onset!==null&&trial.endedAtPerfMs>=onset+config.responseWindowMs
    if(trial.timedOut!==(response===null&&windowCompleted)
      ||envelope.flags.timeout!==trial.timedOut||envelope.flags.premature!==premature)
      throw new Error('ANT raw/envelope timeout or premature flag mismatch')
    if(response)observedInputs.add(response.input)
    const reasons:string[]=[]
    if(trial.recordOrigin!=='live')reasons.push('recovered_without_timing')
    if(trial.clock.timeOriginUnixMs===null)reasons.push('clock_origin_unknown')
    if(trial.eventOverflow)reasons.push('event_overflow')
    if(trial.interruptions.length||envelope.qualityEvents.length)reasons.push('interruption')
    if(premature)reasons.push('premature_input')
    const missing=trial.cueOnsetPerfMs===null||trial.cueOffsetPerfMs===null||onset===null
      ||trial.targetOffsetPerfMs===null||(!response&&!trial.timedOut)
    if(missing)reasons.push('incomplete_stages')
    else {
      const deviations=[trial.cueOnsetPerfMs!-trial.startedAtPerfMs-trial.plannedPreCueMs,
        trial.cueOffsetPerfMs!-trial.cueOnsetPerfMs!-config.cueMs,
        onset!-trial.cueOffsetPerfMs!-config.postCueMs,
        trial.targetOffsetPerfMs!-(response?.atPerfMs??(onset!+config.responseWindowMs)),
        trial.endedAtPerfMs-trial.startedAtPerfMs-config.trialIntervalMs]
      if(deviations.some(d=>Math.abs(d)>config.phaseToleranceMs))reasons.push('phase_duration_deviation')
    }
    if(previous) {
      if(previous.clock.timeOriginUnixMs!==trial.clock.timeOriginUnixMs)reasons.push('clock_origin_changed')
      else if(trial.clock.timeOriginUnixMs!==null) {
        if(trial.startedAtPerfMs<previous.endedAtPerfMs)throw new Error('ANT formal trials overlap')
        if(previous.blockIndex===trial.blockIndex
          &&Math.abs(trial.startedAtPerfMs-previous.startedAtPerfMs-config.trialIntervalMs)>config.phaseToleranceMs)
          reasons.push('trial_start_interval_deviation')
      }
    }
    previous=trial
    const cue=cues[trial.cue],flanker=flankers[trial.flanker]
    cue.observed++;flanker.observed++
    if(reasons.length){exclusions[index]=reasons;continue}
    valid++;cue.valid++;flanker.valid++
    const isCorrect=response!==null&&response.direction===trial.direction
    if(isCorrect){correct++;cue.correct++;flanker.correct++
      for(const value of [byInput[response!.input].cue[trial.cue],byInput[response!.input].flanker[trial.flanker]]){
        value.count++;value.sumMs+=response!.atPerfMs-onset!
      }
    }
  }
  for(const inputType of INPUTS)for(const value of [...Object.values(byInput[inputType].cue),...Object.values(byInput[inputType].flanker)])
    value.meanMs=value.count?value.sumMs/value.count:null
  const conditionRecord=(value:Tally,expected:number):ConditionRecord=>({...value,expected,accuracy:value.valid?value.correct/value.valid:null})
  const cueRecords=record(CUES,()=>null as unknown as ConditionRecord)
  const flankerRecords=record(FLANKERS,()=>null as unknown as ConditionRecord)
  const flags:Record<string,boolean>={incompleteRecords:input.trials.length!==config.totalTrials,
    mixedInput:observedInputs.size>1,incompleteAccuracy:valid!==config.totalTrials}
  for(const cue of CUES){cueRecords[cue]=conditionRecord(cues[cue],config.totalTrials/4)
    flags['incompleteCue_'+cue]=cues[cue].valid!==config.totalTrials/4}
  for(const flank of FLANKERS){flankerRecords[flank]=conditionRecord(flankers[flank],config.totalTrials/3)
    flags['incompleteFlanker_'+flank]=flankers[flank].valid!==config.totalTrials/3}
  const differences=record(INPUTS,()=>({alerting:null,orienting:null,conflict:null} as {alerting:number|null;orienting:number|null;conflict:number|null}))
  for(const inputType of INPUTS)for(const cost of Object.keys(ANT_COSTS) as (keyof typeof ANT_COSTS)[]){
    const keys=ANT_COSTS[cost]
    const values=cost==='conflict'?byInput[inputType].flanker:byInput[inputType].cue
    const conditions=cost==='conflict'?flankerRecords:cueRecords
    const pair=keys.map(key=>(values as Record<string,RtTally>)[key])
    const complete=keys.every(key=>{const c=(conditions as Record<string,ConditionRecord>)[key];return c.valid===c.expected})
    if(complete&&observedInputs.size===1&&pair.every(v=>v.meanMs!==null))
      differences[inputType][cost]=pair[0].meanMs!-pair[1].meanMs!
  }
  for(const cost of Object.keys(ANT_COSTS) as (keyof typeof ANT_COSTS)[])
    flags['unavailable_'+cost]=INPUTS.every(inputType=>differences[inputType][cost]===null)
  flags.noInterpretableCondition=!Object.values(cueRecords).some(c=>c.valid===c.expected)
  const state=flags.noInterpretableCondition?'invalid':Object.values(flags).some(Boolean)?'limited':'interpretable'
  const metrics:AntMetrics={expectedTrialCount:config.totalTrials,receivedTrialCount:input.trials.length,
    validTrialCount:valid,excludedTrialCount:input.trials.length-valid,excludedTrialReasons:exclusions,
    accuracy:valid?correct/valid:null,cueRecords,flankerRecords,inputSourcesObserved:INPUTS.filter(i=>observedInputs.has(i)),
    correctRtByInput:byInput,differencesByInput:differences}
  const result:CognitiveScoreResult={metrics:{...metrics},quality:{state,flags,reasons:state==='invalid'
    ?['完整条件记录不足，本轮不提供表现结论。']:state==='limited'
      ?['部分条件、正确反应或输入来源不足以支持比较，受影响指标暂不展示。']:[]},
    audit:{trialCount:input.trials.length,scorerVersion:id.scoringVersion}}
  // Native report consumers need explicit scalar definitions; reuse the same gated projection.
  const publicReport=projectAntReport(result)
  for(const [group,keys,records,rows] of [
    ['cue',CUES,cueRecords,publicReport.cueRows],
    ['flanker',FLANKERS,flankerRecords,publicReport.flankerRows],
  ] as const)for(const key of keys){
    const condition=(records as Record<string,ConditionRecord>)[key]
    const row=rows.find(row=>('cue' in row?row.cue:row.flanker)===key)
    result.metrics[`${group}Accuracy_${key}`]=row?.accuracy??null
    result.metrics[`${group}CorrectMeanRtMs_${key}`]=row?.correctMeanRtMs??null
    result.metrics[`${group}CorrectRtCount_${key}`]=row?.correctRtCount??null
    result.metrics[`${group}CorrectCount_${key}`]=condition.correct
    result.metrics[`${group}ValidCount_${key}`]=condition.valid
    result.metrics[`${group}ExpectedCount_${key}`]=condition.expected
  }
  for(const cost of Object.keys(ANT_COSTS) as (keyof typeof ANT_COSTS)[]){
    const value=publicReport.differences.find(value=>value.key===cost)
    result.metrics[`${cost}MeanRtDifferenceMs`]=value?.valueMs??null
    result.metrics[`${cost}FirstCorrectCount`]=value?.firstCorrectCount??null
    result.metrics[`${cost}SecondCorrectCount`]=value?.secondCorrectCount??null
  }
  return result
}

/** Exact identities are validated as received; neither entry relabels an older session. */
export const scoreAnt=(input:AuthoritativeScorerInput<AntConfig,AntTrial>):CognitiveScoreResult=>
  scoreAntIdentity(input,ANT_IDENTITY,ANT_PROTOCOL,parseAntConfig)
export const scoreAntGuided=(input:AuthoritativeScorerInput<AntConfig,AntTrial>):CognitiveScoreResult=>
  scoreAntIdentity(input,ANT_GUIDED_IDENTITY,ANT_GUIDED_PROTOCOL,parseAntGuidedConfig)

/** Sole candidate user/report/export projection. Missing or raised gates always fail closed. */
export function projectAntReport(result:CognitiveScoreResult) {
  const flags=result.quality.flags
  const invalid=result.quality.state==='invalid'||flags.noInterpretableCondition!==false
  const m=result.metrics as unknown as AntMetrics
  const inputs=Array.isArray(m.inputSourcesObserved)?m.inputSourcesObserved:[]
  const input=inputs.length===1&&INPUTS.includes(inputs[0])?inputs[0]:null
  const validNumber=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)
  const validCondition=(c:ConditionRecord|undefined)=>!!c&&Number.isInteger(c.valid)&&c.valid>0
    &&c.valid===c.expected&&c.observed===c.expected&&Number.isInteger(c.correct)&&c.correct>=0
    &&c.correct<=c.valid&&validNumber(c.accuracy)&&c.accuracy===c.correct/c.valid
  const rtAllowed=!invalid&&flags.mixedInput===false&&input!==null
  const cueRows=invalid?[]:CUES.flatMap(cue=>{
    const c=m.cueRecords?.[cue]
    if(flags['incompleteCue_'+cue]!==false||!validCondition(c))return []
    const r=input?m.correctRtByInput?.[input]?.cue?.[cue]:undefined
    const show=rtAllowed&&r&&Number.isInteger(r.count)&&r.count>0&&r.count===c.correct
      &&validNumber(r.meanMs)&&r.meanMs>=0&&r.meanMs<1700&&validNumber(r.sumMs)&&r.meanMs===r.sumMs/r.count
    return [{cue,correct:c.correct,total:c.valid,accuracy:c.accuracy,
      correctMeanRtMs:show?r!.meanMs:null,correctRtCount:show?r!.count:null,input:show?input:null}]
  })
  const flankerRows=invalid?[]:FLANKERS.flatMap(flanker=>{
    const c=m.flankerRecords?.[flanker]
    if(flags['incompleteFlanker_'+flanker]!==false||!validCondition(c))return []
    const r=input?m.correctRtByInput?.[input]?.flanker?.[flanker]:undefined
    const show=rtAllowed&&r&&Number.isInteger(r.count)&&r.count>0&&r.count===c.correct
      &&validNumber(r.meanMs)&&r.meanMs>=0&&r.meanMs<1700&&validNumber(r.sumMs)&&r.meanMs===r.sumMs/r.count
    return [{flanker,correct:c.correct,total:c.valid,accuracy:c.accuracy,
      correctMeanRtMs:show?r!.meanMs:null,correctRtCount:show?r!.count:null,input:show?input:null}]
  })
  const differences=invalid?[]:(Object.keys(ANT_COSTS) as (keyof typeof ANT_COSTS)[]).flatMap(key=>{
    if(!rtAllowed||flags['unavailable_'+key]!==false)return []
    const keys=ANT_COSTS[key]
    const conditions=key==='conflict'?m.flankerRecords:m.cueRecords
    const rtValues=key==='conflict'?m.correctRtByInput?.[input!]?.flanker:m.correctRtByInput?.[input!]?.cue
    const pair=keys.map(condition=>(rtValues as Record<string,RtTally>|undefined)?.[condition])
    const eligible=keys.every(condition=>flags[(key==='conflict'?'incompleteFlanker_':'incompleteCue_')+condition]===false
      &&validCondition((conditions as Record<string,ConditionRecord>|undefined)?.[condition]))
    const value=m.differencesByInput?.[input!]?.[key]
    if(!eligible||!pair.every((r,index)=>{
      const c=(conditions as Record<string,ConditionRecord>)[keys[index]]
      return r&&Number.isInteger(r.count)&&r.count>0&&r.count===c.correct
        &&validNumber(r.meanMs)&&r.meanMs>=0&&r.meanMs<1700&&validNumber(r.sumMs)&&r.meanMs===r.sumMs/r.count
    })||!validNumber(value)||value!==pair[0]!.meanMs!-pair[1]!.meanMs!)return []
    return [{key,valueMs:value,input:input!,firstCorrectCount:pair[0]!.count,secondCorrectCount:pair[1]!.count}]
  })
  const totalCorrect=CUES.reduce((sum,cue)=>sum+(m.cueRecords?.[cue]?.correct??0),0)
  const totalValid=CUES.reduce((sum,cue)=>sum+(m.cueRecords?.[cue]?.valid??0),0)
  const allCuesValid=CUES.every(cue=>flags['incompleteCue_'+cue]===false&&validCondition(m.cueRecords?.[cue]))
  const overall=!invalid&&flags.incompleteAccuracy===false&&allCuesValid
    &&m.validTrialCount===m.expectedTrialCount&&totalValid===m.validTrialCount&&totalValid>0
    &&validNumber(m.accuracy)&&m.accuracy===totalCorrect/totalValid?m.accuracy:null
  return {state:invalid?'invalid':result.quality.state,accuracy:overall,cueRows,flankerRows,differences,
    reasons:result.quality.reasons,description:'只描述本轮记录；条件差值不是能力等级，体验版不代表稳定网络能力。',
    practicalTip:'把设备放稳，关闭通知，让视线留在中央注视点。'}
}
