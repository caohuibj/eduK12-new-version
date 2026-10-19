/** New coordinator contracts: real raw DTO transport with synthetic replies,
 * and separately real Node API/worker/observer IPC wiring. No service or DB. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawn,spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {runC26MeasuredA,measuredWorkerHooks,probeDelta,assertMeasuredReadSchedule,installPrismaBusinessGate} from './c25-c26-a-driver.mjs'
import {driverDeadlineContract} from './c25-c26-a-entry.mjs'
import {createRawHarness} from './c25-c26-raw-harness.mjs'
import {COLD_COUNTS,READ_CATEGORIES} from './c25-c26-contract.mjs'
import {startPgObserverSession} from './c25-c26-pg-session.mjs'
import {startObservedApi} from './c25-c26-api.mjs'
import {runObservedWorker} from './c25-c26-worker-runner.mjs'
import {createOwnedPidRegistry} from './c25-c26-pg-observer.mjs'
import {parseProcStat} from './c25-c26-observer.mjs'
const file=name=>fileURLToPath(new URL(name,import.meta.url)),node=fs.realpathSync(process.execPath),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const directory=prefix=>{const root=process.env.C26_PREPARE_EVIDENCE_ROOT;assert.ok(root);const value=fs.mkdtempSync(path.join(root,prefix));fs.chmodSync(value,0o700);return value}
const save=(name,value)=>fs.writeFileSync(name,JSON.stringify(value)+'\n',{mode:0o600})
const modes={PATH:process.env.PATH,NODE_ENV:'test',BACKGROUND_WORKERS_ENABLED:'false',ASSESSMENT_REPORT_ASYNC_ENABLED:'true',HEAVY_PROCESSING_ENABLED:'false',VIDEO_PROCESSING_ENABLED:'false',DATABASE_URL:'postgresql://eduk12_runtime:synthetic@127.0.0.1:54399/eduk12_c25_joint_restore',PORT:'54398'}
const counts=()=>({phase:'A',cold:{...COLD_COUNTS},serialRequests:24,concurrentWaves:6,concurrentRequests:12,maxConcurrency:2,extraFinals:0,automaticRetries:0})
const sample=n=>({pid:9100003,startTicks:'300',sql:{scope:'SYNTHETIC_PROCESS_CALLBACKS',events:n,durationMs:n/2},cpuUsageMicros:{user:n,system:n},memoryUsageBytes:{rss:1000},instrumentation:{mirrorCalls:n}})
async function fakeRun(mode){
 const dir=directory('a-coordinator-'),events=[],outputs={},requests=[];let t=0,number=0,workerId=9100004,session,api,expired=false,failedWrite=false,resourceFault=false,middleware,writePromise=null
 const identity=(pid,role)=>({pid,startTicks:String(pid),processGroupId:pid,parentPid:process.pid,role,applicationName:`c26:${role}:fake`})
 const options={directory:dir,node,env:modes,baseIdentities:[identity(9100000,'pg_postmaster'),identity(9100001,'redis')],connectionOptions:{},remainingMs:()=>expired?0:1000000-t,workRemainingMs:()=>expired?0:940000-t,
  read:()=>({}),write:(name,value)=>{outputs[name]=structuredClone(value);save(path.join(dir,name),value);if(mode==='late-result'&&name==='c25-c26-a-driver-result-private.json'&&value.passed)expired=true;if(mode==='window-write'&&name==='c25-c26-windows-private.json'&&!failedWrite){failedWrite=true;throw Error('SYNTHETIC_WINDOW_WRITE_FAILURE')}},
  record:value=>events.push(value),readResources:()=>({diskBytes:resourceFault?0:9*1024**3,memoryBytes:3*1024**3,tmpBytes:1024**3}),ownedRegistryChanged:entries=>events.push({stage:'registry',roles:entries.map(x=>x.role)}),
  loadIndependentScope:async h=>{const teacher=h.client();assert.deepEqual(await teacher.login({username:'teacher',password:'synthetic'},'TEACHER'),{user:{id:'teacher',role:'TEACHER'}});return {teacher}}}
 const deps={clock:()=>t,wait:async ms=>{t+=ms},loadRuntime:async()=>({normalizeProduct:x=>x,closeQueues:async()=>events.push({stage:'queues-closed'}),prisma:{$use:fn=>{assert.equal(middleware,undefined);middleware=fn},$disconnect:async()=>{if(writePromise)await writePromise;await Promise.resolve();events.push({stage:'prisma-closed'})}}}),
  fetchImpl:async(url,init)=>{requests.push({url,method:init.method});if(mode==='uncertain-final'&&url.endsWith('/final-scale'))throw Error('SYNTHETIC_UNCERTAIN_WRITE');return new Response(JSON.stringify({code:0,data:{user:{id:'teacher',role:'TEACHER'}}}),{status:200,headers:{'content-type':'application/json'}})},
  startSession:async input=>{input.registry.register(identity(9100002,'observer'));session={identity:identity(9100002,'observer'),connect:async()=>({}),begin:async()=>{events.push({stage:'begin'});return {}},operationEnd:async()=>({}),settledEnd:async()=>({}),register:async owner=>{input.registry.register(owner);events.push({stage:'registered',pid:owner.pid})},prepareClose:async owner=>{events.push({stage:'prepared',pid:owner.pid})},retire:async proof=>{input.registry.retire(proof);events.push({stage:'retired',pid:proof.pid})},assertHealthy:()=>{},close:async()=>{events.push({stage:'observer-closed'});return {passed:true}}};return session},
  startApi:async input=>{const own=identity(9100003,'api');await input.register(own);api={identity:own,snapshot:async()=>sample(++number),assertHealthy:()=>{},stop:async()=>{events.push({stage:'api-stopped'});return {passed:true}}};return api},
  runWorker:async input=>{const own=identity(workerId++,input.kind+'_worker');await input.hooks.register(own);await input.hooks.loaded(own);await input.hooks.prepareClose(own);await input.hooks.retire({...own,closeObserved:true,terminalObserved:true,groupQuiescent:true});return {passed:true,kind:input.kind}},
  makeWorkload:(h,{measure,reportChild,exportChild})=>{
   const client=h.client(),request=(route,method='GET')=>client.request(route,method),readCategory=async category=>{
    for(let n=0;n<4;n++)await measure({id:`serial-${category}-${n}`,phase:'serial',category,sample:n,requests:1},()=>request('/read-'+category))
    await measure({id:'wave-'+category,phase:'wave',category,requests:2,concurrency:2},()=>Promise.all([request('/read-'+category),request('/read-'+category)]))
   }
   return {prepare:()=>measure({phase:'setup'},async()=>{if(mode==='pending-prisma'){await middleware({model:'Course',action:'create'},async()=>{events.push({stage:'first-create-issued'});resourceFault=true;writePromise=delay(220);await writePromise;return {id:'inflight-outcome'}});await middleware({model:'CourseStudent',action:'create'},async()=>events.push({stage:'second-create-issued'}));h.write('c25-c26-unapproved-write.json',{});return}return request('/fixture','POST')}),startAndSaveCheckpoint:()=>measure({id:'start',phase:'cold',requests:1},async()=>{if(mode==='work-reserve'){t=940001;events.push({stage:'work-budget-exhausted'})}return request('/attempt','POST')}),readCheckpoint:()=>readCategory(READ_CATEGORIES[0]),submitFour:async()=>{for(const kind of ['form','scale','cognitive','sjt'])await measure({id:'final-'+kind,phase:'cold',requests:1},()=>request('/final-'+kind,'POST'))},drainOriginalReport:()=>reportChild({}),createOriginalExport:()=>exportChild({}),readRemaining:async()=>{for(const category of READ_CATEGORIES.slice(1))await readCategory(category)},finish:async()=>({counts:counts(),attemptId:'new-parent'})}
  }}
 let result,error;try{result=await runC26MeasuredA(options,deps)}catch(caught){error=caught}
 return {dir,result,error,events,outputs,requests,elapsed:t}
}
test('fixed A coordinator connects raw DTOs, observes all 36 reads and closes observer before API',{timeout:5000},async()=>{
 const r=await fakeRun('success');assert.ifError(r.error);assert.equal(r.result.passed,true);assert.equal(r.result.http.length,44);assert.equal(r.result.children.length,2);assert.equal(r.result.tail.length,2)
 assert.deepEqual(r.result.readSchedule,{serialRequests:24,waves:6,concurrentRequests:12});assert.equal(r.result.http.filter(x=>x.route.startsWith('/final-')).length,4)
 assert.ok(r.events.findIndex(e=>e.stage==='observer-closed')<r.events.findIndex(e=>e.stage==='api-stopped'));assert.equal(r.events.filter(e=>e.stage==='prepared').length,2);assert.equal(r.events.filter(e=>e.stage==='retired').length,2)
 assert.equal(r.result.windows.filter(x=>x.operation.phase==='setup').length,2);assert.ok(r.requests.every(x=>!x.url.includes('/metrics')))
})
test('uncertain FINAL or mandatory window write stops later phases and prioritizes API cleanup',{timeout:5000},async()=>{
 for(const mode of ['uncertain-final','window-write']){const r=await fakeRun(mode);assert.ok(r.error);assert.equal(r.outputs['c25-c26-a-driver-result-private.json'].passed,false);assert.equal(r.outputs['c25-c26-a-driver-result-private.json'].children.length,0);assert.ok(!r.requests.some(x=>x.url.endsWith('/final-cognitive')));assert.ok(r.events.findIndex(e=>e.stage==='api-stopped')<r.events.findIndex(e=>e.stage==='observer-closed'))}
})
test('mandatory final evidence returning past aggregate keeps driver false after successful cleanup',{timeout:5000},async()=>{
 const r=await fakeRun('late-result');assert.ok(r.error);assert.equal(r.outputs['c25-c26-a-driver-result-private.json'].passed,false);assert.ok(r.events.some(e=>e.stage==='prisma-closed'))
})
test('read schedule and probe counter boundaries reject reordering or counter drift',()=>{
 const good=READ_CATEGORIES.flatMap(category=>[...Array.from({length:4},(_,sample)=>({operation:{phase:'serial',category,sample,requests:1}})),{operation:{phase:'wave',category,requests:2,concurrency:2}}])
 assert.equal(assertMeasuredReadSchedule(good).concurrentRequests,12);[good[0],good[5]]=[good[5],good[0]];assert.throws(()=>assertMeasuredReadSchedule(good));assert.throws(()=>probeDelta(sample(2),sample(1)));assert.equal(probeDelta(sample(1),sample(3)).sql.events,2)
})

test('real API and original task leaf hooks share the actual separate observer protocol before load and after reap',{timeout:15000},async()=>{
 const dir=directory('a-live-hook-'),proc=pid=>parseProcStat(fs.readFileSync(`/proc/${pid}/stat`,'utf8')),events=[],faults=[],end=performance.now()+12000,remaining=()=>end-performance.now()
 const holder=spawn(node,['-e',"process.send('ready');setInterval(()=>{},1000)"],{detached:true,stdio:['ignore','ignore','ignore','ipc']});const holderClose=new Promise(resolve=>holder.once('close',resolve));await new Promise(resolve=>holder.once('message',resolve))
 const registry=createOwnedPidRegistry([{...proc(process.pid),role:'driver',applicationName:'c26:driver:wiring'},{...proc(holder.pid),role:'pg_postmaster'}]);let observer,api
 const sub=name=>{const d=path.join(dir,name);fs.mkdirSync(d,{mode:0o700});return d},observerDir=sub('observer')
 save(path.join(observerDir,'fixture-config.json'),{scope:'NO_SERVICE_PG_SESSION',mode:'success'});save(path.join(observerDir,'fixture-control.json'),{connected:[]})
 try{
  observer=await startPgObserverSession({directory:observerDir,node,env:{PATH:process.env.PATH},registry,remainingMs:remaining,record:x=>events.push(x),onFault:e=>faults.push(e)},{spawnChild:(exe,argv,options)=>spawn(exe,[file('c25-c26-pg-session-fixture.mjs'),argv[1]],options)})
  await observer.connect({ownerUrl:'postgresql://eduk12_owner:synthetic@127.0.0.1:54399/eduk12_c25_joint_restore',port:54399,expectedSystemIdentifier:'456',primaryDatabase:'eduk12_recovery'})
  const apiDir=sub('api');save(path.join(apiDir,'fixture-config.json'),{scope:'NO_SERVICE_API_LIFECYCLE',mode:'success'})
  api=await startObservedApi({directory:apiDir,node,env:{...modes,C26_API_FIXTURE_DIRECTORY:apiDir},remainingMs:remaining,record:x=>events.push(x),onFault:e=>faults.push(e),register:async identity=>{await observer.register(identity);save(path.join(apiDir,'registration.json'),identity)}},{spawnChild:(exe,argv,options)=>spawn(exe,['--import',file('c25-c26-api-fixture.mjs'),...argv],options)})
  await observer.begin({maxWindowMs:7000})
  for(const kind of ['report','export']){
   const taskDir=sub(kind);save(path.join(taskDir,'fixture-config.json'),{scope:'NO_SERVICE_WORKER_BOUNDARY',kind,mode:'success'})
   const hooks=measuredWorkerHooks(observer,remaining),prepare=hooks.prepareClose;hooks.prepareClose=async identity=>{await prepare(identity);save(path.join(taskDir,'close-permission.json'),{pid:identity.pid,prepared:true})}
   const input=kind==='report'?{attemptEpoch:1,attemptId:'parent-new',jobId:'job-new',oldJobIds:['old-a','old-b']}:{artifactId:'artifact-new',batchId:'batch-new',productId:'product-new'}
   const result=await runObservedWorker({directory:taskDir,kind,input,node,env:{...modes,C26_WORKER_FIXTURE_DIRECTORY:taskDir},remainingMs:remaining,record:x=>events.push(x),onFault:e=>faults.push(e),hooks},{spawnChild:(exe,argv,options)=>spawn(exe,['--import',file('c25-c26-worker-fixture.mjs'),...argv],options)})
   assert.equal(result.passed,true);assert.equal(registry.entries().some(x=>x.pid===result.pid),false)
  }
  await observer.operationEnd();await delay(1120);const measured=await observer.settledEnd();assert.equal(measured.retirements.length,2)
  assert.equal((await observer.close()).passed,true);assert.equal((await api.stop()).passed,true);assert.equal(faults.length,0)
  save(path.join(dir,'wiring-result-private.json'),{passed:true,retirements:measured.retirements,events,scope:'REAL_LEAF_IPC; SYNTHETIC_PG_TASK_AND_NETWORK_IO; NO_PERFORMANCE_RESULT'})
 }finally{if(observer)try{await observer.close()}catch{};if(api)try{await api.stop()}catch{};try{process.kill(-holder.pid,'SIGKILL')}catch(e){if(e.code!=='ESRCH')throw e}await holderClose}
})


test('actual A CLI rejects an unapproved evidence target before any consumer starts',{timeout:5000},()=>{
 const result=spawnSync(node,[file('c25-c26-a-entry.mjs'),'/tmp/unapproved-c26-target'],{encoding:'utf8',timeout:3000,env:{PATH:process.env.PATH,NODE_ENV:'test'},maxBuffer:65536})
 assert.equal(result.error,undefined);assert.equal(result.status,1);assert.equal(result.signal,null);assert.equal(result.stdout,'');assert.match(result.stderr,/C26 entry rejected/)
 save(path.join(directory('a-entry-reject-'),'exit-private.json'),{argv:[node,file('c25-c26-a-entry.mjs'),'/tmp/unapproved-c26-target'],status:result.status,signal:result.signal,stdout:result.stdout,stderr:result.stderr})
})


test('driver global resource fault while Prisma is pending blocks every later create and h.write but disconnects',{timeout:5000},async()=>{
 const r=await fakeRun('pending-prisma');assert.ok(r.error);assert.equal(r.outputs['c25-c26-a-driver-result-private.json'].passed,false)
 assert.equal(r.events.filter(e=>e.stage==='first-create-issued').length,1);assert.equal(r.events.filter(e=>e.stage==='second-create-issued').length,0)
 assert.equal(r.outputs['c25-c26-unapproved-write.json'],undefined);assert.ok(r.events.some(e=>e.stage==='DRIVER_PRISMA_RESOLVED_AFTER_STOP_UNCERTAIN'))
 assert.ok(r.events.some(e=>e.stage==='prisma-closed'));assert.equal(r.outputs['c25-c26-a-driver-result-private.json'].prismaBusiness.pending,0)
})

test('Prisma singleton and raw private writes share the latched business deadline while disconnect stays independent',async()=>{
 let middleware,failure,available=100,writes=0,disconnections=0,nextCalls=0;const events=[]
 const assertWork=()=>{if(failure)throw failure;assert.ok(available>0,'work exhausted')},prisma={$use:fn=>middleware=fn,$disconnect:async()=>{disconnections++}}
 let h;const stop=error=>{failure??=error;h?.stop(failure);return failure}
 const gate=installPrismaBusinessGate(prisma,{assertWork,record:e=>events.push(e),stop})
 h=createRawHarness({state:'private',apiUrl:'http://127.0.0.1:54399',remaining:assertWork,read:()=>({}),write:()=>writes++,check:()=>{},record:()=>{},onFault:stop,normalize:x=>x})
 assert.throws(()=>installPrismaBusinessGate(prisma,{assertWork,record:()=>{},stop}),/twice/)
 available=0;assert.throws(()=>h.write('private',{}),/exhausted/);assert.equal(writes,0)
 await assert.rejects(middleware({model:'Course',action:'create'},async()=>nextCalls++));assert.equal(nextCalls,0)
 await prisma.$disconnect();assert.equal(disconnections,1);assert.equal(gate.snapshot().pending,0)
})

test('work deadline retains real 60s driver cleanup and final audits remain inside the same 1200s',{timeout:5000},async()=>{
 const second=1000000000n;let now=100n*second
 const invocation={startedMonotonicNs:'0',workDeadlineMonotonicNs:String(720n*second),deadlineMonotonicNs:String(780n*second),overallDeadlineMonotonicNs:String(1200n*second),totalBudgetSeconds:1200,cleanupReserveSeconds:60,finalAuditReserveSeconds:300,materialReserveSeconds:60,finalVerificationAndStopReserveSeconds:60}
 const budget=driverDeadlineContract(invocation,()=>now);assert.equal(budget.workRemainingMs(),620000);assert.equal(budget.remainingMs(),680000)
 now=720n*second;assert.throws(()=>budget.workRemainingMs());assert.equal(budget.remainingMs(),60000)
 for(const key of ['workDeadlineMonotonicNs','deadlineMonotonicNs','overallDeadlineMonotonicNs']){const bad={...invocation,[key]:String(BigInt(invocation[key])+second)};assert.throws(()=>driverDeadlineContract(bad,()=>100n*second))}
 const r=await fakeRun('work-reserve');assert.ok(r.error);const result=r.outputs['c25-c26-a-driver-result-private.json'];assert.equal(result.passed,false);assert.ok(r.events.some(e=>e.stage==='api-stopped'));assert.ok(r.events.some(e=>e.stage==='prisma-closed'));assert.equal(result.budget.cleanupReserveMs,60000);assert.ok(r.elapsed<1000000);assert.ok(!r.requests.some(x=>x.url.endsWith('/attempt')))
})
