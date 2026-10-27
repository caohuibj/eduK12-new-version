import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {blinkConfig,blinkPlan,emptyBlinkAnswers,applyBlinkAction,type BlinkRaw,type BlinkPlan,type BlinkAction} from '../../modules/cognitive/content-candidates/attentional-blink/protocol'
import {reviewBlink} from '../../modules/cognitive/content-candidates/attentional-blink/analysis'
import {createBlinkSnapshot,blinkDefinition} from '../../modules/cognitive/content-candidates/attentional-blink/package'
import {scoreBlink,blinkEnvelope} from '../../modules/cognitive/content-candidates/attentional-blink/scorer'
import {projectBlinkReport} from '../../modules/cognitive/content-candidates/attentional-blink/report'
import {createBlinkPresentation} from '../../modules/cognitive/content-candidates/attentional-blink/participant-presentation'
const seed='approved-blink-content'
function complete(plan:BlinkPlan,start:number,answers:[string|null,string|null]):BlinkRaw{const fixation=start+100,first=fixation+800,response=first+plan.stream.length*plan.soaMs,raw:BlinkRaw={plan,startedAtPerfMs:start,endedAtPerfMs:response+30,status:'complete',stopReason:null,fixationAtMs:fixation,responseAtMs:response,exposures:[],frames:[{atMs:start,stage:'pre',letterIndex:null,cue:false},{atMs:fixation,stage:'fixation',letterIndex:null,cue:false}],actions:[],answer:emptyBlinkAnswers(),ignored:{early:0,repeat:0,unready:0},overflow:false}
 for(let i=0;i<plan.stream.length;i++){const onset=first+i*plan.soaMs,offset=onset+plan.letterMs;raw.exposures.push({index:i,onsetMs:onset,offsetMs:offset});raw.frames.push({atMs:onset,stage:'letter',letterIndex:i,cue:i===plan.t1Index||i===plan.t2Index},{atMs:offset,stage:'blank',letterIndex:i,cue:false})}
 raw.frames.push({atMs:response,stage:'response',letterIndex:null,cue:false})
 for(const target of [0,1] as const){const a:BlinkAction={atMs:response+(target+1)*10,kind:answers[target]===null?'forget':'letter',target,letter:answers[target],input:'touch',key:null};raw.actions.push(a);applyBlinkAction(raw.answer,a)}
 const confirm:BlinkAction={atMs:response+30,kind:'confirm',target:1,letter:null,input:'touch',key:null};raw.actions.push(confirm);applyBlinkAction(raw.answer,confirm);return raw}
function fixture(profile:'research'|'experience'='experience',mode:'perfect'|'known'|'forget'='perfect'){const session=createBlinkSnapshot(profile),plan=blinkPlan(session.config,seed),counts:Record<string,number>={};let now=100
 const trials=plan.map(p=>{const rank=counts[p.lag]??0;counts[p.lag]=rank+1;const t1=mode==='known'&&p.lag===2&&rank>=5?p.stream[(p.t1Index+1)%26]:p.stream[p.t1Index],t2=mode==='known'&&p.lag===2&&![0,1,2,5,6,7,8].includes(rank)?p.stream[(p.t2Index+1)%26]:p.stream[p.t2Index],raw=complete(p,now,mode==='forget'?[null,null]:[t1,t2]);now=raw.endedAtPerfMs+20;return blinkEnvelope(raw)})
 return {session,config:session.config,randomSeed:seed,trials}}
