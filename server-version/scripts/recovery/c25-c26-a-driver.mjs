/** Fixed C26 A wiring. Importing is inert; an explicitly authorized outer
 * launcher owns the lock, both DB baselines, recovery point and 1200s watchdog.
 * This process owns API/observer/task children. No automatic B, retry or warmup. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomBytes} from 'node:crypto'
import {parseProcStat} from './c25-c26-observer.mjs'
import {createOwnedPidRegistry} from './c25-c26-pg-observer.mjs'
import {startPgObserverSession} from './c25-c26-pg-session.mjs'
import {startObservedApi} from './c25-c26-api.mjs'
import {runObservedWorker} from './c25-c26-worker-runner.mjs'
import {createRawHarness} from './c25-c26-raw-harness.mjs'
import {createC26Workload} from './c25-c26-workload.mjs'
import {C26_LIMITS,READ_CATEGORIES,assertResources,assertWorkloadCounts} from './c25-c26-contract.mjs'

const proc=pid=>parseProcStat(fs.readFileSync(`/proc/${pid}/stat`,'utf8'))
const defaultRuntime=async()=>{const api=await import('./c20-materials-client.mjs');const {loadStoredCanonicalUnitResult}=api.require(path.join(api.backend,'dist/modules/assessment-runtime/compact-assessment-storage.js'));return {...api,loadStoredCanonicalUnitResult}}
const defaultWait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const ownSample=()=>({monotonicNs:process.hrtime.bigint().toString(),cpu:process.cpuUsage(),memory:process.memoryUsage()})
export function probeDelta(before,after){
 assert.equal(before.pid,after.pid);assert.equal(before.startTicks,after.startTicks);assert.equal(before.sql.scope,after.sql.scope)
 const delta=(a,b)=>{assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&b>=a,'monotonic counter');return b-a}
 return {sql:{scope:before.sql.scope,events:delta(before.sql.events,after.sql.events),durationMs:delta(before.sql.durationMs,after.sql.durationMs)},cpuMicros:{user:delta(before.cpuUsageMicros.user,after.cpuUsageMicros.user),system:delta(before.cpuUsageMicros.system,after.cpuUsageMicros.system)},memoryBefore:before.memoryUsageBytes,memoryAfter:after.memoryUsageBytes,instrumentationBefore:before.instrumentation,instrumentationAfter:after.instrumentation,scope:'API_PROCESS_WIDE_NONOVERLAPPING_WINDOW; NOT_PER_MEMBER_FOR_TWO_READ_WAVE'}
}
export function assertMeasuredReadSchedule(windows){
 const reads=windows.filter(x=>['serial','wave'].includes(x.operation.phase))
 assert.equal(reads.length,30)
 for(const [i,category] of READ_CATEGORIES.entries()){
  const group=reads.slice(i*5,i*5+5)
  assert.deepEqual(group.map(x=>[x.operation.phase,x.operation.category,x.operation.requests]),[...Array.from({length:4},()=>['serial',category,1]),['wave',category,2]])
  assert.deepEqual(group.slice(0,4).map(x=>x.operation.sample),[0,1,2,3]);assert.equal(group[4].operation.concurrency,2)
 }
 return {serialRequests:24,waves:6,concurrentRequests:12}
}

export function measuredWorkerHooks(session,remaining){
 return {register:identity=>session.register(identity),loaded:async()=>{session.assertHealthy();remaining()},prepareClose:identity=>session.prepareClose(identity),retire:proof=>session.retire(proof)}
}

export async function runC26MeasuredA({directory,node,env,baseIdentities,connectionOptions,remainingMs,read,write,record,readResources,ownedRegistryChanged,loadIndependentScope},dependencies={}){
 const {startSession=startPgObserverSession,startApi=startObservedApi,runWorker=runObservedWorker,makeWorkload=createC26Workload,loadRuntime=defaultRuntime,wait=defaultWait,clock=()=>performance.now(),readIdentity=proc,fetchImpl=fetch}=dependencies
 for(const fn of [remainingMs,read,write,record,readResources,ownedRegistryChanged,loadIndependentScope])assert.equal(typeof fn,'function')
 assert.equal(fs.realpathSync(directory),directory);assert.equal(fs.statSync(directory).mode&0o777,0o700)
 assert.ok(!env.NODE_OPTIONS&&!env.C26_RUNTIME_PROBE_ENABLE);assert.equal(env.NODE_ENV,'test');assert.equal(env.BACKGROUND_WORKERS_ENABLED,'false')
 const initial=remainingMs();assert.ok(initial>60000&&initial<=C26_LIMITS.totalMs)
 const end=clock()+initial,abort=new AbortController(),windows=[],children=[],checks=[],scope={schemaVersion:1,phase:'A',passed:false,windows,children,checks,automaticB:false,automaticRetries:0,apiExitCpu:'NOT_OBSERVED_AFTER_FINAL_PROBE',gaps:'SETUP_AND_VALIDATION_GAPS_HAVE_DRIVER_PROCESS_BOUNDARIES; NO_PER_OPERATION_PG_ATTRIBUTION_OUTSIDE_WINDOWS'}
 let failure=null,session,api,runtime,h,active=null,setup=false,watchdog,resourcesTimer,cleaning=false
 const remain=()=>{const left=Math.min(remainingMs(),end-clock());assert.ok(left>0,'A driver shared deadline');if(failure&&!cleaning)throw failure;return left}
 const stop=error=>{failure??=error instanceof Error?error:new Error(String(error));if(!abort.signal.aborted)abort.abort(failure);return failure}
 const safeRecord=value=>{try{const output=record(value);assert.ok(!output?.then,'journal must be synchronous');remain()}catch(error){throw stop(error)}}
 const registry=createOwnedPidRegistry(baseIdentities),applicationName=`c26:driver:${randomBytes(8).toString('hex')}`
 assert.ok(baseIdentities.every(p=>!['driver','observer','api','report_worker','export_worker'].includes(p.role)))
 assert.equal(baseIdentities.filter(p=>p.role==='pg_postmaster').length,1);assert.equal(baseIdentities.filter(p=>p.role==='redis').length,1)
 const driverIdentity={...readIdentity(process.pid),role:'driver',applicationName};registry.register(driverIdentity)
 const originalRegister=registry.register,originalRetire=registry.retire
 const publishedRegistry={...registry,register(entry){const result=originalRegister(entry);ownedRegistryChanged(registry.entries());remain();return result},retire(proof){originalRetire(proof);ownedRegistryChanged(registry.entries());remain()}}
 ownedRegistryChanged(registry.entries());remain()
 const database=new URL(env.DATABASE_URL);assert.equal(database.hostname,'127.0.0.1');assert.equal(database.username,'eduk12_runtime');assert.equal(database.pathname,'/eduk12_c25_joint_restore');database.searchParams.set('application_name',applicationName)
 // This dedicated driver has not imported a product consumer yet. The outer
 // launcher sets all remaining frozen runtime variables before starting it.
 process.env.DATABASE_URL=database.toString();process.env.DATABASE_URL_RUNTIME=database.toString()
 const childEnv={...env,DATABASE_URL:database.toString(),DATABASE_URL_RUNTIME:database.toString()}
 const createDir=name=>{assert.match(name,/^[a-z0-9-]+$/);const dir=path.join(directory,name);fs.mkdirSync(dir,{mode:0o700});return dir}
 const budget=()=>Math.max(1,Math.floor(Math.min(90000,remain())))
 const bounded=async(run,maxMs)=>{
  remain();const limit=Math.min(maxMs,remain()),until=clock()+limit;let timer
  try{const result=await Promise.race([Promise.resolve().then(run),new Promise((_,reject)=>timer=setTimeout(()=>reject(stop(new Error('A operation aggregate deadline'))),limit))]);assert.ok(clock()<until,'A operation returned after deadline');remain();return result}finally{clearTimeout(timer)}
 }
 const resources=()=>{try{const value=readResources(api?.identity);assertResources(value);scope.minimumResources??={...value};for(const [key,n]of Object.entries(value))scope.minimumResources[key]=Math.min(scope.minimumResources[key]??n,n);scope.lastResources=value;if(value.apiRssBytes!==undefined)scope.maxSampledApiRssBytes=Math.max(scope.maxSampledApiRssBytes??0,value.apiRssBytes);remain();if(!cleaning){api?.assertHealthy();session?.assertHealthy()}}catch(error){stop(error)}}
 const snapshot=async()=>({driver:ownSample(),api:api?await api.snapshot():null})
 async function measure(operation,perform){
  if(setup){assert.equal(operation.phase,'setup','only setup HTTP may share setup window');safeRecord({stage:'SETUP_HTTP_WITHIN_WINDOW',operation});return perform()}
  assert.equal(active,null,'measurement windows cannot overlap');remain();assert.ok(windows.length<100,'fixed measurement cap')
  active=operation;const operationEnd=clock()+Math.min(90000,remain());const entry={sequence:windows.length+1,operation:structuredClone(operation),passed:false,issuedMonotonicNs:process.hrtime.bigint().toString()};windows.push(entry)
  try{
   return await bounded(async()=>{
    entry.pgBefore=await session.begin({maxWindowMs:budget()});entry.before=await snapshot()
    const started=clock();entry.operationStartedMonotonicNs=process.hrtime.bigint().toString()
    const value=await perform();entry.operationElapsedMs=clock()-started;entry.operationEndedMonotonicNs=process.hrtime.bigint().toString()
    entry.after=await snapshot();entry.pgOperationEnd=await session.operationEnd();await wait(C26_LIMITS.pgSettleMs);entry.pgSettled=await session.settledEnd()
    if(entry.before.api&&entry.after.api)entry.apiDelta=probeDelta(entry.before.api,entry.after.api)
    entry.passed=true;return value
   },90000)
  }catch(error){entry.error={name:error.name,stack:String(error.stack??error)};throw stop(error)}
  finally{
   entry.finishedMonotonicNs=process.hrtime.bigint().toString();active=null
   try{write('c25-c26-windows-private.json',{schemaVersion:1,windows});if(entry.passed){remain();assert.ok(clock()<operationEnd,'A window evidence write exceeded original deadline')}}
   catch(error){entry.passed=false;entry.error={name:error.name,stack:String(error.stack??error)};stop(error);try{write('c25-c26-windows-private.json',{schemaVersion:1,windows})}catch{};throw error}
  }
 }
 const worker=kind=>async input=>measure({id:`${kind}-task-once`,phase:'cold-worker',kind,requests:0},async()=>{
  const result=await runWorker({directory:createDir(`${kind}-worker`),kind,input,node,env:childEnv,remainingMs:remain,record:safeRecord,onFault:stop,abortSignal:abort.signal,hooks:measuredWorkerHooks(session,remain)})
  assert.equal(result.passed,true);children.push(result);return result
 })
 try{
  resources();if(failure)throw failure
  watchdog=setTimeout(()=>stop(new Error('A driver outer work deadline')),Math.max(1,initial-10000));resourcesTimer=setInterval(resources,100)
  session=await startSession({directory:createDir('pg-observer'),node,env:childEnv,registry:publishedRegistry,remainingMs:remain,record:safeRecord,onFault:stop,abortSignal:abort.signal})
  scope.observerConnection=await session.connect(connectionOptions)
  await measure({id:'api-startup',phase:'setup-services',requests:0},async()=>{api=await startApi({directory:createDir('api'),node,env:childEnv,remainingMs:remain,record:safeRecord,onFault:stop,abortSignal:abort.signal,register:identity=>session.register(identity)});return api.identity})
  await measure({id:'idle-baseline',phase:'idle',requests:0},()=>wait(C26_LIMITS.idleMs))
  let independent
  await measure({id:'driver-setup',phase:'setup',requests:null},async()=>{
   runtime=await loadRuntime()
   h=createRawHarness({state:directory,apiUrl:`http://127.0.0.1:${env.PORT}`,remaining:remain,read,write,check:label=>checks.push(label),record:safeRecord,onFault:stop,normalize:runtime.normalizeProduct,fetchImpl})
   independent=await loadIndependentScope(h,runtime)
  })
  const workload=makeWorkload(h,{measure,reportChild:worker('report'),exportChild:worker('export'),independentReadScope:independent})
  await measure({id:'fixture-setup',phase:'setup',requests:null},async()=>{setup=true;try{return await workload.prepare()}finally{setup=false}})
  const phases=['startAndSaveCheckpoint','readCheckpoint','submitFour','drainOriginalReport','createOriginalExport','readRemaining','finish']
  for(const phase of phases){const at=ownSample();safeRecord({stage:'DRIVER_PHASE_BEGIN',phase,at});const value=await workload[phase]();remain();safeRecord({stage:'DRIVER_PHASE_END',phase,at:ownSample()});if(phase==='finish')scope.workload=value}
  h.assertQuiescent();assertWorkloadCounts(scope.workload.counts);scope.readSchedule=assertMeasuredReadSchedule(windows)
  scope.tail=[]
  await measure({id:'tail-no-work',phase:'tail',requests:0},async()=>{for(const seconds of [30,60]){await wait(30000);scope.tail.push({seconds,at:await snapshot()})}})
  assert.equal(children.length,2);assert.deepEqual(children.map(c=>c.kind),['report','export']);assert.ok(windows.every(w=>w.passed))
  scope.driverEndBeforeCleanup=ownSample();remain()
 }catch(error){stop(error);scope.error={name:error.name,stack:String(error.stack??error)}}
 finally{
  cleaning=true;clearInterval(resourcesTimer);clearTimeout(watchdog);scope.cleanup=[]
  // Normal observation ends while registered API/driver sockets are still live.
  // Failure prioritizes stopping writers; neither path imputes exit-tail CPU.
  const clean=async(name,fn)=>{try{const task=Promise.resolve().then(fn);task.catch(()=>{});const result=await bounded(()=>task,8000);scope.cleanup.push({name,passed:true,result})}catch(error){failure??=error;scope.cleanup.push({name,passed:false,error:{name:error.name,stack:String(error.stack??error)}})}}
  if(failure&&api)await clean('api-stop-first-after-failure',()=>api.stop())
  if(session)await clean('observer-close',()=>session.close())
  if(!failure&&api)await clean('api-stop',()=>api.stop())
  else if(api&&!scope.cleanup.some(x=>x.name.startsWith('api-stop')))await clean('api-stop-after-observer-failure',()=>api.stop())
  if(runtime){await clean('driver-queues',()=>runtime.closeQueues());await clean('driver-prisma',()=>runtime.prisma.$disconnect())}
  scope.driverAfterCleanup=ownSample();resources();if(!failure){try{remain();assert.ok(scope.cleanup.every(x=>x.passed));scope.passed=true}catch(error){failure=error}}
  if(failure){scope.passed=false;scope.error??={name:failure.name,stack:String(failure.stack??failure)}}
  scope.http=h?.result.requests??[]
  try{write('c25-c26-a-driver-result-private.json',scope);if(scope.passed)remain()}catch(error){failure??=error;scope.passed=false;scope.error??={name:error.name,stack:String(error.stack??error)};try{write('c25-c26-a-driver-result-private.json',scope)}catch{}}
 }
 if(failure)throw failure
 return scope
}
