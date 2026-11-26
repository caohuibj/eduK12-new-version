import type {ClassroomDanmakuMessage,ClassroomDanmakuSnapshot} from '../../types/classroomDanmaku'

export const DANMAKU_TRACKS=6
export const DANMAKU_PENDING_LIMIT=24
const MAX_SEEN=256
const MAX_VISIBLE_MS=30_000
const durations={slow:18_000,normal:12_000,fast:8_000} as const

type WaitingMessage=ClassroomDanmakuMessage&{deadline:number}
export type DisplayMessage=WaitingMessage&{lane:number;duration:number;beganAt:number;endsAt:number}
export interface DanmakuDisplayQueue {
  epoch:number;revision:number;sessionId:string|null;enabled:boolean;unavailable:boolean;paused:boolean
  pausedAt:number|null;sessionDeadline:number|null;speed:ClassroomDanmakuSnapshot['speed']
  trackCount:number;active:DisplayMessage[];pending:WaitingMessage[];replay:WaitingMessage[];seen:string[]
}
export const emptyDanmakuQueue=():DanmakuDisplayQueue=>({
  epoch:-1,revision:-1,sessionId:null,enabled:false,unavailable:false,paused:false,pausedAt:null,
  sessionDeadline:null,speed:'normal',trackCount:DANMAKU_TRACKS,active:[],pending:[],replay:[],seen:[],
})

/** One message owns each track for its entire flight; no width estimate or
 * per-frame JavaScript is needed to prevent a following message catching it. */
export function advanceDanmakuQueue(queue:DanmakuDisplayQueue,now:number):DanmakuDisplayQueue {
  if(!queue.enabled||queue.sessionDeadline!==null&&queue.sessionDeadline<=now)
    return {...queue,enabled:false,active:[],pending:[],replay:[]}
  const active=queue.active.filter(message=>message.deadline>now&&(queue.paused||message.endsAt>now))
  const duration=durations[queue.speed]
  const pending=queue.pending.filter(message=>message.deadline>now
    &&(queue.paused||message.deadline-now>=duration))
  const replay=queue.replay.filter(message=>message.deadline>now)
  if(!queue.paused){
    const occupied=new Set(active.map(message=>message.lane))
    const playing=new Set(active.map(message=>message.id))
    for(let lane=0;lane<queue.trackCount;lane++){
      if(occupied.has(lane))continue
      const message=pending.shift()??replay.find(item=>!playing.has(item.id)&&item.deadline-now>=duration)
      if(!message)break
      active.push({...message,lane,duration,beganAt:now,endsAt:now+duration})
      playing.add(message.id)
      // Prioritize fresh messages, then put each launched message at the end
      // of the replay order so a previous flight cannot starve the rest.
      const replayIndex=replay.findIndex(item=>item.id===message.id)
      if(replayIndex>=0)replay.push(...replay.splice(replayIndex,1))
    }
  }
  return {...queue,active,pending:pending.slice(-DANMAKU_PENDING_LIMIT),replay}
}

/** The moderation roster lets a flight continue while its text is absent from
 * the rolling feed, and stops it once the teacher can no longer remove it. */
