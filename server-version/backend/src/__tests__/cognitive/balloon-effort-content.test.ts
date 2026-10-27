import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {effortConfig,effortPlan,earnedPoints,type EffortRaw,type Side} from '../../modules/cognitive/content-candidates/balloon-effort/protocol'
import {createBalloonEffortSnapshot,balloonEffortDefinition} from '../../modules/cognitive/content-candidates/balloon-effort/package'
import {scoreBalloonEffort,effortEnvelope} from '../../modules/cognitive/content-candidates/balloon-effort/scorer'
import {projectEffortReport} from '../../modules/cognitive/content-candidates/balloon-effort/report'
import {createBalloonEffortPresentation} from '../../modules/cognitive/content-candidates/balloon-effort/participant-presentation'
const seed='effort-approved-content'
function fixture(profile:'research'|'experience'='experience',none=false){const session=createBalloonEffortSnapshot(profile),plan=effortPlan(session.config,seed);let now=100
 const trials=plan.map((p,index)=>{const start=now,prob=start+1000,frame=prob+1000,offers=frame+700,choice=offers+1500,choiceEnd=choice+(none?6500:1000),prepare=none?null:choiceEnd,execution=none?null:choiceEnd+3000,
  high=index%2===0,side:Side=high?p.highSide:p.highSide==='left'?'right':'left',count=high?Math.round(p.highGoal*1.2):20,
  endExecution=none?null:execution!+(high?25000:count*50+25),feedback=endExecution??choiceEnd,cumulative=feedback+1000,end=cumulative+1000
 now=end
 const key=side==='left'?'key:KeyQ':'key:KeyP'
 const raw:EffortRaw={plan:p,status:'complete',stopReason:null,startedAtPerfMs:start,endedAtPerfMs:end,onsets:{iti:start,probability:prob,frame,offers,choice,prepare,execution,feedback,cumulative},choiceEndMs:choiceEnd,
  choice:none?null:{side,input:'keyboard',key,downAtMs:choice+100,upAtMs:choiceEnd},choiceOutcome:none?'no_response':'selected',executionEndMs:endExecution,executionResult:none?null:high?'window_elapsed':'target_reached',
  presses:none?[]:Array.from({length:count},(_,i)=>({side,input:'keyboard' as const,key,downAtMs:execution!+(i+1)*50,upAtMs:execution!+(i+1)*50+25})),
  reward:none?null:p.rewardAvailable?(high?Math.round(p.highReward*count/p.highGoal*100)/100:1):0,
  ignored:{early:0,held:0,wrongSide:0,late:0,multiplePointer:0},eventOverflow:false}
 return effortEnvelope(raw)})
 return {session,config:session.config,randomSeed:seed,trials}
}
describe('balloon effort minimal critical contracts',()=>{
 it('freezes 72/18 complete conditions, counterbalances sides/outcomes and replays the exact seed',()=>{
  for(const [profile,total,repeats] of [['research',72,4],['experience',18,1]] as const){const c=effortConfig(profile),plan=effortPlan(c,seed)
   expect(plan).toHaveLength(total);expect(effortPlan(c,seed)).toEqual(plan);expect(effortPlan(c,seed+'other')).not.toEqual(plan)
   expect(new Set(plan.map(p=>p.conditionKey)).size).toBe(18);for(const p of plan)expect(plan.filter(x=>x.conditionKey===p.conditionKey)).toHaveLength(repeats)
   expect(plan.filter(p=>p.highSide==='left')).toHaveLength(total/2);expect(plan.filter(p=>p.probability===1).every(p=>p.rewardAvailable)).toBe(true)
   const chanceWins=plan.filter(p=>p.probability===0.5&&p.rewardAvailable).length;expect(profile==='research'?chanceWins===18:chanceWins===4||chanceWins===5).toBe(true)
   expect(createBalloonEffortSnapshot(profile).config.totalTrials).toBe(total);expect(createBalloonEffortPresentation().protocols?.[profile]?.profileLabel).toBe(profile==='research'?'科研版':'实用版')
   expect(effortPlan(c,seed,'practice').map(p=>[p.forced,p.lowGoal,p.highGoal,p.executionMs])).toEqual([['low',5,10,5000],['high',5,10,5000]])
  }
  expect(()=>effortPlan({...effortConfig('experience'),totalTrials:9},seed)).toThrow();expect(()=>effortPlan(effortConfig('experience'),seed,'practice',3)).toThrow()
 })
 it('keeps proportional/bonus rewards, low completion, natural zero and no-choice null distinct',()=>{
  const p={...effortPlan(effortConfig('experience'),seed)[0],highGoal:100,highReward:5,rewardAvailable:true,highSide:'right' as const}
  expect(earnedPoints(p,'right',80,true)).toBe(4);expect(earnedPoints(p,'right',120,true)).toBe(6);expect(earnedPoints(p,'right',0,true)).toBe(0)
  expect(earnedPoints(p,'left',20,true)).toBe(1);expect(earnedPoints(p,'left',19,true)).toBe(0);expect(earnedPoints(p,null,0,false)).toBeNull();expect(earnedPoints({...p,rewardAvailable:false},'right',120,true)).toBe(0)
  for(const profile of ['research','experience'] as const){const f=fixture(profile),score=scoreBalloonEffort(f),report=projectEffortReport(score);expect(report.state).toBe('interpretable');expect(report.valid).toBe(f.config.totalTrials);expect(report.high).toBe(f.config.totalTrials/2);expect(report.executionCount).toBe(f.config.totalTrials)
   expect(Object.keys(score.metrics).every(k=>k in balloonEffortDefinition.metrics)).toBe(true);expect(report.executionByInput.keyboard.trials).toBe(f.config.totalTrials)
  }
 })
 it('retains a genuine choice if execution is interrupted and refuses forged offers, clocks and report versions',()=>{
  const f=fixture(),first=structuredClone(f.trials[0].payload);first.status='interrupted';first.stopReason='blur';first.endedAtPerfMs=first.onsets.prepare!+1;first.onsets.execution=null;first.onsets.feedback=null;first.onsets.cumulative=null;first.executionEndMs=null;first.executionResult=null;first.presses=[];first.reward=null
  const partial=projectEffortReport(scoreBalloonEffort({...f,trials:[effortEnvelope(first)]}));expect(partial).toMatchObject({state:'limited',valid:1,executionCount:0,totalPresses:null,knownTaskPoints:null})
  const none=projectEffortReport(scoreBalloonEffort(fixture('experience',true)));expect(none).toMatchObject({state:'invalid',valid:0,noChoice:18,totalPresses:null,knownTaskPoints:null})
  const bad=structuredClone(f);bad.trials[0].payload.plan.rewardAvailable=!bad.trials[0].payload.plan.rewardAvailable;expect(()=>scoreBalloonEffort(bad)).toThrow('offer')
  const reward=structuredClone(f);reward.trials[0].payload.reward=999;expect(projectEffortReport(scoreBalloonEffort(reward)).state).toBe('limited')
  expect(()=>scoreBalloonEffort({...f,session:{...f.session,engineVersion:'9.0.0'}})).toThrow('Unsupported exact')
  const score=scoreBalloonEffort(f);(score.metrics.reportBinding as Record<string,unknown>).reportDefinitionVersion='next';expect(()=>projectEffortReport(score)).toThrow()
 })
})
