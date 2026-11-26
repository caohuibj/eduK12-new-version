import {act,cleanup,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import type {ClassroomDanmakuSnapshot} from '../../types/classroomDanmaku'
import {ClassroomDanmakuDisplay} from './ClassroomDanmakuDisplay'

vi.mock('../../api/client',()=>({default:{get:vi.fn(async()=>({code:0,data:{name:'合成课堂',code:'123456',qrcodeUrl:'http://localhost/student/classroom/enter?code=123456'}}))}}))
vi.mock('qrcode.react',()=>({QRCodeCanvas:()=> <canvas aria-label="加入二维码"/>}))
const now=Date.parse('2026-11-27T00:00:00Z')
const snapshot=(patch:Partial<ClassroomDanmakuSnapshot>={}):ClassroomDanmakuSnapshot=>({
  available:true,classroomId:'class',sessionId:'session',displayEpoch:1,revision:1,controlRevision:1,
  enabled:true,paused:false,displayMode:'DANMAKU',reviewMode:'realtime',topic:'交流时间',speed:'normal',
  expiresAt:new Date(now+60_000).toISOString(),
  messages:[{id:'first',text:'<img src=x onerror=alert(1)>',status:'approved',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+30_000).toISOString()}],
  limits:{maxTextLength:60,cooldownMs:3000,maxPerMinute:10,messageTtlMs:30_000,pendingTtlMs:300_000},...patch,
})
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(now)})
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks()})
async function setup(){
  let receive:(value:ClassroomDanmakuSnapshot)=>void=()=>{}
  const unsubscribe=vi.fn(),onPresentationChange=vi.fn()
  const readState=vi.fn(async()=>({ok:true as const,snapshot:snapshot()}))
  const subscribe=(listener:typeof receive)=>{receive=listener;return unsubscribe}
  const view=render(<ClassroomDanmakuDisplay classroomId="class" readState={readState}
    subscribe={subscribe} onPresentationChange={onPresentationChange}/>)
  await act(async()=>{await Promise.resolve()})
  return {view,receive,readState,unsubscribe,onPresentationChange}
}
describe('classroom danmaku renderer',()=>{
  it('renders approved content as text and switches view from the authoritative snapshot without polling',async()=>{
    const {view,receive,readState,onPresentationChange}=await setup()
    expect(screen.getByRole('region',{name:'独立弹幕大屏'})).toBeInTheDocument()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(view.container.querySelector('img')).toBeNull()
    expect(view.container.querySelectorAll('[data-danmaku-track]')).toHaveLength(6)
    act(()=>receive(snapshot({revision:2,displayMode:'QUESTION'})))
    expect(screen.getByRole('region',{name:'课堂弹幕展示区'})).toBeInTheDocument()
    expect(onPresentationChange).toHaveBeenLastCalledWith({enabled:true,displayMode:'QUESTION'})
    expect(readState).toHaveBeenCalledTimes(1)
  })
  it('reconciles pause, clear and stop immediately and rejects a late old session',async()=>{
    const {view,receive,onPresentationChange}=await setup()
    act(()=>receive(snapshot({revision:2,paused:true})))
    expect(view.container.querySelector('.classroom-danmaku-display__stage')).toHaveClass('is-paused')
    act(()=>receive(snapshot({revision:3,displayEpoch:2,messages:[]})))
    expect(screen.queryByText('<img src=x onerror=alert(1)>')).toBeNull()
    act(()=>receive(snapshot({revision:4,displayEpoch:3,enabled:false,displayMode:'QUESTION',messages:[]})))
    expect(screen.queryByRole('region',{name:'独立弹幕大屏'})).toBeNull()
    expect(onPresentationChange).toHaveBeenLastCalledWith({enabled:false,displayMode:'QUESTION'})
    act(()=>receive(snapshot()))
    expect(screen.queryByText('<img src=x onerror=alert(1)>')).toBeNull()
  })
  it('stays absent on an ordinary classroom when state reading is unavailable',async()=>{
    const readState=vi.fn(async()=>({ok:false as const,code:'UNAVAILABLE',message:'unavailable'}))
    render(<ClassroomDanmakuDisplay classroomId="class" readState={readState}
      subscribe={()=>()=>{}} onPresentationChange={vi.fn()}/>)
    await act(async()=>{await Promise.resolve()})
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('expires messages, ignores foreign classrooms and unsubscribes on exit',async()=>{
    const {view,receive,readState,unsubscribe}=await setup()
    act(()=>receive(snapshot({classroomId:'foreign',revision:100,topic:'其他课堂'})))
    expect(screen.queryByText('其他课堂')).toBeNull()
    act(()=>vi.advanceTimersByTime(30_001))
    expect(screen.queryByText('<img src=x onerror=alert(1)>')).toBeNull()
    expect(readState).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
