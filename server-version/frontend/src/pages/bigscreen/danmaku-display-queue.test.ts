import {describe,expect,it} from 'vitest'
import type {ClassroomDanmakuMessage,ClassroomDanmakuSnapshot} from '../../types/classroomDanmaku'
import {advanceDanmakuQueue,DANMAKU_PENDING_LIMIT,DANMAKU_TRACKS,emptyDanmakuQueue,nextDanmakuWake,reconcileDanmakuQueue} from './danmaku-display-queue'

const now=Date.parse('2026-11-27T00:00:00Z')
const message=(id:string,offset=0):ClassroomDanmakuMessage=>({
  id,text:'同学的想法 '+id,status:'approved',createdAt:new Date(now+offset).toISOString(),
  expiresAt:new Date(now+offset+30_000).toISOString(),
})
const snapshot=(patch:Partial<ClassroomDanmakuSnapshot>={}):ClassroomDanmakuSnapshot=>({
  available:true,classroomId:'class',sessionId:'session',displayEpoch:1,revision:1,controlRevision:1,
  enabled:true,paused:false,displayMode:'DANMAKU',reviewMode:'realtime',topic:'分享想法',speed:'normal',
  expiresAt:new Date(now+60_000).toISOString(),messages:[],
  limits:{maxTextLength:60,cooldownMs:3000,maxPerMinute:10,messageTtlMs:30_000,pendingTtlMs:300_000},...patch,
})