export function reconcileDanmakuQueue(
  current:DanmakuDisplayQueue,snapshot:ClassroomDanmakuSnapshot,now:number,
):DanmakuDisplayQueue {
  if(!snapshot.available)return {...current,enabled:false,unavailable:true,active:[],pending:[],replay:[],seen:[]}
  if(!Number.isSafeInteger(snapshot.displayEpoch)||!Number.isSafeInteger(snapshot.revision)
    ||snapshot.displayEpoch<current.epoch
    ||snapshot.displayEpoch===current.epoch&&(snapshot.revision<current.revision
      ||snapshot.revision===current.revision&&!current.unavailable))return current
  const reset=snapshot.displayEpoch!==current.epoch||snapshot.sessionId!==current.sessionId||current.unavailable
  let queue=reset?emptyDanmakuQueue():current
  if(queue.pausedAt!==null&&!snapshot.paused){
    const elapsed=Math.max(0,now-queue.pausedAt)
    queue={...queue,active:queue.active.map(message=>({...message,endsAt:message.endsAt+elapsed}))}
  }
  const sessionDeadline=snapshot.expiresAt===null?null:Date.parse(snapshot.expiresAt)
  const enabled=snapshot.available&&snapshot.enabled&&snapshot.sessionId!==null
    &&(sessionDeadline===null||Number.isFinite(sessionDeadline)&&sessionDeadline>now)
  queue={...queue,epoch:snapshot.displayEpoch,revision:snapshot.revision,sessionId:snapshot.sessionId,
    enabled,unavailable:false,paused:snapshot.paused,pausedAt:snapshot.paused?(queue.pausedAt??now):null,
    sessionDeadline,speed:snapshot.speed,trackCount:snapshot.displayMode==='QUESTION'?3:DANMAKU_TRACKS}
  if(!enabled)return {...queue,active:[],pending:[],replay:[],seen:[]}
  const loop=snapshot.playback==='loop'
  const messages=snapshot.messages.filter(message=>message.status==='approved'&&message.id
    &&typeof message.text==='string'&&Array.from(message.text).length<=60
    &&Number.isFinite(Date.parse(message.expiresAt))&&Date.parse(message.expiresAt)>now)
  const approved=new Map(messages.map(message=>[message.id,message]))
  const removed=Array.isArray(snapshot.removedMessageIds)?new Set(snapshot.removedMessageIds):null
  const olderModeration=Array.isArray(snapshot.olderModerationIds)?new Set(snapshot.olderModerationIds):null
  const inFlight=queue.active.filter(message=>!removed?.has(message.id)
    &&(approved.has(message.id)||olderModeration?.has(message.id)||olderModeration===null&&removed!==null))
    .map(message=>{
      const latest=approved.get(message.id)
      const expiresAt=latest?.expiresAt??message.expiresAt
      const originalDeadline=Date.parse(message.createdAt)+MAX_VISIBLE_MS
      const deadline=loop||!Number.isFinite(originalDeadline)?Date.parse(expiresAt):Math.min(Date.parse(expiresAt),originalDeadline)
      return deadline===message.deadline?message:{...message,expiresAt,deadline}
    })
  const candidates=messages.slice(-(DANMAKU_TRACKS+DANMAKU_PENDING_LIMIT))
  const waiting=new Map(candidates.filter(message=>!removed?.has(message.id))
    .map(message=>[message.id,{...message,deadline:Date.parse(message.expiresAt)}]))
  const seen=new Set(queue.seen)
  const displaced=inFlight.filter(message=>message.lane>=queue.trackCount)
  const pending=[...displaced,...queue.pending].flatMap(message=>waiting.get(message.id)??[])
  for(const message of waiting.values()){
    if(seen.has(message.id))continue
    seen.add(message.id)
    pending.push(message)
  }
  const replay:WaitingMessage[]=[]
  if(loop){
    for(const message of queue.replay){
      const fresh=waiting.get(message.id)
      if(fresh)replay.push(fresh)
      waiting.delete(message.id)
    }
    replay.push(...waiting.values())
  }
  return advanceDanmakuQueue({...queue,active:inFlight.filter(message=>message.lane<queue.trackCount),
    pending,replay,seen:[...seen].slice(-MAX_SEEN)},now)
}

export function nextDanmakuWake(queue:DanmakuDisplayQueue):number|null {
  if(!queue.enabled)return null
  const deadlines=[
    ...(queue.sessionDeadline===null?[]:[queue.sessionDeadline]),
    ...queue.active.flatMap(message=>queue.paused?[message.deadline]:[message.deadline,message.endsAt]),
    ...queue.pending.map(message=>message.deadline),
    ...queue.replay.map(message=>message.deadline),
  ]
  return deadlines.length?Math.min(...deadlines):null
}
