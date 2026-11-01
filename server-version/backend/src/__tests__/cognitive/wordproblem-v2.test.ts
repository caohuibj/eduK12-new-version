import {describe,it,expect} from 'vitest'
import {WORDPROBLEM_BANK_V2 as bank,WORDPROBLEM_PRACTICE_V2 as practice} from '../../modules/cognitive/tasks/wordproblem/bank-v2'
import {WORDPROBLEM_BANK_V2 as frontendBank} from '../../../../frontend/src/modules/cognitive/tasks/wordproblem/bank-v2'
import {wordproblemConfigV2Schema} from '../../modules/cognitive/schemas/wordproblem.config'
import {scoreWordproblemV2 as score} from '../../modules/cognitive/scoring/wordproblem.v2'
const config={totalTrials:36,stimulusSetVersion:'wordproblem-zh-v2.0.0',fixationMs:400,timeoutMs:15000,validRtFloorMs:300,report:{reportVersion:'2.0.0',referenceMode:'none' as const}}
const trials=bank.map((item,trialIndex)=>({trialIndex,payload:{itemId:item.id,responseIndex:item.answer as number|null,rtMs:500 as number|null,interrupted:false}}))
describe('wordproblem audited V2',()=>{
 it('keeps a valid zero accuracy visible while withholding unavailable RT',()=>{
  const result=score({config,trials:trials.map(t=>({...t,payload:{...t.payload,responseIndex:(t.payload.responseIndex!+1)%4}}))})
  expect(score({config,trials:trials.map(t=>({...t,payload:{...t.payload,rtMs:config.timeoutMs}}))}).metrics).toMatchObject({accuracy:0,errorCount:0,timeoutCount:36,medianRtMs:null})
  expect(result.qualityFlags.interpretable).toBe(true);expect(result.metrics.accuracy).toBe(0);expect(result.metrics.medianRtMs).toBeNull()
 })
 it('audits numerical answers, including cuts and transfer of grain',()=>{
  const calculations=[60*10,4*3+3*2,24/6,180/3*5,200*.8,4/(1/3),2*(8+5),35-12+8,20/200*100,900/(55+65),6/(4-1)*(7-1),60/(1-5/8),1/(1/10+1/15),3.14*(6**2-5**2),null,35-(94-35*2)/2,24/(2/5-1/4),12*2/(5-3)*5,120/(20+4),25/125*100,84/3+1,null,60*1.25,45-18,25+15,5*4*3,(70+80+90)/3,56/7+1,Math.ceil(53/8),3*50000/100000,120/(60/30+60/60),(36/2-6)*6,1/(1/6-1/9),12/3*10-12/4*12,null,150*1.2]
  calculations.forEach((expected,index)=>{if(expected!==null)expect(parseFloat(bank[index].options[bank[index].answer]),bank[index].id).toBeCloseTo(expected,8)})
  expect(bank[14].options[bank[14].answer]).toBe('比原价低');expect(1.1*.9).toBeLessThan(1)
  expect(bank[21].options[bank[21].answer]).toBe('3/8');expect(bank[34].options[bank[34].answer]).toBe('3/5')
  expect(bank).toEqual(frontendBank);expect(new Set(bank.map(x=>x.id)).size).toBe(36)
  expect(bank.every(x=>new Set(x.options).size===4&&x.explanation.length>0)).toBe(true)
  expect(bank.some(x=>x.id===practice.id||x.stem===practice.stem)).toBe(false)
 })
 it('scores the 18/30/36 configured trials without silently truncating',()=>{
  for(const totalTrials of [18,30,36]){const c={...config,totalTrials};expect(wordproblemConfigV2Schema.parse(c).totalTrials).toBe(totalTrials);expect(score({config:c,trials:trials.slice(0,totalTrials)}).metrics).toMatchObject({accuracy:1,validRtCount:totalTrials,timeoutCount:0})}
  expect(wordproblemConfigV2Schema.safeParse({...config,totalTrials:37}).success).toBe(false)
 })
 it('keeps option zero, measured zero RT, timeout and missing submission distinct',()=>{
  const allWrong=trials.map(t=>({...t,payload:{...t.payload,responseIndex:(t.payload.responseIndex!+1)%4}}))
  expect(score({config,trials:allWrong}).metrics).toMatchObject({accuracy:0,errorCount:36,timeoutCount:0,medianRtMs:null})
  expect(score({config,trials:trials.map(t=>({...t,payload:{...t.payload,responseIndex:null,rtMs:null}}))}).metrics).toMatchObject({accuracy:0,errorCount:0,timeoutCount:36,medianRtMs:null})
  expect(score({config,trials:trials.map(t=>({...t,payload:{...t.payload,rtMs:0}}))}).metrics).toMatchObject({accuracy:1,timeoutCount:0,validRtCount:0,medianRtMs:null})
  expect(()=>score({config,trials:[]})).toThrow('expects exactly 36 trials')
  expect(()=>score({config,trials:[{...trials[0],payload:{...trials[0].payload,itemId:practice.id}},...trials.slice(1)]})).toThrow('not in the frozen bank')
 })
})
