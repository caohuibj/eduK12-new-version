import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {spawn,spawnSync,type ChildProcess} from 'node:child_process'
import {createServer} from 'node:net'
import {randomUUID} from 'node:crypto'
import {setTimeout as wait} from 'node:timers/promises'
import {createClient} from 'redis'
import {ClassroomDanmakuStore,danmakuForRole,type DanmakuSnapshot} from '../../services/classroomDanmaku'

// Each suite owns an isolated loopback Redis with persistence disabled. No shared keys/services.
let redisProcess:ChildProcess
const redisBinary=process.env.REDIS_SERVER_BIN??'redis-server'
const redisAvailable=spawnSync(redisBinary,['--version'],{stdio:'ignore'}).status===0
let client:ReturnType<typeof createClient>
let store:ClassroomDanmakuStore
beforeAll(async()=>{
 const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 const port=(server.address() as {port:number}).port;await new Promise<void>(resolve=>server.close(()=>resolve()))
 redisProcess=spawn(redisBinary,['--bind','127.0.0.1','--port',String(port),'--save','','--appendonly','no','--protected-mode','yes'],{stdio:'ignore'})
 let connected=false
 for(let attempt=0;attempt<60;attempt++){
  client=createClient({url:'redis://127.0.0.1:'+port,disableOfflineQueue:true,socket:{reconnectStrategy:false,connectTimeout:100}});client.on('error',()=>{})
  try{await client.connect();connected=true;break}catch{if(client.isOpen)client.destroy();await wait(25)}
 }
 if(!connected)throw new Error('Test-owned Redis failed to become ready')
 store=new ClassroomDanmakuStore(async()=>({eval:(script,options)=>client.eval(script,options)}))
},10000)
afterAll(async()=>{if(client?.isOpen)await client.quit();if(redisProcess&&!redisProcess.killed)redisProcess.kill('SIGTERM')})
const prefix=(id:string)=>'classroom-danmaku:v1:{'+id+'}'
async function start(settings:Record<string,string>={}){const id=randomUUID();const initial=(await store.read(id)).snapshot;const snapshot=(await store.control(id,{action:'start',revision:initial.controlRevision,sessionId:null,settings})).snapshot;return {id,snapshot}}
const control=(id:string,snapshot:DanmakuSnapshot,action:string,extra={})=>store.control(id,{action,revision:snapshot.controlRevision,sessionId:snapshot.sessionId,...extra})
const send=(id:string,snapshot:DanmakuSnapshot,sender=randomUUID(),text='合成弹幕',clientMessageId=randomUUID())=>store.send(id,sender,{sessionId:snapshot.sessionId,text,clientMessageId})

