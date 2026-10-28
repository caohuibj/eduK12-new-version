import { describe,it,expect } from 'vitest'
import { projectAntReport,type AntScoreResult } from './generated/report'
import { CUES,FLANKERS } from './generated/protocol'
const mapped=<T>(keys:readonly string[],value:()=>T)=>Object.fromEntries(keys.map(key=>[key,value()]))
describe('ANT generated portable report runtime',()=>{
 it('actually executes flanker projection instead of only accepting precomputed report fixtures',()=>{
  const condition=(n:number)=>({observed:n,valid:n,correct:n,expected:n,accuracy:1})
  const rt=(n:number)=>({count:n,sumMs:n*400,meanMs:400})
  const flags:Record<string,boolean>={noInterpretableCondition:false,mixedInput:false,incompleteAccuracy:false,
   unavailable_alerting:false,unavailable_orienting:false,unavailable_conflict:false,
   ...mapped(CUES.map(c=>'incompleteCue_'+c),()=>false),...mapped(FLANKERS.map(f=>'incompleteFlanker_'+f),()=>false)}
  const result:AntScoreResult={quality:{state:'interpretable',flags,reasons:[]},audit:{trialCount:48,scorerVersion:'1.1.0'},
   metrics:{expectedTrialCount:48,receivedTrialCount:48,validTrialCount:48,excludedTrialCount:0,excludedTrialReasons:{},accuracy:1,
    inputSourcesObserved:['touch'],cueRecords:mapped(CUES,()=>condition(12)),flankerRecords:mapped(FLANKERS,()=>condition(16)),
    correctRtByInput:{touch:{cue:mapped(CUES,()=>rt(12)),flanker:mapped(FLANKERS,()=>rt(16))}},
    differencesByInput:{touch:{alerting:0,orienting:0,conflict:0}}}}
  const report=projectAntReport(result)
  expect(report.flankerRows.map(row=>row.flanker)).toEqual([...FLANKERS])
  expect(report.flankerRows.every(row=>row.correctMeanRtMs===400&&row.correctRtCount===16&&row.total===16)).toBe(true)
  expect(report.cueRows).toHaveLength(4);expect(report.differences.map(value=>value.valueMs)).toEqual([0,0,0])
 })
})
