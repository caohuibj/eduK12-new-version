import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {gradConfig,gradPlan,gradPracticePlans,slots,type GradRaw,type GradSlot,type GradEvent} from '../../modules/cognitive/content-candidates/gradcpt/protocol'
import {resolveGrad} from '../../modules/cognitive/content-candidates/gradcpt/assignment'
import {reviewGrad,gradStatistics,inverseNormal} from '../../modules/cognitive/content-candidates/gradcpt/analysis'
import {createGradSnapshot,gradDefinition} from '../../modules/cognitive/content-candidates/gradcpt/package'
import {scoreGrad,gradEnvelope} from '../../modules/cognitive/content-candidates/gradcpt/scorer'
import {projectGradReport} from '../../modules/cognitive/content-candidates/gradcpt/report'
import {createGradPresentation} from '../../modules/cognitive/content-candidates/gradcpt/participant-presentation'
const seed='approved-grad-content'
function complete(plan:GradSlot[],respond:(kind:GradSlot['kind'])=>boolean=kind=>kind==='city'):GradRaw{const raw:GradRaw={plan,startedAtPerfMs:100,endedAtPerfMs:100,status:'complete',stopReason:null,slots:[],frames:[],events:[],overflow:false};let now=100
 for(const p of plan){raw.slots.push({index:p.index,startMs:now,endMs:now+p.durationMs});raw.frames.push({atMs:now,slotIndex:p.index,opacity:0});if(respond(p.kind)){const at=now+p.durationMs*.9;raw.frames.push({atMs:at,slotIndex:p.index,opacity:.9});for(const [type,delta] of [['down',1],['up',2]] as const)raw.events.push({atMs:at+delta,slotIndex:p.index,opacity:.9,type,token:'key:Space',input:'keyboard',repeat:false,primary:true})}now+=p.durationMs}
 raw.frames.push({atMs:now,slotIndex:plan.length-1,opacity:1});raw.endedAtPerfMs=now;return raw}
