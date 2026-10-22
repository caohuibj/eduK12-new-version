import {useLayoutEffect,useRef,type ReactNode} from 'react'
import {useScaleTimingLifecycle} from '../modules/scale/useScaleTimingLifecycle'
import {SurveyScaleTimingTracker,type SurveyScaleTimings} from './survey-scale-timing'

export type SurveyTimedScaleUnit={
  instrumentKey:string;title:string
  items:{itemKey:string;prompt:string;required:boolean;responseOptions?:{optionKey:string;label:string}[]}[]
  responseOptions:{optionKey:string;label:string}[]
}
/** One active Scale item at a time; answers and telemetry stay in local memory
 * until the same authoritative Survey FINAL. No per-question HTTP traffic. */
export function SurveyTimedScale({unit,answer,onAnswer,tracker,onTiming,index,onIndexChange,paused=false,readOnly=false,renderMedia,imagesReady=true,autoAdvanceReady=true}:{
  unit:SurveyTimedScaleUnit;answer:Record<string,unknown>
  onAnswer:(itemKey:string,optionKey:string)=>void
  tracker:SurveyScaleTimingTracker
  onTiming:(next:SurveyScaleTimings)=>void
  index:number
  paused?:boolean
  readOnly?:boolean
  imagesReady?:boolean
  autoAdvanceReady?:boolean
  renderMedia?:(itemKey:string)=>ReactNode
  onIndexChange:(index:number)=>void
}){
  const current=unit.items[Math.min(index,unit.items.length-1)]
  const currentKey=current?.itemKey
  const arrowSelection=useRef(false)
  const focusAfterAdvance=useRef(false)
  const itemElement=useRef<HTMLFieldSetElement>(null)
  useScaleTimingLifecycle(tracker,currentKey,paused,readOnly,onTiming)
  useLayoutEffect(()=>{
    if(focusAfterAdvance.current){
      focusAfterAdvance.current=false
      itemElement.current?.focus()
    }
    arrowSelection.current=false
  },[currentKey])
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
    <p className="survey-answer-guide">选择新选项后自动进入下一题，最后一题保留检查与提交入口。键盘方向键仅调整当前选择，请按“下一题”继续；回看时可用“上一题”和“下一题”检查，切换不代表正式提交。</p>
    {!autoAdvanceReady&&<p role="status" className="text-sm">本题视频尚未完整播放，选择会保留在当前题。{index<unit.items.length-1?'请看完视频后按“下一题”继续。':'请看完视频后检查答案，再使用本工具后方的继续或正式提交按钮。'}</p>}
    <progress className="w-full" max={Math.max(1,unit.items.length)}
      value={index+1} aria-label="量表施测进度"/>
    <fieldset key={currentKey} ref={itemElement} id={'survey-answer-'+unit.instrumentKey+'-'+current.itemKey} tabIndex={-1} className="rounded-lg border bg-white p-4 space-y-2"
      onPointerDownCapture={()=>{arrowSelection.current=false}}
      onMouseDownCapture={()=>{arrowSelection.current=false}}
      onClickCapture={event=>{if(event.detail>0)arrowSelection.current=false}}
      onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))arrowSelection.current=false}}
      onKeyUp={()=>{arrowSelection.current=false}}
      onKeyDown={event=>{
        // Media controls keep their native keyboard behavior, including range repeats.
        const target=event.target
        if(target!==event.currentTarget&&!(target instanceof HTMLInputElement&&target.type==='radio'))return
        arrowSelection.current=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)
        if(event.repeat&&(arrowSelection.current||event.key===' '))event.preventDefault()
      }}>
      <legend className="font-medium">{current.prompt}{current.required?' *':''}</legend>
      {renderMedia?.(current.itemKey)}
      {(current.responseOptions??unit.responseOptions).map(option=><label key={option.optionKey}
        className="flex items-start gap-3 rounded border p-3 text-sm min-h-11">
        <input type="radio" name={unit.instrumentKey+'-'+current.itemKey}
          checked={selected===option.optionKey} disabled={paused||readOnly||!imagesReady}
          onChange={()=>{
            if(paused||readOnly||!imagesReady)return
            tracker.answer(current.itemKey,selected,option.optionKey)
            onAnswer(current.itemKey,option.optionKey)
            onTiming(tracker.snapshot())
            if(autoAdvanceReady&&!arrowSelection.current&&index<unit.items.length-1){
              focusAfterAdvance.current=true
              onIndexChange(index+1)
            }
          }}/>
        <span>{option.label}</span>
      </label>)}
    </fieldset>
    <nav aria-label="量表题目导航" className="flex justify-between gap-3">
      <button type="button" className="btn-secondary" disabled={paused||index===0}
        onClick={()=>onIndexChange(Math.max(0,index-1))}>上一题</button>
      <button type="button" className="btn-secondary" disabled={paused||(!readOnly&&!imagesReady)||index>=unit.items.length-1}
        onClick={()=>onIndexChange(Math.min(unit.items.length-1,index+1))}>下一题</button>
    </nav>
    <p className="text-xs text-slate-600">返回修改答案会独立记录修改次数与重访时间；切换后台会标记计时中断。逐题时间不会用于诊断或自动评分。</p>
  </section>
}
