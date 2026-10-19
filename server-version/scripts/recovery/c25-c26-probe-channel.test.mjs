import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {createProbeChannel} from './c25-c26-probe-channel.mjs'
const nonce='a'.repeat(64),identity={pid:99,startTicks:'123'},bindings={f:'b'.repeat(64)},role='api'
function setup({record=()=>{},remainingMs=()=>1000}={}){
 const child=new EventEmitter();child.pid=identity.pid;const sent=[],faults=[];child.send=(message,done)=>{sent.push(message);done()}
 const channel=createProbeChannel(child,{nonce,role,identity,bindings,remainingMs,record,onFault:e=>faults.push(e)})
 child.emit('message',{type:'c26-runtime-probe-ready',nonce,role,...identity,bindings})
 function reply(extra={}){
  const command=sent.at(-1),sample={schemaVersion:1,role,...identity,consumerLoaded:true,sql:{scope:'MIRROR_OF_THIS_FROZEN_PRISMA_EVENT_CONSUMER_NOT_ALL_DATABASE_SQL',events:1,durationMs:2},cpuUsageMicros:{user:100,system:20},memoryUsageBytes:{rss:100,heapTotal:80,heapUsed:50,external:1,arrayBuffers:1},instrumentation:Object.fromEntries(['mirrorCalls','snapshots','ipcMessages','ipcBytes','mirrorCpuUserMicros','mirrorCpuSystemMicros','mirrorWallNs','snapshotCpuUserMicros','snapshotCpuSystemMicros','snapshotWallNs'].map(k=>[k,1])),...(command.action==='close'?{closed:true}:{}),...extra}
  child.emit('message',{type:'c26-runtime-probe-result',nonce,sequence:command.sequence,ok:true,value:sample})
 }
 return {child,channel,sent,faults,reply}
}
const issued=async channel=>{const p=channel.request();await Promise.resolve();return {p}}
test('parent probe channel accepts identical read snapshots and one close without any HTTP or SQL operation',async()=>{
 const x=setup();await x.channel.ready()
 for(let i=0;i<2;i++){const {p}=await issued(x.channel);x.reply();assert.equal((await p).sql.events,1)}
 const closing=x.channel.request('close');await Promise.resolve();x.reply();await closing;x.child.emit('close',0,null)
 assert.equal(x.channel.assertHealthy().closed,true);assert.deepEqual(x.sent.map(x=>x.action),['snapshot','snapshot','close']);assert.equal(x.faults.length,0)
})
test('journal failure after response validation rejects the pending IPC request instead of stranding it',async()=>{
 const x=setup({record:value=>{if(['PROBE_RESULT','PROBE_FAULT'].includes(value.stage))throw new Error('synthetic write failure')}})
 const {p}=await issued(x.channel);x.reply();await assert.rejects(p,/synthetic write failure/);assert.equal(x.faults.length,1);assert.throws(()=>x.channel.assertHealthy())
})
test('wrong identity, overlapping snapshots, disconnect and late SQL fault stop parent observation',async()=>{
 for(const kind of ['identity','overlap','disconnect','late']){
  const x=setup(),{p}=await issued(x.channel)
  if(kind==='identity')x.reply({startTicks:'124'})
  else if(kind==='overlap')await assert.rejects(x.channel.request(),/pending/)
  else if(kind==='disconnect')x.child.emit('disconnect')
  else x.child.emit('message',{type:'c26-runtime-probe-fault',nonce,errorClass:'SQL_EVENT_AFTER_PROBE_CLOSE'})
  await assert.rejects(p);assert.equal(x.faults.length,1);assert.throws(()=>x.channel.assertHealthy())
 }
})
test('missing IPC response expires within shared remaining budget and cannot silently produce zero counters',async()=>{
 const x=setup({remainingMs:()=>5}),{p}=await issued(x.channel)
 await assert.rejects(p,/response deadline/);assert.equal(x.faults.length,1);assert.throws(()=>x.channel.assertHealthy())
})
