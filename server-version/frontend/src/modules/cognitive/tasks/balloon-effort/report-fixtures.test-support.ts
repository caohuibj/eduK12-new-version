import {createBalloonEffortSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/balloon-effort/package'
import {scoreBalloonEffort,effortEnvelope} from '../../../../../../backend/src/modules/cognitive/content-candidates/balloon-effort/scorer'
import {projectEffortReport} from '../../../../../../backend/src/modules/cognitive/content-candidates/balloon-effort/report'
import {effortPlan,type EffortRaw} from './generated/protocol'
import {EffortCapture} from './capture'

/** Synthetic UI examples, produced through the real capture, scorer and public projection. */
export function effortReportFixtures(){
 const snapshot=createBalloonEffortSnapshot('experience'),randomSeed='onboarding-effort-report-20261028',plans=effortPlan(snapshot.config,randomSeed)
 let clock=100
 const raws:EffortRaw[]=plans.map((p,index)=>{
  const cap=new EffortCapture(snapshot.config,p,clock),start=clock
  for(const delta of [1000,2000,2700,4200])cap.tick(start+delta)
  const side=p.highGoal===50||p.highGoal===200&&index%2===0?p.highSide:p.highSide==='left'?'right':'left'
  const key=side==='left'?'key:KeyQ':'key:KeyP'
  cap.down(start+4300,key,side,'keyboard');cap.up(start+4310,key);cap.tick(start+7310)
  const onset=cap.raw.onsets.execution!
  for(let i=0;i<(side===p.highSide?p.highGoal:20);i++){
   cap.down(onset+100+i*50,key,side,'keyboard');cap.up(onset+125+i*50,key)
  }
  if(cap.stage==='execution')cap.tick(onset+25000)
  const feedback=cap.raw.onsets.feedback!
  cap.tick(feedback+1000);cap.tick(feedback+2000);clock=feedback+2100
  return cap.raw
 })
 const project=(records:EffortRaw[])=>projectEffortReport(scoreBalloonEffort({session:snapshot,config:snapshot.config,randomSeed,trials:records.map(effortEnvelope)}))
 return {complete:project(raws),limited:project(raws.slice(0,1)),invalid:project([]),raws}
}
