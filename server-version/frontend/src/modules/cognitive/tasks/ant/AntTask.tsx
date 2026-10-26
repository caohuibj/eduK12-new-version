import React,{useEffect,useRef,useState} from 'react'
import { antPlan,type AntConfig,type Direction,type Input } from './generated/protocol'
import { AntSession,type AntSessionOptions,type AntExposureClaim } from './session'
import { antDisplayProblem,antDirectionForKey,type AntDisplayPort } from './display'
import { paintAnt } from './paint'
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
      <p>{en?'Keep looking at the center. Brief cues may appear, then arrows appear above or below. Choose the direction of the middle arrow and ignore its neighbors.':'请注视中央。画面可能先出现短暂提示，随后在上方或下方出现箭头。判断中间箭头朝向，忽略两侧箭头。'}</p>
      <svg className="ant-svg-example" viewBox="0 0 240 80" aria-hidden="true"><text x="120" y="50" textAnchor="middle" fontSize="32" fill="#000">← ← → ← ←</text></svg>
      <p>{en?'Use the fixed left/right areas. Touch and mouse are supported. The keyboard mapping is shown below; changing input during an attempt limits RT comparisons.':'使用固定左右回应区，支持触控与鼠标。键盘映射见下方；一次作答中混用输入会限制用时比较。'}</p>
      <details><summary>{en?'Timing, controls and session length':'时序、操作与时长'}</summary>
        <p>{en?'24 practice trials are saved separately. The research profile has 288 formal trials; experience has 48. Each trial starts 4 seconds after the previous start, including the response period.':'24次练习单独记录。文献次数对照版288次正式，体验版48次。每次起点相隔4秒，包含作答时间。'}</p>
        <p>{en?'Formal minimum: 19.2 / 3.2 minutes; practice adds 1.6 minutes, plus instructions, calibration and breaks.':'正式理论最短19.2 / 3.2分钟；练习另需1.6分钟，还需说明、校准与休息。'}</p>
        <p>{en?'Keyboard':'键盘'}：{d?.inputMap.leftKey??'—'} / {d?.inputMap.rightKey??'—'}。{en?'Release between responses.':'每次回应后请松开。'}</p>
      </details>
      <p>{en?'An approved, frozen physical display calibration is required. A CSS demonstration does not provide calibration.':'正式启动需要宿主提供已确认的冻结物理几何。CSS示意不代替校准。'}</p>
      <button onClick={()=>void start('practice')}>{en?'Check setup and start practice':'核验设置并开始练习'}</button>
    </>}
    {view==='practice-feedback'&&<><h1>{en?'Practice records are ready':'24次练习已记录'}</h1><p>{en?'Practice is separate from the formal result. Continuing means you understand the response method; it is not a practice accuracy pass mark.':'练习与正式结果分开。继续表示你已理解回应方式，不是练习正确率达标判定。'}</p><button onClick={()=>void start('test')}>{en?'Start formal trials':'开始正式作答'}</button></>}
    {view==='break'&&<><h1>{en?'Take a short break':'休息一下'}</h1><p>{en?'Keep the same viewing distance and input. Continue when ready.':'请保持观看距离与输入方式，准备好后继续。'}</p><button onClick={()=>void start('continue')}>{en?'Continue next block':'继续下一组'}</button></>}
    {view==='saving'&&<p role="status">{en?'Confirming the local draft…':'正在确认本机草稿…'}</p>}
    {(view==='error'||view==='terminated')&&<><h1>{en?'This attempt has stopped':'本次作答已停止'}</h1><p className="ant-error">{en?'The exposed records are retained. Retrying only saves the same records; it never repeats an exposure or silently resumes the 4-second stream.':'已曝光记录会保留。重试只保存同一份记录，不会重复呈现，也不会静默接着运行并假装4秒连续。'}</p><p>{en?'Reason':'原因'}：{current?.reason}</p>
      {view==='error'?<button onClick={()=>void current?.retryLocal()}>{en?'Retry saving cached records':'重试保存缓存记录'}</button>:<button onClick={()=>void current?.finalize()}>{en?'Submit the limited record':'提交本次受限记录'}</button>}</>}
    {view==='complete'&&<h1>{en?'This session is complete':'本轮作答已结束'}</h1>}
    {(view==='terminated'||view==='complete')&&<p role="status">{current?.serverSaved?(en?'The host confirmed server saving.':'宿主已确认服务器保存。'):(current?.queue.pendingCount===0&&!current?.queue.failed?(en?'Local draft confirmed; server saving has not been confirmed. This does not indicate COS archival.':'本机草稿已确认；服务器保存尚未确认。这不表示COS归档完成。'):(en?'Local durability and server saving are still unconfirmed.':'本机耐久保存与服务器保存均尚未确认。'))}</p>}
    {view!=='intro'&&<p className="ant-small">{en?'Durable local records':'本机已确认草稿'}：{localStatus}</p>}
    {problem&&<p role="alert">{en?'The frozen display is unavailable or does not match. Ask the host to calibrate and freeze the display before starting.':'冻结几何缺失或不匹配。请由宿主完成校准并冻结后再开始。'} <small>{problem}</small></p>}
  </div></main>
}
