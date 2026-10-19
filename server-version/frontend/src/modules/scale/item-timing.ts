import {elapsedScaleResponseTimeMs,readScaleTimingNow} from './response-timing'

/** Observed browser foreground exposure; not proof of cognitive processing. */
export type SurveyScaleItemTimingV1={
  schemaVersion:1
  firstResponseMs:number|null
  activeTimeMs:number
  changeCount:number
  revisitCount:number
  visits:number
  interrupted:boolean
  recoveredWithoutClock:boolean
}
export type SurveyScaleTimings=Record<string,SurveyScaleItemTimingV1>
export type SurveyWaveScaleTimings=Record<string,SurveyScaleTimings>
const MAX_MS=24*60*60*1000
const MAX_COUNT=10000
const fresh=():SurveyScaleItemTimingV1=>({
  schemaVersion:1,firstResponseMs:null,activeTimeMs:0,changeCount:0,
  revisitCount:0,visits:0,interrupted:false,recoveredWithoutClock:false,
})
const boundedMs=(n:number)=>Math.min(MAX_MS,Math.max(0,Math.round(n)))
export const emptyRecoveredTiming=():SurveyScaleItemTimingV1=>({
  ...fresh(),recoveredWithoutClock:true,interrupted:true,
})

/** Local-only per-instrument timer. It never posts at each question. */
export class SurveyScaleTimingTracker {
  private rows:SurveyScaleTimings
  private current:string|null=null
  private start:number|null=null
  constructor(restored:SurveyScaleTimings={},private readonly initialAnswers:Record<string,unknown>={}){
    // A reload interrupts only an unknown *in-progress* first response.
    // Finished historical questions were not active at reload; marking every
    // restored answer interrupted would contaminate the research export.
    this.rows=Object.fromEntries(Object.entries(restored).map(([key,value])=>[
      key,{...value,interrupted:value.interrupted||value.firstResponseMs===null},
    ]))
  }
  private row(key:string):SurveyScaleItemTimingV1{
    if(!Object.prototype.hasOwnProperty.call(this.rows,key)){
      // A key such as `constructor` is legal, but {}[key] is inherited.
      // Only an actual saved choice means the first-response clock was lost.
      this.rows[key]=Object.prototype.hasOwnProperty.call(this.initialAnswers,key)
        &&this.initialAnswers[key]!==undefined?emptyRecoveredTiming():fresh()
    }
    return this.rows[key]
  }
  private flush(now:number){
    if(this.current!==null&&this.start!==null){
      const row=this.row(this.current)
      row.activeTimeMs=boundedMs(row.activeTimeMs+
        elapsedScaleResponseTimeMs(this.start,now))
      this.start=now
    }
  }
  enter(key:string,visible=true,now=readScaleTimingNow()){
    if(key===this.current)return
    this.leave(now)
    const row=this.row(key)
    if(row.visits>0)row.revisitCount=Math.min(MAX_COUNT,row.revisitCount+1)
    row.visits=Math.min(MAX_COUNT,row.visits+1)
    this.current=key
    this.start=visible?now:null
    if(!visible)row.interrupted=true
  }
  answer(key:string,previous:unknown,next:unknown,now=readScaleTimingNow()){
    if(this.current!==key)return
    const wasRecording=this.start!==null
    this.flush(now)
    const row=this.row(key)
    if(previous===undefined&&row.firstResponseMs===null&&!row.recoveredWithoutClock){
      if(wasRecording)row.firstResponseMs=row.activeTimeMs
      else{
        // An answer when the page is hidden/unfocused has no defensible
        // measured reaction interval. Never manufacture a 0ms observation.
        row.recoveredWithoutClock=true
        row.interrupted=true
      }
    }
    if(previous!==undefined&&previous!==next)
      row.changeCount=Math.min(MAX_COUNT,row.changeCount+1)
  }
  /** Stop a sealed submission clock without inventing a tab interruption or revisit. */
  pause(now=readScaleTimingNow()){
    this.flush(now)
    this.start=null
  }
  suspend(now=readScaleTimingNow()){
    this.pause(now)
    if(this.current!==null)this.row(this.current).interrupted=true
  }
  resume(now=readScaleTimingNow()){
    if(this.current!==null&&this.start===null)this.start=now
  }
  leave(now=readScaleTimingNow()){
    this.flush(now)
    this.current=null
    this.start=null
  }
  snapshot(now=readScaleTimingNow()):SurveyScaleTimings{
    this.flush(now)
    return Object.fromEntries(Object.entries(this.rows).map(([key,value])=>[key,{...value}]))
  }
}
/** A recovered answer without historical timing remains explicitly unknown. */
export function sealSurveyScaleTimings(
  itemKeys:readonly string[],answers:Record<string,unknown>,records:SurveyScaleTimings,
):SurveyScaleTimings{
  return Object.fromEntries(itemKeys.filter(key=>
    Object.prototype.hasOwnProperty.call(answers,key)&&answers[key]!==undefined).map(key=>[
    key,Object.prototype.hasOwnProperty.call(records,key)?records[key]:emptyRecoveredTiming(),
  ]))
}
/** Optional collection never synthesizes an observation for an unmeasured item. */
export function sealObservedScaleTimings(itemKeys:readonly string[],answers:Record<string,unknown>,records:SurveyScaleTimings):SurveyScaleTimings{
 return Object.fromEntries(itemKeys.filter(key=>Object.prototype.hasOwnProperty.call(answers,key)&&answers[key]!==undefined&&Object.prototype.hasOwnProperty.call(records,key)).map(key=>[key,{...records[key]}]))
}
