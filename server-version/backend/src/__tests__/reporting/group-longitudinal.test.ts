import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {groupTrackingMetrics,projectGroupLongitudinal,type GroupLongitudinalWave} from '../../modules/reporting/group-longitudinal'
import type {PersonalTrackingPlan} from '../../modules/reporting/personal-tracking'
import {summarizeGroupMetrics} from '../../modules/reporting/group-summary'
const metric={id:'stable-A-total',sourceKey:'slot-A',scoreKey:'total',kind:'SCALE' as const,label:'A total',unit:'raw',measurementHash:'a'.repeat(64)}
const plan:PersonalTrackingPlan={schemaVersion:1,id:randomUUID(),baselineWaveId:'T1',metrics:[metric,{...metric,id:'B-total',sourceKey:'slot-B'}]}
function wave(ordinal:number,values:Array<number|null>,people=values.map((_,i)=>'person'+i)):GroupLongitudinalWave{
 const summary=summarizeGroupMetrics([{key:'total',label:'total',unit:'raw',range:null,type:'NUMBER',measurement:{reportVersion:ordinal,referenceVersion:ordinal}}],values.map((value,i)=>({parentId:people[i],metricKey:'total',value,quality:null,missingReason:null})),people)
 return {id:'T'+ordinal,ordinal,label:'T'+ordinal,metricKeys:{[metric.id]:'total'},populationKeys:people,observedFrom:'2026-10-01T12:00:00Z',observedUntil:'2026-10-02T12:00:00Z',projection:{schemaVersion:1,descriptionVersion:'group-descriptive-v1',title:'A',sourceLabel:'T'+ordinal,tool:{key:'A',title:'A',kind:'SCALE'},cutoff:'2026-10-03T12:00:00Z',populationLabel:'per wave',completedN:people.length,countUnit:'PERSON',assignedN:null,metrics:summary,limitations:[]}}
}
const project=(waves:GroupLongitudinalWave[],selected=metric)=>projectGroupLongitudinal({plan,metrics:[selected],waves})
describe('frozen leaf group longitudinal assembly reuses disclosed wave statistics',()=>{
 it('isolates same-named leaf totals and keeps raw comparison when only P/R provenance changes',()=>{
  expect(groupTrackingMetrics(plan,'slot-A').metrics.map(m=>m.id)).toEqual([metric.id])
  const result=project([wave(1,[0,2]),wave(2,[-2,0,2],['person0','person1','new-person'])])
  expect(result.metrics).toHaveLength(1)
  expect(result.metrics[0].points[1]).toMatchObject({mean:0,validN:3,completedN:3,missingN:0,adjacentDelta:-1,baselineDelta:-1,populationChanged:true})
  expect(JSON.stringify(result)).not.toContain('new-person')
  expect(result.limitations[0]).toContain('不是同一人的平均改变')
 })
 it('preserves null and zero, signed baseline change, and breaks adjacency through missing rounds',()=>{
  const points=project([wave(1,[0]),wave(2,[null]),wave(3,[-2]),wave(5,[4])]).metrics[0].points
  expect(points[0].mean).toBe(0)
  expect(points[1]).toMatchObject({mean:null,validN:0,missingN:1})
  expect(points[2]).toMatchObject({adjacentDelta:null,baselineDelta:-2,intermediateMissing:true})
  expect(points[3]).toMatchObject({adjacentDelta:null,baselineDelta:4,intermediateMissing:true})
 })
 it('retains disclosure suppression and never turns hidden counts or means into zero',()=>{
  const hidden=wave(2,[10]);hidden.projection.completedN=null;hidden.projection.metrics[0]={...hidden.projection.metrics[0],state:'suppressed',validN:null,missingN:null,mean:null}
  expect(project([wave(1,[0]),hidden]).metrics[0].points[1]).toMatchObject({state:'suppressed',mean:null,validN:null,missingN:null,adjacentDelta:null,baselineDelta:null,populationChanged:null})
 })
 it('keeps explicitly disclosed means when source privacy independently hides counts',()=>{
  const waves=[wave(1,[1]),wave(2,[2])]
  for(const current of waves){current.projection.completedN=null;current.projection.metrics[0]={...current.projection.metrics[0],state:'present'}}
  const points=project(waves).metrics[0].points
  expect(points.map(point=>point.mean)).toEqual([1,2])
  expect(points[1]).toMatchObject({state:'present',completedN:null,validN:null,missingN:null,baselineDelta:1,populationChanged:null})
 })
 it('requires actual Cognitive protocol and consistent units; category codes stay categorical',()=>{
  const cognitive={...metric,kind:'COGNITIVE' as const},first=wave(1,[0]),second=wave(2,[1])
  expect(()=>project([first,second],cognitive)).toThrow('实际协议')
  first.protocols={[metric.id]:'experience:protocol-A'};second.protocols={[metric.id]:'research:protocol-B'}
  expect(()=>project([first,second],cognitive)).toThrow('协议不一致')
  second.protocols=first.protocols;expect(project([first,second],cognitive).metrics[0].points[1].mean).toBe(1)
  second.projection.metrics[0].unit='ms';expect(()=>project([first,second])).toThrow('单位')
  second.projection.metrics[0].unit='raw';second.projection.metrics[0].type='SINGLE';expect(()=>project([first,second])).toThrow('类别')
 })
})
