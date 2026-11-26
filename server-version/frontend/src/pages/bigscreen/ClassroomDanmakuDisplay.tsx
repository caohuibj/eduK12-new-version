import {useEffect,useRef,useState,type CSSProperties} from 'react'
import {QRCodeCanvas} from 'qrcode.react'
import apiClient from '../../api/client'
import type {ClassroomDanmakuSnapshot,ClassroomDanmakuStateAck} from '../../types/classroomDanmaku'
import {advanceDanmakuQueue,emptyDanmakuQueue,nextDanmakuWake,reconcileDanmakuQueue} from './danmaku-display-queue'
import './classroom-danmaku.css'

export type DanmakuPresentation={enabled:boolean;displayMode:'QUESTION'|'DANMAKU'}
type Props={
  classroomId:string
  subscribe:(listener:(snapshot:ClassroomDanmakuSnapshot)=>void)=>()=>void
  readState:()=>Promise<ClassroomDanmakuStateAck>
  onPresentationChange:(presentation:DanmakuPresentation)=>void
}
type JoinInfo={name:string;code:string;qrcodeUrl:string}

/** The socket snapshot and expiry timer stay in this leaf. Chart components
 * only rerender when the enabled/display-mode presentation actually changes. */
export function ClassroomDanmakuDisplay({classroomId,subscribe,readState,onPresentationChange}:Props){
  const [display,setDisplay]=useState(()=>({snapshot:null as ClassroomDanmakuSnapshot|null,queue:emptyDanmakuQueue()}))
  const [join,setJoin]=useState<JoinInfo|null>(null),[joinError,setJoinError]=useState('')
  const stage=useRef<HTMLDivElement>(null)
  const [width,setWidth]=useState(1200)
  useEffect(()=>{
    let live=true
    const accept=(snapshot:ClassroomDanmakuSnapshot)=>{
      if(!live||snapshot.classroomId!==classroomId)return
      setDisplay(previous=>{
        const queue=reconcileDanmakuQueue(previous.queue,snapshot,Date.now())
        return queue===previous.queue?previous:{snapshot,queue}
      })
    }
    const unavailable=()=>setDisplay(previous=>({...previous,queue:{...previous.queue,enabled:false,unavailable:true,active:[],pending:[],seen:[]}}))
    const unsubscribe=subscribe(accept)
    void readState().then(result=>{
      if(!live)return
      if(result.ok)accept(result.snapshot)
      else unavailable()
    }).catch(()=>{if(live)unavailable()})
    return ()=>{live=false;unsubscribe()}
  },[classroomId,readState,subscribe])
  useEffect(()=>{
    const wake=nextDanmakuWake(display.queue)
    if(wake===null)return
    const timer=window.setTimeout(()=>setDisplay(previous=>({
      ...previous,queue:advanceDanmakuQueue(previous.queue,Date.now()),
    })),Math.max(1,wake-Date.now()))
    return ()=>window.clearTimeout(timer)
  },[display.queue])
  const enabled=display.queue.enabled
  const mode=enabled?display.snapshot?.displayMode??'QUESTION':'QUESTION'
  useEffect(()=>onPresentationChange({enabled,displayMode:mode}),[enabled,mode,onPresentationChange])
  useEffect(()=>{
    if(!enabled)return
    let live=true
    void apiClient.get<JoinInfo>(`/classrooms/${classroomId}/qrcode`).then(response=>{
      if(!live)return
      if(response.code===0&&response.data?.qrcodeUrl){setJoin(response.data);setJoinError('')}
      else setJoinError('加入信息暂不可用；可向教师获取课堂码。')
    }).catch(()=>{if(live)setJoinError('加入信息暂不可用；可向教师获取课堂码。')})
    return ()=>{live=false}
  },[classroomId,enabled])
  useEffect(()=>{
    const element=stage.current
    if(!element)return
    const measure=()=>setWidth(Math.max(1,element.clientWidth))
    measure()
    if(typeof ResizeObserver==='undefined'){
      window.addEventListener('resize',measure)
      return ()=>window.removeEventListener('resize',measure)
    }
    const observer=new ResizeObserver(measure);observer.observe(element)
    return ()=>observer.disconnect()
  },[enabled,mode])
  if(!enabled)return null
  const snapshot=display.snapshot!
  const full=mode==='DANMAKU'
  return <section className={'classroom-danmaku-display '+(full?'classroom-danmaku-display--full':'classroom-danmaku-display--compact')}
    aria-label={full?'独立弹幕大屏':'课堂弹幕展示区'}>
    <header className="classroom-danmaku-display__header">
      <div className="classroom-danmaku-display__heading">
        <span className="classroom-danmaku-display__eyebrow">{full?join?.name||'课堂互动':'课堂弹幕'}</span>
        <h2>{snapshot.topic||'说说你的想法'}</h2>
        <p role="status">{snapshot.paused?'已暂停滚动 · 恢复后继续展示有效消息':snapshot.reviewMode==='review'?'教师审核后上屏':'实时展示 · 请友善表达'}</p>
      </div>
      {full&&<details className="classroom-danmaku-display__join"><summary>加入方式{join?' · '+join.code:''}</summary>
        {join?<div className="classroom-danmaku-display__join-content">
          <QRCodeCanvas value={join.qrcodeUrl} size={160} level="M"/>
          <div><strong>课堂码 {join.code}</strong><p>扫描二维码，或打开课堂入口输入课堂码。</p></div>
        </div>:<p>{joinError||'正在读取加入信息…'}</p>}
      </details>}
    </header>
    <div ref={stage} className={'classroom-danmaku-display__stage'+(snapshot.paused?' is-paused':'')}
      style={{'--danmaku-width':width+'px'} as CSSProperties} aria-label="弹幕消息">
      {Array.from({length:display.queue.trackCount},(_,lane)=>{
        const message=display.queue.active.find(item=>item.lane===lane)
        return <div key={lane} className="classroom-danmaku-display__track" data-danmaku-track={lane}>
          {message&&<span key={message.id} className="classroom-danmaku-display__message" data-message-id={message.id}
            style={{animationDuration:message.duration+'ms'}}>{message.text}</span>}
        </div>
      })}
      {display.queue.active.length===0&&<p className="classroom-danmaku-display__empty">
        {snapshot.paused?'弹幕已暂停':'等待同学分享想法'}
      </p>}
    </div>
    <footer className="classroom-danmaku-display__footer">
      <span>{snapshot.paused?'暂停期间仍可发送，消息在有效期内展示':'每条消息最多展示30秒'}</span>
      {display.queue.pending.length>0&&<span>待展示 {display.queue.pending.length} 条</span>}
    </footer>
  </section>
}
