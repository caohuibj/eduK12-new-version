import React,{useEffect,useReducer,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import {digest,type PvtContext,type PvtPorts} from './contracts'
import {PvtSession} from './session'
import {PvtInstructions} from './PvtInstructions'
import {PvtReport} from './PvtReport'
import './pvt.css'
export interface PvtTaskProps {context:PvtContext;ports:PvtPorts;language?:'zh'|'en'}
/** Unregistered React content candidate. No product API, storage or lifecycle adapter is supplied. */
export function PvtTask({context,ports,language=context.language}:PvtTaskProps){
  const [,render]=useReducer(n=>n+1,0),alive=useRef(true),lifecycle=useRef({generation:0}),invalid=useRef(false),initial=useRef({key:digest(context),ports,language}),starting=useRef<number|null>(null)
  const [holder]=useState(()=>{try{return {session:new PvtSession(context,ports,()=>{if(alive.current)render()})}}catch{return {error:true as const}}}),s=holder.session,en=language==='en',view=s?.view??'blocked'
  if(context.language!==language||initial.current.key!==digest(context)||initial.current.ports!==ports||initial.current.language!==language)invalid.current=true
  useEffect(()=>{alive.current=true;const lease=lifecycle.current,generation=++lease.generation;return()=>{alive.current=false;if(starting.current!==null)cancelAnimationFrame(starting.current);queueMicrotask(()=>{if(lease.generation===generation)s?.dispose()})}},[s])
  useEffect(()=>{if(invalid.current)s?.dispose()},[s,context,ports,language])
  useEffect(()=>{if(!s)return
    const down=(e:KeyboardEvent)=>{if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||(e.code!=='Space'&&e.key!==' ')||(e.target instanceof Element&&e.target.closest('[data-pvt-end]')))return
      if(['running','practice-feedback'].includes(s.view))e.preventDefault()
      s.input({kind:'down',atMs:performance.now(),token:'k:Space',input:'keyboard',repeat:e.repeat})}
    const up=(e:KeyboardEvent)=>{if(e.code!=='Space'&&e.key!==' ')return;s.input({kind:'up',atMs:performance.now(),token:'k:Space',input:'keyboard',repeat:false})}
    const pointerUp=(e:PointerEvent)=>s.input({kind:'up',atMs:performance.now(),token:'p:'+e.pointerId,input:e.pointerType==='touch'?'touch':e.pointerType==='pen'?'pen':'mouse',repeat:false})
    const stop=(why:string)=>s.stop(why,performance.now()),blur=()=>stop('blur'),hidden=()=>{if(document.hidden)stop('hidden')},pagehide=()=>stop('page-hidden')
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerUp);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pagehide)
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',pointerUp);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pagehide)}
  },[s])
  useEffect(()=>{if(!s||invalid.current||!['running','practice-feedback'].includes(view))return;let frame=0,active=true
    const loop=()=>{if(!active||!alive.current||invalid.current)return;flushSync(()=>s.tick(performance.now()));if(active&&['running','practice-feedback'].includes(s.view))frame=requestAnimationFrame(loop)}
    frame=requestAnimationFrame(loop);return()=>{active=false;cancelAnimationFrame(frame)}
  },[s,view])
  if(!s||invalid.current)return <section className="pvt-task pvt-reading" role="alert">{en?'This frozen attempt cannot continue. Keep the page open and contact the organiser.':'本次冻结设置无法继续，请保留页面并联系组织者。'}</section>
  const begin=()=>{if(starting.current!==null)return;starting.current=requestAnimationFrame(()=>{starting.current=null;if(alive.current&&!invalid.current)flushSync(()=>s.begin(performance.now()))})}
  if(view==='report'&&s.receipt)return <PvtReport report={s.receipt.report} language={language}/>
  const config=s.context.snapshot.config,cap=s.capture
  const end=()=>s.stop('participant-ended',performance.now())
  return <main className={'pvt-task '+(['running','practice-feedback'].includes(view)?'pvt-stage':'pvt-reading')} data-pvt-view={view}>
    {(view==='intro'||view==='practice-instructions')&&<><PvtInstructions config={config} language={language}/>{view==='practice-instructions'&&<p role="status">{en?'Practice was incomplete or an early press occurred. Review the complete instructions and both examples before retrying.':'练习未完成或出现提前按，请先重看完整说明和两个例子再练一次。'}</p>}<button disabled={s.pending} onClick={()=>view==='intro'?void s.prepare():begin()}>{view==='intro'?(en?'Prepare practice':'准备练习'):(en?'Start next practice round':'开始下一组练习')}</button><button data-pvt-end onClick={end}>{en?'End practice':'结束练习'}</button></>}
    {(view==='practice-ready'||view==='formal-ready')&&<><h1>{view==='practice-ready'?(en?'Ready for three practice targets':'准备3次练习'):(en?'Ready for continuous random waiting':'准备正式随机等待')}</h1><p>{en?'Wait for a solid white circle, press once, then release. Do not anticipate.':'等白色实心圆出现，按一下并抬起，不要猜时间。'}</p><button disabled={s.pending} onClick={begin}>{en?'Start':'开始'}</button><button data-pvt-end onClick={end}>{en?'End this attempt':'结束本次'}</button></>}
    {view==='running'&&cap&&<><h1>{en?'Watch the central circle':'看中央的圆'}</h1><div className="pvt-field" style={{height:config.fieldHeightPx,background:config.background,color:config.foreground}} aria-label={cap.targetOnsetMs===null?(en?'Outline circle: wait':'空心圆：等待'):(en?'Solid circle: respond':'实心圆：回应')}>
      <span className={'pvt-circle '+(cap.targetOnsetMs===null?'':'pvt-solid')} style={{width:config.circleDiameterPx,height:config.circleDiameterPx}}/>
      <span className="pvt-caption">{cap.inFeedback?(s.feedback==='early'?(en?'Wait until the circle is solid':'等圆变实心后再按'):s.feedback==='timeout'?(en?'No response recorded':'这次没有记录到回应'):(en?'Recorded':'已记录')):cap.targetOnsetMs===null?(en?'Wait for the target':'等待目标出现'):(en?'Respond once, then release':'按一下并抬起')}</span>
    </div><button className="pvt-response" onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();s.input({kind:'down',atMs:performance.now(),token:'p:'+e.pointerId,input:e.pointerType==='touch'?'touch':e.pointerType==='pen'?'pen':'mouse',repeat:false})}}>{en?'Respond':'回应'}</button><p className="pvt-control-hint">{en?'Touch / mouse / Space':'触控／鼠标／空格键'}</p><button className="pvt-end" data-pvt-end onClick={end}>{en?'End this attempt':'结束本次'}</button></>}
    {view==='practice-feedback'&&<><h1>{en?'Practice response recorded':'练习回应已记录'}</h1><p>{en?'Release before the next response. There is no speed pass mark.':'每次按后抬起，没有速度合格线。'}</p><button data-pvt-end onClick={end}>{en?'End practice':'结束练习'}</button></>}
    {view==='practice-result'&&<><h1>{en?'Three practice targets completed':'3次练习已完成'}</h1><p>{en?'All three received a first response after target onset. Practice is separate from assessment.':'3次都记录到目标出现后的首答，练习不计正式结果。'}</p>{s.pending&&<p role="status">{en?'Confirming practice records were saved…':'正在确认练习记录已保存…'}</p>}<button disabled={s.pending} onClick={()=>s.acceptPractice()}>{en?'Prepare assessment':'准备正式'}</button><button data-pvt-end onClick={end}>{en?'End practice':'结束练习'}</button></>}
    {['preparing','saving'].includes(view)&&<p role="status">{en?'Confirming your record was saved…':'正在确认记录已保存…'}</p>}
    {view==='retry'&&<><h1>{en?'Presentation has stopped':'呈现已停止'}</h1><p>{en?'Keep this page open and retry saving the same originals. Exposed waits and targets do not replay. Report saving and complete original archival are separate; closing the page does not guarantee an upload.':'请保留本页，重试保存同一份原件，不重放已经曝光的等待或目标。报告保存与完整原件归档分开，关页不保证上传。'}</p><button onClick={()=>void s.retry()}>{en?'Retry saving':'重试保存'}</button></>}
    {view==='stopped'&&<><h1>{en?'Practice has ended':'本次练习已结束'}</h1><p>{en?'No formal assessment is claimed. This is not an ability judgement. Review the instructions before a separate attempt.':'不把练习当正式完成，这不是能力判断。另开一次前请先重看说明。'}</p><PvtInstructions config={config} language={language}/></>}
    {view==='blocked'&&<p role="alert">{en?'A fresh durable attempt could not be confirmed; no target was shown.':'尚未确认新的本机耐久作答身份，没有呈现目标。'}</p>}
  </main>
}
