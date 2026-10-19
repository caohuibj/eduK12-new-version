/** One owned original report/export task, its real probe and bounded close.
 * Caller supplies the existing PG window hooks; no services start on import. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {randomBytes} from 'node:crypto'
import {spawn} from 'node:child_process'
import {observeResourceChild,parseProcStat} from './c25-c26-observer.mjs'
import {createProbeChannel} from './c25-c26-probe-channel.mjs'
import {workerPrivateDirectory,workerRead,workerWrite,workerSha} from './c25-c26-worker-runtime.mjs'
const file=name=>fileURLToPath(new URL(name,import.meta.url)),require=createRequire(import.meta.url)
const {PINNED}=require('./c25-c26-runtime-probe.cjs')
export async function runObservedWorker({directory,kind,input,node,env,remainingMs,record,onFault,hooks,abortSignal},{spawnChild=spawn,observeChild=observeResourceChild,readStartupIdentity=pid=>parseProcStat(fs.readFileSync(`/proc/${pid}/stat`,'utf8'))}={}){
 assert.ok(['report','export'].includes(kind));workerPrivateDirectory(directory)
 for(const fn of [remainingMs,record,onFault,hooks?.register,hooks?.loaded,hooks?.prepareClose,hooks?.retire])assert.equal(typeof fn,'function')
 assert.ok(!env.NODE_OPTIONS&&!env.C26_RUNTIME_PROBE_ENABLE,'worker caller may not preload/capture production modules')
 assert.equal(fs.realpathSync(node),node);assert.ok(!fs.existsSync(path.join(directory,'invocation.json')))
 const aggregate=Math.floor(Math.min(90000,remainingMs()));assert.ok(aggregate>=2000,'insufficient single worker aggregate budget')
 const killGraceMs=100,reapMs=500,deadlineMs=aggregate-killGraceMs-reapMs,deadline=performance.now()+deadlineMs
 const remaining=()=>{const left=Math.min(remainingMs(),deadline-performance.now());assert.ok(left>0,'worker remaining aggregate deadline');return left}
 const nonce=randomBytes(32).toString('hex'),role=kind+'_worker',applicationName=`c26:${kind}:${nonce.slice(0,16)}`
 const database=new URL(env.DATABASE_URL);assert.equal(database.hostname,'127.0.0.1');assert.equal(database.username,'eduk12_runtime');assert.equal(database.pathname,'/eduk12_c25_joint_restore');database.searchParams.set('application_name',applicationName)
 const invocation={schemaVersion:1,kind,nonce,parentPid:process.pid,input},invocationFile=path.join(directory,'invocation.json'),inputSha256=workerWrite(invocationFile,invocation)
 const argv=['--require',file('loopback-only.cjs'),'--require',file('c25-c26-runtime-probe.cjs'),file('c25-c26-worker-child.mjs'),invocationFile]
 const childEnv={...env,DATABASE_URL:database.toString(),PERF_ISOLATED_TEST_MODE:'1',PERF_SQL_EVENT_COUNT:'1',C26_RUNTIME_PROBE_ENABLE:'1',C26_PROBE_NONCE:nonce,C26_PROBE_ROLE:kind,C26_WORKER_DEADLINE_NS:(process.hrtime.bigint()+BigInt(Math.floor(remaining()*1e6))).toString()}
 const controller=new AbortController(),receipt={schemaVersion:1,passed:false,kind,nonce,inputSha256,aggregateBudgetMs:aggregate,stages:[],probe:[],issuedMonotonicNs:process.hrtime.bigint().toString(),cpuTail:'TERMINAL_TO_ACK_EXIT_CPU_NOT_OBSERVED; REAL_WALL_INTERVAL_RETAINED'}
 let closeResolve;const closePromise=new Promise(resolve=>closeResolve=resolve)
 let child,resources,channel,identity,failure=null,waiting=null,closed=false,resourceResult=null,resourceError=null,queue=[],lastSequence=0,logBytes=0
 const stop=error=>{failure??=error;controller.abort(failure);if(waiting){clearTimeout(waiting.timer);waiting.reject(failure);waiting=null}try{onFault(failure)}catch{}}
 const aborted=()=>stop(abortSignal.reason instanceof Error?abortSignal.reason:new Error('global worker abort'))
 const journal=value=>{record(value);receipt.stages.push(value)}
 const bounded=run=>new Promise((resolve,reject)=>{
  let timer;const abort=()=>{clearTimeout(timer);reject(controller.signal.reason??new Error('worker aborted'))}
  if(controller.signal.aborted){abort();return}
  controller.signal.addEventListener('abort',abort,{once:true})
  timer=setTimeout(()=>stop(new Error('worker callback aggregate deadline')),Math.max(1,Math.floor(remaining())))
  Promise.resolve().then(run).then(value=>{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);try{remaining();if(failure)throw failure;assert.ok(!controller.signal.aborted,'worker callback returned after abort');resolve(value)}catch(error){stop(error);reject(error)}},error=>{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);reject(error)})
 })
 const waitStage=stage=>{
  if(failure)return Promise.reject(failure)
  return new Promise((resolve,reject)=>{
   const accept=value=>{try{assert.equal(value.stage,stage,'unexpected worker lifecycle order');resolve(value)}catch(error){stop(error);reject(error)}}
   if(queue.length){accept(queue.shift());return}
   if(closed){reject(new Error('worker closed before '+stage));return}
   waiting={resolve:accept,reject,timer:setTimeout(()=>stop(new Error('worker lifecycle deadline')),Math.max(1,Math.floor(remaining())))}
  })
 }
 const permit=(value,action)=>new Promise((resolve,reject)=>child.send({type:'c26:worker',nonce,sequence:value.sequence,action},error=>{if(error){stop(error);reject(error)}else resolve()}))
 const log=fs.openSync(path.join(directory,'process-private.log'),'wx',0o600)
 try{
  child=spawnChild(node,argv,{cwd:path.resolve(file('../../backend')),env:childEnv,detached:true,stdio:['ignore','pipe','pipe','ipc']})
  receipt.argv=child.spawnargs;receipt.pid=child.pid;child.once('error',stop)
  child.once('close',(code,signal)=>{receipt.closeObservation={code,signal,observedMonotonicNs:process.hrtime.bigint().toString()};closed=true;closeResolve();if(waiting){const current=waiting;waiting=null;clearTimeout(current.timer);current.reject(new Error('worker closed before lifecycle completion'))}})
  // Attach the independent killer before callbacks or receipt writes can fail.
  resources=observeChild(child,{nonce,role,deadlineMs:Math.max(1,Math.floor(remaining())),killGraceMs,reapMs,abortSignal:controller.signal})
  resources.then(value=>resourceResult=value,error=>{resourceError=error;stop(error)}).catch(()=>{})
  identity={...parseProcStat(fs.readFileSync(`/proc/${child.pid}/stat`,'utf8')),role,applicationName}
  assert.equal(identity.parentPid,process.pid);assert.equal(identity.processGroupId,child.pid);receipt.identity=identity
  child.on('message',value=>{
   if(value?.type!=='c26:worker')return
   try{
    assert.equal(value.nonce,nonce);assert.equal(value.pid,identity.pid);assert.ok(['BOOTED','LOADED','TASK_DONE','CLEANED'].includes(value.stage));assert.equal(value.sequence,lastSequence+1);lastSequence=value.sequence
    assert.deepEqual(Object.keys(value).sort(),(['BOOTED','LOADED'].includes(value.stage)?['nonce','pid','sequence','stage','type']:['nonce','passed','pid','sequence','stage','type']).sort())
    if(!['BOOTED','LOADED'].includes(value.stage))assert.equal(typeof value.passed,'boolean')
    journal({stage:'CHILD_'+value.stage,pid:value.pid,sequence:value.sequence,passed:value.passed,observedMonotonicNs:process.hrtime.bigint().toString()})
    if(waiting){const current=waiting;waiting=null;clearTimeout(current.timer);current.resolve(value)}else{assert.ok(queue.length<4);queue.push(value)}
   }catch(error){stop(error)}
  })
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{try{logBytes+=bytes.length;assert.ok(logBytes<=1024*1024,'worker log cap');fs.writeSync(log,bytes)}catch(error){stop(error)}})
  channel=createProbeChannel(child,{nonce,role:kind,identity,bindings:PINNED,remainingMs:remaining,record:value=>{record(value);receipt.probe.push(value)},onFault:stop})
  if(abortSignal){if(abortSignal.aborted)aborted();else abortSignal.addEventListener('abort',aborted,{once:true})}
  await bounded(()=>hooks.register(identity));const booted=await waitStage('BOOTED');await permit(booted,'LOAD')
  const loaded=await waitStage('LOADED');await channel.ready();await bounded(()=>hooks.loaded(identity));receipt.initialProbe=await channel.request();await permit(loaded,'WORK')
  const done=await waitStage('TASK_DONE')
  await bounded(()=>hooks.prepareClose(identity)) // A real fresh PG+proc query, not cached owners.
  journal({stage:'FRESH_PREPARE_CLOSE_GRANTED',pid:identity.pid,monotonicNs:process.hrtime.bigint().toString()});await permit(done,'DISCONNECT')
  const cleaned=await waitStage('CLEANED');receipt.finalProbe=await channel.request('close');await permit(cleaned,'FINISH')
  resourceResult=await resources;channel.assertHealthy()
  const proof={pid:identity.pid,startTicks:identity.startTicks,closeObserved:resourceResult.lifecycle.closeObserved,terminalObserved:!!resourceResult.terminal,groupQuiescent:resourceResult.lifecycle.groupQuiescent,terminalCpu:{pid:identity.pid,startTicks:identity.startTicks,...resourceResult.terminal.cpu}}
  await bounded(()=>hooks.retire(proof))
  const result=workerRead(path.join(directory,'result-private.json'));assert.equal(result.nonce,nonce);assert.equal(result.pid,child.pid);assert.equal(result.parentPid,process.pid);assert.equal(result.inputSha256,inputSha256)
  assert.equal(done.passed,true);assert.equal(cleaned.passed,true);assert.equal(result.passed,true);assert.ok(result.cleanup.every(row=>row.closed))
  assert.deepEqual(workerRead(invocationFile),invocation);receipt.resultSha256=workerSha(fs.readFileSync(path.join(directory,'result-private.json')))
  remaining();if(failure)throw failure;assert.ok(!controller.signal.aborted,'worker aborted before final PASS');receipt.passed=true;receipt.result=result
 }catch(error){failure??=error;stop(failure)}
 finally{
  abortSignal?.removeEventListener('abort',aborted)
  if(failure)controller.abort(failure)
  if(resources){try{resourceResult=await resources}catch(error){resourceError=error;failure??=error}}
  else if(child?.pid){
   try{
    let own
    try{own=readStartupIdentity(child.pid)}
    catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;receipt.startupIdentityObservation={status:'NOT_OBSERVED',pid:child.pid,path:`/proc/${child.pid}/stat`,operation:'STARTUP_FAILURE_CLEANUP_STAT',errno:error.code,ownedKnown:true}}
    if(own){assert.equal(own.pid,child.pid);assert.equal(own.parentPid,process.pid);assert.equal(own.processGroupId,child.pid);if(!closed){try{process.kill(-child.pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error;receipt.startupSignalObservation={pid:child.pid,operation:'SIGNAL_VERIFIED_STARTUP_GROUP',errno:error.code,sent:false}}}}
   }catch(error){receipt.startupCleanupError={name:error.name,stack:String(error.stack??error)}}
   finally{
    let timer
    try{await Promise.race([closePromise,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('worker startup cleanup close deadline')),Math.max(1,Math.min(500,aggregate-(performance.now()-(deadline-deadlineMs))))))])}
    catch(error){receipt.startupCloseError={name:error.name,stack:String(error.stack??error)}}
    finally{clearTimeout(timer);receipt.startupCloseObserved=closed;if(!closed)receipt.closeObservation=null}
   }
  }
  receipt.resources=resourceResult;receipt.failedLifecycle=resourceError?.lifecycle??null
  if(failure){receipt.passed=false;receipt.error={name:failure.name,stack:String(failure.stack??failure)}}
  receipt.closedMonotonicNs=process.hrtime.bigint().toString();receipt.logBytes=logBytes;fs.fsyncSync(log);fs.closeSync(log)
  receipt.logSha256=workerSha(fs.readFileSync(path.join(directory,'process-private.log')))
  workerWrite(path.join(directory,'runner-private.json'),receipt)
 }
 if(failure){failure.workerReceipt=path.join(directory,'runner-private.json');throw failure}
 return receipt
}
