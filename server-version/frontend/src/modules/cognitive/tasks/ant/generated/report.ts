// Exact ANT report projection, no scorer/runtime imports. Backend SHA256: 139b6dbe763a9d5c2d8d6845296450c0adf3a501fb9d617d9d6dc5666ce3cf54
import { CUES,FLANKERS,INPUTS,type Cue,type Flanker,type Input } from './protocol'
export type AntScoreResult={metrics:Record<string,unknown>;quality:{state:'interpretable'|'limited'|'invalid';flags:Record<string,boolean>;reasons:string[]};audit:{trialCount:number;scorerVersion:string}}
type CognitiveScoreResult=AntScoreResult
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
