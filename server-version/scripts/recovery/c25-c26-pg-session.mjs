/** Separate, owned observer process. Importing starts nothing.
 * The caller retains the authoritative immutable PID registry. register() MUST
 * finish before an API/worker is allowed to load a database consumer. API stop
 * belongs AFTER close(): its final exit CPU is outside these measured windows.
 * One connection/session <=1200s; each begin/end/settled window remains <=90s.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {randomBytes,createHash} from 'node:crypto'
import {parseProcStat} from './c25-c26-observer.mjs'

export const PG_SESSION_PROTOCOL='c26:pg-session:v1'
const file=name=>fileURLToPath(new URL(name,import.meta.url))
const keys=(value,expected)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),expected.slice().sort(),'unexpected PG session message fields')}
const id=p=>`${p.pid}:${p.startTicks}`
const proc=pid=>{const row=parseProcStat(fs.readFileSync(`/proc/${pid}/stat`,'utf8'));assert.equal(row.pid,pid);return row}
const missing=error=>['ENOENT','ESRCH'].includes(error?.code)
function privateDirectory(directory){
 assert.equal(path.resolve(directory),directory);assert.equal(fs.realpathSync(directory),directory)
 const stat=fs.lstatSync(directory);assert.ok(stat.isDirectory());assert.equal(stat.mode&0o777,0o700);assert.equal(stat.uid,process.getuid())
}
function pin(entry,{owned=false}={}){
 const row=proc(entry.pid);assert.equal(row.startTicks,entry.startTicks,'registered PID reused');assert.equal(row.processGroupId,entry.processGroupId,'registered process group changed');assert.ok(!['Z','X','x'].includes(row.state),'registered process already dead')
 if(entry.parentPid!==undefined)assert.equal(row.parentPid,entry.parentPid)
 if(owned){assert.equal(row.parentPid,process.pid,'API/worker must be a direct owned child');assert.equal(row.processGroupId,row.pid,'API/worker must have an owned detached group')}
 return row
}
function writePrivate(file,value){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}

export async function startPgObserverSession({directory,node,env={},registry,remainingMs,record,onFault,abortSignal,maxJournalBytes=32*1024**2},{spawnChild=spawn}={}){
 privateDirectory(directory);assert.equal(fs.realpathSync(node),node)
 for(const fn of [registry?.entries,registry?.register,registry?.retire,remainingMs,record,onFault])assert.equal(typeof fn,'function')
 assert.ok(!env.NODE_OPTIONS&&!env.C26_RUNTIME_PROBE_ENABLE,'observer must not preload business probes')
 assert.ok(Number.isSafeInteger(maxJournalBytes)&&maxJournalBytes>=1024&&maxJournalBytes<=64*1024**2)
 const initial=remainingMs();assert.ok(Number.isFinite(initial)&&initial>=4500&&initial<=1200000,'observer session aggregate must fit 1200s')
 const aggregateEnd=performance.now()+initial,reserveMs=1500,nonce=randomBytes(32).toString('hex'),applicationName=`c26:observer:${nonce.slice(0,16)}`
 const initialEntries=registry.entries();assert.equal(initialEntries.filter(p=>p.role==='observer').length,0);assert.equal(initialEntries.filter(p=>p.role==='pg_postmaster').length,1);assert.ok(initialEntries.filter(p=>p.role==='api').length<=1)
 assert.ok(initialEntries.some(p=>p.role==='driver'&&p.pid===process.pid),'actual driver registration required');for(const entry of initialEntries)pin(entry)
 const invocationPath=path.join(directory,'observer-invocation-private.json'),journalPath=path.join(directory,'observer-parent-raw-private.jsonl')
 const deadlineNs=(process.hrtime.bigint()+BigInt(Math.floor(initial*1e6))).toString()
 writePrivate(invocationPath,{schemaVersion:1,nonce,parentPid:process.pid,deadlineNs,reserveMs,maxJournalBytes})
 const journalFd=fs.openSync(journalPath,'wx',0o600),digest=createHash('sha256')
 const receipt={schemaVersion:1,nonce,applicationName,initialAggregateMs:initial,identity:null,signals:[],closeObserved:false,groupQuiescent:false,passed:false,windows:0,terminalToCloseCpu:'NOT_OBSERVED; NO_FULL_EXIT_CPU_CLAIM',apiStopScope:'AFTER_OBSERVER_CLOSE; OUTSIDE_MEASURED_WINDOWS'}
 let child,identity,sequence=0,eventSequence=0,pending=null,booted=false,connected=false,windowDeadline=null,windowPhase='none',closing=false,closeAck=false,failure=null,faultNotified=false,journalBytes=0,journalClosed=false,finished=false,killTimer,hardTimer,lifetimeTimer,groupTimer,closeResult=null,bootResolve,doneResolve
 const issuedHistory=new Map()
 const bootPromise=new Promise(resolve=>bootResolve=resolve),done=new Promise(resolve=>doneResolve=resolve)
 const remaining=()=>{const value=Math.min(remainingMs(),aggregateEnd-performance.now());assert.ok(Number.isFinite(value)&&value>0,'observer session aggregate deadline');return value}
 const workRemaining=()=>{const value=Math.min(remaining()-reserveMs,windowDeadline===null?Infinity:windowDeadline-performance.now());assert.ok(value>0,'observer session/window work deadline');return value}
 const successRemaining=({endAt=null,windowEndAt=windowDeadline,work=!closing}={})=>{
  if(failure)throw failure
  if(work)workRemaining();else remaining()
  assert.ok(windowEndAt===null||performance.now()<windowEndAt,'observer original window deadline exceeded')
  assert.ok(endAt===null||performance.now()<endAt,'observer RPC deadline exceeded after callback')
 }
 const raw=(value,{failureEvidence=false}={})=>{
  assert.ok(!journalClosed,'observer parent journal closed');const bytes=Buffer.from(JSON.stringify(value)+'\n');assert.ok(journalBytes+bytes.length<=maxJournalBytes,'observer parent journal limit')
  fs.writeFileSync(journalFd,bytes);digest.update(bytes);journalBytes+=bytes.length
  const result=record(structuredClone(value));assert.ok(!result?.then,'observer record must be synchronous');if(!failureEvidence)successRemaining()
 }
 const membersOf=pgid=>{
  const names=fs.readdirSync('/proc');assert.ok(names.length<=8192,'observer cleanup proc enumeration bound')
  const rows=[];for(const name of names)if(/^[1-9][0-9]*$/.test(name))try{const row=proc(Number(name));if(row.processGroupId===pgid){rows.push(row);assert.ok(rows.length<=512,'observer process group bound')}}catch(error){if(!missing(error))throw error}
  return rows
 }
 const groups=()=>membersOf(identity.processGroupId)
 const notifyFault=error=>{if(faultNotified)return;faultNotified=true;try{onFault(error)}catch{}}
 const signal=name=>{
  if(!child?.pid)return
  try{
   if(identity){
    const members=groups();assert.ok(members.every(p=>p.pid!==identity.pid||p.startTicks===identity.startTicks),'observer process group leader PID reused')
    if(!members.some(p=>!['Z','X','x'].includes(p.state))){receipt.signals.push({name,sent:false,reason:'GROUP_ALREADY_QUIESCENT'});return}
    process.kill(-identity.processGroupId,name)
   }else child.kill(name)
   receipt.signals.push({name,sent:true})
  }catch(error){receipt.signals.push({name,sent:false,code:error.code??null});if(!missing(error))failure??=error}
 }
 const finish=()=>{
  if(finished)return;finished=true
  for(const timer of [killTimer,hardTimer,lifetimeTimer,groupTimer])clearTimeout(timer)
  abortSignal?.removeEventListener('abort',aborted)
  if(pending){clearTimeout(pending.timer);pending.reject(failure??new Error('observer exited before RPC completion'));pending=null}
  if(identity&&!receipt.closeObserved)try{receipt.finalGroupMembers=groups();receipt.groupQuiescent=receipt.finalGroupMembers.every(p=>['Z','X','x'].includes(p.state))}catch(error){failure??=error}
  receipt.cleanupFinishedMonotonicNs=process.hrtime.bigint().toString();receipt.closedMonotonicNs=receipt.processClosedMonotonicNs??null;receipt.closeAck=closeAck;receipt.result=closeResult;receipt.journalBytes=journalBytes
  receipt.terminalToCloseWallNs=closeResult?.terminal&&receipt.closedMonotonicNs?(BigInt(receipt.closedMonotonicNs)-BigInt(closeResult.terminal.monotonicNs)).toString():null
  if(!failure)try{
   remaining();const childJournal=path.join(directory,'observer-child-raw-private.jsonl'),stat=fs.lstatSync(childJournal);assert.ok(stat.isFile());assert.equal(stat.nlink,1);assert.equal(stat.uid,process.getuid());assert.equal(stat.mode&0o777,0o600);assert.ok(stat.size<=maxJournalBytes);assert.equal(stat.size,closeResult?.journalBytes);assert.equal(createHash('sha256').update(fs.readFileSync(childJournal)).digest('hex'),closeResult?.journalSha256,'observer child raw journal digest mismatch')
  }catch(error){failure??=error}
  receipt.passed=!failure&&closing&&closeAck&&receipt.closeObserved&&receipt.groupQuiescent&&receipt.exit?.code===0&&receipt.exit?.signal===null
  if(!receipt.passed)failure??=new Error('observer lifecycle incomplete')
  try{fs.fsyncSync(journalFd)}catch(error){failure??=error;receipt.passed=false}
  try{fs.closeSync(journalFd)}catch(error){failure??=error;receipt.passed=false}journalClosed=true;receipt.journalSha256=digest.digest('hex')
  if(!failure)try{successRemaining({work:false})}catch(error){failure=error;receipt.passed=false}
  if(failure){receipt.error={name:failure.name,message:failure.message};notifyFault(failure)}
  const receiptPath=path.join(directory,'observer-session-private.json')
  try{
   writePrivate(receiptPath,receipt)
   if(!failure)try{successRemaining({work:false})}catch(error){
    // Mandatory receipt I/O is inside the original aggregate. A late write is
    // corrected to false; this failure-only diagnostic never creates a PASS.
    failure=error;receipt.passed=false;receipt.error={name:error.name,message:error.message};notifyFault(error)
    const fd=fs.openSync(receiptPath,'r+');try{fs.ftruncateSync(fd,0);fs.writeFileSync(fd,JSON.stringify(receipt)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
   }
  }catch(error){failure??=error;receipt.passed=false;notifyFault(error)}
  if(failure)failure.observerLifecycle=structuredClone(receipt)
  doneResolve(receipt)
 }
 const fault=error=>{
  if(finished||failure)return failure??error
  failure=error instanceof Error?error:new Error(String(error))
  if(pending){clearTimeout(pending.timer);pending.reject(failure);pending=null}
  notifyFault(failure)
  signal('SIGTERM');let left=0;try{left=remaining()}catch{}
  const cleanup=Math.max(1,Math.min(reserveMs,left));clearTimeout(hardTimer);killTimer=setTimeout(()=>signal('SIGKILL'),Math.min(150,cleanup/3))
  hardTimer=setTimeout(()=>{signal('SIGKILL');finish()},cleanup);return failure
 }
 const aborted=()=>fault(abortSignal.reason instanceof Error?abortSignal.reason:new Error('observer coordinator aborted'))
 const check=()=>{if(failure)throw failure;assert.ok(!finished,'observer session closed');remaining();pin(identity,{owned:true})}
 const awaitBoot=()=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{const error=fault(new Error('observer boot deadline'));reject(error)},Math.min(3000,workRemaining()))
  bootPromise.then(()=>{clearTimeout(timer);try{successRemaining();resolve()}catch(error){reject(fault(error))}});done.then(()=>{clearTimeout(timer);if(!booted)reject(failure??new Error('observer closed before boot'))})
 })
 const rpc=async(op,payload={},limit=90000)=>{
  try{
   check();assert.ok(booted&&!pending&&!closing,'single outstanding observer semantic command required')
   assert.ok(issuedHistory.size<4096,'observer issued history bound')
   const seq=++sequence,left=Math.floor(Math.min(limit,op==='close'?remaining():workRemaining()));assert.ok(left>0)
   if(op==='close')closing=true
   const endNs=(process.hrtime.bigint()+BigInt(left)*1000000n).toString()
   return await new Promise((resolve,reject)=>{
    pending={seq,op,resolve,reject,endAt:performance.now()+left,timer:setTimeout(()=>fault(new Error(`observer ${op} RPC deadline`)),left)}
    const issued={seq,op,issuedMonotonicNs:process.hrtime.bigint().toString()}
    child.send({type:PG_SESSION_PROTOCOL,kind:'command',nonce,seq,op,deadlineNs:endNs,payload},error=>{if(error)fault(error)})
    issuedHistory.set(seq,issued);raw({stage:'OBSERVER_RPC_ISSUED',...issued})
   })
  }catch(error){throw fault(error)}
 }
 const validateReply=value=>{
  assert.equal(value.type,PG_SESSION_PROTOCOL);assert.equal(value.nonce,nonce);assert.equal(value.pid,identity.pid);assert.equal(value.startTicks,identity.startTicks)
 }
 try{
  child=spawnChild(node,[file('c25-c26-pg-session-child.mjs'),invocationPath],{cwd:directory,env:{...env,NODE_OPTIONS:''},detached:true,stdio:['ignore','pipe','pipe','ipc']})
  child.once('error',fault)
  child.once('close',(code,signalName)=>{
   receipt.closeObserved=true;receipt.exit={code,signal:signalName};receipt.processClosedMonotonicNs=process.hrtime.bigint().toString()
   if(!closing||!closeAck||code!==0||signalName)fault(new Error('observer abnormal or premature close'))
   const settle=()=>{
    try{receipt.finalGroupMembers=groups();receipt.groupQuiescent=receipt.finalGroupMembers.every(p=>['Z','X','x'].includes(p.state));if(receipt.groupQuiescent){finish();return}fault(new Error('observer left live descendants'));signal('SIGKILL');groupTimer=setTimeout(settle,20)}catch(error){fault(error)}
   };if(identity)settle();else finish()
  })
  child.once('disconnect',()=>{if(!closing||!closeAck)fault(new Error('observer IPC disconnected before terminal ACK'))})
  identity=Object.freeze({...proc(child.pid),role:'observer',applicationName});assert.equal(identity.parentPid,process.pid);assert.equal(identity.processGroupId,identity.pid);receipt.identity=identity
  registry.register(identity)
  raw({stage:'OBSERVER_IDENTITY_PINNED',identity,monotonicNs:process.hrtime.bigint().toString()})
  child.on('message',value=>{
   if(finished)return
   try{
    validateReply(value)
    if(value.kind==='boot'){
     keys(value,['type','kind','nonce','seq','op','pid','startTicks','parentPid','processGroupId']);assert.equal(value.seq,0);assert.equal(value.op,'boot');assert.ok(!booted);assert.equal(value.parentPid,process.pid);assert.equal(value.processGroupId,identity.processGroupId);pin(identity,{owned:true});booted=true;raw({stage:'OBSERVER_BOOTED',identity});bootResolve();return
    }
    assert.ok(booted,'observer message before boot')
    if(value.kind==='event'){
     keys(value,['type','kind','nonce','seq','op','pid','startTicks','value']);assert.equal(value.op,'record');assert.equal(value.seq,eventSequence+1);eventSequence=value.seq;raw({stage:'OBSERVER_RAW',sequence:eventSequence,value:value.value});return
    }
    if(value.kind==='fault'){
     keys(value,['type','kind','nonce','seq','op','pid','startTicks','error']);keys(value.error,['name','message']);assert.equal(typeof value.error.name,'string');assert.equal(typeof value.error.message,'string')
     // Identity was authenticated above. Preserve the actual fault BEFORE
     // matching its semantic history or clearing the in-flight command. An
     // asynchronous sample can fail at completed RPC3 while RPC4 is in transit.
     const context={stage:'OBSERVER_CHILD_FAULT',receivedMonotonicNs:process.hrtime.bigint().toString(),envelope:structuredClone(value),pending:pending?{seq:pending.seq,op:pending.op}:null,issuedHistory:[...issuedHistory.values()],lastCompletedOperation:receipt.lastOperation??null}
     receipt.childFault=context
     try{raw(context,{failureEvidence:true})}catch(error){receipt.childFaultEvidenceError={name:error.name,message:error.message};throw error}
     assert.ok(Number.isSafeInteger(value.seq)&&issuedHistory.has(value.seq),'fault refers to unissued/future RPC')
     assert.equal(value.op,issuedHistory.get(value.seq).op,'fault issued RPC operation mismatch')
     throw new Error(`observer child ${value.error.name}: ${value.error.message}`)
    }
    keys(value,['type','kind','nonce','seq','op','pid','startTicks','result']);assert.equal(value.kind,'reply');assert.ok(pending,'unsolicited observer reply');assert.equal(value.seq,pending.seq);assert.equal(value.op,pending.op);assert.ok(performance.now()<pending.endAt,'observer reply arrived after RPC deadline');if(value.op==='close')remaining();else workRemaining()
    const current=pending;raw({stage:'OBSERVER_RPC_COMPLETED',seq:value.seq,op:value.op,result:value.result});successRemaining({endAt:current.endAt,work:value.op!=='close'});assert.equal(pending,current,'observer RPC changed during mandatory record')
    if(value.op==='close'){
     assert.equal(value.result?.terminal?.pid,identity.pid);assert.equal(value.result.terminal.startTicks,identity.startTicks);assert.match(value.result.terminal.monotonicNs,/^[0-9]+$/)
     for(const key of ['user','system'])assert.ok(Number.isSafeInteger(value.result.terminal.cpu?.[key])&&value.result.terminal.cpu[key]>=0)
     closeResult=value.result;child.send({type:PG_SESSION_PROTOCOL,kind:'ack',nonce,seq:value.seq,op:'close',pid:identity.pid,startTicks:identity.startTicks},error=>{
      try{if(error)throw error;successRemaining({endAt:current.endAt,work:false});assert.equal(pending,current,'observer terminal ACK lost RPC');closeAck=true;clearTimeout(current.timer);pending=null;receipt.lastOperation=value.op;current.resolve(value.result)}catch(error){fault(error)}
     });return
    }
    clearTimeout(current.timer);pending=null;receipt.lastOperation=value.op;current.resolve(value.result)
   }catch(error){fault(error)}
  })
  let outputBytes=0
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{try{outputBytes+=bytes.length;assert.ok(outputBytes<=65536,'observer unexpected output cap');raw({stage:'OBSERVER_PROCESS_OUTPUT',stream:stream===child.stdout?'stdout':'stderr',text:bytes.toString('utf8')})}catch(error){fault(error)}})
  lifetimeTimer=setTimeout(()=>fault(new Error('observer aggregate work deadline')),Math.max(1,Math.floor(workRemaining())))
  if(abortSignal){if(abortSignal.aborted)aborted();else abortSignal.addEventListener('abort',aborted,{once:true})}
  await awaitBoot();check()
  const guarded=fn=>async(...args)=>{try{check();assert.ok(!pending&&!closing,'single outstanding observer semantic command required');const originalWindowEnd=windowDeadline,result=await fn(...args);check();successRemaining({windowEndAt:originalWindowEnd,work:true});return result}catch(error){throw fault(error)}}
  return Object.freeze({
   identity,
   connect:guarded(async options=>{assert.ok(!connected);keys(options,['ownerUrl','port','expectedSystemIdentifier','primaryDatabase']);const result=await rpc('connect',{...options,identity,registry:registry.entries()},4000);connected=true;return result}),
   begin:guarded(async({maxWindowMs=90000}={})=>{assert.ok(connected&&['none','settled'].includes(windowPhase),'previous observer window not settled');assert.ok(Number.isSafeInteger(maxWindowMs)&&maxWindowMs>1100&&maxWindowMs<=90000);windowDeadline=performance.now()+Math.min(maxWindowMs,workRemaining());windowPhase='running';const result=await rpc('begin',{maxWindowMs});receipt.windows++;return result}),
   operationEnd:guarded(async()=>{assert.equal(windowPhase,'running');const result=await rpc('operationEnd');windowPhase='settling';return result}),
   settledEnd:guarded(async()=>{assert.equal(windowPhase,'settling');const result=await rpc('settledEnd');windowPhase='settled';windowDeadline=null;return result}),
   register:guarded(async entry=>{assert.ok(connected);assert.ok(['api','report_worker','export_worker'].includes(entry.role));assert.ok(entry.role!=='api'||registry.entries().every(p=>p.role!=='api'),'one active API permitted');pin(entry,{owned:true});registry.register(entry);return rpc('register',{entry})}),
   prepareClose:guarded(async entry=>{assert.ok(['running','settling'].includes(windowPhase));return rpc('prepareClose',{pid:entry.pid,startTicks:entry.startTicks})}),
   retire:guarded(async proof=>{assert.ok(['running','settling'].includes(windowPhase));const owner=registry.entries().find(p=>p.pid===proof.pid);assert.ok(owner&&id(owner)===id(proof));try{const live=proc(owner.pid);assert.equal(live.startTicks,owner.startTicks,'retirement PID reused');assert.ok(['Z','X','x'].includes(live.state),'retired worker is still live')}catch(error){if(!missing(error))throw error}
    assert.ok(membersOf(owner.processGroupId).every(p=>['Z','X','x'].includes(p.state)),'retired worker group is live')
    const result=await rpc('retire',{proof});registry.retire(proof);return result}),
   async close(){
    if(!finished&&!closing&&!failure)try{
     assert.ok(['none','settled'].includes(windowPhase),'cannot qualify unfinished observer window')
     const closeBudget=Math.min(1500,remaining());assert.ok(closeBudget>500,'observer close needs reserved reap budget')
     hardTimer=setTimeout(()=>{fault(new Error('observer close/reap deadline'));signal('SIGKILL')},closeBudget)
     await rpc('close',{},Math.max(1,Math.floor(closeBudget-500)))
    }catch(error){fault(error)}
    if(failure&&!finished){signal('SIGTERM')}
    const result=await done;if(failure)throw failure;successRemaining({work:false});return result
   },
   assertHealthy(){try{check();workRemaining()}catch(error){throw fault(error)}},
  })
 }catch(error){fault(error);if(!child?.pid)finish();await done;throw failure??error}
}
