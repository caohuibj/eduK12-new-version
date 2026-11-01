import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {CognitiveTaskProps} from '../../core/runner.types'
import {CognitiveTaskIntro} from '../shared/CognitiveTaskPresentation'
import {CognitiveFocusStage} from '../shared/CognitiveFocusStage'
import type {EmbeddedfiguresConfig,EmbeddedfiguresTrialPayload} from './types'
import {embeddedfiguresItemV2,embeddedTargetTranslations,type ContextFigure,type Point} from './generator.v2'
import './embeddedfigures.css'

type Phase='instruction'|'practice'|'formal'|'completed'
type Step='target'|'search'|'feedback'
const Figure=({figure,target}:{figure?:ContextFigure;target?:Point[]})=><svg viewBox="0 0 100 100" aria-hidden="true" className="embedded-figure">
 {figure?.lines.map((line,i)=><line key={i} x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y}/>)}
 {target&&<polygon points={target.map(p=>p.x+','+p.y).join(' ')} className={figure?'embedded-teaching-answer':undefined}/>}
</svg>
export const EmbeddedfiguresTask=({taskContext,trialIndex,onTrialComplete,onTaskComplete}:CognitiveTaskProps)=>{
 const config=taskContext.config as unknown as EmbeddedfiguresConfig
 const [phase,setPhase]=useState<Phase>('instruction'),[step,setStep]=useState<Step>('target'),[feedback,setFeedback]=useState(''),[practiceCorrect,setPracticeCorrect]=useState(false)
 const [remaining,setRemaining]=useState(config.timeoutMs)
 const started=useRef<number|null>(null),interrupted=useRef(false),inFlight=useRef(false),completionSent=useRef(false)
 const pending=useRef<EmbeddedfiguresTrialPayload|null>(null),activeIndex=useRef(trialIndex);activeIndex.current=trialIndex
 const practice=phase==='practice'
 const item=useMemo(()=>embeddedfiguresItemV2(taskContext.randomSeed+(practice?':practice':''),practice?0:trialIndex),[taskContext.randomSeed,practice,trialIndex])
 useEffect(()=>{if(phase==='formal'){setStep('target');setFeedback('');pending.current=null;interrupted.current=false}},[phase,trialIndex])
 useEffect(()=>{
  if((phase!=='practice'&&phase!=='formal')||step!=='target')return
  const timer=window.setTimeout(()=>{started.current=performance.now();setRemaining(config.timeoutMs);setStep('search')},config.showTargetMs)
  return()=>window.clearTimeout(timer)
 },[phase,step,trialIndex,config.showTargetMs,config.timeoutMs])
 useEffect(()=>{
  if(phase!=='formal')return
  const hidden=()=>{if(document.hidden)interrupted.current=true}
  document.addEventListener('visibilitychange',hidden);return()=>document.removeEventListener('visibilitychange',hidden)
 },[phase])
 const finish=useCallback(async()=>{
  if(completionSent.current)return
  completionSent.current=true;setPhase('completed');setFeedback('已完成，正在准备本次结果…')
  try{await onTaskComplete?.()}
  catch{completionSent.current=false;setFeedback('本题已记录，完成确认未成功，请重试。')}
 },[onTaskComplete])
 const persist=useCallback(async(payload:EmbeddedfiguresTrialPayload)=>{
  if(inFlight.current)return
  inFlight.current=true;setFeedback('正在记录本题…')
  try{
   const accepted=await onTrialComplete(payload)
   if(accepted===false)throw Error('not accepted')
   pending.current=null
   if(payload.itemIndex===config.totalTrials-1)await finish()
  }catch{
   if(activeIndex.current===payload.itemIndex)setFeedback('提交未确认，请重试保存；不必重新寻找。')
  }finally{inFlight.current=false}
 },[onTrialComplete,finish,config.totalTrials])
 const pick=useCallback((choice:string|null)=>{
  if(step!=='search'||inFlight.current)return
  if(practice){setPracticeCorrect(choice===item.targetId);setFeedback(choice===item.targetId?'找对了。教学高亮显示它的三条边如何融入背景。':'这次未找到。教学高亮给出本练习的答案；重新读说明后再练习。');setStep('feedback');return}
  if(phase!=='formal'||pending.current)return
  const elapsed=started.current===null?config.timeoutMs:Math.max(0,performance.now()-started.current)
  const timedOut=choice===null||elapsed>=config.timeoutMs
  const payload={itemIndex:trialIndex,clickedShapeId:timedOut?null:choice,rtMs:timedOut?null:Math.floor(elapsed),interrupted:interrupted.current}
  pending.current=payload;setStep('feedback');void persist(payload)
 },[step,practice,item.targetId,phase,config.timeoutMs,trialIndex,persist])
 useEffect(()=>{
  if(step!=='search'||(phase!=='practice'&&phase!=='formal'))return
  const tick=()=>setRemaining(Math.max(0,config.timeoutMs-(performance.now()-(started.current??performance.now()))))
  const timer=window.setTimeout(()=>pick(null),Math.max(0,config.timeoutMs-(performance.now()-(started.current??performance.now()))))
  const interval=window.setInterval(tick,250)
  return()=>{window.clearTimeout(timer);window.clearInterval(interval)}
 },[phase,step,config.timeoutMs,pick])
 const beginPractice=()=>{setFeedback('');setPracticeCorrect(false);setStep('target');setPhase('practice')}
 if(phase==='instruction')return <CognitiveTaskIntro title="嵌入图形" description={(taskContext.config.report as { reportVersion?: string } | undefined)?.reportVersion === '3.0.0' ? (<><p>先看目标轮廓，再从七个复杂图块中，选择包含它的那个。三条边会与背景线相交或延伸。</p><p>目标的形状、大小和方向保持不变，只会平移。请确认整条轮廓，不需要旋转或缩放。</p><p>看一张复杂地图时，先记住一小段路线的转角，再去找完整走向；局部像还不够，要连起来核对。 这次任务只记录本次作答表现。</p></>) : (<><p>先看目标轮廓，再从七个复杂图块中，选择包含它的那个。三条边会与背景线相交或延伸。</p><p>目标的形状、大小和方向保持不变，只会平移。请确认整条轮廓，不需要旋转或缩放。</p></>)} hint={<p>每题只记录第一次选择；限时 {config.timeoutMs/1000} 秒。先完成一次练习，练习回答后有教学高亮，正式题没有答案提示。</p>} onAction={beginPractice}/>
 if(phase==='completed')return <><p role="status">{feedback}</p>{!completionSent.current&&<button type="button" className="btn-primary" onClick={()=>void finish()}>重试完成确认</button>}</>
 const content=<section className="card embedded-task" aria-label={practice?'嵌入图形练习':'嵌入图形正式作答'}>
  <p>{practice?'练习 · 不计入成绩':`第 ${trialIndex+1} / ${config.totalTrials} 题`}</p>
  {step==='target'&&<><h2>记住目标的形状、大小和方向</h2><div className="embedded-board"><div className="embedded-target"><Figure target={item.target}/></div></div></>}
  {step==='search'&&<><h2>哪个图块包含刚才的完整轮廓？</h2><div className="embedded-board embedded-grid">{item.field.map((figure,i)=><button className="embedded-choice" key={figure.id} type="button" aria-label={`选择图块 ${i+1}`} onClick={()=>pick(figure.id)}><Figure figure={figure}/><span>{i+1}</span></button>)}</div><p>剩余 {Math.ceil(remaining/1000)} 秒</p></>}
  {step==='feedback'&&<><p role="status">{feedback}</p>{practice?<><div className="embedded-board"><div className="embedded-target"><Figure figure={item.field.find(f=>f.id===item.targetId)} target={item.target.map(p=>{const shift=embeddedTargetTranslations(item.field.find(f=>f.id===item.targetId)!,item.target)[0];return {x:p.x+shift.x,y:p.y+shift.y}})}/></div></div>{practiceCorrect?<button type="button" className="btn-primary" onClick={()=>{setStep('target');setFeedback('');setPhase('formal')}}>开始正式测评</button>:<button type="button" className="btn-primary" onClick={()=>{setPhase('instruction');setStep('target');setFeedback('')}}>重新阅读说明并练习</button>}</>:pending.current&&feedback.includes('未确认')?<button type="button" className="btn-primary" onClick={()=>{if(pending.current)void persist(pending.current)}}>重试保存本题</button>:null}</>}
 </section>
 return <CognitiveFocusStage ariaLabel={practice?'嵌入图形练习':'嵌入图形正式测验'}>{content}</CognitiveFocusStage>
}
