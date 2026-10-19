/** Actual bounded Node children only; no product/service/network startup. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {observeResourceChild,summarizeProcesses} from './c25-c26-observer.mjs'
const moduleUrl=new URL('./c25-c26-observer.mjs',import.meta.url).href
const nonce=()=>randomBytes(32).toString('hex')
function childSource(n,mode){return `
 import {reportNodeResources} from ${JSON.stringify(moduleUrl)};
 const options={nonce:${JSON.stringify(n)},role:'report_worker',timeoutMs:1500};
 await reportNodeResources({...options,phase:'start'});
 if(${JSON.stringify(mode)}==='wait'){process.on('SIGTERM',()=>{});process.send({type:'c26-test-waiting'});setInterval(()=>{},1000)}
 else {await reportNodeResources({...options,phase:'terminal'});let n=0;for(let i=0;i<1000000;i++)n+=i;globalThis.testTail=n;}
`}
function spawnChild(n,mode){return spawn(process.execPath,['--input-type=module','-e',childSource(n,mode)],{detached:true,stdio:['ignore','ignore','ignore','ipc']})}
async function ensureGone(child){if(child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid,'SIGKILL')}catch(e){if(e.code!=='ESRCH')throw e};await new Promise(resolve=>child.once('close',resolve))}}
test('actual worker observation accepts a remaining-window budget above 10s and reports measured wall tail with CPU excluded',{timeout:5000},async()=>{
 const n=nonce(),child=spawnChild(n,'success')
 try{
  const r=await observeResourceChild(child,{nonce:n,role:'report_worker',deadlineMs:15000,killGraceMs:250,reapMs:1000})
  assert.equal(r.lifecycle.aggregateBudgetMs,16250);assert.equal(r.lifecycle.groupQuiescent,true);assert.equal(r.lifecycle.closeObserved,true)
  assert.ok(BigInt(r.lifecycle.terminalToCloseWallNs)>0n);assert.equal(r.lifecycle.terminalToCloseCpu,'NOT_OBSERVED')
  assert.equal(BigInt(r.lifecycle.closedMonotonicNs)-BigInt(r.terminal.monotonicNs),BigInt(r.lifecycle.terminalToCloseWallNs))
  const total=summarizeProcesses([],100,{children:[r],requiredChildren:[r.start]})
  assert.equal(total.physicalTotals.userMicroseconds,r.terminal.cpu.user);assert.match(total.physical[0].cpuScope,/ACK_EXIT_TAIL_EXCLUDED/)
 }finally{await ensureGone(child)}
})
test('aggregate above 90s and a process not directly owned are rejected before any signal',()=>{
 const n=nonce();assert.throws(()=>observeResourceChild(null,{nonce:n,role:'report_worker',deadlineMs:90000,killGraceMs:1,reapMs:1}),/90 seconds/)
 assert.throws(()=>observeResourceChild({pid:process.pid,connected:true},{nonce:n,role:'report_worker',deadlineMs:1000}),/direct owned child/)
})
test('global fault abort interrupts an actual child and proves close plus owned-group quiescence',{timeout:5000},async()=>{
 const n=nonce(),child=spawnChild(n,'wait'),controller=new AbortController(),error=new Error('synthetic global IPC/ownership fault')
 const waiting=new Promise(resolve=>child.on('message',message=>{if(message?.type==='c26-test-waiting')resolve()}))
 const outcome=observeResourceChild(child,{nonce:n,role:'report_worker',deadlineMs:2000,killGraceMs:30,reapMs:500,abortSignal:controller.signal});outcome.catch(()=>{})
 try{await waiting;controller.abort(error);await assert.rejects(outcome,got=>{
  assert.equal(got,error);assert.equal(got.lifecycle.closeObserved,true);assert.equal(got.lifecycle.groupQuiescent,true);assert.equal(got.lifecycle.code,null);assert.equal(got.lifecycle.signal,'SIGKILL')
  assert.deepEqual(got.lifecycle.terminationSignals.map(x=>x.signal),['SIGTERM','SIGKILL']);assert.equal(got.lifecycle.terminalToCloseWallNs,null);return true
 })}finally{await ensureGone(child)}
})
