import {describe,it,expect} from 'vitest'
import {scoreEmbeddedfiguresV2} from '../../modules/cognitive/scoring/embeddedfigures.v2'
import {embeddedfiguresItemV2} from '../../modules/cognitive/tasks/embeddedfigures/generator.v2'
import {embeddedfiguresV2Meta} from '../../modules/cognitive/tasks/embeddedfigures/definitions'
import {participantPresentations} from '../../modules/cognitive/tasks/embeddedfigures/participant-presentation'
import {buildCognitiveSingleTaskReport} from '../../modules/cognitive/single-task-report'
import type {FrozenReportSnapshot} from '../../modules/cognitive/profile-freeze'
import type {EmbeddedfiguresTrial} from '../../modules/cognitive/schemas/embeddedfigures.trial'
import {seeds} from '../../modules/cognitive/tasks/embeddedfigures/seeds'
const base={totalTrials:4,stimulusSetVersion:'embeddedfigures-zh-v1.1.0',showTargetMs:3000,timeoutMs:15000,validRtFloorMs:400,report:{reportVersion:'1.1.0',referenceMode:'none' as const}}
const trial=(i:number,id:string|null,rt:number|null=900)=>({trialIndex:i,payload:{itemIndex:i,clickedShapeId:id,rtMs:rt,interrupted:false} as EmbeddedfiguresTrial})
const correct=(n:number)=>Array.from({length:n},(_,i)=>trial(i,embeddedfiguresItemV2('fixture',i).targetId))
describe('embedded figures1.1 stimulus to frozen report',()=>{
 it.each(['experience','research'] as const)('scores the exact %s count with one shared geometry/protocol and no reference norm',profile=>{
  const n=embeddedfiguresV2Meta.profiles[profile].configPatch.totalTrials!,config={...base,totalTrials:n}
  expect(n).toBe(profile==='experience'?6:16)
  const result=scoreEmbeddedfiguresV2({config,randomSeed:'fixture',trials:correct(n)})
  expect(result.metrics).toEqual({accuracy:1,medianRtMs:900,errorCount:0,timeoutCount:0,validRtCount:n})
  expect(result.score).toBe(100);expect(seeds[0].config.report.referenceMode).toBe('none')
 })
 it('preserves real zero accuracy, zero-latency choice and missing timeouts as different facts in the report',()=>{
  const wrong=Array.from({length:4},(_,i)=>trial(i,embeddedfiguresItemV2('fixture',i).targetId==='s0'?'s1':'s0',0))
  const zero=scoreEmbeddedfiguresV2({config:base,randomSeed:'fixture',trials:wrong})
  const timeout=scoreEmbeddedfiguresV2({config:base,randomSeed:'fixture',trials:wrong.map(t=>trial(t.trialIndex,null,null))})
  expect(zero.metrics).toMatchObject({accuracy:0,errorCount:4,timeoutCount:0,medianRtMs:null})
  expect(timeout.metrics).toMatchObject({accuracy:0,errorCount:0,timeoutCount:4,medianRtMs:null})
  const frozen:FrozenReportSnapshot={...embeddedfiguresV2Meta,profile:'experience',reportCaveats:[],presentationVersion:'1.1.0',participantPresentation:participantPresentations[1]}
  const report=buildCognitiveSingleTaskReport({testType:'embeddedfigures',engineVersion:'1.1.0',scoringVersion:'1.1.0',configVersion:'1.1.0',profile:'experience',frozenReport:frozen,...zero,reference:null})!
  expect(report.headline?.value).toBe(0);expect(report.headline?.formatted).toBe('0%')
  expect(report.productIndex).toBeNull();expect(report.showProductIndex).toBe(false)
  expect(report.primaryMetrics.find(m=>m.key==='medianRtMs')?.value).toBeNull()
  expect(report.practicalTips).not.toContain('顶点数量是关键：目标永远是三角形。')
 })
 it('rejects empty, duplicate, foreign-stimulus and impossible choice facts; interruption remains explicit',()=>{
  const rows=correct(4)
  for(const trials of [[],[rows[0],rows[0],rows[2],rows[3]],[trial(0,'unknown'),...rows.slice(1)],[trial(0,'s0',15000),...rows.slice(1)]])expect(()=>scoreEmbeddedfiguresV2({config:base,randomSeed:'fixture',trials})).toThrow()
  expect(()=>scoreEmbeddedfiguresV2({config:{...base,stimulusSetVersion:'embeddedfigures-zh-v1.0.0'},randomSeed:'fixture',trials:rows})).toThrow()
  rows[0].payload.interrupted=true
  expect(scoreEmbeddedfiguresV2({config:base,randomSeed:'fixture',trials:rows}).qualityFlags.interrupted).toBe(true)
 })
})
