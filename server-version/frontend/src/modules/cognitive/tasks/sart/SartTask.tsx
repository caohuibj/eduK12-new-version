import React,{useEffect,useReducer,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import {digest,type SartContext,type SartPorts} from './contracts'
import {SartSession} from './session'
import {SartInstructions} from './SartInstructions'
import {SartReport} from './SartReport'
import './sart.css'
export interface SartTaskProps {context:SartContext;ports:SartPorts;language?:'zh'|'en'}
/** Unregistered React content candidate. No product API, storage or lifecycle adapter is supplied. */
export function SartTask({context,ports,language='zh'}:SartTaskProps){
  const [,render]=useReducer(n=>n+1,0),alive=useRef(true),lifecycle=useRef({generation:0}),invalid=useRef(false),initial=useRef({key:digest(context),ports,language}),starting=useRef<number|null>(null)
  const [holder]=useState(()=>{try{return {session:new SartSession(context,ports,()=>{if(alive.current)render()})}}catch{return {error:true as const}}}),s=holder.session,en=language==='en',view=s?.view??'blocked'
  if(initial.current.key!==digest(context)||initial.current.ports!==ports||initial.current.language!==language)invalid.current=true
  useEffect(()=>{alive.current=true;const lease=lifecycle.current,generation=++lease.generation;return()=>{alive.current=false;if(starting.current!==null)cancelAnimationFrame(starting.current);queueMicrotask(()=>{if(lease.generation===generation)s?.dispose()})}},[s])
  useEffect(()=>{if(invalid.current)s?.dispose()},[s,context,ports,language])
  useEffect(()=>{if(!s||invalid.current||!['running','practice-feedback'].includes(view))return;let frame=0,active=true
    const loop=()=>{if(!active||!alive.current||invalid.current)return;flushSync(()=>s.tick(performance.now()));if(active&&['running','practice-feedback'].includes(s.view))frame=requestAnimationFrame(loop)}
    frame=requestAnimationFrame(loop)
    const down=(e:KeyboardEvent)=>{if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||(e.code!=='Space'&&e.key!==' '))return;e.preventDefault();s.input({kind:'down',atMs:performance.now(),token:'k:Space',input:'keyboard',repeat:e.repeat})}
    const up=(e:KeyboardEvent)=>{if(e.code!=='Space'&&e.key!==' ')return;e.preventDefault();s.input({kind:'up',atMs:performance.now(),token:'k:Space',input:'keyboard',repeat:false})}
    const pointerUp=(e:PointerEvent)=>s.input({kind:'up',atMs:performance.now(),token:'p:'+e.pointerId,input:e.pointerType==='touch'?'touch':e.pointerType==='pen'?'pen':'mouse',repeat:false})
    const stop=(why:string)=>s.stop(why,performance.now()),blur=()=>stop('blur'),hidden=()=>{if(document.hidden)stop('hidden')},pagehide=()=>stop('page-hidden'),orientation=()=>stop('orientation-changed')
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerUp);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pagehide);window.addEventListener('orientationchange',orientation)
    return()=>{active=false;cancelAnimationFrame(frame);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',pointerUp);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pagehide);window.removeEventListener('orientationchange',orientation)}
  },[s,view])
  if(!s||invalid.current)return <section className="sart-task sart-reading" role="alert">{en?'This frozen attempt cannot continue. Keep the page open and contact the organiser.':'本次冻结设置无法继续，请保留页面并联系组织者。'}</section>
  const begin=()=>{if(starting.current!==null)return;starting.current=requestAnimationFrame(()=>{starting.current=null;if(alive.current&&!invalid.current)flushSync(()=>s.begin(performance.now()))})}
  if(view==='report'&&s.receipt)return <SartReport report={s.receipt.report} language={language}/>
  const config=s.context.snapshot.config,cap=s.capture
  return <main className={'sart-task '+(['running','practice-feedback'].includes(view)?'sart-stage':'sart-reading')} data-sart-view={view}>
    {(view==='intro'||view==='practice-instructions')&&<><SartInstructions config={config} language={language}/>{view==='practice-instructions'&&<p role="status">{en?'Practice was incomplete or did not meet the rule. Review both examples before a new round.':'练习未完成或尚未符合规则，请先重看两个例子再开始新一组。'}</p>}<button disabled={s.pending} onClick={()=>view==='intro'?void s.prepare():begin()}>{view==='intro'?(en?'Prepare practice':'准备练习'):(en?'Start next practice round':'开始下一组练习')}</button><button onClick={()=>s.endPractice()}>{en?'End practice':'结束练习'}</button></>}
    {(view==='practice-ready'||view==='formal-ready')&&<><h1>{view==='practice-ready'?(en?'Ready for nine practice trials':'准备9次慢练习'):(en?'Ready for the continuous assessment':'准备正式连续回应')}</h1><p>{en?'Press once for every digit except 3. For 3, do not press. Release before each new response.':'除了3，每个数字都按一下；3不按。每次抬起再重新按下。'}</p><button disabled={s.pending} onClick={begin}>{en?'Start':'开始'}</button><button onClick={()=>s.endPractice()}>{en?'End this attempt':'结束本次'}</button></>}
    {view==='running'&&cap&&<><h1>{en?'Watch the central digit':'只看中央数字'}</h1><div className="sart-field" style={{height:config.fieldHeightPx,background:config.background,color:config.foreground,fontFamily:config.fontFamily}} aria-label={en?'Digit and mask field':'数字与掩蔽区域'}>
      {!cap.masked?<span style={{fontSize:cap.raw.plan.fontPx}}>{cap.raw.plan.digit}</span>:<svg width="48" height="48" viewBox="0 0 100 100" aria-label={en?'Mask':'掩蔽'}><circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="3"/><path d="M22 22L78 78M22 78L78 22" fill="none" stroke="currentColor" strokeWidth="3"/></svg>}
    </div><button className="sart-response" onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();s.input({kind:'down',atMs:performance.now(),token:'p:'+e.pointerId,input:e.pointerType==='touch'?'touch':e.pointerType==='pen'?'pen':'mouse',repeat:false})}}>{en?'Respond':'回应'}</button><p className="sart-control-hint">{en?'Touch / mouse / Space':'触控／鼠标／空格键'}</p><button className="sart-end" onClick={()=>s.stop('participant-ended',performance.now())}>{en?'End this attempt':'结束本次'}</button></>}
    {view==='practice-feedback'&&<><h1>{en?'Practice feedback':'练习反馈'}</h1><p role="status">{s.lastCorrect?(en?'That followed the rule.':'这次符合规则。'):(en?'For 3 do not press; for all other digits press once.':'3不按，其他数字按一下。')}</p><button onClick={()=>s.stop('practice-ended',performance.now())}>{en?'End practice':'结束练习'}</button></>}
    {view==='practice-result'&&<><h1>{en?'Practice completed':'本组练习已完成'}</h1><p>{en?`Go responses ${s.goCorrect}/8; correct No-Go withholding ${s.noGoCorrect}/1. All nine windows must complete.`:`Go回应${s.goCorrect}/8；No-Go正确不按${s.noGoCorrect}/1。需要完整做完9次。`}</p>{s.pending&&<p role="status">{en?'Confirming practice was saved…':'正在确认练习记录已保存…'}</p>}{s.practicePassed?<button disabled={s.pending} onClick={()=>s.acceptPractice()}>{en?'Prepare assessment':'准备正式'}</button>:s.canRetryPractice?<button onClick={()=>s.reviewInstructions()}>{en?'Read the full instructions and examples again':'重看完整说明与例子'}</button>:<p>{en?'Three rounds are finished. You can end and ask the organiser for help.':'已练3组，可以先结束并向组织者询问。'}</p>}<button onClick={()=>s.endPractice()}>{en?'End practice':'结束练习'}</button></>}
    {['preparing','saving'].includes(view)&&<p role="status">{en?'Confirming your record was saved…':'正在确认记录已保存…'}</p>}
    {view==='retry'&&<><h1>{en?'Presentation has stopped':'呈现已停止'}</h1><p>{en?'Keep this page open and retry saving the same originals. Exposed trials do not replay. Report saving and complete raw archival are separate; closing does not guarantee an upload.':'请保留本页，重试保存同一份原件，不重放已经曝光的数字。报告保存和完整原件归档分开，关页不保证上传。'}</p><button onClick={()=>void s.retry()}>{en?'Retry saving':'重试保存'}</button></>}
    {view==='stopped'&&<><h1>{en?'Practice has ended':'本次练习已结束'}</h1><p>{en?'No formal assessment is claimed. This is not an ability judgement.':'不把练习当正式完成，这不是能力判断。'}</p></>}
    {view==='blocked'&&<p role="alert">{en?'A fresh durable attempt could not be confirmed; no digit was shown.':'尚未确认新的本机耐久作答身份，没有呈现数字。'}</p>}
  </main>
}
