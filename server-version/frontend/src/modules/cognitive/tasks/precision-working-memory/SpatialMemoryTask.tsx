import React,{useEffect,useReducer,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import {PALETTE,position,type Input} from './generated/protocol'
import {digest,type SpatialContext,type SpatialPorts} from './contracts'
import {SpatialSession} from './session'
import {SpatialInstructions} from './SpatialInstructions'
import {SpatialReport} from './SpatialReport'
import './spatial.css'
export interface SpatialMemoryTaskProps {context:SpatialContext;ports:SpatialPorts;language?:'zh'|'en'}
function Bar({angle,colour}:{angle:number;colour:string}){const p=position(angle),a=angle*Math.PI/180,dx=-Math.sin(a)*16,dy=Math.cos(a)*16
  return <line x1={p.x-dx} y1={p.y-dy} x2={p.x+dx} y2={p.y+dy} stroke={colour} strokeWidth="6"/>}
/** Candidate component only: no registry, product seed, delivery admission or production persistence adapter. */
export function SpatialMemoryTask({context,ports,language='zh'}:SpatialMemoryTaskProps){
  const [,render]=useReducer(n=>n+1,0),initial=useRef({key:digest(context),ports,language}),invalid=useRef(false),alive=useRef(true),startFrame=useRef<number|null>(null),board=useRef<SVGSVGElement>(null)
  const [holder]=useState(()=>{try{return {session:new SpatialSession(context,ports,()=>{if(alive.current)render()})}}catch{return {error:true as const}}})
  const [displayError,setDisplayError]=useState(false)
  const s=holder.session,en=language==='en',view=s?.view??'blocked'
  if(initial.current.key!==digest(context)||initial.current.ports!==ports||initial.current.language!==language)invalid.current=true
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(startFrame.current!==null)cancelAnimationFrame(startFrame.current);s?.dispose()}},[s])
  useEffect(()=>{if(invalid.current)s?.dispose()},[s,context,ports,language])
  useEffect(()=>{
    if(!s||view!=='running'||invalid.current)return
    let frame=0
    const loop=()=>{if(!alive.current||invalid.current||s.view!=='running')return;flushSync(()=>s.tick(performance.now()));if(s.view==='running')frame=requestAnimationFrame(loop)}
    frame=requestAnimationFrame(loop)
    const stop=(reason:string)=>s.stop(reason,performance.now()),blur=()=>stop('blur'),hidden=()=>{if(document.hidden)stop('hidden')},pagehide=()=>stop('page-hidden')
    const resize=()=>{if(window.innerWidth<348||(board.current&&Math.abs(board.current.getBoundingClientRect().width-300)>1))stop('display-changed')},orientation=()=>stop('orientation-changed')
    const key=(e:KeyboardEvent)=>{if(e.altKey||e.ctrlKey||e.metaKey||s.capture?.stage!=='response')return
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();s.keyboard(performance.now(),(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?10:1))}
      else if(e.key==='Enter'&&!e.repeat&&(e.target as HTMLElement)?.tagName!=='BUTTON'){e.preventDefault();s.confirm(performance.now())}}
    window.addEventListener('keydown',key);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pagehide)
    window.addEventListener('resize',resize);window.addEventListener('orientationchange',orientation)
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('keydown',key);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pagehide);window.removeEventListener('resize',resize);window.removeEventListener('orientationchange',orientation)}
  },[s,view])
  if(!s||invalid.current)return <section className="spatial-task spatial-reading" role="alert">{en?'This frozen attempt cannot continue. Keep this page open and contact the organiser.':'本次冻结设置无法继续。请保留页面并联系组织者。'}</section>
  const start=()=>{if(window.innerWidth<348){setDisplayError(true);return}setDisplayError(false)
    if(startFrame.current!==null)cancelAnimationFrame(startFrame.current)
    startFrame.current=requestAnimationFrame(()=>{startFrame.current=null;if(alive.current&&!invalid.current)flushSync(()=>s.begin(performance.now()))})}
  const pointer=(e:React.PointerEvent<SVGSVGElement>,kind:'down'|'move'|'up')=>{if(kind==='down'&&e.button!==0)return;e.preventDefault()
    const box=e.currentTarget.getBoundingClientRect();if(box.width<=0||box.height<=0)return
    const input:Exclude<Input,'keyboard'>=e.pointerType==='touch'?'touch':e.pointerType==='pen'?'pen':'mouse'
    s.pointer(performance.now(),(e.clientX-box.left)*300/box.width,(e.clientY-box.top)*300/box.height,input,kind,e.isPrimary!==false)
    if(kind==='down'&&s.capture?.dragging)e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  if(view==='report'&&s.receipt)return <SpatialReport report={s.receipt.report} language={language}/>
  const cap=s.capture,r=cap?.raw,selection=cap?.selection,responding=cap?.stage==='response'
  return <main className={'spatial-task '+(view==='running'?'spatial-stage':'spatial-reading')} data-spatial-view={view}>
    {displayError&&<p role="alert">{en?'This fixed display needs a wider viewport. Widen the window before continuing.':'固定刺激区需要更宽的显示空间，请扩大窗口后继续。'}</p>}
    {(view==='intro'||view==='practice-instructions')&&<><SpatialInstructions language={language} profile={s.context.snapshot.config.profile}/>
      <button onClick={()=>view==='intro'?void s.prepare():start()}>{view==='intro'?(en?'Prepare practice':'准备练习'):(en?'Start next practice round':'开始下一轮练习')}</button>
      {view==='practice-instructions'&&<button className="spatial-end" onClick={()=>s.endPractice()}>{en?'End practice':'结束练习'}</button>}</>}
    {['practice-ready','formal-ready','break'].includes(view)&&<><h1>{view==='break'?(en?'Take a short break':'休息一下'):view==='formal-ready'?(en?'Ready for the formal trials':'准备正式作答'):(en?'Ready for practice':'准备开始练习')}</h1>
      <p>{view==='break'?(en?`You have recorded ${s.formalIndex} formal trials. Continue when ready.`:`已记录${s.formalIndex}次正式作答，准备好再继续。`):(en?'Watch the colours and positions. Select only after the colour cue, then confirm.':'先看颜色和位置，等中央颜色提示后再选点并确认。')}</p>
      <button onClick={start}>{view==='practice-ready'?(en?'Start practice':'开始练习'):(en?'Continue':'继续')}</button>
      <button className="spatial-end" onClick={()=>view==='practice-ready'?s.endPractice():s.stop('participant-ended',performance.now())}>{en?'End this attempt':'结束本次记录'}</button></>}
    {view==='running'&&r&&cap&&<><p className="spatial-phase">{s.phase==='practice'?(en?'Practice':'练习'):(en?'Formal trials':'正式作答')}</p>
      <svg ref={board} className="spatial-board" width="300" height="300" viewBox="0 0 300 300" role="img" tabIndex={0} aria-label={en?'Colour and position display':'颜色与位置区域'}
        onPointerDown={e=>pointer(e,'down')} onPointerMove={e=>pointer(e,'move')} onPointerUp={e=>pointer(e,'up')} onPointerCancel={()=>s.stop('pointer-cancelled',performance.now())} onContextMenu={e=>e.preventDefault()}>
        <rect width="300" height="300" fill="#666666"/>
        {cap.stage==='encoding'&&r.plan.items.map(item=><Bar key={item.colour} angle={item.angleDeg} colour={PALETTE[item.colour]}/>)}
        {responding?<><circle cx="150" cy="150" r="110" fill="none" stroke="#cbd5e1" strokeOpacity=".18" strokeWidth="40"/><circle cx="150" cy="150" r="110" fill="none" stroke="#cbd5e1" strokeWidth="2"/>
          <circle cx="150" cy="150" r="10" fill={PALETTE[r.plan.targetColour]}/>{selection&&<circle cx={position(selection.angleDeg).x} cy={position(selection.angleDeg).y} r="7" fill="none" stroke="#cbd5e1" strokeWidth="3"/>}</>
          :<text x="150" y="158" textAnchor="middle" fill="#cbd5e1" fontSize="26">+</text>}
      </svg>
      {responding&&<div className="spatial-response"><p>{en?'Select on the ring, release, then confirm.':'在环带选点，松手后确认。'}</p>
        <button onClick={()=>s.keyboard(performance.now(),null)}>{en?'Activate keyboard selection':'启用键盘选点'}</button>
        <button disabled={!selection||cap.dragging} onClick={()=>s.confirm(performance.now())}>{en?'Confirm position':'确认位置'}</button>
        {r.warningAtMs!==null&&<p className="spatial-warning" role="status">{en?'Take your time and choose the remembered position; you can still respond.':'可以继续选择记得的位置，不用急。'}</p>}
        <button className="spatial-end" onClick={()=>s.stop('participant-ended',performance.now())}>{en?'End this attempt':'结束本次记录'}</button></div>}
    </>}
    {view==='practice-feedback'&&s.feedback&&<><h1>{en?'Practice feedback':'练习反馈'}</h1><p role="status">{en?`Your selection was ${s.feedback.errorDeg.toFixed(1)}° from the target.`:`本题落点偏离目标${s.feedback.errorDeg.toFixed(1)}°。`}</p>
      <div className="spatial-feedback"><svg width="300" height="300" viewBox="0 0 300 300" role="img" aria-label={en?'Target and your selection':'目标与本题落点'}><circle cx="150" cy="150" r="110" fill="none" stroke="#cbd5e1" strokeWidth="2"/>
        <Bar angle={s.feedback.target} colour="#F0E442"/><circle cx={position(s.feedback.response).x} cy={position(s.feedback.response).y} r="7" fill="none" stroke="#cbd5e1" strokeWidth="3"/></svg>
        <p>{en?'Yellow bar: correct position. Grey outline: your selection.':'黄色短线：正确位置；浅灰圈：你的落点。'}</p></div>
      <p>{en?`Round ${s.round+1}: ${s.practiceCorrect}/${s.practiceIndex} within 30°.`:`第${s.round+1}轮：目前${s.practiceCorrect}/${s.practiceIndex}次落在目标±30°内。`}</p>
      {s.practiceIndex<6?<button onClick={()=>s.nextPractice(performance.now())}>{en?'Next practice trial':'下一次练习'}</button>:s.practicePassed?<button onClick={()=>s.acceptPractice()}>{en?'Prepare formal trials':'准备正式作答'}</button>:<>
        <p>{en?'At least 5 of 6 are needed. This is practice for the controls, not an ability judgement.':'需要至少5/6次。这是熟悉操作，不是能力判断。'}</p>
        {s.canRetryPractice?<button onClick={()=>s.reviewInstructions()}>{en?'Read instructions and examples again':'重新查看说明与例子'}</button>:<p>{en?'Three rounds are complete. You may finish and ask the organiser for help.':'已完成3轮，可先结束并向组织者询问操作方法。'}</p>}</>}
      <button className="spatial-end" onClick={()=>s.endPractice()}>{en?'End practice':'结束练习'}</button></>}
    {['preparing','saving-item','saving-final'].includes(view)&&<p role="status">{en?'Checking that your record was saved…':'正在确认记录已保存…'}</p>}
    {view==='retry'&&<><h1>{en?'Presentation has stopped':'呈现已停止'}</h1><p>{en?'Keep this page open. Retry saving the same records; trials will not replay. Full raw archiving is separate from report saving.':'请保留此页面，重试保存同一份记录，不会重放试次。完整原件归档与报告保存分别处理。'}</p><button onClick={()=>void s.retry()}>{en?'Retry saving':'重试保存'}</button></>}
    {view==='stopped'&&<><h1>{en?'This practice attempt has ended':'本次练习已结束'}</h1><p>{en?'No formal measurement was completed. Retain this page and contact the organiser if you need help.':'尚未完成正式测量。请保留此页，需要时联系组织者。'}</p></>}
    {view==='blocked'&&<p role="alert">{en?'A fresh durable attempt could not be confirmed. No stimuli were presented.':'尚未确认新的本机耐久作答身份，没有呈现刺激。'}</p>}
  </main>
}
