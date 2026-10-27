import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {dualConfig,dualPlan,initialDualState,reduceDualEvent,requiredDual,dualFeedbackMs,type DualRaw,type DualPlan,type DualEvent} from '../../modules/cognitive/content-candidates/dual-arrow/protocol'
import {reviewDual} from '../../modules/cognitive/content-candidates/dual-arrow/analysis'
import {createDualSnapshot,dualDefinition} from '../../modules/cognitive/content-candidates/dual-arrow/package'
import {scoreDual,dualEnvelope} from '../../modules/cognitive/content-candidates/dual-arrow/scorer'
import {projectDualReport} from '../../modules/cognitive/content-candidates/dual-arrow/report'
import {createDualPresentation} from '../../modules/cognitive/content-candidates/dual-arrow/participant-presentation'
const seed='approved-dual-content'
function complete(p:DualPlan,start:number,miss=false):DualRaw{const c=dualConfig('experience'),onset=start+p.fixationMs,raw:DualRaw={plan:p,startedAtPerfMs:start,endedAtPerfMs:start,status:'interrupted',stopReason:null,events:[],state:initialDualState(p),ignoredRepeatCount:0,overflow:false},events:DualEvent[]=[{kind:'stimulus',atMs:onset}]
 if(!miss)for(const channel of ['blue','red'] as const){if(!requiredDual(p.mode,channel))continue;const rt=p.mode==='dual'?(channel==='blue'?400:900):(channel==='blue'?500:600);for(const [kind,delta] of [['down',0],['up',10]] as const)events.push({kind,atMs:onset+rt+delta,channel,direction:p[channel],token:'pointer:'+channel,input:'touch',key:null,repeat:false,primary:channel==='blue'})}
 if(miss)events.push({kind:'timeout',atMs:onset+p.deadlineMs});events.sort((a,b)=>a.atMs-b.atMs)
 for(const e of events){reduceDualEvent(raw.state,e,p,c,start);raw.events.push(e)}const finish:DualEvent={kind:'finish',atMs:raw.state.feedbackAtMs!+dualFeedbackMs(raw.state,p,c)};reduceDualEvent(raw.state,finish,p,c,start);raw.events.push(finish);raw.status='complete';raw.endedAtPerfMs=finish.atMs;return raw}