describe('attentional blink minimal content contracts',()=>{
 it('freezes all 25 conditions in 200/50 profiles, seed replay, no repeated stream letters and six easier trials',()=>{
  for(const [profile,n,repeats] of [['research',200,8],['experience',50,2]] as const){const c=blinkConfig(profile),plan=blinkPlan(c,seed);expect(plan).toHaveLength(n);expect(blinkPlan(c,seed)).toEqual(plan);expect(blinkPlan(c,seed+'other')).not.toEqual(plan);expect(new Set(plan.map(p=>p.condition)).size).toBe(25)
   for(const p of plan){expect(plan.filter(x=>x.condition===p.condition)).toHaveLength(repeats);expect(new Set(p.stream).size).toBe(26);expect(p.t2Index-p.t1Index).toBe(p.lag);expect(p.stream[p.t1Index]).not.toBe(p.stream[p.t2Index])}
   expect(createBlinkSnapshot(profile).config.totalTrials).toBe(n);expect(createBlinkPresentation().protocols?.[profile]?.profileLabel).toBe(profile==='research'?'科研版':'实用版')
   const practice=blinkPlan(c,seed,'practice');expect(practice).toHaveLength(6);expect(practice.filter(p=>p.lag===4)).toHaveLength(3);expect(practice.every(p=>p.stream.length===12&&p.soaMs===250&&p.letterMs===150&&p.t2Index<12)).toBe(true);expect(c.practice.minimumCorrect).toBe(5)
  }
  expect(()=>blinkPlan({...blinkConfig('experience'),totalTrials:25},seed)).toThrow();expect(()=>blinkPlan(blinkConfig('research'),seed,'practice',3)).toThrow()
 })
 it('uses T1-correct denominators, exact order and signed position errors, keeping explicit forgotten answers distinct from incomplete trials',()=>{
  const f=fixture('experience','known'),score=scoreBlink(f),r=projectBlinkReport(score);expect(r.state).toBe('interpretable');expect(r).toMatchObject({valid:50,t1Correct:45,t2Correct:47,bothCorrect:43});expect(r.byLag['2']).toMatchObject({planned:10,valid:10,t1Correct:5,t2Correct:7,bothCorrect:3,t2GivenT1:.6})
  for(const profile of ['research','experience'] as const){const p=projectBlinkReport(scoreBlink(fixture(profile)));expect(p.valid).toBe(p.planned);expect(p.bothCorrect).toBe(p.planned)}expect(Object.keys(score.metrics).every(k=>k in blinkDefinition.metrics)).toBe(true)
  const first=f.trials[0].payload,targets:[string,string]=[first.plan.stream[first.plan.t1Index],first.plan.stream[first.plan.t2Index]],reverse=complete(first.plan,100,[targets[1],targets[0]]),review=reviewBlink(reverse,first.plan,f.config);expect(review).toMatchObject({valid:true,t1:false,t2:false,t1Offset:first.plan.lag,t2Offset:-first.plan.lag})
  const duplicate=reviewBlink(complete(first.plan,100,[targets[0],targets[0]]),first.plan,f.config);expect(duplicate).toMatchObject({valid:true,t1:true,t2:false})
  const forgotten=projectBlinkReport(scoreBlink(fixture('experience','forget')));expect(forgotten).toMatchObject({state:'limited',valid:50,t1Correct:0,forgotTargets:100});expect(Object.values(forgotten.byLag).every(g=>g.t2GivenT1===null)).toBe(true)
 })
 it('refuses missing exposures, target/frame tampering, unconfirmed or forged answers and unknown report identities',()=>{
  const f=fixture(),raw=structuredClone(f.trials[0].payload),end=raw.exposures[2].onsetMs+10;raw.status='interrupted';raw.stopReason='blur';raw.endedAtPerfMs=end;raw.responseAtMs=null;raw.exposures=raw.exposures.slice(0,3);raw.exposures[2].offsetMs=null;raw.frames=raw.frames.filter(fr=>fr.atMs<=end);raw.actions=[];raw.answer=emptyBlinkAnswers()
  expect(projectBlinkReport(scoreBlink({...f,trials:[blinkEnvelope(raw)]}))).toMatchObject({state:'invalid',received:1,valid:0});expect(projectBlinkReport(scoreBlink({...f,trials:[]})).state).toBe('invalid')
  const cue=structuredClone(f);cue.trials[0].payload.frames.find(fr=>fr.stage==='letter')!.cue=!cue.trials[0].payload.frames.find(fr=>fr.stage==='letter')!.cue;expect(()=>scoreBlink(cue)).toThrow('target/phase')
  const unexecuted=structuredClone(f);unexecuted.trials[0].payload.exposures.pop();expect(()=>scoreBlink(unexecuted)).toThrow();const forged=structuredClone(f);forged.trials[0].payload.answer.answers[0]='!';expect(()=>scoreBlink(forged)).toThrow()
  const untouched=complete(f.trials[0].payload.plan,100,[null,null]);untouched.actions=[];untouched.answer=emptyBlinkAnswers();expect(()=>scoreBlink({...f,trials:[blinkEnvelope(untouched)]})).toThrow('claimed complete')
  expect(()=>scoreBlink({...f,session:{...f.session,engineVersion:'next'}})).toThrow();const score=scoreBlink(f);(score.metrics.reportBinding as Record<string,unknown>).reportDefinitionVersion='next';expect(()=>projectBlinkReport(score)).toThrow()
 })
})
