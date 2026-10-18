import {useEffect,useRef} from 'react'
import {type SurveyScaleTimingTracker,type SurveyScaleTimings} from './item-timing'
export function useScaleTimingLifecycle(tracker:SurveyScaleTimingTracker,currentKey:string|undefined,paused:boolean,readOnly:boolean,onTiming:(next:SurveyScaleTimings)=>void){
  const timingCallback=useRef(onTiming)
  timingCallback.current=onTiming
  const pausedState=useRef(paused)
  pausedState.current=paused||readOnly
  useEffect(()=>{
    if(paused||readOnly)tracker.pause()
    else if(document.visibilityState!=='hidden'&&document.hasFocus())tracker.resume()
  },[paused,readOnly,tracker])
  useEffect(()=>{
    // Reviewing locked prerequisites is navigation, not another administration.
    if(!currentKey||readOnly)return
    tracker.enter(currentKey,!pausedState.current&&document.visibilityState!=='hidden'&&document.hasFocus())
    timingCallback.current(tracker.snapshot())
    const suspend=()=>{tracker.suspend();timingCallback.current(tracker.snapshot())}
    const resume=()=>{
      if(!pausedState.current&&document.visibilityState!=='hidden'&&document.hasFocus())tracker.resume()
      timingCallback.current(tracker.snapshot())
    }
    const visibility=()=>document.visibilityState==='hidden'?suspend():resume()
    document.addEventListener('visibilitychange',visibility)
    window.addEventListener('pagehide',suspend)
    window.addEventListener('blur',suspend)
    window.addEventListener('focus',resume)
    return ()=>{
      document.removeEventListener('visibilitychange',visibility)
      window.removeEventListener('pagehide',suspend)
      window.removeEventListener('blur',suspend)
      window.removeEventListener('focus',resume)
      tracker.leave()
      timingCallback.current(tracker.snapshot())
    }
  },[currentKey,readOnly,tracker])
}