function fixture(profile:'research'|'experience'='experience',miss=false){const session=createDualSnapshot(profile),plan=dualPlan(session.config,seed);let now=100;const trials=plan.map(p=>{const raw=complete(p,now,miss);now=raw.endedAtPerfMs+10;return dualEnvelope(raw)});return {session,config:session.config,randomSeed:seed,trials}}
describe('dual arrows minimal content contracts',()=>{
 it('freezes 300/60 plans, all mode/direction combinations, Latin block orders and only three easier practice trials',()=>{
  for(const [profile,n,blocks,perMode,perCombo] of [['research',300,12,100,25],['experience',60,6,20,5]] as const){const c=dualConfig(profile),plan=dualPlan(c,seed);expect(plan).toHaveLength(n);expect(dualPlan(c,seed)).toEqual(plan);expect(dualPlan(c,seed+'other')).not.toEqual(plan);expect(new Set(plan.map(p=>p.blockIndex)).size).toBe(blocks)
   for(const mode of ['blue','red','dual'] as const){const group=plan.filter(p=>p.mode===mode);expect(group).toHaveLength(perMode);for(const blue of ['left','right'])for(const red of ['left','right'])expect(group.filter(p=>p.blue===blue&&p.red===red)).toHaveLength(perCombo)}
   for(let block=0;block<blocks;block++){const rows=plan.filter(p=>p.blockIndex===block);expect(rows).toHaveLength(c.trialsPerBlock);expect(new Set(rows.map(p=>p.mode)).size).toBe(1);expect(rows.map(p=>p.withinBlock)).toEqual(Array.from({length:c.trialsPerBlock},(_,i)=>i))}
   if(profile==='research')for(let position=0;position<3;position++)expect(new Set([0,1,2].map(cycle=>plan.find(p=>p.cycle===cycle&&p.blockIndex%3===position)!.mode)).size).toBe(3)
   expect(plan.every(p=>p.fixationMs>=300&&p.fixationMs<=799&&p.deadlineMs===5000)).toBe(true);expect(createDualSnapshot(profile).config.totalTrials).toBe(n);expect(createDualPresentation().protocols?.[profile]?.profileLabel).toBe(profile==='research'?'科研版':'实用版')
   const practice=dualPlan(c,seed,'practice');expect(practice.map(p=>p.mode)).toEqual(['blue','red','dual']);expect(practice.every(p=>p.deadlineMs===8000&&p.blue==='left'&&p.red==='right')).toBe(true);expect(c.practice.minimumCorrect).toBe(3)
  }
  expect(()=>dualPlan({...dualConfig('experience'),totalTrials:30},seed)).toThrow();expect(()=>dualPlan(dualConfig('research'),seed,'practice',3)).toThrow()
 })
 it('uses correct per-channel denominators and signed differences, keeping missing and not-required null instead of zero RT',()=>{
  for(const profile of ['research','experience'] as const){const f=fixture(profile),score=scoreDual(f),r=projectDualReport(score);expect(r).toMatchObject({state:'interpretable',valid:f.config.totalTrials,dualTrials:f.config.totalTrials/3,bothCorrectDual:f.config.totalTrials/3});expect(r.differences).toEqual({blueLatencyMs:-100,redLatencyMs:300,blueAccuracy:0,redAccuracy:0});expect(r.groups.blueSingle.medianCorrectMs).toBe(500);expect(r.groups.redDual.medianCorrectMs).toBe(900);expect(Object.keys(score.metrics).every(k=>k in dualDefinition.metrics)).toBe(true)}
  const f=fixture('experience',true),r=projectDualReport(scoreDual(f));expect(r).toMatchObject({state:'limited',valid:60,bothCorrectDual:0});for(const g of Object.values(r.groups))expect(g).toMatchObject({presentedRequired:20,answered:0,missed:20,correct:0,medianCorrectMs:null});expect(r.differences.blueLatencyMs).toBeNull();expect(r.differences.blueAccuracy).toBe(0)
  const single=f.trials.find(t=>t.payload.plan.mode==='blue')!.payload,row=reviewDual(single,single.plan,f.config);expect(row.blue).toMatchObject({required:true,answered:false,correct:false,rtMs:null});expect(row.red).toMatchObject({required:false,answered:false,correct:null,rtMs:null})
 })
 it('retains a completed response window after feedback interruption, rejects unexecuted/forged records and gates unknown report identities',()=>{
  const f=fixture(),raw=structuredClone(f.trials[0].payload);raw.status='interrupted';raw.stopReason='blur';raw.endedAtPerfMs=raw.state.feedbackAtMs!+1;raw.events=raw.events.filter(e=>e.atMs<=raw.endedAtPerfMs);raw.state=initialDualState(raw.plan);for(const e of raw.events)reduceDualEvent(raw.state,e,raw.plan,f.config,raw.startedAtPerfMs)
  expect(projectDualReport(scoreDual({...f,trials:[dualEnvelope(raw)]}))).toMatchObject({state:'limited',received:1,valid:1});expect(projectDualReport(scoreDual({...f,trials:[]}))).toMatchObject({state:'invalid',valid:0})
  const unexecuted=structuredClone(f);unexecuted.trials[0].payload.events=[];unexecuted.trials[0].payload.state=initialDualState(unexecuted.trials[0].payload.plan);expect(()=>scoreDual(unexecuted)).toThrow('claimed complete')
  const guessed=structuredClone(f);guessed.trials[0].payload.state.responses.blue.choice='left';guessed.trials[0].payload.state.responses.blue.atMs=0;expect(()=>scoreDual(guessed)).toThrow('state')
  const key=structuredClone(f);const e=key.trials[0].payload.events.find(e=>e.kind==='down')!;if('input' in e){e.input='keyboard';e.key='Digit7'}expect(()=>scoreDual(key)).toThrow('mapping')
  const plan=structuredClone(f);plan.trials[0].payload.plan.blue=plan.trials[0].payload.plan.blue==='left'?'right':'left';expect(()=>scoreDual(plan)).toThrow('plan');expect(()=>scoreDual({...f,session:{...f.session,engineVersion:'next'}})).toThrow();const score=scoreDual(f);(score.metrics.reportBinding as Record<string,unknown>).reportDefinitionVersion='next';expect(()=>projectDualReport(score)).toThrow()
 })
})