describe.skipIf(!redisAvailable)('classroom danmaku atomic Redis lifecycle',()=>{
 it('defaults playback settings for new and legacy Redis snapshots and validates the enums',async()=>{
  const {id,snapshot}=await start()
  expect(snapshot).toMatchObject({messageSize:'standard',playback:'once'})
  const raw=JSON.parse((await client.get(prefix(id)))!);delete raw.messageSize;delete raw.playback
  await client.set(prefix(id),JSON.stringify(raw),{PX:7200000})
  expect((await store.read(id)).snapshot).toMatchObject({messageSize:'standard',playback:'once'})
  for(const messageSize of ['standard','large','extra-large']){
   const current=(await store.read(id)).snapshot
   expect((await control(id,current,'configure',{settings:{messageSize}})).snapshot).toMatchObject({messageSize,playback:'once'})
  }
  expect(()=>control(id,snapshot,'configure',{settings:{messageSize:'huge'}})).toThrow()
  expect(()=>control(id,snapshot,'configure',{settings:{playback:'forever'}})).toThrow()
  expect(new ClassroomDanmakuStore().unavailable(id)).toMatchObject({messageSize:'standard',playback:'once'})
 })
 it('starts loop retention at approval without extending the pending deadline or resetting it on reads',async()=>{
  const {id,snapshot}=await start({reviewMode:'review',playback:'loop',messageSize:'large'})
  const sent=await send(id,snapshot)
  const pending=JSON.parse((await client.get(prefix(id)+':pending'))!)
  expect(pending[0].expiresAt-pending[0].createdAt).toBe(300000)
  pending[0].createdAt=Date.now()-120000;pending[0].expiresAt=pending[0].createdAt+300000
  await client.set(prefix(id)+':pending',JSON.stringify(pending),{PX:180000})
  const approved=(await control(id,snapshot,'approve',{messageId:sent.messageId})).snapshot
  const message=approved.messages[0]
  expect(Date.parse(message.createdAt)).toBeGreaterThan(pending[0].createdAt+119000)
  expect(Date.parse(message.expiresAt)-Date.parse(message.createdAt)).toBe(300000)
  expect(await client.pTTL(prefix(id)+':visibility:'+sent.messageId)).toBeGreaterThan(299000)
  expect(JSON.parse((await client.get(prefix(id)+':visibility:'+sent.messageId))!).createdAt).toBe(Date.parse(message.createdAt))
  const read=(await store.read(id)).snapshot
  expect(read.messages[0]).toEqual(message)
  const changed=(await control(id,read,'configure',{settings:{messageSize:'extra-large',speed:'slow'}})).snapshot
  expect(changed.messages[0]).toEqual(message)
 })
 it('enables loop only for still-live approved messages and caps their deadlines at the activity end',async()=>{
  const {id,snapshot}=await start()
  const live=await send(id,snapshot),expired=await send(id,snapshot)
  const messages=JSON.parse((await client.get(prefix(id)+':messages'))!)
  messages[0].createdAt=Date.now()-10000;messages[0].expiresAt=messages[0].createdAt+30000
  messages[1].expiresAt=Date.now()-1
  await client.set(prefix(id)+':messages',JSON.stringify(messages),{PX:30000})
  const marker=await client.get(prefix(id)+':visibility:'+live.messageId)
  const loop=(await control(id,snapshot,'configure',{settings:{playback:'loop'}})).snapshot
  expect(loop.messages.map(message=>message.id)).toEqual([live.messageId])
  expect(loop.messages.some(message=>message.id===expired.messageId)).toBe(false)
  expect(Date.parse(loop.messages[0].createdAt)).toBe(messages[0].createdAt)
  expect(Date.parse(loop.messages[0].expiresAt)).toBe(messages[0].createdAt+300000)
  expect(await client.get(prefix(id)+':visibility:'+live.messageId)).toBe(marker)
  expect(await client.pTTL(prefix(id)+':visibility:'+live.messageId)).toBeLessThanOrEqual(30000)
  const raw=JSON.parse((await client.get(prefix(id)))!);raw.expiresAt=Date.now()+5000
  await client.set(prefix(id),JSON.stringify(raw),{PX:5000})
  const sent=await send(id,loop)
  const current=(await store.read(id)).snapshot
  expect(Date.parse(current.messages.find(message=>message.id===sent.messageId)!.expiresAt)).toBe(raw.expiresAt)
 })
 it('switches loop off using approval time and explicitly removes messages already beyond thirty seconds',async()=>{
  const {id,snapshot}=await start({playback:'loop'})
  const older=await send(id,snapshot),newer=await send(id,snapshot)
  const messages=JSON.parse((await client.get(prefix(id)+':messages'))!)
  messages[0].createdAt=Date.now()-45000;messages[0].expiresAt=messages[0].createdAt+300000
  messages[1].createdAt=Date.now()-5000;messages[1].expiresAt=messages[1].createdAt+300000
  await client.set(prefix(id)+':messages',JSON.stringify(messages),{PX:300000})
  const olderMarker=JSON.parse((await client.get(prefix(id)+':visibility:'+older.messageId))!)
  olderMarker.createdAt=messages[0].createdAt
  await client.set(prefix(id)+':visibility:'+older.messageId,JSON.stringify(olderMarker),{PX:300000})
  const once=(await control(id,snapshot,'configure',{settings:{playback:'once'}})).snapshot
  expect(once.messages.map(message=>message.id)).toEqual([newer.messageId])
  expect(Date.parse(once.messages[0].createdAt)).toBe(messages[1].createdAt)
  expect(Date.parse(once.messages[0].expiresAt)).toBe(messages[1].createdAt+30000)
  expect(danmakuForRole(once,'bigscreen').removedMessageIds).toContain(older.messageId)
  expect(await client.exists(prefix(id)+':visibility:'+older.messageId)).toBe(1)
  expect(await client.pTTL(prefix(id)+':visibility:'+newer.messageId)).toBeGreaterThan(299000)
  await expect(control(id,once,'hide',{messageId:older.messageId})).rejects.toMatchObject({code:'NOT_FOUND'})
  const hidden=(await control(id,once,'hide',{messageId:newer.messageId})).snapshot
  expect(await client.exists(prefix(id)+':visibility:'+newer.messageId)).toBe(0)
  const stopped=(await control(id,hidden,'stop')).snapshot
  const restarted=(await control(id,stopped,'start')).snapshot
  expect(restarted).toMatchObject({messageSize:'standard',playback:'once',messages:[]})
 })
 it('defaults to realtime before any question and role filters remove pending and identities',async()=>{
  const {id,snapshot}=await start();expect(snapshot.reviewMode).toBe('realtime');expect(snapshot.enabled).toBe(true)
  const result=await send(id,snapshot)
  expect(result.status).toBe('approved');expect(result.snapshot.messages).toEqual([])
  const current=(await store.read(id)).snapshot
  expect(danmakuForRole(current,'bigscreen').messages[0].text).toBe('合成弹幕')
  expect(danmakuForRole(result.snapshot,'student')).not.toHaveProperty('pending')
  expect(danmakuForRole(result.snapshot,'student').messages).toEqual([])
  expect(Object.keys(current.messages[0]).sort()).toEqual(['createdAt','expiresAt','id','status','text'])
 })
 it('keeps review messages pending when switching to realtime; approval resets a 30s TTL',async()=>{
  const {id,snapshot}=await start({reviewMode:'review'});const sent=await send(id,snapshot)
  expect(sent.snapshot.pending).toEqual([])
  expect((await store.read(id)).snapshot.pending).toHaveLength(1)
  const realtime=(await control(id,snapshot,'configure',{settings:{reviewMode:'realtime'}})).snapshot
  expect(realtime.pending).toHaveLength(1);expect(realtime.messages).toEqual([])
  const approved=(await control(id,realtime,'approve',{messageId:sent.messageId})).snapshot
  expect(approved.pending).toEqual([]);expect(approved.messages).toHaveLength(1)
  expect(Date.parse(approved.messages[0].expiresAt)-Date.parse(approved.messages[0].createdAt)).toBe(30000)
  const hidden=(await control(id,approved,'hide',{messageId:sent.messageId})).snapshot
  expect(hidden.messages).toEqual([])
  expect(danmakuForRole(hidden,'bigscreen').removedMessageIds).toEqual([sent.messageId])
  expect(danmakuForRole(hidden,'student')).not.toHaveProperty('removedMessageIds')
  expect(danmakuForRole((await store.read(id)).snapshot,'bigscreen').removedMessageIds).toEqual([sent.messageId])
  const removalKey=prefix(id)+':removed'
  expect(await client.pTTL(removalKey)).toBeGreaterThan(0)
  expect(await client.pTTL(removalKey)).toBeLessThanOrEqual(30000)
  expect(JSON.parse((await client.get(removalKey))!)).toEqual([{id:sent.messageId,expiresAt:Date.parse(approved.messages[0].expiresAt)}])
  const cleared=(await control(id,hidden,'clear')).snapshot
  expect(danmakuForRole(cleared,'bigscreen').removedMessageIds).toEqual([])
  expect(await client.exists(removalKey)).toBe(0)
 })
 it('allows student sends while paused and clear/stop prevent replay across sessions',async()=>{
  const {id,snapshot}=await start({displayMode:'DANMAKU'});const paused=(await control(id,snapshot,'pause')).snapshot
  const sent=await send(id,paused);expect(sent.snapshot.paused).toBe(true)
  const cleared=(await control(id,paused,'clear')).snapshot;expect(cleared.messages).toEqual([]);expect(cleared.displayEpoch).toBeGreaterThan(snapshot.displayEpoch)
  const resumed=(await control(id,cleared,'resume')).snapshot;expect(resumed.paused).toBe(false)
  const stopped=(await control(id,resumed,'stop')).snapshot;expect(stopped.sessionId).toBeNull();expect(stopped.displayMode).toBe('QUESTION')
  const restarted=(await control(id,stopped,'start')).snapshot;expect(restarted.displayEpoch).toBeGreaterThan(stopped.displayEpoch);expect(restarted.sessionId).not.toBe(snapshot.sessionId)
  await expect(send(id,snapshot)).rejects.toMatchObject({code:'CONFLICT'})
 })
 it('deduplicates identical retries before charging cooldown or rate, rejects changed text',async()=>{
  const {id,snapshot}=await start();const sender=randomUUID(),key=randomUUID()
  const a=await send(id,snapshot,sender,'同一条',key),b=await send(id,snapshot,sender,'同一条',key)
  expect(b.replayed).toBe(true);expect(b.messageId).toBe(a.messageId);expect(b.snapshot.revision).toBe(a.snapshot.revision)
  await expect(send(id,snapshot,sender,'改过了',key)).rejects.toMatchObject({code:'CONFLICT'})
  await expect(send(id,snapshot,sender)).rejects.toMatchObject({code:'RATE_LIMIT'})
  expect(await client.zCard(prefix(id)+':rate:'+sender+':'+snapshot.sessionId)).toBe(1)
 })
 it('enforces rolling 10/min atomically even after cooldown has elapsed',async()=>{
  const {id,snapshot}=await start();const sender=randomUUID()
  for(let index=0;index<10;index++){await client.del(prefix(id)+':cooldown:'+sender+':'+snapshot.sessionId);await send(id,snapshot,sender)}
  await client.del(prefix(id)+':cooldown:'+sender+':'+snapshot.sessionId)
  await expect(send(id,snapshot,sender)).rejects.toMatchObject({code:'RATE_LIMIT'})
 })
 it('queue mutations never starve config CAS but concurrent config updates conflict',async()=>{
  const {id,snapshot}=await start();await Promise.all(Array.from({length:12},()=>send(id,snapshot)))
  const changes=await Promise.allSettled([control(id,snapshot,'configure',{settings:{topic:'第一'}}),control(id,snapshot,'configure',{settings:{topic:'第二'}})])
  expect(changes.filter(x=>x.status==='fulfilled')).toHaveLength(1)
  expect(changes.filter(x=>x.status==='rejected')).toHaveLength(1)
  const current=(await store.read(id)).snapshot;expect(current.revision).toBeGreaterThan(current.controlRevision);expect(current.messages).toHaveLength(12)
 })
 it('stores text separately with absolute queue TTL; read/config do not prolong it',async()=>{
  const {id,snapshot}=await start();await send(id,snapshot)
  const raw=JSON.parse((await client.get(prefix(id)))!);expect(raw).not.toHaveProperty('messages');expect(raw).not.toHaveProperty('pending')
  const before=await client.pTTL(prefix(id)+':messages');expect(before).toBeGreaterThan(29000);expect(before).toBeLessThanOrEqual(30000)
  await wait(20);await control(id,snapshot,'configure',{settings:{speed:'slow'}});await store.read(id)
  expect(await client.pTTL(prefix(id)+':messages')).toBeLessThan(before)
  const queue=JSON.parse((await client.get(prefix(id)+':messages'))!);queue[0].expiresAt=Date.now()-1;await client.set(prefix(id)+':messages',JSON.stringify(queue),{PX:30000})
  expect((await store.read(id)).snapshot.messages).toEqual([]);expect(await client.exists(prefix(id)+':messages')).toBe(0)
 })
 it('keeps older approved text available to teachers while bounding the displayed feed',async()=>{
  const {id,snapshot}=await start({reviewMode:'review'})
  await Promise.all(Array.from({length:100},()=>send(id,snapshot)))
  await expect(send(id,snapshot)).rejects.toMatchObject({code:'QUEUE_FULL'})
  const updated=(await control(id,snapshot,'configure',{settings:{reviewMode:'realtime'}})).snapshot
  const first=await send(id,updated),second=await send(id,updated)
  await Promise.all(Array.from({length:100},()=>send(id,updated)))
  const latest=(await store.read(id)).snapshot
  expect(latest.pending).toHaveLength(100)
  const teacher=danmakuForRole(latest,'teacher'),screen=danmakuForRole(latest,'bigscreen')
  expect(teacher.messages).toHaveLength(102)
  expect(teacher.messages[0].id).toBe(first.messageId)
  expect(screen.messages).toHaveLength(100)
  expect(screen.messages.some(message=>message.id===first.messageId)).toBe(false)
  expect(screen.olderModerationIds).toEqual([first.messageId,second.messageId])
  expect(danmakuForRole(latest,'student')).not.toHaveProperty('olderModerationIds')
  const hidden=(await control(id,latest,'hide',{messageId:first.messageId})).snapshot
  expect(danmakuForRole(hidden,'bigscreen').removedMessageIds).toEqual([first.messageId])
  expect(danmakuForRole(hidden,'bigscreen').olderModerationIds).toEqual([second.messageId])
  expect(await client.exists(prefix(id)+':visibility:'+first.messageId)).toBe(0)
  const cleared=(await control(id,hidden,'clear')).snapshot
  expect(danmakuForRole(cleared,'bigscreen').olderModerationIds).toEqual([])
  await expect(control(id,cleared,'hide',{messageId:second.messageId})).rejects.toMatchObject({code:'NOT_FOUND'})
 })
 it('drops the oldest moderation ID with its text once the bounded roster fills up',async()=>{
  const {id,snapshot}=await start()
  const first=await send(id,snapshot)
  await Promise.all(Array.from({length:256},()=>send(id,snapshot)))
  const current=(await store.read(id)).snapshot
  expect(danmakuForRole(current,'teacher').messages).toHaveLength(256)
  const screen=danmakuForRole(current,'bigscreen')
  expect(screen.olderModerationIds).toHaveLength(156)
  expect(screen.olderModerationIds).not.toContain(first.messageId)
  expect(screen.messages.some(message=>message.id===first.messageId)).toBe(false)
 })
 it('close is terminal even for an in-flight stale start and clears text keys',async()=>{
  const {id,snapshot}=await start();await send(id,snapshot);const closed=(await store.close(id)).snapshot
  expect(closed.enabled).toBe(false);expect(await client.exists(prefix(id)+':messages')).toBe(0)
  await expect(control(id,closed,'start')).rejects.toMatchObject({code:'CLASSROOM_CLOSED'})
  await expect(send(id,snapshot)).rejects.toMatchObject({code:'STOPPED'})
 })
 it('validates bounded text and fails closed independently if Redis is unavailable',async()=>{
  const {id,snapshot}=await start()
  expect(()=>send(id,snapshot,randomUUID(),'字'.repeat(61))).toThrow()
  expect(()=>send(id,snapshot,randomUUID(),'  ')).toThrow()
  const broken=new ClassroomDanmakuStore(async()=>{throw new Error('not connected')})
  await expect(broken.read(id)).rejects.toMatchObject({code:'UNAVAILABLE'})
  expect(broken.unavailable(id)).toMatchObject({available:false,enabled:false,messages:[]})
 })
 it('caps message text TTL at the session deadline and never revives orphan queues after expiry',async()=>{
  for(const mode of ['realtime','review']){
   const {id,snapshot}=await start({reviewMode:mode})
   const raw=JSON.parse((await client.get(prefix(id)))!);raw.expiresAt=Date.now()+1000
   await client.set(prefix(id),JSON.stringify(raw),{PX:1000})
   const sent=await send(id,snapshot)
   const current=(await store.read(id)).snapshot
   const queue=mode==='review'?current.pending!:current.messages
   expect(Date.parse(queue[0].expiresAt)).toBe(raw.expiresAt)
   expect(await client.pTTL(prefix(id)+(mode==='review'?':pending':':messages'))).toBeLessThanOrEqual(1000)
   if(mode==='review'){
    const approved=(await control(id,snapshot,'approve',{messageId:sent.messageId})).snapshot
    expect(Date.parse(approved.messages[0].expiresAt)).toBe(raw.expiresAt)
   }
   await client.del(prefix(id))
   const fresh=(await store.read(id)).snapshot
   expect(fresh.messages).toEqual([]);expect(fresh.pending).toEqual([])
   expect(await client.exists(prefix(id)+':messages')).toBe(0)
  }
 })

})
