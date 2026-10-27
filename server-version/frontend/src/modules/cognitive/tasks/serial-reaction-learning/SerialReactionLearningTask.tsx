import React,{useEffect,useLayoutEffect,useReducer,useRef,useState} from 'react'
import {Session} from './session'
import {digest,type Context,type Ports} from './contracts'
import type {Language,Location} from './generated/protocol'
import {Instructions,LOCATION_NAMES} from './Instructions'
import {Report} from './Report'
import './serial-reaction-learning.css'
export interface SerialReactionLearningTaskProps{context:Context;ports:Ports;language?:Language}
/** Independent touch candidate. No product registration or persistence adapter. */
export function SerialReactionLearningTask({context,ports,language=context.language}:SerialReactionLearningTaskProps){
  const [,render]=useReducer(n=>n+1,0),alive=useRef(true),invalid=useRef(false),suppressGestureClick=useRef(false),initial=useRef({digest:digest(context),ports,language})
  const [holder]=useState(()=>{try{if(language!==context.language)throw Error('Teaching language differs from frozen context');return {session:new Session(context,ports,()=>{if(alive.current)render()})}}catch{return {error:true as const}}})
  const s=holder.session,en=language==='en',view=s?.view??'blocked',plan=s?.activePlan
  if(initial.current.digest!==digest(context)||initial.current.ports!==ports||initial.current.language!==language)invalid.current=true
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;queueMicrotask(()=>{if(!alive.current)s?.dispose()})}},[s])
  useEffect(()=>{if(invalid.current)s?.dispose()},[s,context,ports,language])
  useLayoutEffect(()=>{if(s&&view==='presenting'&&!invalid.current)s.expose(performance.now())},[s,view,plan])
  useEffect(()=>{if(!s||view!=='interval'||invalid.current||s.lastRaw?.correctAtMs==null)return;const timer=setTimeout(()=>s.nextAfterInterval(),Math.max(0,s.lastRaw.correctAtMs+s.context.snapshot.config.rsiMs-performance.now()));return()=>clearTimeout(timer)},[s,view,s?.lastRaw])
  useEffect(()=>{if(!s||!['presenting','running','interval'].includes(view)||invalid.current)return
    const hidden=()=>{if(document.hidden)s.stop('visibility-lost',performance.now())},blur=()=>s.stop('window-blur',performance.now()),pagehide=()=>s.stop('page-hidden',performance.now())
    document.addEventListener('visibilitychange',hidden);window.addEventListener('blur',blur);window.addEventListener('pagehide',pagehide)
    return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('blur',blur);window.removeEventListener('pagehide',pagehide)}
  },[s,view])
  const gestureGuards={onPointerDownCapture:(e:React.PointerEvent<HTMLElement>)=>{suppressGestureClick.current=e.pointerType==='touch'&&Boolean((e.target as Element).closest('.srl-grid'))},onClickCapture:(e:React.MouseEvent<HTMLElement>)=>{if(suppressGestureClick.current&&e.detail>0){suppressGestureClick.current=false;e.preventDefault();e.stopPropagation()}}}
  if(!s||invalid.current)return <section className="srl-task" role="alert">{en?'The frozen attempt cannot continue. Keep the page and contact the organiser.':'冻结作答无法继续，请保留本页并联系组织者。'}</section>
  if(view==='report'&&s.receipt)return <div {...gestureGuards}><Report report={s.receipt.report} language={language}/></div>
  const c=s.context.snapshot.config
  return <main className="srl-task" data-srl-view={view} {...gestureGuards}>
    {(view==='intro'||view==='practice-instructions')&&<><Instructions config={c} language={language}/><div className="srl-actions"><button onClick={()=>view==='intro'?void s.prepare():s.begin()}>{view==='intro'?(en?'I understand. Prepare practice':'我明白了，准备练习'):(en?'Start another practice round':'开始下一轮练习')}</button><button className="srl-secondary" onClick={()=>s.endPractice()}>{en?'End this activity':'结束本次活动'}</button></div></>}
    {['practice-ready','formal-ready','break'].includes(view)&&<><h1>{view==='practice-ready'?(en?'Ready for four simple practice taps':'准备四次简单练习'):view==='formal-ready'?(en?'Ready for the formal activity':'准备正式活动'):en?'Rest before the next run':'休息一下，再继续'}</h1><p>{view==='break'?(en?`${s.formalIndex}/${c.totalTrials} trials have been recorded. Continue when ready.`:`已记录 ${s.formalIndex}/${c.totalTrials} 次，准备好再继续。`):(en?'Touch input only. You may stop at any time.':'请用触屏操作，随时可以结束。')}</p><div className="srl-actions"><button onClick={()=>s.begin()}>{en?'Start':'开始'}</button><button className="srl-secondary" onClick={()=>s.phase==='practice'?s.endPractice():s.stop('participant-ended',performance.now())}>{en?'End this activity':'结束本次活动'}</button></div></>}
    {['presenting','running','interval'].includes(view)&&plan&&<><header>{s.phase==='practice'?(en?`Practice ${Math.min(s.practiceIndex+1,4)}/4`:`练习 ${Math.min(s.practiceIndex+1,4)}/4`):(en?`Run ${plan.run+1} · ${plan.position+1}/84`:`第 ${plan.run+1} 轮 · ${plan.position+1}/84`)}</header><h1>{en?'Tap the square with ★':'点 ★ 所在的方格'}</h1><div className="srl-grid" onContextMenu={e=>e.preventDefault()}>{([0,1,2,3] as Location[]).map(location=><button key={location} disabled={view!=='running'} className={view!=='interval'&&location===plan.target?'srl-lit':''} aria-label={LOCATION_NAMES[language][location]} onClick={e=>e.preventDefault()} onPointerDown={e=>{e.preventDefault();if(e.pointerType!=='touch'||!e.isPrimary){s.ignore();return}s.tap(location,performance.now())}}>{view!=='interval'&&location===plan.target?'★':'\u00a0'}</button>)}</div><p>{en?'See it, then tap. Please do not guess ahead.':'看清再点，不要提前猜。'}</p><button className="srl-secondary" onClick={()=>s.phase==='practice'?s.endPractice():s.stop('participant-ended',performance.now())}>{en?'End this activity':'结束本次活动'}</button></>}
    {view==='practice-feedback'&&<><h1>{s.practiceIncomplete?(en?'Practice was incomplete':'练习尚未完成'):s.lastRaw?.firstCorrect?(en?'Your first tap was correct':'首次就点准了'):en?'Your first tap missed the star':'首次没有点到 ★'}</h1><p>{en?'Tap the square containing the star. A correction does not replace your first tap.':'要点 ★ 所在的方格；点错后纠正，不会改写首答。'}</p>{s.practiceRoundFinished&&!s.practicePassed&&<p>{en?'That is okay. Review the full instructions and example before trying another round. There are at most three rounds; you may stop.':'没关系，先一起重看完整说明和例子，再试一组。最多三轮，也可以结束。'}</p>}<div className="srl-actions">{!s.practiceRoundFinished&&<button onClick={()=>s.nextPractice()}>{en?'Next practice tap':'继续练习'}</button>}{s.practicePassed&&<button disabled={s.durableCount!==s.retained.length} onClick={()=>s.acceptPractice()}>{en?'Continue to the formal activity':'进入正式活动'}</button>}{s.practiceRoundFinished&&!s.practicePassed&&s.canRetryPractice&&<button onClick={()=>s.reviewInstructions()}>{en?'Review instructions and example':'重看说明与例子'}</button>}<button className="srl-secondary" onClick={()=>s.endPractice()}>{en?'End practice':'结束练习'}</button></div></>}
    {['preparing','draining'].includes(view)&&<p role="status">{en?'Retaining your records. Please keep this page open.':'正在保留本次记录，请暂时保留本页。'}</p>}
    {view==='retry'&&<><h1>{en?'Records have not yet been confirmed saved':'尚未确认记录已保存'}</h1><p>{en?'The activity is paused. Keep this page open and retry saving the same records. No saved result is claimed yet.':'活动已暂停。请保留本页，重试保存同一份记录；当前尚未确认结果已保存。'}</p><button onClick={()=>void s.retry()}>{en?'Retry saving':'重试保存'}</button></>}
    {view==='blocked'&&<p role="alert">{en?'This attempt could not be prepared. No target was started.':'本次作答尚未准备好，没有开始目标呈现。'}</p>}
    {view==='stopped'&&<p role="status">{en?'Practice has ended. No formal performance result was generated.':'练习已结束，没有生成正式表现结果。'}</p>}
  </main>
}
