/** Real Node process and read-only /proc only: no listeners, PG or API. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {spawn} from 'node:child_process'
import {parseProcStat} from './c25-c26-observer.mjs'
import {createProcSocketReader} from './c25-c26-proc-sockets.mjs'
const identity=pid=>parseProcStat(fs.readFileSync(`/proc/${pid}/stat`,'utf8'))
test('real Node observer fd inventory keeps directory handles open instead of repeatedly losing its own scandir FD',{timeout:5000},async()=>{
 const child=spawn(process.execPath,['-e',"process.on('message',m=>{if(m==='stop')process.disconnect()});process.send({ready:true})"],{detached:true,stdio:['ignore','ignore','ignore','ipc']})
 const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})))
 try{
  await new Promise((resolve,reject)=>{child.once('message',v=>v.ready?resolve():reject(new Error('bad fixture ready')));child.once('error',reject)})
  const owners=[{...identity(process.pid),role:'observer',applicationName:'c26:observer:live-fd-contract'},{...identity(child.pid),role:'pg_postmaster'}],registry={entries:()=>structuredClone(owners)},raw=[]
  // Exact former directory-list boundary reproduces the self-generated race.
  const legacyIo={readText:p=>fs.readFileSync(p,'utf8'),readdir:p=>fs.readdirSync(p),readlink:p=>fs.readlinkSync(p)}
  const legacy=createProcSocketReader({registry,remainingMs:()=>1000,record:value=>raw.push(value),io:legacyIo})
  assert.throws(()=>legacy(),/proc entry disappeared during snapshot/);assert.equal(raw.filter(x=>x.kind==='proc_socket_snapshot_failure').length,2);assert.ok(raw.every(x=>/\/fd\//.test(x.procPath)))
  const observations=[],read=createProcSocketReader({registry,remainingMs:()=>1000,record:value=>observations.push(value)})
  let frame;try{frame=read()}catch(error){if(process.env.C26_PREPARE_EVIDENCE_ROOT)fs.writeFileSync(`${process.env.C26_PREPARE_EVIDENCE_ROOT}/proc-live-failure-private.json`,JSON.stringify({observations,error:{code:error.code,stack:error.stack}},null,2),{mode:0o600,flag:'wx'});throw error}assert.deepEqual(frame.processes.map(p=>p.pid),owners.map(p=>p.pid));assert.equal(frame.snapshotEvidence.attempts,1);assert.equal(frame.snapshotEvidence.discardedAttempts.length,0)
  assert.equal(frame.pgChildren.length,0);assert.equal(frame.snapshotEvidence.childEnumerationMethod,'COMPLETE_PROC_PPID');assert.equal(frame.snapshotEvidence.globalProcScans,2);assert.ok(frame.snapshotEvidence.globalProcRows>=4);assert.ok(frame.snapshotEvidence.observerCpu.user>=0);assert.ok(frame.socketInventory.some(x=>x.protocol==='unix'));assert.ok(frame.processes.every(p=>p.rssBytes>0&&p.userTicks>=0));assert.equal(observations.length,1)
  child.send('stop');const exit=await closed;assert.deepEqual(exit,{code:0,signal:null});fs.writeFileSync(`${process.env.C26_PREPARE_EVIDENCE_ROOT}/real-proc-contract-private.json`,JSON.stringify({legacyFailures:raw,currentFrame:frame,observations,exit},null,2),{mode:0o600,flag:'wx'})
 }finally{if(child.exitCode===null&&child.signalCode===null){process.kill(-child.pid,'SIGKILL');await closed}}
})
