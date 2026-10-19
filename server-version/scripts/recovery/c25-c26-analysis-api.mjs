/** Bounded actual API lifecycle, pinned probe and PM2-ready demultiplexer.
 * The caller owns the overall 1200s watchdog, row protection and service lock. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {EventEmitter} from 'node:events'
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {randomBytes} from 'node:crypto'
import {parseProcStat} from './c25-c26-observer.mjs'
import {createProbeChannel} from './c25-c26-probe-channel.mjs'
import {workerPrivateDirectory,workerWrite,workerSha} from './c25-c26-worker-runtime.mjs'
const file=name=>fileURLToPath(new URL(name,import.meta.url)),require=createRequire(import.meta.url)
const {PINNED}=require('./c25-c26-runtime-probe.cjs')
const {analysisArtifactEnvironment}=require('./c25-c26-analysis-artifacts.cjs')
export async function startObservedAnalysisApi({arm,directory,node,env,remainingMs,record,onFault,register,abortSignal},{spawnChild=spawn,readIdentity=pid=>parseProcStat(fs.readFileSync(`/proc/${pid}/stat`,'utf8'))}={}){
 const artifact=analysisArtifactEnvironment(arm,env);env=artifact.env;assert.deepEqual(artifact.selected.probeBindings,PINNED)
 workerPrivateDirectory(directory);for(const fn of [remainingMs,record,onFault,register])assert.equal(typeof fn,'function')
 assert.ok(!env.NODE_OPTIONS&&!env.C26_RUNTIME_PROBE_ENABLE);assert.equal(fs.realpathSync(node),node)
 for(const key of ['BACKGROUND_WORKERS_ENABLED','HEAVY_PROCESSING_ENABLED','VIDEO_PROCESSING_ENABLED'])assert.equal(env[key],'false');assert.equal(env.NODE_ENV,'test')
 const initial=remainingMs();assert.ok(initial>=5000&&initial<=1200000);const aggregateEnd=performance.now()+initial,startEnd=performance.now()+Math.min(30000,initial-1000)
 const remaining=()=>{const value=Math.min(remainingMs(),aggregateEnd-performance.now());assert.ok(value>0,'API aggregate deadline');return value}
 const startRemaining=()=>{const value=Math.min(remaining(),startEnd-performance.now());assert.ok(value>0,'API startup deadline');return value}
 const nonce=randomBytes(32).toString('hex'),applicationName=`c26:api:${nonce.slice(0,16)}`,database=new URL(env.DATABASE_URL)
 assert.equal(database.hostname,'127.0.0.1');assert.equal(database.username,'eduk12_runtime');assert.equal(database.pathname,'/eduk12_c25_joint_restore');database.searchParams.set('application_name',applicationName)
 const childEnv={...env,DATABASE_URL:database.toString(),PERF_ISOLATED_TEST_MODE:'1',PERF_SQL_EVENT_COUNT:'1',C26_RUNTIME_PROBE_ENABLE:'1',C26_PROBE_ROLE:'api',C26_PROBE_NONCE:nonce,C26_API_PARENT_PID:String(process.pid),C26_API_START_DEADLINE_NS:(process.hrtime.bigint()+BigInt(Math.floor(startRemaining()*1e6))).toString()}
 const argv=['--require',file('loopback-only.cjs'),'--require',file('c25-c26-analysis-probe.cjs'),file('c25-c26-analysis-api-child.mjs')]
 const logPath=path.join(directory,'api-process-private.log'),log=fs.openSync(logPath,'wx',0o600)
 const receipt={schemaVersion:1,artifact:artifact.selected.inputIdentity,arm,dist:artifact.selected.dist,dependencyRoot:artifact.selected.nodePath,passed:false,nonce,applicationName,argv:null,pid:null,startedMonotonicNs:process.hrtime.bigint().toString(),initialAggregateMs:initial,closedMonotonicNs:null,probe:[],signals:[],scope:'REAL_API_PROCESS; FINAL_PROBE_TO_EXIT_CPU_UNOBSERVED'}
 let child,identity,channel,bus,closeResolve,closed=false,exit=null,ready=false,booted=false,loadGranted=false,failure=null,waitReject=null,killTimer,lifetimeTimer,stopPromise,logBytes=0,bootResolve,readyResolve
 const bootPromise=new Promise(resolve=>bootResolve=resolve),readyPromise=new Promise(resolve=>readyResolve=resolve),closePromise=new Promise(resolve=>closeResolve=resolve)
 const signal=name=>{if(!child?.pid)return;try{if(identity)process.kill(-identity.processGroupId,name);else child.kill(name);receipt.signals.push({name,sent:true})}catch(error){receipt.signals.push({name,sent:false});if(error.code!=='ESRCH')failure??=error}}
 const fault=error=>{if(failure)return;failure=error;waitReject?.(error);try{onFault(error)}catch{};signal('SIGTERM');killTimer??=setTimeout(()=>signal('SIGKILL'),500)}
 const aborted=()=>fault(abortSignal.reason instanceof Error?abortSignal.reason:new Error('API coordinator aborted'))
 const bounded=async(run,budget)=>{
  if(failure)throw failure;let timer,rejectFailure
  const pending=new Promise((_,reject)=>{rejectFailure=reject;waitReject=reject;timer=setTimeout(()=>{const error=new Error('API lifecycle deadline');fault(error);reject(error)},Math.max(1,Math.floor(budget())))})
  try{const result=await Promise.race([Promise.resolve().then(run),pending]);budget();if(failure)throw failure;return result}finally{clearTimeout(timer);if(waitReject===rejectFailure)waitReject=null}
 }
 const members=()=>{
  const rows=[];for(const entry of fs.readdirSync('/proc'))if(/^[1-9][0-9]*$/.test(entry)){try{const row=parseProcStat(fs.readFileSync(`/proc/${entry}/stat`,'utf8'));if(row.processGroupId===identity.processGroupId)rows.push(row)}catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error}}
  return rows
 }
 async function stop(){
  if(stopPromise)return stopPromise
  stopPromise=(async()=>{
   clearTimeout(lifetimeTimer);let finalProbe
   try{
    if(!failure&&channel){receipt.finalProbeIssuedNs=process.hrtime.bigint().toString();finalProbe=await bounded(()=>channel.request('close'),()=>Math.min(2000,remaining()));receipt.finalProbeReceivedNs=process.hrtime.bigint().toString();receipt.finalProbe=finalProbe}
   }catch(error){fault(error)}
   // Cleanup has its own finite 3s allowance inside the caller's reserved tail.
   // Its execution cannot upgrade an already failed/expired observation.
   signal('SIGTERM');let callerCleanupLeft=0
   try{callerCleanupLeft=remainingMs();assert.ok(Number.isFinite(callerCleanupLeft))}catch(error){failure??=error}
   const cleanupLeft=Math.max(0,Math.min(3000,aggregateEnd-performance.now(),callerCleanupLeft)),cleanupEnd=performance.now()+cleanupLeft
   if(cleanupLeft<=500)signal('SIGKILL');else killTimer??=setTimeout(()=>signal('SIGKILL'),500)
   try{
    await Promise.race([closePromise,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('API close not observed')),Math.max(1,cleanupEnd-performance.now()));closePromise.finally(()=>clearTimeout(t))})])
    assert.equal(exit.code,0);assert.equal(exit.signal,null);channel?.assertHealthy()
   }catch(error){failure??=error;signal('SIGKILL')}
   clearTimeout(killTimer)
   if(identity){
    try{
     receipt.groupMembersAtClose=members();if(receipt.groupMembersAtClose.some(x=>!['Z','X','x'].includes(x.state))){failure??=new Error('API left live owned descendants');signal('SIGKILL')}
     while(true){receipt.finalGroupMembers=members();receipt.groupQuiescent=receipt.finalGroupMembers.every(x=>['Z','X','x'].includes(x.state));if(receipt.groupQuiescent||performance.now()>=cleanupEnd)break;await new Promise(resolve=>setTimeout(resolve,20))}
     assert.equal(receipt.groupQuiescent,true)
    }catch(error){failure??=error;signal('SIGKILL')}
   }
   receipt.exit=exit;receipt.closeObserved=closed;receipt.cleanupFinishedMonotonicNs=process.hrtime.bigint().toString()
   receipt.exitTailWallObservation=receipt.finalProbeReceivedNs&&receipt.closedMonotonicNs?'OBSERVED_BOUNDARY':'NOT_OBSERVED';receipt.finalProbeToCloseWallLowerNs=null;receipt.finalProbeToCloseWallUpperNs=null
   if(receipt.finalProbeReceivedNs&&receipt.closedMonotonicNs){receipt.finalProbeToCloseWallLowerNs=(BigInt(receipt.closedMonotonicNs)-BigInt(receipt.finalProbeReceivedNs)).toString();receipt.finalProbeToCloseWallUpperNs=(BigInt(receipt.closedMonotonicNs)-BigInt(receipt.finalProbeIssuedNs)).toString()}
   try{remaining()}catch(error){failure??=error}
   receipt.passed=!failure&&ready&&closed&&receipt.groupQuiescent
   if(failure)receipt.error={name:failure.name,stack:String(failure.stack??failure)}
   receipt.logBytes=logBytes;fs.fsyncSync(log);fs.closeSync(log);receipt.logSha256=workerSha(fs.readFileSync(logPath));workerWrite(path.join(directory,'api-lifecycle-private.json'),receipt)
   abortSignal?.removeEventListener('abort',aborted)
   if(failure)throw failure
   return receipt
  })();stopPromise.catch(()=>{});return stopPromise
 }
 try{
  child=spawnChild(node,argv,{cwd:path.resolve(file('../../backend')),env:childEnv,detached:true,stdio:['ignore','pipe','pipe','ipc']});receipt.argv=child.spawnargs;receipt.pid=child.pid
  child.once('close',(code,signal)=>{receipt.closedMonotonicNs=process.hrtime.bigint().toString();closed=true;exit={code,signal};bus?.emit('close',code,signal);closeResolve(exit);if(!stopPromise)fault(new Error('API closed before requested cleanup'))})
  child.once('error',fault)
  const candidate={...readIdentity(child.pid),role:'api',applicationName};assert.equal(candidate.parentPid,process.pid);assert.equal(candidate.processGroupId,child.pid);identity=Object.freeze(candidate);receipt.identity=identity
  bus=new EventEmitter();bus.pid=child.pid;bus.send=(...args)=>child.send(...args)
  child.on('message',value=>{
   try{
    if(value==='ready'){assert.ok(booted&&loadGranted&&!ready,'unexpected/duplicate actual PM2 ready');ready=true;record({stage:'API_PM2_READY',pid:child.pid});readyResolve();return}
    if(value?.type==='c26:api-booted'){assert.ok(!booted);assert.deepEqual(value,{type:'c26:api-booted',nonce,pid:identity.pid,startTicks:identity.startTicks});booted=true;record({stage:'API_BOOTED',pid:child.pid});bootResolve();return}
    assert.ok(value&&['c26-runtime-probe-ready','c26-runtime-probe-result','c26-runtime-probe-fault'].includes(value.type),'unknown API IPC namespace/type')
    bus.emit('message',value)
   }catch(error){fault(error)}
  })
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{try{logBytes+=bytes.length;assert.ok(logBytes<=1024*1024,'API log cap');fs.writeSync(log,bytes)}catch(error){fault(error)}})
  child.on('error',error=>bus.emit('error',error));child.once('disconnect',()=>bus.emit('disconnect'))
  channel=createProbeChannel(bus,{nonce,role:'api',identity,bindings:PINNED,remainingMs:remaining,record:value=>{record(value);receipt.probe.push(value)},onFault:fault})
  lifetimeTimer=setTimeout(()=>fault(new Error('API lifetime exceeded aggregate')),Math.max(1,Math.floor(remaining()-3000)))
  if(abortSignal){if(abortSignal.aborted)aborted();else abortSignal.addEventListener('abort',aborted,{once:true})}
  await bounded(()=>register(identity),startRemaining);await bounded(()=>bootPromise,startRemaining)
  loadGranted=true;await bounded(()=>new Promise((resolve,reject)=>child.send({type:'c26:api-permission',nonce,action:'LOAD',parentPid:process.pid},error=>error?reject(error):resolve())),startRemaining)
  await bounded(()=>Promise.all([readyPromise,channel.ready()]),startRemaining);receipt.initialProbe=await bounded(()=>channel.request(),startRemaining)
  return Object.freeze({identity,snapshot:async()=>{remaining();if(failure)throw failure;return channel.request()},stop,assertHealthy(){remaining();if(failure)throw failure;return channel.assertHealthy()}})
 }catch(error){fault(error);try{await stop()}catch{};throw error}
}
