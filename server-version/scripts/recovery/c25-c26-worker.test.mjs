/** Real Node leaf CLI and real frozen SQL consumer; external I/O only is fake. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {runObservedWorker} from './c25-c26-worker-runner.mjs'
import {workerWrite,workerRead} from './c25-c26-worker-runtime.mjs'
const fixture=fileURLToPath(new URL('c25-c26-worker-fixture.mjs',import.meta.url))
const input={report:{attemptEpoch:1,attemptId:'parent-new',jobId:'job-new',oldJobIds:['old-a','old-b']},export:{artifactId:'artifact-new',batchId:'batch-new',productId:'product-new'}}
const modes={NODE_ENV:'test',BACKGROUND_WORKERS_ENABLED:'false',ASSESSMENT_REPORT_ASYNC_ENABLED:'true',HEAVY_PROCESSING_ENABLED:'false',VIDEO_PROCESSING_ENABLED:'false'}
function state(kind,mode){const root=process.env.C26_PREPARE_EVIDENCE_ROOT;assert.ok(root&&fs.statSync(root).isDirectory());const directory=fs.mkdtempSync(path.join(root,`worker-${kind}-${mode}-`));fs.chmodSync(directory,0o700);workerWrite(path.join(directory,'fixture-config.json'),{scope:'NO_SERVICE_WORKER_BOUNDARY',kind,mode});return directory}
async function run(kind,mode,extra={}){
 const directory=state(kind,mode),events=[],faults=[];let identity,retired=null,expired=false,registrationRelease;const registration=new Promise(resolve=>registrationRelease=resolve)
 const budget=extra.budget??7000,end=performance.now()+budget
 const record=value=>{events.push(value);if(extra.holdRegistration&&value.stage==='CHILD_BOOTED'){const raw=fs.readFileSync(path.join(directory,'fixture-events.jsonl'),'utf8');assert.ok(!raw.includes('real-production-consumer-loaded'),'client import preceded ownership registration');workerWrite(path.join(directory,'registration-proof.json'),{consumerLoaded:false,booted:true});registrationRelease()};if(extra.journalFault&&value.stage==='CHILD_TASK_DONE')throw new Error('SYNTHETIC_JOURNAL_FAILURE')}
 const hooks={register:async value=>{identity=value;if(extra.holdRegistration)await registration;events.push({stage:'registered',pid:value.pid})},loaded:async value=>{assert.equal(value,identity);events.push({stage:'loaded'})},prepareClose:async value=>{
  assert.equal(value,identity);events.push({stage:'prepare-enter'})
  if(extra.holdPrepare)await new Promise(()=>{})
  // An actual asynchronous boundary; permission cannot be sent first.
  await new Promise(resolve=>setImmediate(resolve));workerWrite(path.join(directory,'close-permission.json'),{pid:value.pid,prepared:true});events.push({stage:'prepare-return'})
 },retire:async proof=>{assert.equal(proof.pid,identity.pid);assert.equal(proof.startTicks,identity.startTicks);for(const key of ['closeObserved','terminalObserved','groupQuiescent'])assert.equal(proof[key],true);assert.ok(proof.terminalCpu.user>0);retired=proof;events.push({stage:'retired'});if(extra.expireRetire)expired=true}}
 let receipt,error
 try{receipt=await runObservedWorker({directory,kind,input:input[kind],node:process.execPath,env:{PATH:process.env.PATH,...modes,DATABASE_URL:'postgresql://eduk12_runtime:synthetic@127.0.0.1:54399/eduk12_c25_joint_restore',C26_WORKER_FIXTURE_DIRECTORY:directory},remainingMs:()=>expired?0:end-performance.now(),record,onFault:error=>faults.push(error.name),hooks},
 {spawnChild:(node,argv,options)=>spawn(node,['--import',fixture,...argv],options)})}catch(caught){error=caught}
 const saved=workerRead(path.join(directory,'runner-private.json')),raw=fs.readFileSync(path.join(directory,'fixture-events.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x))
 return {directory,receipt,saved,error,events,raw,faults,retired}
}
for(const kind of ['report','export'])test(`actual ${kind} leaf task waits for fresh PG close proof, records actual retry metadata and real consumer mirror`,{timeout:12000},async()=>{
 const r=await run(kind,'success');assert.ifError(r.error);assert.equal(r.receipt.passed,true);assert.equal(r.saved.passed,true)
 const result=workerRead(path.join(r.directory,'result-private.json'));assert.equal(result.passed,true);assert.ok(result.moduleClosure.length>0);assert.equal(result.argv[1],fileURLToPath(new URL('c25-c26-worker-child.mjs',import.meta.url)))
 const loaded=r.raw.filter(x=>x.name==='real-module-loaded').map(x=>path.basename(new URL(x.url).pathname));for(const name of ['c25-c26-worker-child.mjs','c25-c26-worker-runtime.mjs','c25-c26-worker-tasks.mjs','c25-analysis-export.mjs'])assert.ok(loaded.includes(name),name)
 assert.equal(r.raw.filter(x=>x.name===kind+'-process').length,1);assert.equal(r.raw.filter(x=>x.name==='prisma-disconnect').length,1);assert.equal(r.raw.filter(x=>x.name==='queues-close').length,1)
 assert.ok(r.events.findIndex(x=>x.stage==='prepare-return')<r.events.findIndex(x=>x.stage==='CHILD_CLEANED'));assert.ok(r.retired)
 assert.equal(r.receipt.initialProbe.sql.events,0);assert.ok(r.receipt.finalProbe.sql.events>0);assert.equal(r.receipt.finalProbe.closed,true);assert.equal(r.receipt.finalProbe.instrumentation.mirrorCalls,r.receipt.finalProbe.sql.events)
 assert.equal(r.receipt.resources.lifecycle.groupQuiescent,true);assert.ok(BigInt(r.receipt.resources.lifecycle.terminalToCloseWallNs)>0n);assert.equal(r.receipt.resources.lifecycle.terminalToCloseCpu,'NOT_OBSERVED')
 if(kind==='report'){assert.equal(result.task.claimed.attemptCount,1);assert.deepEqual(result.task.lockedOldJobIds,['old-a','old-b']);assert.equal(r.raw.filter(x=>x.name==='report-claim').length,1);assert.equal(r.raw.filter(x=>x.name==='gate-disconnect').length,1)}
 else{assert.equal(result.task.before.recordCount,0);assert.equal(result.task.after.recordCount,1);assert.deepEqual(result.task.redisBefore.invocation,{data:{batchId:'batch-new'},id:'export-batch-new',opts:{attempts:2},attemptsMade:1});assert.ok(r.raw.every(x=>!x.filename?.endsWith('exportProcessor.js')))}
 assert.equal(r.faults.length,0)
})
for(const kind of ['report','export'])test(`actual ${kind} task exception retains private error, never retries, closes resources and remains false`,{timeout:12000},async()=>{
 const r=await run(kind,'error');assert.ok(r.error);assert.equal(r.saved.passed,false);assert.equal(r.retired,null)
 const result=workerRead(path.join(r.directory,'result-private.json'));assert.equal(result.passed,false);assert.equal(result.error.name,'TypeError');assert.match(result.error.stack,/SYNTHETIC_TASK_ERROR_PRIVATE/)
 assert.ok(result.cleanup.every(x=>x.closed));assert.equal(r.raw.filter(x=>x.name===kind+'-process').length,1);assert.equal(r.saved.failedLifecycle.closeObserved,true);assert.equal(r.saved.failedLifecycle.groupQuiescent,true)
 assert.equal(r.saved.failedLifecycle.code,1);assert.ok(r.faults.length);assert.ok(!fs.readFileSync(path.join(r.directory,'process-private.log'),'utf8').includes('SYNTHETIC_TASK_ERROR_PRIVATE'))
})
test('actual hung report is killed and reaped within the original aggregate; no resubmission or fabricated result',{timeout:7000},async()=>{
 const r=await run('report','hang',{budget:2500});assert.ok(r.error);assert.equal(r.saved.passed,false);assert.equal(r.saved.failedLifecycle.closeObserved,true);assert.equal(r.saved.failedLifecycle.groupQuiescent,true)
 assert.equal(r.saved.failedLifecycle.signal,'SIGKILL');assert.equal(r.raw.filter(x=>x.name==='report-process').length,1);assert.equal(fs.existsSync(path.join(r.directory,'result-private.json')),false)
 assert.equal(r.retired,null)
})
test('held fresh PG preparation cannot escape aggregate deadline or grant disconnect early',{timeout:7000},async()=>{
 const r=await run('report','success',{budget:2500,holdPrepare:true});assert.ok(r.error);assert.equal(r.saved.passed,false);assert.equal(r.saved.failedLifecycle.groupQuiescent,true)
 assert.equal(fs.existsSync(path.join(r.directory,'close-permission.json')),false);assert.equal(r.raw.some(x=>x.name==='gate-disconnect'),false);assert.equal(r.retired,null)
})
test('private journal failure after task completion latches a stop and still reaps the real child',{timeout:7000},async()=>{
 const r=await run('export','success',{journalFault:true});assert.ok(r.error);assert.match(r.saved.error.stack,/SYNTHETIC_JOURNAL_FAILURE/);assert.equal(r.saved.passed,false);assert.equal(r.saved.failedLifecycle.closeObserved,true);assert.equal(r.saved.failedLifecycle.groupQuiescent,true);assert.equal(r.raw.filter(x=>x.name==='export-process').length,1)
})

test('retire hook returning after the shared deadline cannot produce a late PASS after child close',{timeout:7000},async()=>{
 const r=await run('report','success',{expireRetire:true});assert.ok(r.error);assert.equal(r.saved.passed,false);assert.match(r.saved.error.stack,/aggregate deadline/)
 assert.ok(r.retired);assert.equal(r.saved.resources.lifecycle.closeObserved,true);assert.equal(r.saved.resources.lifecycle.groupQuiescent,true);assert.equal(r.saved.resources.lifecycle.code,0)
 assert.equal(workerRead(path.join(r.directory,'result-private.json')).passed,true,'completed child is retained separately from failed parent acceptance')
})

test('actual worker cannot load production client or connect before asynchronous PID registration completes',{timeout:7000},async()=>{
 const r=await run('report','success',{holdRegistration:true});assert.ifError(r.error);assert.equal(r.saved.passed,true)
 assert.deepEqual(workerRead(path.join(r.directory,'registration-proof.json')),{consumerLoaded:false,booted:true})
 assert.ok(r.events.findIndex(x=>x.stage==='CHILD_BOOTED')<r.events.findIndex(x=>x.stage==='registered'));assert.ok(r.events.findIndex(x=>x.stage==='registered')<r.events.findIndex(x=>x.stage==='CHILD_LOADED'))
})
