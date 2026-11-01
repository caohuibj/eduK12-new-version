import {describe,it,expect} from 'vitest'
import {scoreSharegameV2} from '../../modules/cognitive/scoring/sharegame.v2'
import {sharegameV2TrialSchema} from '../../modules/cognitive/schemas/sharegame.v2.trial'
import {seeds} from '../../modules/cognitive/tasks/sharegame/seeds'
import {executionEntries} from '../../modules/cognitive/tasks/sharegame/package'
import {sharegameRegistryMetaV2} from '../../modules/cognitive/tasks/sharegame/definitions'
import {buildCognitiveSingleTaskReport} from '../../modules/cognitive/single-task-report'
import {participantPresentations} from '../../modules/cognitive/tasks/sharegame/participant-presentation'
const config={endowments:[20,50,100],fixationMs:400,timeoutMs:20000,report:{reportVersion:'2.0.0',referenceMode:'none' as const}}
const trial=(i:number,given:number|null,response:'choice'|'timeout'|'omitted'=given===null?'timeout':'choice')=>({trialIndex:i,payload:{endowment:config.endowments[i],given,response,rtMs:given===null?null:0,interrupted:false}})
describe('sharegame v2 response facts to FINAL and report',()=>{
 it('preserves an explicit zero and excludes timeout/omission from all preference denominators',()=>{
  const result=scoreSharegameV2({config,trials:[trial(0,0),trial(1,null),trial(2,null,'omitted')] as never})
  expect(result.metrics).toMatchObject({givingRate:0,answeredRounds:1,answeredEndowment:20,zeroChoiceCount:1,timeoutRounds:1,omittedRounds:1,generousRate:0,medianDecisionMs:0})
  expect(result.qualityFlags).toMatchObject({interpretable:true,incomplete:true})
 })
 it('weights only answered endowments and keeps missing metrics null',()=>{
  expect(scoreSharegameV2({config,trials:[trial(0,0),trial(1,25),trial(2,null)] as never}).metrics.givingRate).toBe(0.3571)
  const missing=scoreSharegameV2({config,trials:[trial(0,null),trial(1,null),trial(2,null)] as never})
  expect(missing.metrics).toMatchObject({givingRate:null,equalSplitCount:null,generousRate:null,givingRateSd:null,medianDecisionMs:null,zeroChoiceCount:0})
  expect(missing.qualityFlags.interpretable).toBe(false);expect(missing.showProductIndex).toBe(false)
 })
 it('rejects contradictory, late or absent FINAL facts instead of padding zero',()=>{
  expect(sharegameV2TrialSchema.safeParse({...trial(0,null).payload,given:0}).success).toBe(false)
  expect(()=>scoreSharegameV2({config,trials:[trial(0,0)] as never})).toThrow()
  expect(()=>scoreSharegameV2({config,trials:[{...trial(0,0),payload:{...trial(0,0).payload,rtMs:20000}},trial(1,0),trial(2,0)] as never})).toThrow()
 })
 it('retains the old frozen identity and gives the new identity its own FINAL budget and report',()=>{
  expect(executionEntries.map(e=>[e.engineVersion,e.scoringVersion])).toEqual([['1.0.0','1.0.0'],['2.0.0','2.0.0']])
  expect(executionEntries[1].finalSubmission!.maxTrials!(config)).toBe(3)
  expect(participantPresentations[1].metrics.givingRate.explanation).toContain('未答')
 })
 it('renders frozen natural zero as 0% and no-response as unavailable, without a product index',()=>{
  const make=(trials:any[])=>{
   const r=scoreSharegameV2({config,trials})
   return buildCognitiveSingleTaskReport({testType:'sharegame',engineVersion:'2.0.0',scoringVersion:'2.0.0',configVersion:'2.0.0',profile:'experience',score:r.score,metrics:r.metrics,qualityFlags:r.qualityFlags,reference:null,
    frozenReport:{...sharegameRegistryMetaV2,protocolShowProductIndex:false,presentationVersion:'2.0.0',participantPresentation:participantPresentations[1]} as any})!
  }
  const zero=make([trial(0,0),trial(1,null),trial(2,null)])
  expect(zero.headline?.value).toBe(0);expect(zero.headline?.formatted).toBe('0%');expect(zero.productIndex).toBeNull()
  const missing=make([trial(0,null),trial(1,null),trial(2,null)])
  expect(missing.interpretable).toBe(false);expect(missing.headline).toBeNull();expect(missing.primaryMetrics).toEqual([])
 })

 it('binds experience and research to the new report and their frozen round budgets',()=>{
  for(const [profile,n] of [['experience',3],['research',8]] as const){
   const frozen=executionEntries[1].configSchema.parse({...seeds[1].config,...sharegameRegistryMetaV2.profiles[profile].configPatch}) as typeof config
   expect(frozen.endowments).toHaveLength(n);expect(frozen.report).toEqual({reportVersion:'2.0.0',referenceMode:'none'})
   expect(executionEntries[1].finalSubmission!.maxTrials!(frozen)).toBe(n)
  }
 })

})
