import React,{useEffect,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import {validateContext,decodeAssets,releaseDecodedAssets} from './assets'
import {RecognitionSession} from './session'
import type {RecognitionContext,RecognitionPorts,Envelope} from './contracts'
import {RecognitionReport} from './RecognitionReport'
import './recognition.css'
export interface RecognitionTaskProps {context:RecognitionContext;ports:RecognitionPorts;language?:'zh'|'en';
  syntheticReview?:boolean;onTrialComplete?:(raw:Envelope)=>void}
export function RecognitionTask({context,ports,language='zh',syntheticReview=false,onTrialComplete}:RecognitionTaskProps){
  const hostKey=JSON.stringify(context)
  const initial=useRef({context,ports,hostKey,syntheticReview,onTrialComplete,language})
  const en=initial.current.language==='en',invalid=useRef(false),generation=useRef(0),startFrame=useRef<number|null>(null)
  const identityChanged=hostKey!==initial.current.hostKey||ports!==initial.current.ports||language!==initial.current.language
    ||syntheticReview!==initial.current.syntheticReview||onTrialComplete!==initial.current.onTrialComplete
  if(identityChanged)invalid.current=true
  const [version,render]=useState(0),[loaded,setLoaded]=useState(false),[blocked,setBlocked]=useState('')
  const session=useRef<RecognitionSession|null>(null),images=useRef(new Map<string,HTMLImageElement>()),board=useRef<HTMLDivElement>(null)
  const alive=useRef(true)
  useEffect(()=>{
    let cancelled=false
    alive.current=true
    void(async()=>{try{const c=validateContext(initial.current.context,initial.current.syntheticReview),decoded=await decodeAssets(c)
      if(cancelled||invalid.current){releaseDecodedAssets(decoded);return}
      images.current=decoded
      session.current=new RecognitionSession(c,initial.current.ports,initial.current.syntheticReview,()=>{if(alive.current)render(v=>v+1)},()=>performance.now(),initial.current.onTrialComplete)
      setLoaded(true)
    }catch{if(!cancelled)setBlocked('assets-or-freeze-not-ready')}})()
    return()=>{cancelled=true;alive.current=false;generation.current++;if(startFrame.current!==null)cancelAnimationFrame(startFrame.current);session.current?.dispose();releaseDecodedAssets(images.current)}
  },[])
  useEffect(()=>{if(identityChanged){generation.current++;if(startFrame.current!==null)cancelAnimationFrame(startFrame.current);session.current?.dispose();setBlocked('frozen-context-language-or-port-changed')}},[identityChanged])
  const paint=()=>{
    const s=session.current,element=board.current,c=s?.capture
    if(!element||!c)return
    element.dataset.stage=c.stage
    if(c.stage==='image'){
      const image=images.current.get(c.payload.record.assetId)
      if(!image||!image.complete||image.naturalWidth===0){s.halt('image-load-failure',performance.now());return}
      if(element.firstChild!==image){image.onerror=()=>s.halt('image-load-failure',performance.now());element.replaceChildren(image)}
    }else if(c.stage==='isi'&&element.textContent!=='+')element.replaceChildren(document.createTextNode('+'))
  }
  useEffect(()=>{
    if(invalid.current||!session.current||!['practice','formal'].includes(session.current.view))return
    let frame=0
    const loop=()=>{const s=session.current;if(!invalid.current&&s&&['practice','formal'].includes(s.view)){s.tick(performance.now());paint();if(['practice','formal'].includes(s.view))frame=requestAnimationFrame(loop)}}
    frame=requestAnimationFrame(loop)
    const halt=(reason:string)=>session.current?.halt(reason,performance.now())
    const hidden=()=>{if(document.hidden)halt('hidden')},blur=()=>halt('blur'),resize=()=>halt('rotation')
    const key=(e:KeyboardEvent)=>{
      const s=session.current;if(!s||!['practice','formal'].includes(s.view))return
      if(e.key.toLowerCase()==='r'&&!e.ctrlKey&&!e.metaKey&&!e.altKey)e.preventDefault()
      s.input(performance.now(),'keyboard',(e.ctrlKey||e.metaKey||e.altKey?'modified:':'')+e.key.slice(0,20),e.repeat)
    }
    document.addEventListener('visibilitychange',hidden);window.addEventListener('blur',blur);window.addEventListener('resize',resize)
    window.addEventListener('orientationchange',resize);window.visualViewport?.addEventListener('resize',resize);window.addEventListener('keydown',key)
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('blur',blur)
      window.removeEventListener('resize',resize);window.removeEventListener('orientationchange',resize);window.visualViewport?.removeEventListener('resize',resize);window.removeEventListener('keydown',key)}
  },[loaded,version])
  const s=session.current,view=s?.view??'loading';void version
  const start=()=>{
    if(window.innerWidth<348||window.innerHeight<650){setBlocked('display-too-small-no-shrink');return}
    const current=session.current,token=generation.current
    if(!current||invalid.current||!alive.current)return
    startFrame.current=requestAnimationFrame(()=>{startFrame.current=null;if(invalid.current||!alive.current||generation.current!==token||session.current!==current)return;flushSync(()=>current.begin(performance.now()));paint()})
  }
  if(blocked||invalid.current)return <section className="recognition-task recognition-reading" role="alert">{initial.current.syntheticReview&&<p className="recognition-note">{en?'Synthetic review remains non-formal':'合成审阅始终为非正式测验'}</p>}<h1>{en?'This attempt cannot continue':'本次暂时无法继续'}</h1><p>{en?'The test settings or pictures are not ready. Keep this page open and contact the publisher.':'测验设置或图片尚未准备好，请保留页面并联系发布者。'}</p><details><summary>{en?'View diagnostic details':'查看诊断信息'}</summary><code>{blocked||'frozen-context-language-or-port-changed'}</code></details></section>
  if(view==='report'&&s?.receipt)return <RecognitionReport report={s.receipt.report} language={language} synthetic={initial.current.syntheticReview}/>
  const running=view==='practice'||view==='formal'
  return <main className={'recognition-task '+(!running?'recognition-reading':'recognition-stage')} data-cognitive-task-root data-recognition-view={view}>
    {initial.current.syntheticReview&&<p className="recognition-note">{en?'Synthetic design review · not a formal test':'合成设计审阅 · 非正式测验'}</p>}
    {!loaded?<p role="status">{en?'Preparing the pictures…':'正在准备图片…'}</p>:null}
    {view==='intro'&&<><h1>{en?'Have you seen this picture?':'这张图，你见过吗？'}</h1>
      <p>{en?'If a picture has appeared before in this run, tap Seen once or press R. Do nothing for a new picture.':'如果图片在本轮已经出现过，轻触“见过”或按R键；第一次出现时不操作。'}</p>
      <p>{en?'You may respond while the picture or the following + is shown. Keep watching; responding does not end the display early.':'图片显示时和紧随其后的“+”期间都可以回应。回应不会让图片提前结束，请持续观看。'}</p>
      <p>{en?'First try 8 separate practice presentations. The formal stream then runs continuously.':'先用独立图片练习8次；正式图片随后连续呈现。'}</p>
      <p>{en?'Keep the device still. Interrupted attempts will stop; saving can be retried without showing images again.':'请放稳设备；中断后停止呈现，保存可重试，不重复展示已看图片。'}</p>
      <button onClick={()=>void s?.prepare()}>{en?'Prepare practice':'准备练习'}</button></>}
    {(view==='ready-practice'||view==='ready-formal')&&<><h1>{view==='ready-practice'?(en?'Ready for practice':'准备开始练习'):(en?'Practice complete':'练习已完成')}</h1>
      <p>{en?'Tap Seen only for a picture shown earlier in this stream.':'仅当图片在本轮出现过时，轻触“见过”。'}</p>
      <button onClick={start}>{view==='ready-practice'?(en?'Start practice':'开始练习'):(en?'Start formal stream':'开始正式作答')}</button></>}
    {running&&<><p className="recognition-phase">{view==='practice'?(en?'Practice':'练习'):(en?'Formal stream':'正式作答')}</p>
      <div className="recognition-board" ref={board} aria-label={en?'Image and fixation display':'图片与注视区域'}/>
      <div className="recognition-response"><button onPointerDown={e=>{e.preventDefault();if(e.button!==0)return
        const kind=e.pointerType==='touch'?'touch':e.pointerType==='pen'?'pen':'mouse'
        s?.input(performance.now(),kind,null,false,e.isPrimary)}} onContextMenu={e=>e.preventDefault()}>{en?'Seen':'见过'}</button>
        <span>{en?'New picture: do nothing · R also works':'新图片不操作 · 也可按R'}</span></div></>}
    {['preparing','practice-saving','saving'].includes(view)&&<p role="status">{en?'Checking whether your submission was saved…':'正在确认提交是否成功…'}</p>}
    {view==='retry'&&<><h1>{en?'The stream has stopped':'图片呈现已停止'}</h1><p role="alert">{en?'Keep this page open and retry saving. Your existing answers will be kept, and pictures will not be shown again.':'请保留当前页面并重试保存。原有作答记录会保留，不会再次展示图片。'}</p>
      <button onClick={()=>void s?.retry()}>{en?'Retry saving':'重试保存'}</button></>}
    {view==='blocked'&&<p role="alert">{en?'This attempt has stopped. Please do not start again. Your existing answers will be kept for saving retries; contact the publisher if you need help.':'本次作答已停止，请勿重新开始，原记录会保留供保存重试。如需帮助，请联系发布者。'}</p>}
  </main>
}
