import React,{useEffect,useLayoutEffect,useReducer,useRef,useState} from 'react'
import {NumberSeriesSession} from './session'
import {digest,type NumberSeriesContext,type NumberSeriesPorts} from './contracts'
import {keyChoice,type InputMode} from './generated/protocol'
import type {Language} from './generated/report'
import {NumberSeriesInstructions,practiceExplanation} from './NumberSeriesInstructions'
import {NumberSeriesReport} from './NumberSeriesReport'
import './number-series.css'
export interface NumberSeriesTaskProps {context:NumberSeriesContext;ports:NumberSeriesPorts;language?:Language}
/** Independent candidate: the product host and its durable ports are deliberately not registered here. */
export function NumberSeriesTask({context,ports,language=context.language}:NumberSeriesTaskProps) {
  const [,render]=useReducer(n=>n+1,0),alive=useRef(true),invalid=useRef(false),initial=useRef({context:digest(context),ports,language})
  const [holder]=useState(()=>{try{if(language!==context.language)throw Error('UI language differs from frozen teaching language');return {session:new NumberSeriesSession(context,ports,()=>{if(alive.current)render()})}}catch{return {error:true as const}}})
  const s=holder.session,en=language==='en',view=s?.view??'blocked',plan=s?.activePlan
  if(initial.current.context!==digest(context)||initial.current.ports!==ports||initial.current.language!==language)invalid.current=true
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;queueMicrotask(()=>{if(!alive.current)s?.dispose()})}},[s])
  useEffect(()=>{if(invalid.current)s?.dispose()},[s,context,ports,language])
  useLayoutEffect(()=>{if(s&&view==='presenting'&&!invalid.current)s.expose(performance.now())},[s,view,plan])
  useEffect(()=>{
    if(!s||view!=='running'||invalid.current)return
    const down=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||e.altKey||e.metaKey||e.ctrlKey||invalid.current)return
      const key=e.code||e.key,choice=keyChoice(key)
      if(choice===null)return
      e.preventDefault();s.answer(choice,'keyboard',key,performance.now(),e.repeat)
    }
    const hidden=()=>{if(document.hidden)s.stop('visibility-lost',performance.now())},blur=()=>s.stop('window-blur',performance.now()),pagehide=()=>s.stop('page-hidden',performance.now())
    window.addEventListener('keydown',down);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pagehide)
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pagehide)}
  },[s,view])
  if(!s||invalid.current)return <section className="number-series-task" role="alert">{en?'The frozen attempt cannot continue. Keep the page and contact the organiser.':'冻结作答无法继续，请保留本页并联系组织者。'}</section>
  if(view==='report'&&s.receipt)return <NumberSeriesReport report={s.receipt.report} language={language}/>
  const config=s.context.snapshot.config
  const lastPracticeCorrect=s.lastRaw?.status==='answered'&&s.lastRaw.response===s.lastRaw.plan.correctIndex
  const choose=(choice:number,input:InputMode,key:string|null=null,repeat=false)=>{if(alive.current&&!invalid.current)s.answer(choice,input,key,performance.now(),repeat)}
  return <main className="number-series-task" data-number-series-view={view} onKeyDownCapture={e=>{if(e.repeat)e.preventDefault()}}>
    {(view==='intro'||view==='practice-instructions')&&<><NumberSeriesInstructions config={config} language={language}/><div className="number-series-actions"><button onClick={()=>view==='intro'?void s.prepare():s.begin()}>{view==='intro'?(en?'Prepare practice':'准备练习'):(en?'Start another practice round':'开始下一轮练习')}</button><button className="number-series-secondary" onClick={()=>s.endPractice()}>{en?'End practice':'结束练习'}</button></div></>}
    {['practice-ready','formal-ready','item-ready','break'].includes(view)&&<>
      <h1>{view==='practice-ready'?(en?'Ready for three practice questions':'准备三题练习'):view==='formal-ready'?(en?'Ready for the formal questions':'准备正式题目'):view==='break'?(en?'Take a break if you like':'休息一下，再继续'):en?'Answer recorded':'已记录本题'}</h1>
      <p>{s.phase==='test'?(en?`Recorded ${s.formalIndex}/${config.totalItems} questions. No answer feedback is shown during the formal task.`:`已记录 ${s.formalIndex}/${config.totalItems} 题。正式阶段不逐题公布对错。`):view==='formal-ready'?(en?`Practice complete. There are ${config.totalItems} formal questions.`:`练习已完成，接下来有 ${config.totalItems} 题正式题目。`):en?'Smaller numbers, one of each type. Practice is explained and does not enter your formal result.':'数字较小，三类各一题。练习会逐题解释，不进入正式结果。'}</p>
      <div className="number-series-actions"><button onClick={()=>s.begin()}>{view==='practice-ready'?(en?'Start practice':'开始练习'):view==='formal-ready'?(en?'Start formal questions':'开始正式题目'):en?'Next question':'下一题'}</button><button className="number-series-secondary" onClick={()=>s.phase==='test'?s.stop('participant-ended',performance.now()):s.endPractice()}>{en?'End this activity':'结束本次任务'}</button></div>
    </>}
    {(view==='presenting'||view==='running')&&plan&&<>
      <p className="number-series-stage">{s.phase==='practice'?(en?`Practice ${s.practiceIndex+1}/3 · round ${s.round+1}/3`:`练习 ${s.practiceIndex+1}/3 · 第 ${s.round+1}/3 轮`):(en?`Question ${s.formalIndex+1}/${config.totalItems}`:`第 ${s.formalIndex+1}/${config.totalItems} 题`)}</p>
      <h1>{en?'What number comes next?':'下一个数字是什么？'}</h1><p>{en?'Look at the pattern, then choose one number.':'看一看变化的规律，再选一个最合适的数字。'}</p>
      <div className="number-series-row" aria-label={en?'Number row':'数字序列'}>{plan.known.map((n,i)=><React.Fragment key={i}><span>{n}</span><span aria-hidden="true">·</span></React.Fragment>)}<span>?</span></div>
      <div className="number-series-choices">{plan.options.map((value,index)=><button className="number-series-choice" key={index} disabled={view!=='running'} aria-label={en?`Option ${index+1}: ${value}`:`选项 ${index+1}：${value}`} onPointerDown={e=>{if(e.button!==0||e.isPrimary===false)return;e.preventDefault();choose(index,e.pointerType==='touch'?'touch':e.pointerType==='pen'?'pen':'mouse')}} onClick={e=>{if(e.detail===0)choose(index,'assistive')}} onKeyDown={e=>{if(e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();e.stopPropagation();choose(index,'keyboard',`focus:${index+1}:${e.key===' '?'Space':'Enter'}`,e.repeat)}}>{value}<small>{en?'Option':'选项'} {index+1}</small></button>)}</div>
      <p className="number-series-hint">{en?'No preselected answer. Your first choice submits the answer. There is no countdown.':'没有预选答案。首次点选即提交，没有倒计时。'}</p>
      <button className="number-series-secondary" disabled={view!=='running'} onClick={e=>s.skip(e.detail===0?'assistive':'mouse',performance.now())}>{en?'Skip this question':'这题先跳过'}</button>
      <button className="number-series-end" onClick={()=>s.stop('participant-ended',performance.now())}>{en?'End this activity':'结束本次任务'}</button>
    </>}
    {view==='practice-feedback'&&<>
      <h1>{lastPracticeCorrect?(en?'This practice answer is correct':'这题练习答对了'):en?'Let’s review this together':'一起再看看这道练习'}</h1>
      {s.lastRaw&&s.lastRaw.status==='answered'?<><p>{en?'Your choice':'你的选择'}：{s.lastRaw.plan.options[s.lastRaw.response!]}</p><p>{practiceExplanation(s.lastRaw.plan,language)}</p></>:<p>{en?'This question was skipped or unfinished. It is not an ability score.':'这题练习被跳过或尚未完成，不是能力分数。'}</p>}
      <p>{en?'Practice does not enter formal results.':'练习不进入正式结果。'}</p>
      {s.practiceRoundFinished&&<p>{en?`This round: ${s.practiceCorrect}/3 correct. All three are required before formal questions.`:`本轮答对 ${s.practiceCorrect}/3 题，需三题全对后进入正式题目。`}</p>}
      <div className="number-series-actions">{s.practiceFailed&&s.practiceRoundFinished?s.canRetryPractice?<button onClick={()=>s.reviewInstructions()}>{en?'Review all instructions and three examples':'重看完整说明与三个例子'}</button>:<p>{en?'Three rounds have been attempted. Let’s stop for today; you can practise again when ready.':'已尝试三轮，今天先到这里；准备好后可再来熟悉规则。'}</p>:s.practicePassed?<button onClick={()=>s.acceptPractice()}>{en?'Prepare formal questions':'准备正式题目'}</button>:<button onClick={()=>s.nextPractice()}>{en?'Next practice question':'下一题练习'}</button>}<button className="number-series-secondary" onClick={()=>s.endPractice()}>{en?'End practice':'结束练习'}</button></div>
    </>}
    {['preparing','saving-item','saving-final'].includes(view)&&<p role="status">{en?'Confirming that the record was saved…':'正在确认记录已保存…'}</p>}
    {view==='retry'&&<><h1>{en?'Keep this page open':'请保留本页'}</h1><p>{en?'Saving has not been confirmed. Retry keeps exactly the same record and does not show the question again. Report saving and full raw archival are separate; closing this page does not guarantee an upload.':'尚未确认保存成功。重试只保存同一份记录，不重新呈现题目。报告保存和完整原件归档分别确认，关页不保证后台上传。'}</p><button onClick={()=>void s.retry()}>{en?'Retry saving':'重试保存'}</button></>}
    {view==='stopped'&&<><h1>{en?'Practice has ended':'本次练习已结束'}</h1><p>{en?'No formal result was completed. This is not an ability judgement.':'尚未完成正式测量，这不是能力判断。'}</p></>}
    {view==='blocked'&&<p role="alert">{en?'A fresh retained attempt was not confirmed. No question has started.':'尚未确认新的耐久作答身份，没有开始题目。'}</p>}
  </main>
}
