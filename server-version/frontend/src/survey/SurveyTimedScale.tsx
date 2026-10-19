import {useScaleTimingLifecycle} from '../modules/scale/useScaleTimingLifecycle'
import {SurveyScaleTimingTracker,type SurveyScaleTimings} from './survey-scale-timing'

export type SurveyTimedScaleUnit={
  instrumentKey:string;title:string
  items:{itemKey:string;prompt:string;required:boolean}[]
  responseOptions:{optionKey:string;label:string}[]
}
/** One active Scale item at a time; answers and telemetry stay in local memory
 * until the same authoritative Survey FINAL. No per-question HTTP traffic. */
export function SurveyTimedScale({unit,answer,onAnswer,tracker,onTiming,index,onIndexChange,paused=false,readOnly=false}:{
  unit:SurveyTimedScaleUnit;answer:Record<string,unknown>
  onAnswer:(itemKey:string,optionKey:string)=>void
  tracker:SurveyScaleTimingTracker
  onTiming:(next:SurveyScaleTimings)=>void
  index:number
  paused?:boolean
  readOnly?:boolean
  onIndexChange:(index:number)=>void
}){
  const current=unit.items[Math.min(index,unit.items.length-1)]
  const currentKey=current?.itemKey
  useScaleTimingLifecycle(tracker,currentKey,paused,readOnly,onTiming)
  if(!current)return <section className="rounded border p-4">
    <h3>{unit.title}</h3><p role="alert">此量表没有可作答的冻结题目。</p>
  </section>
  const selected=Object.prototype.hasOwnProperty.call(answer,current.itemKey)
    ?answer[current.itemKey]:undefined
  return <section className="rounded-xl border bg-slate-50 p-4 my-5 space-y-4 survey-answer-panel"
    aria-label={'逐题施测：'+unit.title}>
    <h3 className="text-lg font-semibold">{unit.title}</h3>
    <p className="text-sm text-slate-600" role="status">
      第 {index+1} / {unit.items.length} 题 · 本量表逐题呈现，并记录本次作答的浏览器时间
    </p>
    <p className="survey-answer-guide">请选择符合实际情况的一项。可用“上一题”和“下一题”检查答案；切换题目不代表正式提交。</p>
    <progress className="w-full" max={Math.max(1,unit.items.length)}
      value={index+1} aria-label="量表施测进度"/>
    <fieldset className="rounded-lg border bg-white p-4 space-y-2">
      <legend className="font-medium">{current.prompt}{current.required?' *':''}</legend>
      {unit.responseOptions.map(option=><label key={option.optionKey}
        className="flex items-start gap-3 rounded border p-3 text-sm min-h-11">
        <input type="radio" name={unit.instrumentKey+'-'+current.itemKey}
          checked={selected===option.optionKey} disabled={paused||readOnly}
          onChange={()=>{
            tracker.answer(current.itemKey,selected,option.optionKey)
            onAnswer(current.itemKey,option.optionKey)
            onTiming(tracker.snapshot())
          }}/>
        <span>{option.label}</span>
      </label>)}
    </fieldset>
    <nav aria-label="量表题目导航" className="flex justify-between gap-3">
      <button type="button" className="btn-secondary" disabled={paused||index===0}
        onClick={()=>onIndexChange(Math.max(0,index-1))}>上一题</button>
      <button type="button" className="btn-secondary" disabled={paused||index>=unit.items.length-1}
        onClick={()=>onIndexChange(Math.min(unit.items.length-1,index+1))}>下一题</button>
    </nav>
    <p className="text-xs text-slate-600">返回修改答案会独立记录修改次数与重访时间；切换后台会标记计时中断。逐题时间不会用于诊断或自动评分。</p>
  </section>
}