describe('bounded classroom danmaku display',()=>{
  it('bounds bursts, deduplicates snapshots and gives every simultaneous message its own track',()=>{
    const messages=Array.from({length:1000},(_,i)=>message(String(i)))
    const queue=reconcileDanmakuQueue(emptyDanmakuQueue(),snapshot({messages}),now)
    expect(queue.active).toHaveLength(DANMAKU_TRACKS)
    expect(queue.pending).toHaveLength(DANMAKU_PENDING_LIMIT)
    expect(new Set(queue.active.map(item=>item.lane)).size).toBe(DANMAKU_TRACKS)
    const repeated=reconcileDanmakuQueue(queue,snapshot({revision:2,messages}),now+100)
    expect(repeated.active.map(item=>item.id)).toEqual(queue.active.map(item=>item.id))
    expect(repeated.pending).toHaveLength(DANMAKU_PENDING_LIMIT)
    const advanced=advanceDanmakuQueue(repeated,now+12_000)
    expect(new Set(advanced.active.map(item=>item.lane)).size).toBe(DANMAKU_TRACKS)
    expect(advanced.active.every(item=>!queue.active.some(old=>old.id===item.id))).toBe(true)
    expect(nextDanmakuWake(queue)).toBe(now+12_000)
  })
  it('does not truncate an active flight when later approved messages exceed the local candidate cap',()=>{
    const original=Array.from({length:6},(_,i)=>message('original-'+i))
    let queue=reconcileDanmakuQueue(emptyDanmakuQueue(),snapshot({messages:original}),now)
    const activeIds=queue.active.map(item=>item.id)
    const later=Array.from({length:40},(_,i)=>message('later-'+i,1000))
    queue=reconcileDanmakuQueue(queue,snapshot({revision:2,messages:[...original,...later]}),now+1000)
    expect(queue.active.map(item=>item.id)).toEqual(activeIds)
    expect(queue.active.every(item=>item.endsAt===now+12_000)).toBe(true)
    expect(queue.pending).toHaveLength(DANMAKU_PENDING_LIMIT)
    const more=Array.from({length:30},(_,i)=>message('more-'+i,2000))
    const all=[...original,...later,...more]
    queue=reconcileDanmakuQueue(queue,snapshot({revision:3,messages:all}),now+2000)
    expect(queue.active.map(item=>item.id)).toEqual(activeIds)
    // Removing the message from the authoritative set still means hide.
    queue=reconcileDanmakuQueue(queue,snapshot({revision:4,messages:all.filter(item=>item.id!==activeIds[0])}),now+2001)
    expect(queue.active.some(item=>item.id===activeIds[0])).toBe(false)
    expect(queue.active.filter(item=>activeIds.includes(item.id))).toHaveLength(5)
    expect(queue.pending.length).toBeLessThanOrEqual(DANMAKU_PENDING_LIMIT)
  })
  it('keeps the overlay to three tracks and safely queues displaced full-screen messages',()=>{
    const messages=Array.from({length:6},(_,i)=>message(String(i)))
    let queue=reconcileDanmakuQueue(emptyDanmakuQueue(),snapshot({messages}),now)
    queue=reconcileDanmakuQueue(queue,snapshot({revision:2,displayMode:'QUESTION',messages}),now+100)
    expect(queue.active).toHaveLength(3)
    expect(queue.pending).toHaveLength(3)
    expect(queue.active.every(item=>item.lane<3)).toBe(true)
    expect(new Set([...queue.active,...queue.pending].map(item=>item.id)).size).toBe(6)
  })
  it('never renders pending, expired or out-of-contract text',()=>{
    const queue=reconcileDanmakuQueue(emptyDanmakuQueue(),snapshot({messages:[
      {...message('pending'),status:'pending'},message('expired',-30_001),
      {...message('long'),text:'字'.repeat(61)},message('valid'),
    ]}),now)
    expect(queue.active.map(item=>item.id)).toEqual(['valid'])
  })
  it('pauses flights and new playback, then resumes without extending server TTL',()=>{
    let queue=reconcileDanmakuQueue(emptyDanmakuQueue(),snapshot({messages:[message('first')]}),now)
    queue=reconcileDanmakuQueue(queue,snapshot({revision:2,paused:true,messages:[message('first')]}),now+1000)
    queue=reconcileDanmakuQueue(queue,snapshot({revision:3,paused:true,messages:[message('first'),message('later',2000)]}),now+2000)
    expect(queue.active.map(item=>item.id)).toEqual(['first'])
    expect(queue.pending.map(item=>item.id)).toEqual(['later'])
    queue=reconcileDanmakuQueue(queue,snapshot({revision:4,messages:[message('first'),message('later',2000)]}),now+5000)
    expect(queue.active.find(item=>item.id==='first')).toMatchObject({endsAt:now+16_000,deadline:now+30_000})
    expect(advanceDanmakuQueue(queue,now+33_000).active).toEqual([])
  })
  it('honors hide, clear, stop and new-session ordering without replaying an older snapshot',()=>{
    const initial=snapshot({messages:[message('first'),message('second')]})
    let queue=reconcileDanmakuQueue(emptyDanmakuQueue(),initial,now)
    queue=reconcileDanmakuQueue(queue,snapshot({revision:2,messages:[message('second')]}),now+1)
    expect(queue.active.map(item=>item.id)).toEqual(['second'])
    queue=reconcileDanmakuQueue(queue,snapshot({displayEpoch:2,revision:3,messages:[]}),now+2)
    expect(queue.active).toEqual([])
    expect(reconcileDanmakuQueue(queue,initial,now+3)).toBe(queue)
    queue=reconcileDanmakuQueue(queue,snapshot({displayEpoch:3,revision:4,enabled:false,displayMode:'QUESTION'}),now+4)
    expect(queue).toMatchObject({enabled:false,active:[],pending:[]})
    queue=reconcileDanmakuQueue(queue,snapshot({displayEpoch:4,revision:1,sessionId:'new',messages:[message('new')]}),now+5)
    expect(queue.active.map(item=>item.id)).toEqual(['new'])
  })
  it('fails closed without poisoning the ordering watermark and accepts recovery at the same revision',()=>{
    const initial=snapshot({messages:[message('first')]})
    let queue=reconcileDanmakuQueue(emptyDanmakuQueue(),initial,now)
    queue=reconcileDanmakuQueue(queue,snapshot({available:false,displayEpoch:999,revision:999}),now+1)
    expect(queue).toMatchObject({enabled:false,epoch:1,revision:1,active:[]})
    queue=reconcileDanmakuQueue(queue,initial,now+2)
    expect(queue.enabled).toBe(true)
    expect(queue.active.map(item=>item.id)).toEqual(['first'])
  })
  it('clears the screen at the authoritative session deadline without polling',()=>{
    const queue=reconcileDanmakuQueue(emptyDanmakuQueue(),snapshot({
      messages:[message('first')],expiresAt:new Date(now+5000).toISOString(),
    }),now)
    expect(nextDanmakuWake(queue)).toBe(now+5000)
    expect(advanceDanmakuQueue(queue,now+5000)).toMatchObject({enabled:false,active:[],pending:[]})
  })
})
