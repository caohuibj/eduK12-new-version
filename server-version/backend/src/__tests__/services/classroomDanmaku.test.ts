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
 it('defaults to realtime before any question and role filters remove pending and identities',async()=>{
  const {id,snapshot}=await start();expect(snapshot.reviewMode).toBe('realtime');expect(snapshot.enabled).toBe(true)
  const result=await send(id,snapshot)
  expect(result.status).toBe('approved');expect(result.snapshot.messages).toHaveLength(1)
  expect(danmakuForRole(result.snapshot,'bigscreen').messages[0].text).toBe('合成弹幕')
  expect(danmakuForRole(result.snapshot,'student')).not.toHaveProperty('pending')
  expect(danmakuForRole(result.snapshot,'student').messages).toEqual([])
  expect(Object.keys(result.snapshot.messages[0]).sort()).toEqual(['createdAt','expiresAt','id','status','text'])
 })
 it('keeps review messages pending when switching to realtime; approval resets a 30s TTL',async()=>{
  const {id,snapshot}=await start({reviewMode:'review'});const sent=await send(id,snapshot)
  expect(sent.snapshot.pending).toHaveLength(1);expect(danmakuForRole(sent.snapshot,'bigscreen').messages).toEqual([])
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
 it('caps pending at 100 without charging failed submissions and visible history at 100',async()=>{
  const {id,snapshot}=await start({reviewMode:'review'})
  await Promise.all(Array.from({length:100},()=>send(id,snapshot)))
  await expect(send(id,snapshot)).rejects.toMatchObject({code:'QUEUE_FULL'})
  const updated=(await control(id,snapshot,'configure',{settings:{reviewMode:'realtime'}})).snapshot
  const first=await send(id,updated),second=await send(id,updated)
  await Promise.all(Array.from({length:100},()=>send(id,updated)))
  const latest=(await store.read(id)).snapshot
  expect(latest.messages).toHaveLength(100)
  expect(latest.pending).toHaveLength(100)
  expect(latest.messages.some(message=>message.id===first.messageId)).toBe(false)
  expect(danmakuForRole(latest,'bigscreen').removedMessageIds).toEqual([])
  const hidden=(await control(id,latest,'hide',{messageId:first.messageId})).snapshot
  expect(danmakuForRole(hidden,'bigscreen').removedMessageIds).toEqual([first.messageId])
  expect(await client.exists(prefix(id)+':visibility:'+first.messageId)).toBe(0)
  const cleared=(await control(id,hidden,'clear')).snapshot
  await expect(control(id,cleared,'hide',{messageId:second.messageId})).rejects.toMatchObject({code:'NOT_FOUND'})
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
   const queue=mode==='review'?sent.snapshot.pending!:sent.snapshot.messages
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
