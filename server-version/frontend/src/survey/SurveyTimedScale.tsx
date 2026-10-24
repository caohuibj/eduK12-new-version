import {useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react'
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
  const navigationId=useId()
  const [navigationOpen,setNavigationOpen]=useState(false)
  const [feedback,setFeedback]=useState<{from:number;to:number;label:string}|null>(null)
  const current=unit.items[Math.min(index,unit.items.length-1)]
  const currentKey=current?.itemKey
  const arrowSelection=useRef(false)
  const focusAfterAdvance=useRef(false)
  const itemElement=useRef<HTMLFieldSetElement>(null)
  const navigationButton=useRef<HTMLButtonElement>(null)
  useScaleTimingLifecycle(tracker,currentKey,paused,readOnly,onTiming)
  useLayoutEffect(()=>{
    if(focusAfterAdvance.current){
      focusAfterAdvance.current=false
      itemElement.current?.focus({preventScroll:true})
    }
    arrowSelection.current=false
  },[currentKey])
  if(!current)return <section className="rounded border p-4">
    <h3>{unit.title}</h3><p role="alert">此量表没有可作答的冻结题目。</p>
  </section>
  const hasAnswer=(itemKey:string)=>Object.prototype.hasOwnProperty.call(answer,itemKey)&&
    typeof answer[itemKey]==='string'&&answer[itemKey]!==''
  const answeredCount=unit.items.filter(item=>hasAnswer(item.itemKey)).length
  const selected=hasAnswer(current.itemKey)?String(answer[current.itemKey]):undefined
  const nextUnanswered=unit.items.map((_,offset)=>(index+offset+1)%unit.items.length)
    .find(candidate=>candidate!==index&&!hasAnswer(unit.items[candidate].itemKey))
  const moveTo=(next:number)=>{
    setNavigationOpen(false)
    if(next===index){itemElement.current?.focus({preventScroll:true});return}
    focusAfterAdvance.current=true
    onIndexChange(next)
  }
  const continueUnanswered=()=>{
    if(paused||readOnly||!imagesReady||!autoAdvanceReady||!selected||nextUnanswered===undefined)return
    setFeedback({from:index,to:nextUnanswered,label:String(selected)})
    moveTo(nextUnanswered)
  }
  const choose=(optionKey:string)=>{
    if(paused||readOnly||!imagesReady)return
    tracker.answer(current.itemKey,selected,optionKey)
    onAnswer(current.itemKey,optionKey)
    onTiming(tracker.snapshot())
    if(autoAdvanceReady&&!arrowSelection.current&&nextUnanswered!==undefined){
      setFeedback({from:index,to:nextUnanswered,label:optionKey})
      moveTo(nextUnanswered)
    }else setFeedback({from:index,to:index,label:optionKey})
  }
  return <section className="rounded-xl border p-4 my-5 space-y-4 survey-answer-panel survey-scale-experience"
    aria-label={'逐题施测：'+unit.title}>
    <div className="survey-scale-heading"><div>
      <h3>{unit.title}</h3>
    </div><span className="survey-scale-count"><strong>{String(index+1).padStart(2,'0')}</strong> / {String(unit.items.length).padStart(2,'0')}</span></div>
    <div className="survey-scale-progress-row">
      <div className="survey-scale-progress"><div><span>作答进度</span><span>已答 {answeredCount} / {unit.items.length}</span></div>
        <progress max={Math.max(1,unit.items.length)} value={answeredCount} aria-label="量表作答进度"/>
      </div>
      <button type="button" ref={navigationButton} className="survey-scale-navigator" aria-expanded={navigationOpen} aria-controls={navigationId}
        disabled={paused} onClick={()=>setNavigationOpen(open=>!open)}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z" stroke="currentColor" strokeWidth="1.5"/></svg>
        题目导航
      </button>
    </div>
    {navigationOpen&&<nav id={navigationId} className="survey-scale-question-map" aria-label="本量表已答题导航" onKeyDown={event=>{if(event.key==='Escape'){setNavigationOpen(false);navigationButton.current?.focus()}}}>
      <div className="survey-scale-map-heading"><span>回看已答题目</span><button type="button" aria-label="关闭题目导航" onClick={()=>{setNavigationOpen(false);navigationButton.current?.focus()}}>收起</button></div>
      <div className="survey-scale-question-grid">{unit.items.map((item,itemIndex)=><button key={item.itemKey} type="button"
        aria-label={'第 '+(itemIndex+1)+' 题'+(hasAnswer(item.itemKey)?'，已作答':'，未作答')}
        aria-current={itemIndex===index?'step':undefined} disabled={paused||!hasAnswer(item.itemKey)}
        onClick={()=>{setFeedback(null);moveTo(itemIndex)}}>{String(itemIndex+1).padStart(2,'0')}{hasAnswer(item.itemKey)&&<span aria-hidden="true">✓</span>}</button>)}</div>
      <p>仅可回看本量表已作答的题目。</p>
    </nav>}
    <div className="survey-scale-feedback" role="status" aria-label="作答反馈" aria-live="polite" aria-atomic="true">
      {feedback&&feedback.to===index
        ?<span key={feedback.from+':'+feedback.to+':'+feedback.label} className="survey-scale-feedback-confirmed"><span aria-hidden="true">✓</span> 第 {feedback.from+1} 题已作答{feedback.to!==feedback.from?' · 已切换至第 '+(index+1)+' 题':answeredCount===unit.items.length?' · 本部分已全部作答':''}</span>
        :<span>选择后自动进入下一道未答题</span>}
    </div>
    {!autoAdvanceReady&&<p role="status" className="text-sm">请先看完本题视频，完成后可继续未答题；全部作答后请使用下方的继续或提交按钮。</p>}
    <fieldset key={currentKey} ref={itemElement} id={'survey-answer-'+unit.instrumentKey+'-'+current.itemKey} tabIndex={-1} className="survey-scale-question"
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
        if(event.key==='Enter'){event.preventDefault();continueUnanswered()}
      }}>
      <legend><span className="survey-scale-question-label">第 {index+1} 题{current.required?' · 必答':''}</span><span>{current.prompt}</span></legend>
      {renderMedia?.(current.itemKey)}
      {(current.responseOptions??unit.responseOptions).map(option=><label key={option.optionKey}
        className={'survey-scale-option'+(selected===option.optionKey?' is-selected':'')}>
        <input type="radio" name={unit.instrumentKey+'-'+current.itemKey}
          checked={selected===option.optionKey} disabled={paused||readOnly||!imagesReady}
          onClick={event=>{
            if(event.detail>0&&selected===option.optionKey)continueUnanswered()
          }}
          onChange={()=>choose(option.optionKey)}/>
        <span>{option.label}</span><span className="survey-scale-option-mark" aria-hidden="true">{selected===option.optionKey?'✓':''}</span>
      </label>)}
    </fieldset>
    {selected&&nextUnanswered!==undefined&&!readOnly&&<button type="button" className="survey-scale-resume"
      disabled={paused||!imagesReady||!autoAdvanceReady} onClick={continueUnanswered}>继续未答题 <span aria-hidden="true">→</span></button>}
  </section>
}
