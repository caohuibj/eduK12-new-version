import React, { useEffect, useRef, useState } from 'react'
import { MOT_COLORS, motCalibrationMatches, motConfig, motGeometry, motTrialPlan,
  type MotCalibration as Calibration, type MotConfig, type MotTrial } from './generated/protocol'
import { MotCalibration } from './MotCalibration'
import { readMotDisplay } from './display'
import { MotCapture, type MotStage } from './capture'
import { MotDraftError, type MotDraftPort, type MotDraftRecord } from './draft'
import { createMotSaveGate } from './save-gate'
import './mot.css'

export interface MotTaskProps {
  config: MotConfig; randomSeed: string; trialIndex: number; language?: 'zh'|'en'
  draft: MotDraftPort
  /** Persist core through the platform. false/rejection leaves an explicit retry, never repeats exposure. */
  onTrialComplete: (core:MotTrial)=>Promise<void|boolean>
  /** Platform uploads raw frames to private COS and verifies its version before the final core is submitted. */
  prepareFinalArchive: (records:{formal:readonly MotDraftRecord[];practice:readonly MotDraftRecord[]})=>Promise<void>
}
export function MotTask({config,randomSeed,trialIndex,language='zh',draft,onTrialComplete,prepareFinalArchive}:MotTaskProps){
  if(config.profile!=='research'&&config.profile!=='experience')throw new Error('Unknown MOT profile')
  const expected=motConfig(config.profile)
  if(Object.keys(config).length!==Object.keys(expected).length||Object.entries(expected).some(([key,v])=>config[key as keyof MotConfig]!==v))
    throw new Error('Unsupported frozen MOT config')
  const en=language==='en'
  const [view,setView]=useState<'intro'|'calibration'|'ready'|'running'|'practice-feedback'|'break'|'saving'|'error'>('intro')
  const [calibration,setCalibration]=useState<Calibration|null>(null)
  const [practice,setPractice]=useState(0),[formal,setFormal]=useState(false)
  const [stage,setStage]=useState<MotStage>('fixation'),[selected,setSelected]=useState<number[]>([])
  const [practiceHits,setPracticeHits]=useState(0),[error,setError]=useState('')
  const capture=useRef<MotCapture|null>(null),board=useRef<HTMLDivElement>(null)
  const dots=useRef<Array<HTMLButtonElement|null>>([]),working=useRef(false)
  const saveGate=useRef(createMotSaveGate())
  const retry=useRef<(()=>Promise<void>)|null>(null)
  const startRef=useRef<()=>Promise<void>>(async()=>{})
  const trialCallback=useRef(onTrialComplete);trialCallback.current=onTrialComplete
  const archiveCallback=useRef(prepareFinalArchive);archiveCallback.current=prepareFinalArchive

  function persist(record:MotDraftRecord):Promise<void>{
    const snapshot=structuredClone(record)
    return saveGate.current.run('formal:'+snapshot.core.trialIndex,()=>persistFormal(snapshot))
  }
  async function persistFormal(record:MotDraftRecord){
    setView('saving')
    try{
      await draft.append(record)
      if(record.core.trialIndex===config.totalTrials-1)await archiveCallback.current({formal:await draft.records(),practice:await draft.practices()})
      const accepted=await trialCallback.current(structuredClone(record.core))
      if(accepted===false)throw new Error('Core persistence has not been confirmed')
      retry.current=null
      if(record.core.trialIndex===config.totalTrials-1){setView('saving');return}
      const boundary=(record.core.trialIndex+1)%(config.repetitionsPerSpeedPerBlock*3)===0
      setView(boundary?'break':'ready')
    }catch{
      retry.current=()=>persist(record);setError(en?'Saving is not confirmed. Your local record is retained; retry saving without repeating the trial.':'保存尚未确认。本机记录已保留，请重试保存，无需重复作答。');setView('error')
    }
  }
  function persistPractice(record:MotDraftRecord):Promise<void>{
    const snapshot=structuredClone(record)
    return saveGate.current.run('practice:'+practice,async()=>{
      setView('saving')
      try{
        await draft.appendPractice(snapshot)
        retry.current=null
        setPracticeHits(snapshot.core.responses.filter(r=>snapshot.core.targetIds.includes(r.objectId)).length)
        setView('practice-feedback')
      }catch{
        retry.current=()=>persistPractice(snapshot)
        setError(en?'The practice record has not been saved. Keep this page open and retry saving; you do not need to repeat the practice.':'练习记录尚未保存。请保留当前页面并重试保存，无需重复练习。')
        setView('error')
      }
    })
  }
  const finishRef=useRef<(value:MotCapture)=>void>(()=>{})
  finishRef.current=value=>{
    if(working.current)return
    working.current=true
    const save=formal?persist(value.record()):persistPractice(value.record())
    void save.finally(()=>{working.current=false})
  }
  startRef.current=async()=>{
    if(!calibration||working.current)return
    working.current=true
    try{
      const display=readMotDisplay(language,calibration.referenceCssPx,calibration.viewingDistanceMm)
      if(!motCalibrationMatches(calibration,display)){setView('calibration');return}
      const pending=await draft.pending()
      if(pending){
        if(pending.trialIndex!==trialIndex)throw new MotDraftError('SEQUENCE','Pending MOT exposure differs from current progress')
        const recovered=new MotCapture(config,motTrialPlan(config,randomSeed,pending.trialIndex),pending.calibration,performance.now())
        recovered.trial.recordOrigin='recovered_without_timing'
        recovered.interrupt('runner_restart',performance.now())
        working.current=false;await persist(recovered.record());return
      }
      if(formal){
        const existing=(await draft.records()).find(r=>r.core.trialIndex===trialIndex)
        if(existing){working.current=false;await persist(existing);return}
        await draft.begin({trialIndex,calibration})
      }
      const value=new MotCapture(config,motTrialPlan(config,randomSeed,formal?trialIndex:practice,!formal),calibration,performance.now())
      capture.current=value;setStage('fixation');setSelected([]);setView('running')
    }catch(error){
      const recoveryConflict=error instanceof MotDraftError&&(error.code==='CONFLICT'||error.code==='SEQUENCE')
      setError(recoveryConflict?(en?'The local records do not match this attempt’s progress. Keep this page open and contact the publisher to recover the record.':'本机记录与本次作答进度不一致。请保留当前页面，联系发布者恢复记录。'):
        en?'Local saving is unavailable. The trial has not started. Please enable storage and try again.':'本机保存暂不可用，任务尚未开始。请允许存储后重试。')
      setView('error')
    }
    finally{working.current=false}
  }
  useEffect(()=>{
    if(view!=='running')return
    let frame=0,alive=true
    const value=capture.current!
    const paint=(now:number)=>{
      if(!alive)return
      const previous=value.stage,next=value.tick(now)
      if(previous!==next)setStage(next)
      for(const object of value.plan.objects){
        const element=dots.current[object.id],p=value.position(object.id,now)
        if(element){element.style.left=(p.x/12*100)+'%';element.style.top=(p.y/12*100)+'%'}
      }
      if(next==='complete'){finishRef.current(value);return}
      frame=requestAnimationFrame(paint)
    }
    const interrupt=(reason:MotTrial['interruptions'][number])=>{
      if(value.stage==='complete')return
      value.interrupt(reason,performance.now());finishRef.current(value)
    }
    const visibility=()=>{if(document.hidden)interrupt('visibility_lost')}
    const blur=()=>interrupt('window_blur')
    const resize=()=>{
      const current=readMotDisplay(language,value.calibration.referenceCssPx,value.calibration.viewingDistanceMm)
      if(!motCalibrationMatches(value.calibration,current))interrupt('viewport_changed')
    }
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',blur)
    window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize)
    frame=requestAnimationFrame(paint)
    return()=>{alive=false;cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',visibility)
      window.removeEventListener('blur',blur);window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize)}
  },[view,language])
  const choose=(point:{x:number;y:number},input:'touch'|'pointer'|'keyboard',keyboardId?:number)=>{
    const value=capture.current
    if(!value||working.current)return
    value.select(point,input,performance.now(),keyboardId)
    setSelected(value.trial.responses.map(r=>r.objectId))
    if(value.stage==='complete')finishRef.current(value)
  }
  const ready=()=>{setView('ready');setError('')}
  const field=calibration?motGeometry(calibration,window.innerWidth-28,window.innerHeight-242).fieldCssPx:0
  const value=capture.current
  return <div className="mot-task" data-cognitive-task-root="true" data-mot-stage={view==='running'?stage:view}>
    {view==='intro'&&<section className="mot-intro"><h1>{en?'Follow the five targets':'跟住这5个目标'}</h1>
      <p>{en?'Ten circles appear. Remember the five red circles. When they all turn dark and move, keep track of those five. After they stop, select the five original targets.':'画面会出现10个圆点。记住其中5个红色圆点；全部变成深色并移动后，请继续追踪这5个目标。停止后，选出最初的5个目标。'}</p>
      <p>{en?'Tap or click each circle once. Selections cannot be undone; the fifth selection ends the trial. Overlapping circles require a clear, unambiguous point.':'点击或轻触圆点，每个只能选一次，不能撤销；选满5个后本轮自动结束。重叠圆点需点到可以明确区分的位置。'}</p>
      <details><summary>{en?'Keyboard controls':'键盘操作'}</summary><p>{en?'In the response phase, Tab into the display. Arrow keys move focus to a circle in that direction; Space or Enter selects it.':'进入作答阶段后，用Tab进入区域，方向键移动到相应方向的圆点，空格或回车选中。'}</p></details>
      <p>{en?'First calibrate the screen and try two practice trials. Formal trials do not tell you which choices were correct.':'先校准屏幕，再练习2次。正式作答不提示选择是否正确。'}</p>
      <button className="mot-button" onClick={()=>setView('calibration')}>{en?'Set up the screen':'校准屏幕'}</button></section>}
    {view==='calibration'&&<MotCalibration language={language} onConfirm={c=>{setCalibration(c);ready()}}/>}
    {(view==='ready'||view==='break')&&<section className="mot-intro"><h1>{view==='break'?(en?'Take a short break':'休息一下'):
      formal?(en?'Ready for the next trial':'准备开始下一轮'):(en?'Try the practice':'先来练习' )}</h1>
      <p>{en?'Keep your viewing distance unchanged. Start when you are ready.':'请保持刚才的观看距离，准备好后开始。'}</p>
      <button className="mot-button" onClick={()=>void startRef.current()}>{en?'Start':'开始'}</button></section>}
    {view==='running'&&value&&<section className="mot-stage">
      <div className="mot-stage-header" aria-hidden="true"><span>{formal?(en?'Formal trial':'正式作答'):(en?'Practice':'练习')}</span><span>{(formal?trialIndex:practice)+1} / {formal?config.totalTrials:2}</span></div>
      <div className="mot-stage-space"><div ref={board} className="mot-board" style={{width:field,height:field}}
        role="group" aria-label={en?'Tracking display':'追踪区域'} tabIndex={stage==='response'?0:-1}
        onPointerDown={e=>{e.preventDefault();if(!e.isPrimary||e.button!==0)return
          const rect=e.currentTarget.getBoundingClientRect(),x=e.clientX-rect.left-e.currentTarget.clientLeft,y=e.clientY-rect.top-e.currentTarget.clientTop
          choose({x:x/e.currentTarget.clientWidth*12,y:y/e.currentTarget.clientHeight*12},e.pointerType==='touch'?'touch':'pointer')}}
        onKeyDown={e=>{
          if(e.repeat||e.altKey||e.metaKey||e.ctrlKey)return
          const keys=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter']
          if(!keys.includes(e.key))return;e.preventDefault()
          if(stage!=='response'){if(e.key===' '||e.key==='Enter')choose({x:0,y:0},'keyboard');return}
          const focusedId=(document.activeElement as HTMLElement)?.dataset.motId
          if(focusedId===undefined&&(e.key===' '||e.key==='Enter')){dots.current[0]?.focus();return}
          const id=Number(focusedId??0)
          if(e.key===' '||e.key==='Enter'){choose(value.position(id,performance.now()),'keyboard',id);return}
          const p=value.position(id,performance.now()),axis=e.key==='ArrowLeft'||e.key==='ArrowRight'?'x':'y'
          const sign=e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1
          const candidates=value.plan.objects.filter(o=>!selected.includes(o.id)&&o.id!==id).map(o=>({id:o.id,p:value.position(o.id,performance.now())}))
            .filter(o=>(o.p[axis]-p[axis])*sign>0).sort((a,b)=>Math.hypot(a.p.x-p.x,a.p.y-p.y)-Math.hypot(b.p.x-p.x,b.p.y-p.y))
          dots.current[candidates[0]?.id??id]?.focus()
        }}>
        {stage==='fixation'?<span className="mot-cross" aria-hidden="true">+</span>:value.plan.objects.map(object=><button
          key={object.id} ref={element=>{dots.current[object.id]=element}} className="mot-dot" type="button"
          tabIndex={-1} data-mot-id={object.id} data-selected={selected.includes(object.id)}
          aria-label={(en?'Circle ':'圆点')+(object.id+1)} aria-pressed={selected.includes(object.id)}
          style={{width:field/10,height:field/10,left:(object.x/12*100)+'%',top:(object.y/12*100)+'%',
            background:selected.includes(object.id)?MOT_COLORS.selected:stage==='cue'&&value.plan.targetIds.includes(object.id)?MOT_COLORS.target:MOT_COLORS.object}}>
            {selected.includes(object.id)?<span aria-hidden="true">✓</span>:null}</button>)}
      </div></div>
      <div className="mot-stage-footer"><h1>{stage==='response'?(en?'Select the five targets':'选出最初的5个目标'):stage==='cue'?(en?'Remember the red targets':'记住红色目标'):(en?'Keep watching':'请持续注视')}</h1>
        {stage==='response'&&<p role="status">{en?'Selected':'已选择'} {selected.length} / 5</p>}</div>
    </section>}
    {view==='practice-feedback'&&<section className="mot-intro"><h1>{en?'Practice record':'练习记录'}</h1>
      <p>{en?'Targets found':'找回目标'} {practiceHits} / 5</p>
      <button className="mot-button" onClick={()=>{if(practice===0){setPractice(1);ready()}else{setFormal(true);ready()}}}>
        {practice===0?(en?'Next practice':'再练习一次'):(en?'Start formal trials':'进入正式作答')}</button>
      {practice===1&&<button className="mot-button mot-button-secondary" onClick={()=>{setPractice(0);ready()}}>{en?'Repeat practice':'重新练习'}</button>}</section>}
    {view==='saving'&&<section className="mot-intro" role="status"><p>{en?'Saving your record…':'正在保存记录…'}</p></section>}
    {view==='error'&&<section className="mot-intro"><p role="alert">{error}</p><button className="mot-button" onClick={()=>{if(retry.current)void retry.current();else ready()}}>{en?'Retry':'重试'}</button></section>}
  </div>
}