function fixture(profile:'research'|'experience'='experience',respond?:(kind:GradSlot['kind'])=>boolean){const session=createGradSnapshot(profile),raw=complete(gradPlan(session.config,seed),respond);return {session,config:session.config,randomSeed:seed,trials:[gradEnvelope(raw)]}}
describe('gradCPT minimal content contracts',()=>{
 it('freezes 300/100 real image plans, exact 90/10 short balance, eight easier practice pictures and true versions',()=>{
  for(const [profile,n,city,mountain] of [['research',300,268,32],['experience',100,90,10]] as const){const c=gradConfig(profile),plan=gradPlan(c,seed);expect(plan).toHaveLength(n+2);expect(plan.filter(p=>p.kind==='city')).toHaveLength(city);expect(plan.filter(p=>p.kind==='mountain')).toHaveLength(mountain);expect(new Set(plan.map(p=>p.image)).size).toBe(21);expect(gradPlan(c,seed)).toEqual(plan)
   expect(createGradSnapshot(profile).config.totalTrials).toBe(n);expect(createGradPresentation().protocols?.[profile]?.profileLabel).toBe(profile==='research'?'科研版':'实用版')
   const practice=gradPracticePlans(c,seed,0);expect(practice).toHaveLength(8);expect(practice.filter(p=>p[1].kind==='city')).toHaveLength(6);expect(practice.slice(0,4).every(p=>p.every(s=>s.durationMs===1600))).toBe(true);expect(practice.slice(4).every(p=>p.every(s=>s.durationMs===800))).toBe(true);expect(c.practice.minimumCorrect).toBe(7)
  }
  expect(gradPlan(gradConfig('experience'),seed)).not.toEqual(gradPlan(gradConfig('experience'),seed+'other'));expect(()=>gradPlan({...gradConfig('experience'),totalTrials:75},seed)).toThrow();expect(()=>gradPracticePlans(gradConfig('research'),seed,3)).toThrow()
 })
 it('preserves exact opacity boundaries, late ownership and code4 chronological reassignment with known signed statistics',()=>{
  for(const [prevKind,currentKind,op,target,code] of [['city','city',.399999,1,1],['city','mountain',.4,1,5],['city','city',.6,1,8],['city','city',.600001,2,7],['boundary','mountain',.8,2,10],['city','mountain',.800001,2,2]] as const){
   const plan=slots([prevKind==='boundary'?'scrambled.png':'city1.png',currentKind==='mountain'?'mountain1.png':'city2.png']),raw=complete(plan,()=>false),at=raw.slots[2].startMs+op*800
   raw.events=[{atMs:at,slotIndex:2,opacity:op,type:'down',token:'key:Space',input:'keyboard',repeat:false,primary:true}];expect(resolveGrad(raw,plan).assigned[target]?.code).toBe(code)
  }
  const plan=slots(['city1.png','city2.png']),raw=complete(plan,()=>false),start=raw.slots[2].startMs
  const event=(op:number,type:'down'|'up'):GradEvent=>({atMs:start+op*800,slotIndex:2,opacity:op,type,token:'key:Space',input:'keyboard',repeat:false,primary:true})
  raw.events=[event(.7,'down'),event(.72,'up'),event(.8,'down')];const a=resolveGrad(raw,plan).assigned;expect(a[1]).toMatchObject({eventIndex:0,code:4,atMs:start+560,rtMs:1360});expect(a[2]).toMatchObject({eventIndex:2,code:4,rtMs:640});expect(raw.events[0].atMs).toBe(start+560)
  expect(inverseNormal(.5)).toBe(0);expect(inverseNormal(.975)).toBeCloseTo(1.95996398,6)
  for(const profile of ['research','experience'] as const){const f=fixture(profile),score=scoreGrad(f),r=projectGradReport(score);expect(r.state).toBe('interpretable');expect(r.statistics).toMatchObject({omissions:0,falseAlarms:0,medianMs:721,sdMs:0,cv:0});expect(r.statistics.dPrime).toBeGreaterThan(0);expect(Object.keys(score.metrics).every(k=>k in gradDefinition.metrics)).toBe(true)}
  const noResponse=projectGradReport(scoreGrad(fixture('experience',()=>false)));expect(noResponse.state).toBe('interpretable');expect(noResponse.statistics.meanMs).toBeNull();expect(noResponse.statistics.dPrime).toBeLessThan(0)
  expect(projectGradReport(scoreGrad(fixture('experience',k=>k!=='boundary'))).statistics.criterion).toBeLessThan(0)
 })
 it('keeps only actually exposed settled windows, rejects forged plans/paint/versions and gates empty records',()=>{
  const f=fixture(),raw=structuredClone(f.trials[0].payload),end=raw.slots[5].startMs+100;raw.status='interrupted';raw.stopReason='blur';raw.endedAtPerfMs=end;raw.slots=raw.slots.slice(0,6);raw.slots[5].endMs=null;raw.frames=raw.frames.filter(fr=>fr.atMs<=end);raw.events=raw.events.filter(e=>e.atMs<=end)
  const r=projectGradReport(scoreGrad({...f,trials:[gradEnvelope(raw)]}));expect(r.state).toBe('limited');expect(r.statistics.city+r.statistics.mountain).toBe(3);expect(r.presented).toBe(4)
  expect(projectGradReport(scoreGrad({...f,trials:[]})).state).toBe('invalid')
  const plan=structuredClone(f);plan.trials[0].payload.plan[1].image='city99.png';expect(()=>scoreGrad(plan)).toThrow('plan')
  const paint=structuredClone(f);paint.trials[0].payload.events[0].opacity=.1;expect(()=>scoreGrad(paint)).toThrow('displayed frame')
  const incomplete=structuredClone(f);incomplete.trials[0].payload.slots.pop();expect(()=>scoreGrad(incomplete)).toThrow('claimed complete')
  expect(()=>scoreGrad({...f,session:{...f.session,scoringVersion:'next'}})).toThrow();const score=scoreGrad(f);(score.metrics.reportBinding as Record<string,unknown>).reportDefinitionVersion='next';expect(()=>projectGradReport(score)).toThrow()
  expect(gradStatistics(reviewGrad(complete(slots(['city1.png']),()=>false),slots(['city1.png']))).correctedFalseAlarmRate).toBeNull()
 })
})
