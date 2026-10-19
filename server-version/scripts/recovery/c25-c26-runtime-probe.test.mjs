import test from 'node:test'
import assert from 'node:assert/strict'
import {fork} from 'node:child_process'
import {createRequire} from 'node:module'
import {randomBytes} from 'node:crypto'
import {fileURLToPath} from 'node:url'
const require=createRequire(import.meta.url)
const {transparentMirror}=require('./c25-c26-runtime-probe.cjs')
const file=name=>fileURLToPath(new URL(name,import.meta.url))
function child(mode='normal',extra={}){
 const nonce=randomBytes(32).toString('hex'),events=[],waiters=[]
 const proc=fork(file('c25-c26-probe-fixture.cjs'),[],{
  execPath:process.execPath,execArgv:['--require',file('c25-c26-probe-boundary.cjs'),'--require',file('c25-c26-runtime-probe.cjs')],
  detached:true,stdio:['ignore','pipe','pipe','ipc'],
  env:{PATH:process.env.PATH,NODE_ENV:'test',PERF_ISOLATED_TEST_MODE:'1',PERF_SQL_EVENT_COUNT:'1',
   C26_RUNTIME_PROBE_ENABLE:'1',C26_PROBE_ROLE:'api',C26_PROBE_NONCE:nonce,C26_PROBE_FIXTURE_MODE:mode,...extra},
 })
 let logs='',seq=0,id=0
 for(const stream of [proc.stdout,proc.stderr])stream.on('data',bytes=>{logs+=bytes;if(logs.length>16384)proc.kill('SIGKILL')})
 const closed=new Promise(resolve=>proc.once('close',(code,signal)=>{const event={type:'closed',code,signal};events.push(event);for(const f of [...waiters])f(event);resolve(event)}))
 proc.on('message',event=>{events.push(event);for(const f of [...waiters])f(event)})
 const wait=predicate=>new Promise((resolve,reject)=>{
  const found=events.find(predicate);if(found){resolve(found);return}
  const timer=setTimeout(()=>{remove();reject(Error('bounded child IPC wait: '+logs))},3000)
  const listener=event=>{if(predicate(event)){remove();resolve(event)}}
  function remove(){clearTimeout(timer);const i=waiters.indexOf(listener);if(i>=0)waiters.splice(i,1)}
  waiters.push(listener)
 })
 async function request(action){
  const sequence=++seq;proc.send({type:'c26-runtime-probe',nonce,sequence,action})
  return wait(x=>x.type==='c26-runtime-probe-result'&&x.sequence===sequence)
 }
 async function fixture(action,extra={}){
  const current=++id;proc.send({type:'c26-fixture',id:current,action,...extra})
  const reply=await wait(x=>x.id===current&&x.type.startsWith('c26-fixture-'));assert.equal(reply.type,'c26-fixture-ok');return reply
 }
 async function stop(){
  if(proc.exitCode===null&&proc.signalCode===null){
   if(proc.connected){try{await fixture('stop')}catch{}}
   const outcome=await Promise.race([closed,new Promise(resolve=>setTimeout(()=>resolve(null),500))])
   if(!outcome){try{process.kill(-proc.pid,'SIGTERM')}catch{}
    const term=await Promise.race([closed,new Promise(resolve=>setTimeout(()=>resolve(null),500))])
    if(!term){try{process.kill(-proc.pid,'SIGKILL')}catch{}}
   }
  }
  return await Promise.race([closed,new Promise((_,reject)=>setTimeout(()=>reject(Error('child did not reap')),1000))])
 }
 return {proc,wait,request,fixture,stop,closed,nonce}
}
async function loaded(c){await c.wait(x=>x.type==='c26-runtime-probe-ready');await c.wait(x=>x.type==='c26-fixture-loaded')}
test('real frozen CommonJS consumer event increments mirror; IPC snapshots add no SQL or metric reset',{timeout:10000},async()=>{
 const c=child()
 try{
  await loaded(c);const zero=await c.request('snapshot');assert.equal(zero.ok,true);assert.equal(zero.value.sql.events,0)
  assert.equal(zero.value.consumerLoaded,true);assert.ok(zero.value.cpuUsageMicros.user>=0&&zero.value.memoryUsageBytes.heapUsed>0)
  await c.fixture('event',{duration:1.25});const one=await c.request('snapshot');assert.equal(one.value.sql.events,1);assert.equal(one.value.sql.durationMs,1.25)
  await c.fixture('invalid-events');const again=await c.request('snapshot');assert.deepEqual(again.value.sql,one.value.sql)
  const verify=await c.fixture('check');assert.equal(verify.resetCount,0)
  await c.fixture('duplicate');const final=await c.request('close');assert.equal(final.ok,true);assert.equal(final.value.closed,true);assert.deepEqual(final.value.sql,one.value.sql)
  await c.fixture('event',{duration:2});const late=await c.wait(x=>x.type==='c26-runtime-probe-fault');assert.equal(late.errorClass,'SQL_EVENT_AFTER_PROBE_CLOSE')
  assert.equal((await c.request('snapshot')).ok,false,'closed observer may not silently start another measurement')
 }finally{const exit=await c.stop();assert.equal(exit.code,0);assert.equal(exit.signal,null)}
})
test('late preload with a previously captured production module fails before ready',{timeout:10000},async()=>{
 const c=child('normal',{C26_PROBE_PRELOAD_RUNTIME:'1'})
 try{const exit=await c.wait(x=>x.type==='closed');assert.notEqual(exit.code,0)}
 finally{await c.stop()}
})
test('missing real consumer or replaced record export cannot qualify SQL observations',{timeout:15000},async()=>{
 for(const mode of ['missing-consumer','normal']){
  const c=child(mode)
  try{await loaded(c);if(mode==='normal')await c.fixture('drift');assert.equal((await c.request('snapshot')).ok,false)}
  finally{assert.equal((await c.stop()).code,0)}
 }
})
test('probe namespace nonce/sequence/command faults fail closed',{timeout:10000},async()=>{
 const c=child()
 try{
  await loaded(c);c.proc.send({type:'c26-runtime-probe',nonce:'0'.repeat(64),sequence:1,action:'snapshot'})
  const rejected=await c.wait(x=>x.type==='c26-runtime-probe-result');assert.equal(rejected.ok,false)
  assert.equal((await c.request('snapshot')).ok,false,'invalid message latches observation failure')
 }finally{assert.equal((await c.stop()).code,0)}
})
test('transparent wrapper forwards exact return/receiver/exception and does not change business on mirror failure',()=>{
 const receiver={},result={},error=new Error('synthetic original error');let mirrored=0,failed=0
 const wrapped=transparentMirror(function(x){assert.equal(this,receiver);if(x==='throw')throw error;return result},()=>true,()=>{mirrored++},()=>{failed++})
 assert.equal(wrapped.call(receiver,7),result);assert.equal(mirrored,1)
 assert.throws(()=>wrapped.call(receiver,'throw'),x=>x===error);assert.equal(mirrored,1)
 const broken=transparentMirror(()=>result,()=>true,()=>{throw Error('synthetic mirror fault')},()=>{failed++})
 assert.equal(broken(),result);assert.equal(failed,1)
})
