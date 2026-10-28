import fs from 'node:fs'
import assert from 'node:assert/strict'
import {SearchCapture} from '../../../../../server-version/frontend/src/modules/cognitive/tasks/visual-search/capture'
import {createSearchSnapshot} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/visual-search/package'
import {searchPlan,type SearchInput} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/visual-search/protocol'
import {scoreSearch,searchEnvelope} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/visual-search/scorer'
import {projectSearchReport} from '../../../../../server-version/backend/src/modules/cognitive/content-candidates/visual-search/report'

const session=createSearchSnapshot('experience'),randomSeed='search-envelope-quality-review',manifest=searchPlan(session.config,randomSeed)
let clock=100
const records=manifest.slice(0,7).map((plan,index)=>{
 const cap=new SearchCapture(session.config,plan,clock),prompt=clock+800,target=plan.targetCount===0?'none':plan.items.find(i=>i.target)!.id
 const event=(atMs:number,kind:'down'|'up',control:string,token='pointer:1',input:SearchInput='touch',repeat=false,primary=true)=>cap.input({kind,atMs,control,token,input,key:input==='keyboard'?'Space':null,repeat,primary})
 if(index===4)event(clock+100,'down','done','key:Space','keyboard')
 cap.tick(prompt)
 if(index===4){
  event(prompt+10,'up','done','key:Space','keyboard');assert.equal(cap.raw.state.stage,'search')
  event(prompt+20,'down','done','key:Space','keyboard');event(prompt+30,'up','done','key:Space','keyboard')
  event(prompt+31,'up','done','key:Space','keyboard');assert.equal(cap.raw.state.selection,null)
  const eventCount=cap.raw.events.length
  for(let i=0;i<300;i++)event(prompt+32+i,'down',target,'key:Space','keyboard',true)
  assert.equal(cap.raw.events.length,eventCount);assert.equal(cap.raw.ignoredRepeatCount,300)
  event(prompt+400,'down',target);event(prompt+410,'down','none','pointer:2','touch',false,false)
  event(prompt+420,'up','none','pointer:2');event(prompt+430,'up','outside')
  assert.equal(cap.raw.state.selection,null)
  assert.deepEqual(cap.raw.state.ignored,{early:0,repeat:0,multiple:1,held:0,crossStage:1,outside:1})
  cap.tick(prompt+200000);assert.equal(cap.done,false)
  event(prompt+200010,'down',target);event(prompt+200020,'up',target)
 }else{
  const search=[0,300,100,400,0,500,450][index],locate=[0,700,0,100,0,100,100][index]
  event(prompt+search,'down','done');event(prompt+search,'up','done')
  if(index===2)cap.interrupt('blur',prompt+search+50)
  else{
   const selection=index===1?(plan.targetCount===0?plan.items[0].id:'none'):target
   event(prompt+search+locate,'down',selection);event(prompt+search+locate,'up',selection)
  }
 }
 clock=cap.raw.endedAtPerfMs+100
 return cap.raw
})
const trials=records.map(searchEnvelope);trials[3].flags.premature=true;trials[5].flags.timeout=true;trials[6].qualityEvents=['resume']
const input={session,config:session.config,randomSeed,trials},score=scoreSearch(input),report=projectSearchReport(score)
assert.deepEqual([report.received,report.valid,report.correct,report.state],[7,3,2,'limited'])
assert.equal(score.metrics.accuracy,2/3)
// Independently specified eligibility and elapsed times, not values read from scorer output.
const expected=[{index:0,correct:true,search:0,locate:0},{index:1,correct:false,search:300,locate:700},{index:4,correct:true,search:30,locate:199990}]
const median=(a:number[])=>{const s=a.slice().sort((a,b)=>a-b);return !s.length?null:s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2}
for(const [kind,groups] of Object.entries({bySetSize:report.bySetSize,byColour:report.byColour,byTargetCount:report.byTargetCount,conditions:report.conditions}))for(const [key,g] of Object.entries(groups)){
 const matches=(index:number)=>String(kind==='bySetSize'?manifest[index].setSize:kind==='byColour'?manifest[index].targetColour:kind==='byTargetCount'?manifest[index].targetCount:manifest[index].condition)===key
 const usable=expected.filter(r=>matches(r.index)),correct=usable.filter(r=>r.correct)
 assert.equal(g.received,records.filter((_,i)=>matches(i)).length);assert.equal(g.valid,usable.length);assert.equal(g.correct,correct.length);assert.equal(g.correctRTCount,correct.length)
 assert.equal(g.medianSearchMs,median(correct.map(r=>r.search)));assert.equal(g.medianLocateMs,median(correct.map(r=>r.locate)))
}
assert.deepEqual(report.phaseInputs,{search:{touch:2,keyboard:1},locate:{touch:3}})
const zeroReport=projectSearchReport(scoreSearch({...input,trials:trials.slice(0,1)}))
const zeroCell=zeroReport.conditions[manifest[0].condition];assert.deepEqual([zeroCell.medianSearchMs,zeroCell.medianLocateMs],[0,0])
const flagged=structuredClone(trials[0]);flagged.flags.premature=true
const markedOnlyReport=projectSearchReport(scoreSearch({...input,trials:[flagged]}))
assert.deepEqual([markedOnlyReport.received,markedOnlyReport.valid,markedOnlyReport.state],[1,0,'invalid'])
const emptyReport=projectSearchReport(scoreSearch({...input,trials:[]}));assert.equal(emptyReport.state,'invalid')
fs.writeFileSync(new URL('./representative-records.json',import.meta.url),JSON.stringify({synthetic:true,scope:'seven actual SearchCapture records, not a completed 36-trial attempt; markers are injected envelope inconsistencies, not task-generated timeouts',input,expected,score,report,zeroReport,markedOnlyReport,emptyReport},null,2)+'\n')
console.log(JSON.stringify({received:report.received,valid:report.valid,correct:report.correct,state:report.state,bySetSize:report.bySetSize,phaseInputs:report.phaseInputs,markedOnlyState:markedOnlyReport.state,zeroMedians:[zeroCell.medianSearchMs,zeroCell.medianLocateMs]}))
