import {useState,type ReactNode} from 'react'
import {SurveyScaleTimingTracker,type SurveyScaleTimings} from './item-timing'
import {useScaleTimingLifecycle} from './useScaleTimingLifecycle'
/** Mounted inside media gates: a hidden/loading stimulus does not start a clock. */
export function TrainingTimingBoundary({tracker,itemKey,locked,onTiming,children}:{tracker:SurveyScaleTimingTracker;itemKey:string;locked:boolean;onTiming:(rows:SurveyScaleTimings)=>void;children:ReactNode}){
 const [paused,setPaused]=useState(false)
 useScaleTimingLifecycle(tracker,itemKey,paused||locked,locked,onTiming)
 return <><p className="text-sm" role="status">本次已启用浏览器有效前台时间记录（毫秒），仅作描述，不用于评分或判断认真程度。</p><button type="button" className="btn-secondary" disabled={locked} onClick={()=>setPaused(value=>!value)}>{paused?'继续作答与计时':'暂停作答与计时'}</button><fieldset disabled={paused||locked} className="border-0 p-0 m-0">{children}</fieldset></>
}
export function restoreTrainingTiming(metadata:Record<string,unknown>|undefined,snapshotHash:string):SurveyScaleTimings{
 const saved=metadata?.trainingScaleTiming as {snapshotHash?:unknown;items?:SurveyScaleTimings}|undefined
 return saved?.snapshotHash===snapshotHash&&saved.items&&typeof saved.items==='object'?saved.items:{}
}
