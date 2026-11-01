import {describe,it,expect} from 'vitest'
import { COGEST_BANK as bank } from '../../modules/cognitive/tasks/cogest/bank-v1.1'
import { scoreCogestV11 as score } from '../../modules/cognitive/scoring/cogest.v1.1'
import { cogestConfigV11Schema as schema } from '../../modules/cognitive/tasks/cogest/config-v1.1'
import {buildCogestItems as build,COGEST_PRACTICE_ITEM as practice} from '../../../../frontend/src/modules/cognitive/tasks/cogest/prng-v1.1'
import { COGEST_BANK as front } from '../../../../frontend/src/modules/cognitive/tasks/cogest/bank-v1.1'
const config=(n:number)=>({totalTrials:n,stimulusSetVersion:'cogest-zh-v1.1.0',fixationMs:400,timeoutMs:15000,validRtFloorMs:300,report:{reportVersion:'1.1.0',referenceMode:'none' as const}})
const trials=bank.map((x,i)=>({trialIndex:i,payload:{itemId:x.id,responseIndex:x.answer as number|null,rtMs:500 as number|null,interrupted:false}}))
describe('cogest 1.1.0 frozen form',()=>{
 it('has 36 distinct explained items, identical client material and disjoint practice',()=>{
  expect(bank).toHaveLength(36);expect(new Set(bank.map(x=>x.id)).size).toBe(36);expect(front).toEqual(bank)
  expect(bank.some(x=>x.id===practice.id||x.stem===practice.stem)).toBe(false)
  for(const x of bank){expect(new Set(x.options).size).toBe(4);expect(x.sourceUrl.startsWith('https://')).toBe(true);const matches=x.optionIntervals.flatMap(([lo,hi],i)=>x.referenceValue>=lo&&x.referenceValue<=hi?[i]:[]);expect(matches).toEqual([x.answer]);expect(x.options.join(' ')).not.toMatch(/\de[+-]\d/i);if(x.auditRange){for(const value of x.auditRange)expect(x.optionIntervals.flatMap(([lo,hi],i)=>value>=lo&&value<=hi?[i]:[])).toEqual([x.answer])}expect(x.explanation.length).toBeGreaterThan(5)}
 })
 it('presents exactly 18/30/36 unique deterministic items and refuses silent truncation',()=>{
  for(const n of [18,30,36]){expect(schema.parse(config(n)).totalTrials).toBe(n);expect(build('seed',n)).toHaveLength(n);expect(new Set(build('seed',n).map(x=>x.itemId)).size).toBe(n);expect(build('seed',n)).toEqual(build('seed',n));expect(build('seed',n).some(x=>x.itemId===practice.id)).toBe(false)}
  expect(()=>build('seed',37)).toThrow();expect(()=>schema.parse(config(37))).toThrow()
 })
 it('scores all 36 candidate answers and preserves meaningful zero vs no valid RT',()=>{
  expect(score({config:config(36),trials}).metrics.accuracy).toBe(1)
  const wrong=trials.map(x=>({...x,payload:{...x.payload,responseIndex:(x.payload.responseIndex!+1)%4}}))
  const r=score({config:config(36),trials:wrong});expect(r.metrics.accuracy).toBe(0);expect(r.metrics.medianRtMs).toBe(null);expect(r.metrics.timeoutCount).toBe(0);expect(r.qualityFlags.interpretable).toBe(true)
  const omitted=trials.map(x=>({...x,payload:{...x.payload,responseIndex:null,rtMs:null}}));expect(score({config:config(36),trials:omitted}).metrics.timeoutCount).toBe(36)
 })
 it('rejects incomplete duplicate unknown and historical-bank submissions; excludes interrupted/late RT',()=>{
  expect(()=>score({config:config(36),trials:trials.slice(1)})).toThrow()
  expect(()=>score({config:config(36),trials:trials.map(x=>({...x,payload:trials[0].payload}))})).toThrow()
  expect(()=>score({config:{...config(36),stimulusSetVersion:'cogest-zh-v1.0.0'},trials})).toThrow()
  expect(()=>score({config:config(1),trials:[{trialIndex:0,payload:{...trials[0].payload,itemId:'unknown'}}]})).toThrow()
  expect(()=>score({config:config(1),trials:[{...trials[0],payload:{...trials[0].payload,rtMs:16000}}]})).toThrow()
  const r=score({config:config(1),trials:[{...trials[0],payload:{...trials[0].payload,interrupted:true,rtMs:500}}]});expect(r.metrics.medianRtMs).toBe(null);expect(r.qualityFlags.interrupted).toBe(true)
 })
})

it('synthetic fixtures remain exact scorer inputs and outputs for the current 36 candidates',async()=>{const fixtures=await import('../../modules/cognitive/tasks/cogest/fixtures/1.1.0-1.1.0.json');for(const c of fixtures.default.cases)expect(score({...c.input,config:schema.parse(c.input.config)})).toEqual(c.expected)})
