import {describe,it,expect} from 'vitest'
import {createSearchSnapshot} from '../../modules/cognitive/content-candidates/visual-search/package'
import {searchPlan,initialSearchState,reduceSearchEvent,type SearchRaw,type SearchEvent} from '../../modules/cognitive/content-candidates/visual-search/protocol'
import {scoreSearch,searchEnvelope} from '../../modules/cognitive/content-candidates/visual-search/scorer'
import {projectSearchReport} from '../../modules/cognitive/content-candidates/visual-search/report'

function fixture(count=1){
 const session=createSearchSnapshot('experience'),randomSeed='search-envelope-quality-review'
 const trials=searchPlan(session.config,randomSeed).slice(0,count).map((plan,index)=>{
 const offset=index*3000
 const control=plan.targetCount===0?'none':plan.items.find(i=>i.target)!.id
 const events:SearchEvent[]=[{kind:'reveal',atMs:900}]
 for(const [atMs,kind,id] of [[1800,'down','done'],[1900,'up','done'],[2300,'down',control],[2400,'up',control]] as const)events.push({kind,atMs,control:id,token:'pointer:1',input:'touch',key:null,repeat:false,primary:true})
 const raw:SearchRaw={plan,startedAtPerfMs:100,endedAtPerfMs:2400,status:'complete',stopReason:null,events,state:initialSearchState(),ignoredRepeatCount:0,overflow:false}
 raw.startedAtPerfMs+=offset;raw.endedAtPerfMs+=offset
 for(const event of events){event.atMs+=offset;reduceSearchEvent(raw.state,event,plan,session.config,raw.startedAtPerfMs)}
 return searchEnvelope(raw)})
 return {session,config:session.config,randomSeed,trials}
}
describe('visual search envelope quality denominators',()=>{
 it('retains a normal correct completion and both distinct phase times',()=>{
  const report=projectSearchReport(scoreSearch(fixture()))
  expect(report).toMatchObject({state:'limited',received:1,valid:1,correct:1})
  expect(Object.values(report.conditions).find(g=>g.valid)).toMatchObject({correctRTCount:1,medianSearchMs:1000,medianLocateMs:500})
 })
 it.each(['timeout','premature','qualityEvent'] as const)('excludes an existing %s marker from accuracy, both RTs and both input denominators',marker=>{
  const input=fixture(),envelope=input.trials[0]
  if(marker==='qualityEvent')envelope.qualityEvents=['resume'];else envelope.flags[marker]=true
  const score=scoreSearch(input),report=projectSearchReport(score)
  expect(score.metrics.validTrialCount).toBe(0)
  expect(score.metrics.accuracy).toBeNull()
  expect(report).toMatchObject({state:'invalid',received:1,valid:0,correct:0,phaseInputs:{search:{},locate:{}}})
  for(const groups of [report.bySetSize,report.byColour,report.byTargetCount,report.conditions])for(const group of Object.values(groups))expect(group).toMatchObject({valid:0,correct:0,correctRTCount:0,medianSearchMs:null,medianLocateMs:null})
 })
 it.each(['timeout','premature','qualityEvent'] as const)('keeps the unaffected trial in a mixed record with one %s marker',marker=>{
  const input=fixture(2),envelope=input.trials[1]
  if(marker==='qualityEvent')envelope.qualityEvents=['resume'];else envelope.flags[marker]=true
  const score=scoreSearch(input),report=projectSearchReport(score)
  expect(score.metrics.accuracy).toBe(1)
  expect(report).toMatchObject({state:'limited',received:2,valid:1,correct:1,phaseInputs:{search:{touch:1},locate:{touch:1}}})
  expect(report.conditions[input.trials[0].condition!]).toMatchObject({received:1,valid:1,correct:1,correctRTCount:1,medianSearchMs:1000,medianLocateMs:500})
  expect(report.conditions[envelope.condition!]).toMatchObject({received:1,valid:0,correct:0,correctRTCount:0,medianSearchMs:null,medianLocateMs:null})
 })
})
