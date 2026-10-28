import React,{useEffect,useRef,useState} from 'react'
import { antPlan,isAntGuidedConfig,type AntConfig,type Direction,type Input } from './generated/protocol'
import { AntSession,type AntSessionOptions,type AntExposureClaim } from './session'
import { antDisplayProblem,antDirectionForKey,type AntDisplayPort } from './display'
import { paintAnt } from './paint'
import { AntGuidedInstructions } from './AntGuidedInstructions'
import './ant.css'
export interface AntTaskProps {
  contextId:string;config:AntConfig;randomSeed:string;configHash:string;protocolSignature:string;
  display:AntDisplayPort|null;language?:'zh'|'en';allowSyntheticFixture?:boolean;
  /** Durable, one-time host marker must reject a reopened/refreshed attempt; not a sessionStorage flag. */
  claimAttemptExposure:(identity:{contextId:string;configHash:string;protocolSignature:string})=>Promise<AntExposureClaim>;
  persistLocalDraft:AntSessionOptions['persistLocalDraft'];onTaskComplete:AntSessionOptions['onTaskComplete'];
}
export function AntTask(props:AntTaskProps){
  // Every measurement/context change remounts an isolated capture and callback closure.
  const key=[props.contextId,props.randomSeed,props.configHash,props.protocolSignature,props.language,
    JSON.stringify(props.config),JSON.stringify(props.display?.frozen),props.allowSyntheticFixture].join('|')
  return <AntTaskSession key={key} {...props}/>
}
function AntTaskSession(props:AntTaskProps){
  antPlan(props.config,props.randomSeed) // strict runtime config/seed check before any exposure
  const en=props.language==='en',fixture=props.allowSyntheticFixture===true
  const [,update]=useState(0),[problem,setProblem]=useState<string|null>(null)
  const svg=useRef<SVGSVGElement>(null),session=useRef<AntSession|null>(null),alive=useRef(true)
  const claiming=useRef(false)
  const heldKeys=useRef(new Set<string>()),heldPointers=useRef(new Set<number>())
  const readProblem=()=>{
    try{return props.display?antDisplayProblem(session.current?.options.display??props.display.frozen,props.display.readViewport(),props.config,
      props.configHash,props.protocolSignature,fixture):'missing_frozen_geometry'}catch{return 'display_port_unavailable'}
  }
  useEffect(()=>{
    alive.current=true
    const frozen=props.display?structuredClone(props.display.frozen):null
    if(props.display&&frozen)session.current=new AntSession({contextId:props.contextId,config:props.config,seed:props.randomSeed,
      display:frozen,fixture,persistLocalDraft:props.persistLocalDraft,onTaskComplete:props.onTaskComplete,
      now:()=>performance.now(),timeOrigin:()=>Number.isFinite(performance.timeOrigin)?performance.timeOrigin:null,
      paint:capture=>{if(svg.current)paintAnt(svg.current,capture,frozen,capture?.stage??'fixation')},
      onChange:()=>{if(alive.current)update(n=>n+1)}})
    const down=(e:KeyboardEvent)=>{
      const direction=frozen?antDirectionForKey(frozen,e.key):null
      const held=heldKeys.current.has(e.key);heldKeys.current.add(e.key)
      if(!direction||session.current?.view!=='running'||e.ctrlKey||e.altKey||e.metaKey)return
      e.preventDefault();session.current.capture?.input(direction,'keyboard',performance.now(),e.repeat,held)
    }
    const up=(e:KeyboardEvent)=>heldKeys.current.delete(e.key)
    const pointerUp=(e:PointerEvent)=>heldPointers.current.delete(e.pointerId)
    const interrupt=(reason:string)=>session.current?.view==='running'&&session.current.stop(reason,performance.now())
    const visibility=()=>{if(document.hidden)interrupt('visibility_lost')}
    const blur=()=>interrupt('window_blur')
    const resize=()=>{if(readProblem())interrupt('viewport_changed')}
    window.addEventListener('keydown',down);window.addEventListener('keyup',up)
    window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerUp)
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',blur)
    window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize)
    return()=>{alive.current=false;session.current?.close();session.current=null
      window.removeEventListener('keydown',down);window.removeEventListener('keyup',up)
      window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',pointerUp)
      document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',blur)
      window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize)}
  },[]) // Measurement props are immutable under the wrapper key; in-flight callbacks retain their original context.
  const current=session.current,view=current?.view??'intro'
  useEffect(()=>{
    if(view!=='running')return
    let alive=true,frame=0
    const paint=()=>{
      if(!alive)return
      const instance=session.current
      if(!instance||instance.view!=='running')return
      if(readProblem()){instance.stop('viewport_changed',performance.now());return}
      instance.tick(performance.now()) // actual DOM mutation clock inside rAF, not a scheduled deadline
      if(instance.view==='running')frame=requestAnimationFrame(paint)
    }
    frame=requestAnimationFrame(paint)
    return()=>{alive=false;cancelAnimationFrame(frame)}
  },[view])
  async function start(phase:'practice'|'test'|'continue'){
    const error=readProblem();setProblem(error);if(error||!session.current||claiming.current)return
    const instance=session.current
    if(phase==='practice'){
      if(!instance.needsExposureClaim){instance.startPractice();return}
      if(typeof props.claimAttemptExposure!=='function'){setProblem('missing_durable_attempt_marker');return}
      claiming.current=true
      try{
        const claim=await props.claimAttemptExposure({contextId:props.contextId,configHash:props.configHash,protocolSignature:props.protocolSignature})
        if(!alive.current||session.current!==instance)return
        instance.authorizeExposure(claim)
        const changed=readProblem();if(changed){setProblem(changed);return}
        instance.startPractice()
      }catch{if(alive.current)setProblem('fresh_durable_attempt_marker_required')}
      finally{claiming.current=false}
    }
    else if(phase==='test')instance.startFormal()
    else instance.continueBlock()
  }
  function choose(direction:Direction,input:Input,now:number,pointerId:number){
    const held=heldPointers.current.has(pointerId);heldPointers.current.add(pointerId)
    session.current?.capture?.input(direction,input,now,false,held)
  }
  const d=current?.options.display??props.display?.frozen,g=d?.geometry
  if(view==='running'&&d&&g)return <main className="ant-candidate ant-stimulus" data-ant-view="running" data-ant-fixture={fixture?'true':'false'}>
    <svg className="ant-field" ref={svg} width={g.fieldWidthCssPx} height={g.fieldHeightCssPx} role="img"
      aria-label={en?'Look at the center and respond to the middle arrow':'注视中央，判断中间箭头方向'} />
    <div className="ant-responses" role="group" aria-label={en?'Fixed response areas':'固定回应区'} style={{gap:g.responseGapCssPx}}>
      {(['left','right'] as const).map(direction=><button key={direction} type="button" style={{width:g.responseWidthCssPx,height:g.responseHeightCssPx}}
        aria-label={en?(direction==='left'?'Respond left':'Respond right'):(direction==='left'?'向左回应':'向右回应')}
        onPointerDown={e=>{e.preventDefault();if(e.button!==0)return
          choose(direction,e.pointerType==='touch'?'touch':'pointer',performance.now(),e.pointerId)}}>{direction==='left'?'←':'→'}</button>)}
    </div>
  </main>
  const localStatus=current?.queue.durableCount??0
  return <main className="ant-candidate" data-ant-view={view}><div className="ant-body">
    {fixture&&<p className="ant-fixture-label">{en?'SYNTHETIC DEVICE FIXTURE · Not physically calibrated':'合成设备示例 · 未完成物理校准'}</p>}
    {view==='intro'&&<>
      <h1>{en?'Follow the middle arrow':'看中间箭头，判断它的方向'}</h1>
      {isAntGuidedConfig(props.config)?<AntGuidedInstructions config={props.config} en={en} leftKey={d?.inputMap.leftKey} rightKey={d?.inputMap.rightKey}/>:<>
      <p>{en?'Keep looking at the center. Brief cues may appear, then arrows appear above or below. Choose the direction of the middle arrow and ignore its neighbors.':'请注视中央。画面可能先出现短暂提示，随后在上方或下方出现箭头。判断中间箭头朝向，忽略两侧箭头。'}</p>
      <svg className="ant-svg-example" viewBox="0 0 240 80" aria-hidden="true"><text x="120" y="50" textAnchor="middle" fontSize="32" fill="#000">← ← → ← ←</text></svg>
      <p>{en?'Use the fixed left/right areas by touch or mouse. Keyboard controls are shown below. Try to use the same response method throughout.':'轻触或点击固定左右回应区，键盘操作见下方。请尽量全程使用同一种回应方式，便于比较用时。'}</p>
      <details><summary>{en?'Timing, controls and session length':'时序、操作与时长'}</summary>
        <p>{en?'24 practice trials are saved separately. The research profile has 288 formal trials; experience has 48. Each trial starts 4 seconds after the previous start, including the response period.':'24次练习单独记录。文献次数对照版288次正式，体验版48次。每次起点相隔4秒，包含作答时间。'}</p>
        <p>{en?'Formal minimum: 19.2 / 3.2 minutes; practice adds 1.6 minutes, plus instructions, calibration and breaks.':'正式理论最短19.2 / 3.2分钟；练习另需1.6分钟，还需说明、校准与休息。'}</p>
        <p>{en?'Keyboard':'键盘'}：{d?.inputMap.leftKey??'—'} / {d?.inputMap.rightKey??'—'}。{en?'Release between responses.':'每次回应后请松开。'}</p>
      </details>
      <p>{en?'First complete the screen and viewing-distance calibration. Keep the same distance while responding.':'开始前，请先完成屏幕与观看距离校准。作答时请保持相同的观看距离。'}</p>
      </>}
      <button onClick={()=>void start('practice')}>{en?'Start practice':'开始练习'}</button>
    </>}
    {view==='practice-instructions'&&isAntGuidedConfig(props.config)&&<>
      <h1>{en?'Read the instructions again':'再看一次操作说明'}</h1>
      <p>{en?'Take your time with the examples before your next practice round.':'先对照例子确认操作，再开始下一轮练习。'}</p>
      <AntGuidedInstructions config={props.config} en={en} leftKey={d?.inputMap.leftKey} rightKey={d?.inputMap.rightKey}/>
      <button onClick={()=>void start('practice')}>{en?'Start the next practice round':'开始下一轮练习'}</button>
    </>}
    {view==='practice-item-feedback'&&current?.lastPractice&&<>
      <h1>{en?'Practice answer':'练习答案'}</h1>
      <p role="status">{current.lastPracticeCorrect?(en?'Correct.':'这一题答对了。'):(en?'Let’s check this one.':'我们看一下这一题。')}
        {en?`The middle arrow points ${current.lastPractice.core.direction}.`:`中间箭头朝${current.lastPractice.core.direction==='left'?'左':'右'}，应选择“向${current.lastPractice.core.direction==='left'?'左':'右'}”。`}</p>
      <p>{en?'The neighboring arrows and the upper/lower screen position do not change your response. Wait for the arrows, then respond once.':'旁边箭头的方向、画面上下位置都不改变答案；看到箭头后回应一次即可。'}</p>
      <button onClick={()=>current.nextPracticeTrial()}>{en?'Next practice trial':'下一题'}</button>
    </>}
    {view==='practice-feedback'&&(current?.practicePolicy?<>
      <h1>{current.practicePassed?(en?'Practice passed':'练习已通过'):(en?'Review before trying again':'再看说明后练习' )}</h1>
      <p>{en?`You answered ${current.practiceCorrect} of 8 correctly; 7 are required. Practice is separate from your formal result.`:`本轮答对${current.practiceCorrect}/8题，需至少答对7题。练习不计入正式结果。`}</p>
      {current.lastPractice&&<p>{en?`For the last trial, the middle arrow pointed ${current.lastPractice.core.direction}.`:`最后一题的中间箭头朝${current.lastPractice.core.direction==='left'?'左':'右'}，正确应选“向${current.lastPractice.core.direction==='left'?'左':'右'}”。`}</p>}
      {current.practicePassed?<button onClick={()=>void start('test')}>{en?'Start formal trials':'开始正式作答'}</button>:<>
        <p>{current.canRetryPractice?(en?'Read the full instructions again before another round.':'请先重新查看完整说明与例子，再开始下一轮。'):(en?'Please pause here and try again later. You have not entered formal trials.':'本次先练习到这里，建议休息后再试；尚未进入正式测量。')}</p>
        {current.canRetryPractice&&<button onClick={()=>current.reviewPracticeInstructions()}>{en?'Review instructions':'重新查看说明'}</button>}
        <button onClick={()=>current.endPractice()}>{en?'Finish practice for now':'结束本次练习'}</button>
      </>}
    </>:<><h1>{en?'Practice records are ready':'24次练习已记录'}</h1><p>{en?'Practice is separate from the formal result. Continuing means you understand the response method; it is not a practice accuracy pass mark.':'练习与正式结果分开。继续表示你已理解回应方式，不是练习正确率达标判定。'}</p><button onClick={()=>void start('test')}>{en?'Start formal trials':'开始正式作答'}</button></>)}
    {view==='break'&&<><h1>{en?'Take a short break':'休息一下'}</h1><p>{en?'Keep the same viewing distance and input. Continue when ready.':'请保持观看距离与输入方式，准备好后继续。'}</p><button onClick={()=>void start('continue')}>{en?'Continue next block':'继续下一组'}</button></>}
    {view==='saving'&&<p role="status">{en?'Saving your records on this device…':'正在这台设备上保存记录…'}</p>}
    {(view==='error'||view==='terminated')&&<><h1>{en?'This attempt has stopped':'本次作答已停止'}</h1><p className="ant-error">{en?'Completed and interrupted responses are retained. Retrying saves these same records without starting the task again.':'已经完成或中断的作答会保留。重试只保存这些记录，不会重新开始作答。'}</p><details><summary>{en?'Technical details for support':'需要帮助时可查看技术诊断'}</summary><code>{current?.reason}</code></details>
      {view==='error'?<button onClick={()=>void current?.retryLocal()}>{en?'Retry saving these records':'重试保存记录'}</button>:<button onClick={()=>void current?.finalize()}>{en?'Submit the retained records':'提交已保留的记录'}</button>}</>}
    {view==='complete'&&<h1>{en?'This session is complete':'本轮作答已结束'}</h1>}
    {(view==='terminated'||view==='complete')&&<p role="status">{current?.serverSaved?(en?'Submitted successfully.':'提交成功。'):(current?.queue.pendingCount===0&&!current?.queue.failed?(en?'Your records are saved on this device, but submission has not been confirmed. Keep this page open.':'记录已保存在这台设备上，尚未确认提交成功。请保持页面打开。'):(en?'Saving and submission are not confirmed yet. Keep this page open.':'记录保存与提交尚未确认，请保持页面打开。'))}</p>}
    {view!=='intro'&&<p className="ant-small">{en?'Records saved on this device':'这台设备上已保存的记录'}：{localStatus}</p>}
    {problem&&<><p role="alert">{problem==='fresh_durable_attempt_marker_required'
      ?(en?'This attempt has already been started or could not be confirmed. Keep this page open and contact the publisher.':'这次作答已启动过，或启动状态尚未确认。请保持页面打开，联系发布者处理。')
      :problem==='missing_durable_attempt_marker'
        ?(en?'This task cannot start yet. Keep this page open and try again later or contact the publisher.':'暂时无法开始作答。请保持页面打开，稍后重试或联系发布者。')
        :(en?'Please complete the screen and viewing-distance calibration before starting.':'请先完成屏幕与观看距离校准，再开始作答。')}</p>
      <details><summary>{en?'Technical details for support':'需要帮助时可查看技术诊断'}</summary><code>{problem}</code></details></>}
  </div></main>
}
