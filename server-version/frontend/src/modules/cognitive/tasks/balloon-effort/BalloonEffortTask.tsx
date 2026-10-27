import React,{useEffect,useReducer,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import {EFFORT_QUIZ,isHigh,effortKeySide,type Side,type Input} from './generated/protocol'
import {EffortSession} from './session'
import {digest,type EffortContext,type EffortPorts} from './contracts'
import {EffortInstructions} from './EffortInstructions'
import {EffortReport} from './EffortReport'
import './effort.css'
export interface BalloonEffortTaskProps {context:EffortContext;ports:EffortPorts;language?:'zh'|'en'}
const SIDES:Side[]=['left','right']
/** No product registration here; caller must supply a verified frozen context and real durable/server ports. */
export function BalloonEffortTask({context,ports,language='zh'}:BalloonEffortTaskProps){
 const [,render]=useReducer(n=>n+1,0),initial=useRef({key:digest(context),ports,language}),invalid=useRef(false),alive=useRef(true),startFrame=useRef<number|null>(null)
 const [holder]=useState(()=>{try{return {session:new EffortSession(context,ports,()=>{if(alive.current)render()})}}catch{return {error:true as const}}})
 const [answer,setAnswer]=useState<number|null>(null),[displayError,setDisplayError]=useState(false),s=holder.session,en=language==='en',view=s?.view??'blocked'
 if(initial.current.key!==digest(context)||initial.current.ports!==ports||initial.current.language!==language)invalid.current=true
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(startFrame.current!==null)cancelAnimationFrame(startFrame.current);s?.dispose()}},[s])
 useEffect(()=>{if(invalid.current)s?.dispose()},[s,context,ports,language])
 useEffect(()=>{if(!s||view!=='running'||invalid.current)return;let frame=0
  const loop=()=>{if(!alive.current||invalid.current||s.view!=='running')return;flushSync(()=>s.tick(performance.now()));if(s.view==='running')frame=requestAnimationFrame(loop)};frame=requestAnimationFrame(loop)
  const side=(e:KeyboardEvent):Side|null=>effortKeySide('key:'+(e.code||e.key.toLowerCase()))
  const down=(e:KeyboardEvent)=>{const which=side(e);if(!which||e.altKey||e.ctrlKey||e.metaKey)return;e.preventDefault();s.down(performance.now(),'key:'+(e.code||e.key.toLowerCase()),which,'keyboard',e.repeat)}
  const up=(e:KeyboardEvent)=>{if(!side(e))return;e.preventDefault();s.up(performance.now(),'key:'+(e.code||e.key.toLowerCase()))}
  const stop=(reason:string)=>s.stop(reason,performance.now()),blur=()=>stop('blur'),hidden=()=>{if(document.hidden)stop('hidden')},pagehide=()=>stop('page-hidden'),resize=()=>{if(window.innerWidth<348)stop('display-changed')},orientation=()=>stop('orientation-changed')
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pagehide);window.addEventListener('resize',resize);window.addEventListener('orientationchange',orientation)
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pagehide);window.removeEventListener('resize',resize);window.removeEventListener('orientationchange',orientation)}
 },[s,view])
 if(!s||invalid.current)return <section className="effort-task effort-reading" role="alert">{en?'This frozen attempt cannot continue. Keep the page open and contact the organiser.':'本次冻结设置无法继续。请保留页面并联系组织者。'}</section>
 const start=()=>{if(window.innerWidth<348){setDisplayError(true);return}setDisplayError(false);if(startFrame.current!==null)cancelAnimationFrame(startFrame.current)
  startFrame.current=requestAnimationFrame(()=>{startFrame.current=null;if(alive.current&&!invalid.current)flushSync(()=>s.begin(performance.now()))})}
 const pointerDown=(e:React.PointerEvent<HTMLButtonElement>,side:Side)=>{if(e.button!==0)return;e.preventDefault();const input:Input=e.pointerType==='touch'?'touch':e.pointerType==='pen'?'pen':'mouse'
  s.down(performance.now(),'pointer:'+e.pointerId,side,input,false,e.isPrimary!==false);e.currentTarget.setPointerCapture?.(e.pointerId)}
 const pointerUp=(e:React.PointerEvent<HTMLButtonElement>)=>{e.preventDefault();s.up(performance.now(),'pointer:'+e.pointerId)}
 const focusKey=(e:React.KeyboardEvent<HTMLButtonElement>,side:Side,down:boolean)=>{if(e.key!==' '&&e.key!=='Enter')return;e.preventDefault();const token='focus:'+side+':'+(e.code||e.key);if(down)s.down(performance.now(),token,side,'keyboard',e.repeat);else s.up(performance.now(),token)}
 if(view==='report'&&s.receipt)return <EffortReport report={s.receipt.report} language={language}/>
 const cap=s.capture,raw=cap?.raw,stage=cap?.stage,visible=stage&&['offers','choice','prepare','execution','feedback','cumulative'].includes(stage),question=EFFORT_QUIZ[s.quizIndex]
 return <main className={'effort-task '+(view==='running'?'effort-stage':'effort-reading')} data-effort-view={view}>
  {displayError&&<p role="alert">{en?'Widen the viewport before continuing with the fixed task layout.':'请扩大显示空间后再继续固定布局的任务。'}</p>}
  {(view==='intro'||view==='practice-instructions')&&<><EffortInstructions language={language} profile={s.context.snapshot.config.profile}/><button onClick={()=>view==='intro'?void s.prepare():start()}>{view==='intro'?(en?'Prepare practice':'准备练习'):(en?'Start next practice round':'开始下一轮练习')}</button>
   <button className="effort-end" onClick={()=>s.endPractice()}>{en?'End practice':'结束练习'}</button></>}
  {['practice-ready','formal-ready','break'].includes(view)&&<><h1>{view==='break'?(en?'Take a short break':'休息一下'):view==='formal-ready'?(en?'Ready for formal choices':'准备正式选择'):(en?'Ready for the demonstrations':'准备操作演示')}</h1>
   <p>{view==='break'?(en?`Recorded ${s.formalIndex} rounds. Continue when ready.`:`已记录${s.formalIndex}轮，准备好后再继续。`):(en?'Follow the offer and complete fresh down/up presses after preparation.':'看清方案，准备结束后再完成新的按下松开。')}</p>
   <button onClick={start}>{view==='practice-ready'?(en?'Start demonstrations':'开始操作演示'):(en?'Continue':'继续')}</button><button className="effort-end" onClick={()=>view==='practice-ready'?s.endPractice():s.stop('participant-ended',performance.now())}>{en?'End this attempt':'结束本次记录'}</button></>}
  {view==='running'&&raw&&cap&&<><p className="effort-phase">{s.phase==='practice'?(en?'Practice demonstration':'操作演示'):(en?'Formal choice':'正式选择')}</p>
   <p className="effort-probability">{stage==='iti'?'＋':`${en?'Payout probability':'兑现概率'}：${raw.plan.probability*100}%`}</p>
   <svg className="effort-field" width="300" height="180" viewBox="0 0 300 180" role="img" aria-label={en?'Balloon options':'气球选项'}><rect width="300" height="180" fill="#f2f2f2"/>
    {stage!=='iti'&&stage!=='probability'&&SIDES.map(side=>{const high=isHigh(raw.plan,side),x=side==='left'?75:225,selected=raw.choice?.side===side,ratio=selected?raw.presses.length/(high?raw.plan.highGoal:raw.plan.lowGoal):0,shape=s.context.snapshot.config.stimulus,growth=Math.min(ratio,2)*shape.growthMaxPx/2,rx=(high?shape.highRx:shape.lowRx)+growth,ry=(high?shape.highRy:shape.lowRy)+growth,cy=high?shape.highY:shape.lowY
     return <g key={side}><path d={`M${x-8} 15 L${x+8} 15 L${x} 30 Z`} fill="#222"/><ellipse cx={x} cy={cy} rx={rx} ry={ry} fill={high?'#009e73':'#1d4ed8'}/><path d={`M${x} ${cy+ry} L${x} 170`} stroke="#64748b" strokeWidth="2"/></g>})}</svg>
   {visible&&<div className="effort-offers">{SIDES.map(side=>{const high=isHigh(raw.plan,side),selected=raw.choice?.side===side,forced=raw.plan.forced&&high!==(raw.plan.forced==='high'),active=(stage==='choice'&&!forced)||(stage==='execution'&&selected)
    return <div key={side}><span>{high?(en?'More presses':'较多按压'):(en?'Fewer presses':'较少按压')}</span><br/><strong>{high?raw.plan.highGoal:raw.plan.lowGoal}{en?' presses':'次'} → {high?raw.plan.highReward:raw.plan.lowReward}{en?' points':'点'}{high?(en?' baseline':'基准'):''}</strong>
     <button disabled={!active} aria-label={en?`${stage==='execution'?'Press':'Choose'} ${side}`:`${stage==='execution'?'按压':'选择'}${side==='left'?'左':'右'}侧`} onPointerDown={e=>pointerDown(e,side)} onPointerUp={pointerUp} onPointerCancel={e=>{if(e.isPrimary!==false)s.stop('pointer-cancelled',performance.now())}} onKeyDown={e=>focusKey(e,side,true)} onKeyUp={e=>focusKey(e,side,false)} onContextMenu={e=>e.preventDefault()}>
      {stage==='execution'?(en?'Press and release':'按下并松开'):(en?'Choose':'选择')} · {side==='left'?'Q':'P'}</button></div>})}</div>}
   <div className="effort-clock" role="status">{stage==='choice'&&<p>{en?'Choose within 6.5 seconds.':'请在6.5秒内选择。'} {raw.plan.forced&&(en?`Demonstration: choose ${raw.plan.forced==='high'?'more':'fewer'} presses.`:`本次演示请选择${raw.plan.forced==='high'?'较多':'较少'}按压。`)}</p>}
    {stage==='prepare'&&<p>{en?'Prepare':'准备'}：{Math.ceil(cap.remainingMs/1000)}{en?' s':'秒'}；{en?'release any held key or contact':'请松开按键或手指'}</p>}
    {stage==='execution'&&<><p>{en?'Presses':'已按'}：{raw.presses.length} / {raw.choice&&isHigh(raw.plan,raw.choice.side)?raw.plan.highGoal:raw.plan.lowGoal}；{en?'Remaining':'剩余'}：{Math.ceil(cap.remainingMs/1000)}{en?' s':'秒'}</p><p>{en?'Only the selected side counts. More-option points can exceed the baseline.':'只计所选侧；较多按压可超过基准点数。'}</p></>}
    {stage==='feedback'&&<p>{raw.choice===null?(en?'No selection; execution was not started.':'本轮未选择，没有进入按压执行。'):(en?`This round earned ${raw.reward} task points.`:`本轮获得${raw.reward}任务点数。`)}</p>}
    {stage==='cumulative'&&<p>{en?'Cumulative task points':'累计任务点数'}：{Math.round((s.recordedPoints+(raw.reward??0))*100)/100}</p>}</div>
   <button className="effort-end" onClick={()=>s.stop('participant-ended',performance.now())}>{en?'End this attempt':'结束本次记录'}</button>
  </>}
  {view==='demo-feedback'&&s.lastDemo&&<><h1>{en?'Demonstration feedback':'演示反馈'}</h1><p>{en?`Recorded ${s.lastDemo.presses.length} complete presses; task points: ${s.lastDemo.reward??'—'}.`:`记录了${s.lastDemo.presses.length}次完整按下松开，任务点数${s.lastDemo.reward??'—'}。`}</p>
   <p>{en?'Partial high-option points are valid. Choosing fewer is not a mistake.':'较多按压的部分收益是正常结果；选择较少不是错误。'}</p>
   {s.practiceIndex<2?<button onClick={()=>s.nextDemo(performance.now())}>{en?'Next demonstration':'下一次演示'}</button>:s.demosPassed?<button onClick={()=>{setAnswer(null);s.nextDemo(performance.now())}}>{en?'Answer understanding questions':'回答理解题'}</button>:<><p>{en?'A complete press was not recorded in each demonstration. Review the controls before retrying.':'还没有在每次演示中记录到完整按压，请先重看操作说明。'}</p>{s.canRetryPractice&&<button onClick={()=>s.reviewInstructions()}>{en?'Read instructions and examples again':'重新查看说明与例子'}</button>}</>}
   <button className="effort-end" onClick={()=>s.endPractice()}>{en?'End practice':'结束练习'}</button></>}
  {view==='quiz'&&question&&<><h1>{en?'Check the rules':'确认理解规则'}</h1><fieldset><legend>{en?question.en:question.zh}</legend>{(en?question.optionsEn:question.optionsZh).map((label,index)=><label key={index}><input type="radio" name="effort-understanding" checked={answer===index} onChange={()=>setAnswer(index)}/>{label}</label>)}</fieldset>
   <button disabled={answer===null} onClick={()=>{if(answer!==null)s.answerQuiz(answer,performance.now());setAnswer(null)}}>{en?'Confirm answer':'确认答案'}</button><button className="effort-end" onClick={()=>s.endPractice()}>{en?'End practice':'结束练习'}</button></>}
  {view==='quiz-feedback'&&s.lastQuiz&&<><h1>{en?'Understanding feedback':'理解题反馈'}</h1><p role="status">{s.lastQuiz.correct?(en?'Correct.':'这题答对了。'):(en?'Please review the rule.':'再看一下这条规则。')} {en?EFFORT_QUIZ[s.lastQuiz.questionIndex].optionsEn[EFFORT_QUIZ[s.lastQuiz.questionIndex].correct]:EFFORT_QUIZ[s.lastQuiz.questionIndex].optionsZh[EFFORT_QUIZ[s.lastQuiz.questionIndex].correct]}</p>
   <p>{en?`${s.quizCorrect}/${s.quizIndex} correct; all 3 are required.`:`目前答对${s.quizCorrect}/${s.quizIndex}题，需要3题均正确。`}</p>
   {s.quizIndex<3?<button onClick={()=>{setAnswer(null);s.nextQuestion()}}>{en?'Next question':'下一题'}</button>:s.practicePassed?<button onClick={()=>s.acceptPractice()}>{en?'Prepare formal choices':'准备正式选择'}</button>:<>{s.canRetryPractice?<button onClick={()=>s.reviewInstructions()}>{en?'Read instructions and examples again':'重新查看说明与例子'}</button>:<p>{en?'Three rounds are complete. You may finish and ask the organiser for help.':'已完成3轮，可先结束并向组织者询问操作方法。'}</p>}</>}
   <button className="effort-end" onClick={()=>s.endPractice()}>{en?'End practice':'结束练习'}</button></>}
  {['preparing','saving-item','saving-final'].includes(view)&&<p role="status">{en?'Checking that your record was saved…':'正在确认记录已保存…'}</p>}
  {view==='retry'&&<><h1>{en?'Presentation has stopped':'呈现已停止'}</h1><p>{en?'Keep this page open and retry saving the same records. Choices and presses will not replay. Report saving and raw archival are separate.':'请保留本页并重试保存同一份记录，不会重放选择或按压。报告保存与完整原件归档分别处理。'}</p><button onClick={()=>void s.retry()}>{en?'Retry saving':'重试保存'}</button></>}
  {view==='stopped'&&<><h1>{en?'Practice has ended':'本次练习已结束'}</h1><p>{en?'No formal measurement was completed. This is not a motivation judgement.':'尚未完成正式测量，这不是动力判断。'}</p></>}
  {view==='blocked'&&<p role="alert">{en?'A fresh durable attempt could not be confirmed; no trial was presented.':'尚未确认新的本机耐久作答身份，没有呈现任务。'}</p>}
 </main>
}
