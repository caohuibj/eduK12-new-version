import {describe,it,expect} from 'vitest'
import {LOGICDEDUCE_BANK_V2 as bank,LOGICDEDUCE_PRACTICE_V2 as practice} from '../../modules/cognitive/tasks/logicdeduce/bank-v2'
import {LOGICDEDUCE_BANK_V2 as frontendBank} from '../../../../frontend/src/modules/cognitive/tasks/logicdeduce/bank-v2'
import {logicdeduceConfigV2Schema} from '../../modules/cognitive/schemas/logicdeduce.config'
import {scoreLogicdeduceV2 as score} from '../../modules/cognitive/scoring/logicdeduce.v2'
const config={totalTrials:36,stimulusSetVersion:'logicdeduce-zh-v2.0.0',fixationMs:400,timeoutMs:15000,validRtFloorMs:300,report:{reportVersion:'2.0.0',referenceMode:'none' as const}}
const trials=bank.map((item,trialIndex)=>({trialIndex,payload:{itemId:item.id,responseIndex:item.answer as number|null,rtMs:500 as number|null,interrupted:false}}))
function permutations<T>(xs:T[]):T[][]{return xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map(rest=>[x,...rest])):[[]]}
describe('logicdeduce audited V2',()=>{
 it('keeps a valid zero accuracy visible while withholding unavailable RT',()=>{
  const result=score({config,trials:trials.map(t=>({...t,payload:{...t.payload,responseIndex:(t.payload.responseIndex!+1)%4}}))})
  expect(score({config,trials:trials.map(t=>({...t,payload:{...t.payload,rtMs:config.timeoutMs}}))}).metrics).toMatchObject({accuracy:0,errorCount:0,timeoutCount:36,medianRtMs:null})
  expect(result.qualityFlags.interpretable).toBe(true);expect(result.metrics.accuracy).toBe(0);expect(result.metrics.medianRtMs).toBeNull()
 })
 it('checks corrected direction, non-entailment and unique constraint solutions',()=>{
  expect(bank[4].options[bank[4].answer]).toBe('小刘') // west: Liu < Zhang < Chen
  const shapes=permutations(['圆形','方形','三角形']).filter(p=>p[0]!=='圆形'&&p.indexOf('方形')<p.indexOf('三角形')&&p[2]!=='三角形')
  expect(shapes).toEqual([['方形','三角形','圆形']]);expect(bank[13].options[bank[13].answer]).toBe(shapes[0][0])
  const seats=permutations(['甲','乙','丙','丁']).filter(p=>p.indexOf('甲')+1===p.indexOf('乙')&&p[3]==='丙'&&Math.abs(p.indexOf('丁')-p.indexOf('丙'))!==1)
  expect(seats).toEqual([['丁','甲','乙','丙']]);expect(bank[24].options[bank[24].answer]).toBe(seats[0][0])
  const possible=[true,false].filter(hasPen=>Number(hasPen)+Number(!hasPen)===1)
  expect(possible).toEqual([true,false]);expect(bank[28].options[bank[28].answer]).toBe('不能确定')
  const box=[1,2,3].filter(n=>n!==1&&(n===2||n===1));expect(box).toEqual([2]);expect(bank[23].options[bank[23].answer]).toBe('2号')
  expect(bank).toEqual(frontendBank);expect(new Set(bank.map(x=>x.id)).size).toBe(36)
  expect(bank.every(x=>new Set(x.options).size===4&&x.explanation.length>0)).toBe(true)
  expect(bank.some(x=>x.id===practice.id||x.stem===practice.stem)).toBe(false)
 })
 it('provides exactly the configured 18/30/36 trials and rejects practice from scoring',()=>{
  for(const totalTrials of [18,30,36]){expect(logicdeduceConfigV2Schema.parse({...config,totalTrials}).totalTrials).toBe(totalTrials);expect(score({config:{...config,totalTrials},trials:trials.slice(0,totalTrials)}).metrics.accuracy).toBe(1)}
  expect(logicdeduceConfigV2Schema.safeParse({...config,totalTrials:37}).success).toBe(false)
  expect(()=>score({config,trials:[{...trials[0],payload:{...trials[0].payload,itemId:practice.id}},...trials.slice(1)]})).toThrow('not in the frozen bank')
 })
 it('distinguishes all-wrong zero from all-timeout and excludes interrupted RT',()=>{
  expect(score({config,trials:trials.map(t=>({...t,payload:{...t.payload,responseIndex:(t.payload.responseIndex!+1)%4}}))}).metrics).toMatchObject({accuracy:0,errorCount:36,timeoutCount:0,medianRtMs:null})
  expect(score({config,trials:trials.map(t=>({...t,payload:{...t.payload,responseIndex:null,rtMs:null}}))}).metrics).toMatchObject({accuracy:0,errorCount:0,timeoutCount:36,medianRtMs:null})
  expect(score({config,trials:trials.map(t=>({...t,payload:{...t.payload,interrupted:true}}))}).metrics).toMatchObject({accuracy:1,validRtCount:0,medianRtMs:null})
  expect(()=>score({config,trials:[]})).toThrow('expects exactly 36 trials')
 })
})
