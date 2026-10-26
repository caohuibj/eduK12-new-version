import { MOT_MAX_FRAMES, motHitIds, motPosition, summarizeMotFrames,
  type MotCalibration, type MotConfig, type MotInput, type MotPlan, type MotPoint, type MotTrial } from './generated/protocol'

export type MotStage = 'fixation' | 'cue' | 'motion' | 'hold' | 'response' | 'complete'
export interface MotRawFrames { schemaVersion: 1; trialIndex: number; motionFrameTimesMs: number[] }
/** Task-owned state machine. tick() receives the actual requestAnimationFrame clock. */
export class MotCapture {
  stage: MotStage = 'fixation'
  readonly frames: number[] = []
  private overflow = false
  readonly trial: MotTrial
  constructor(readonly config: MotConfig, readonly plan: MotPlan, readonly calibration: MotCalibration, now: number) {
    this.trial = { recordOrigin:'live',phase:'test',trialIndex:plan.trialIndex,blockIndex:plan.blockIndex,speed:plan.speed,
      targetIds:[...plan.targetIds],initialObjects:plan.objects.map(o=>({...o})),
      startedAtPerfMs:now,cueStartedAtPerfMs:null,motionStartedAtPerfMs:null,motionEndedAtPerfMs:null,
      responseStartedAtPerfMs:null,endedAtPerfMs:now,completionTimeMs:0,
      frameTiming:summarizeMotFrames([]),calibration:{...calibration},responses:[],
      prematureInputs:0,missedInputs:0,ambiguousInputs:0,interactionEvents:[],interactionOverflow:false,interruptions:[],timedOut:false }
  }
  tick(now: number): MotStage {
    const t=this.trial,c=this.config
    // One actual transition per paint: a background pause must not fabricate past presentations.
    if(this.stage==='fixation'&&now-t.startedAtPerfMs>=c.fixationMs){t.cueStartedAtPerfMs=now;this.stage='cue'}
    else if(this.stage==='cue'&&now-t.cueStartedAtPerfMs!>=c.cueMs){t.motionStartedAtPerfMs=now;this.stage='motion'}
    else if(this.stage==='motion'&&now-t.motionStartedAtPerfMs!>=c.motionMs){t.motionEndedAtPerfMs=now;this.stage='hold'}
    else if(this.stage==='hold'&&now-t.motionEndedAtPerfMs!>=c.postMotionMs){t.responseStartedAtPerfMs=now;this.stage='response'}
    if(this.stage==='motion'){
      if(this.frames.length<MOT_MAX_FRAMES)this.frames.push(now-t.motionStartedAtPerfMs!)
      else this.overflow=true
    }
    return this.stage
  }
  position(id: number, now: number): MotPoint {
    const elapsed=this.stage==='fixation'||this.stage==='cue'?0:
      this.stage==='motion'?now-this.trial.motionStartedAtPerfMs!:this.config.motionMs
    return motPosition(this.plan.objects[id],elapsed,this.config)
  }
  select(point: MotPoint, input: MotInput, now: number, keyboardId?: number): boolean {
    if(this.stage==='complete')return false
    if(this.stage!=='response'){this.trial.prematureInputs++;this.log('premature',now,input);return false}
    const selected=this.trial.responses.map(r=>r.objectId)
    const hits=motHitIds(this.plan,point,this.config,selected)
    if(!hits.length){this.trial.missedInputs++;this.log('miss',now,input);return false}
    if(hits.length>1&&input!=='keyboard'){this.trial.ambiguousInputs++;this.log('ambiguous',now,input);return false}
    const id=input==='keyboard'?keyboardId:hits[0]
    if(id===undefined||!hits.includes(id)){this.trial.missedInputs++;this.log('miss',now,input);return false}
    this.trial.responses.push({...point,objectId:id,atPerfMs:now,input})
    if(this.trial.responses.length===this.config.targetCount)this.finish(now)
    return true
  }
  interrupt(reason: MotTrial['interruptions'][number], now: number) {
    if(this.stage==='complete')return
    if(!this.trial.interruptions.includes(reason))this.trial.interruptions.push(reason)
    this.log('interruption',now,null)
    this.finish(now)
  }
  private log(type:MotTrial['interactionEvents'][number]['type'],atPerfMs:number,input:MotInput|null){
    if(this.trial.interactionEvents.length<128)this.trial.interactionEvents.push({type,atPerfMs,input})
    else this.trial.interactionOverflow=true
  }
  private finish(now: number) {
    this.trial.endedAtPerfMs=now;this.trial.completionTimeMs=now-this.trial.startedAtPerfMs
    this.trial.frameTiming=summarizeMotFrames(this.frames,this.overflow);this.stage='complete'
  }
  record(): {core: MotTrial; raw: MotRawFrames} {
    if(this.stage!=='complete')throw new Error('MOT record is not complete')
    return {core:structuredClone(this.trial),raw:{schemaVersion:1,trialIndex:this.plan.trialIndex,motionFrameTimesMs:[...this.frames]}}
  }
}
