import type {ClassroomDanmakuMessage,ClassroomDanmakuSnapshot} from '../../types/classroomDanmaku'

export const DANMAKU_TRACKS=6
export const DANMAKU_PENDING_LIMIT=24
const MAX_SEEN=256
const MAX_VISIBLE_MS=30_000
const durations={slow:18_000,normal:12_000,fast:8_000} as const

type WaitingMessage=ClassroomDanmakuMessage&{deadline:number}
export type DisplayMessage=WaitingMessage&{lane:number;duration:number;endsAt:number}
export interface DanmakuDisplayQueue {
  epoch:number;revision:number;sessionId:string|null;enabled:boolean;unavailable:boolean;paused:boolean
  pausedAt:number|null;sessionDeadline:number|null;speed:ClassroomDanmakuSnapshot['speed']
  trackCount:number;active:DisplayMessage[];pending:WaitingMessage[];seen:string[]
}
export const emptyDanmakuQueue=():DanmakuDisplayQueue=>({
  epoch:-1,revision:-1,sessionId:null,enabled:false,unavailable:false,paused:false,pausedAt:null,
  sessionDeadline:null,speed:'normal',trackCount:DANMAKU_TRACKS,active:[],pending:[],seen:[],
})

/** One message owns each track for its entire flight; no width estimate or
 * per-frame JavaScript is needed to prevent a following message catching it. */
export function advanceDanmakuQueue(queue:DanmakuDisplayQueue,now:number):DanmakuDisplayQueue {
  if(!queue.enabled||queue.sessionDeadline!==null&&queue.sessionDeadline<=now)
    return {...queue,enabled:false,active:[],pending:[]}
  const active=queue.active.filter(message=>message.deadline>now&&(queue.paused||message.endsAt>now))
  const duration=durations[queue.speed]
  const pending=queue.pending.filter(message=>message.deadline>now
    &&(queue.paused||message.deadline-now>=duration))
  if(!queue.paused){
    const occupied=new Set(active.map(message=>message.lane))
    for(let lane=0;lane<queue.trackCount&&pending.length;lane++){
      if(occupied.has(lane))continue
      const message=pending.shift()!
      active.push({...message,lane,duration,endsAt:now+duration})
    }
  }
  return {...queue,active,pending:pending.slice(-DANMAKU_PENDING_LIMIT)}
}

/** The moderation roster lets a flight continue while its text is absent from
 * the rolling feed, and stops it once the teacher can no longer remove it. */
export function reconcileDanmakuQueue(
  current:DanmakuDisplayQueue,snapshot:ClassroomDanmakuSnapshot,now:number,
):DanmakuDisplayQueue {
  if(!snapshot.available)return {...current,enabled:false,unavailable:true,active:[],pending:[],seen:[]}
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
  if(!enabled)return {...queue,active:[],pending:[],seen:[]}
  const messages=snapshot.messages.filter(message=>message.status==='approved'&&message.id
    &&typeof message.text==='string'&&Array.from(message.text).length<=60
    &&Number.isFinite(Date.parse(message.expiresAt))&&Date.parse(message.expiresAt)>now)
  const allowed=new Set(messages.map(message=>message.id))
  const removed=Array.isArray(snapshot.removedMessageIds)?new Set(snapshot.removedMessageIds):null
  const olderModeration=Array.isArray(snapshot.olderModerationIds)?new Set(snapshot.olderModerationIds):null
  const inFlight=queue.active.filter(message=>!removed?.has(message.id)
    &&(allowed.has(message.id)||olderModeration?.has(message.id)||olderModeration===null&&removed!==null))
  const candidates=messages.slice(-(DANMAKU_TRACKS+DANMAKU_PENDING_LIMIT))
  const candidateIds=new Set(candidates.map(message=>message.id))
  const seen=new Set(queue.seen)
  const displaced=inFlight.filter(message=>message.lane>=queue.trackCount)
  const pending=[...displaced,...queue.pending].filter(message=>candidateIds.has(message.id)&&!removed?.has(message.id))
  for(const message of candidates){
    if(seen.has(message.id)||removed?.has(message.id))continue
    seen.add(message.id)
    pending.push({...message,deadline:Math.min(Date.parse(message.expiresAt),now+MAX_VISIBLE_MS)})
  }
  return advanceDanmakuQueue({...queue,active:inFlight.filter(message=>message.lane<queue.trackCount),
    pending,seen:[...seen].slice(-MAX_SEEN)},now)
}

export function nextDanmakuWake(queue:DanmakuDisplayQueue):number|null {
  if(!queue.enabled)return null
  const deadlines=[
    ...(queue.sessionDeadline===null?[]:[queue.sessionDeadline]),
    ...queue.active.flatMap(message=>queue.paused?[message.deadline]:[message.deadline,message.endsAt]),
    ...queue.pending.map(message=>message.deadline),
  ]
  return deadlines.length?Math.min(...deadlines):null
}
