/** Actual leaf CLI checks for the exact relative resume-state dispatch. Only
 * runtime and prerequisite I/O are synthetic; copied export/HTTP/leaf modules
 * run unchanged. No service, database, API or Redis connection is opened. */
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath,pathToFileURL} from 'node:url'

const directory=path.dirname(fileURLToPath(import.meta.url))
const fixture=path.join(directory,'c25-analysis-child-fixture.mjs')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const graphFiles=['c25-analysis-child.mjs','c25-analysis-export.mjs','c25-analysis-http.mjs','c25-client.mjs','c21-error-redaction.mjs','loopback-only.cjs','c25-analysis-contract.mjs','c25-analysis-resume-contract.mjs']
const input=kind=>kind==='report'?{
 attempts:['MA','SA','MB'].map(attemptId=>({attemptId,jobId:'job-'+attemptId,attemptEpoch:1})),
 oldJobIds:Array.from({length:148},(_,i)=>'old-'+String(i).padStart(3,'0')),
}:{batchId:'batch',artifactId:'artifact',courseId:'course'}
const read=(state,name)=>JSON.parse(fs.readFileSync(path.join(state,name)))
function events(state){const file=path.join(state,'fixture-events.jsonl');return fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]}
function alive(pid){try{process.kill(pid,0);return true}catch(error){if(error.code==='ESRCH')return false;throw error}}

async function run(kind){
 assert.equal(process.version,'v24.21.0','Use the same pinned Node version as the real child')
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'c25-analysis-resume-cli-contract-'))
 const graph=path.join(root,'REPO','server-version','scripts','recovery'),state=path.join(root,'eduk12_c25_analysis_02')
 let journal=[]
 try{
  fs.mkdirSync(graph,{recursive:true,mode:0o700});fs.mkdirSync(state,{mode:0o700})
  assert.equal(path.resolve(graph,'../../../..','eduk12_c25_analysis_02'),state,'Exercise the real exact relative resume branch')
  for(const name of graphFiles){
   const bytes=fs.readFileSync(path.join(directory,name));fs.writeFileSync(path.join(graph,name),bytes,{mode:0o600})
   assert.equal(sha(fs.readFileSync(path.join(graph,name))),sha(bytes),'Actual module bytes must remain unchanged: '+name)
  }
  fs.writeFileSync(path.join(state,'fixture-config.json'),JSON.stringify({scope:'SYNTHETIC_CLI_LIFECYCLE_ONLY',kind,mode:'success',input:input(kind),remainingMs:12000}),{mode:0o600})
  const processResult=spawnSync(process.execPath,[fixture],{env:{...process.env,
   NODE_OPTIONS:'--import '+pathToFileURL(fixture).href,NODE_ENV:'test',
   C25_CHILD_CONTRACT_STATE:state,C25_CHILD_CONTRACT_GRAPH:graph,
   BACKGROUND_WORKERS_ENABLED:'false',HEAVY_PROCESSING_ENABLED:'false',VIDEO_PROCESSING_ENABLED:'false',ASSESSMENT_REPORT_ASYNC_ENABLED:'true',
   DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/never-connect',
  },encoding:'utf8',timeout:12000,killSignal:'SIGKILL',maxBuffer:1024*1024})
  journal=events(state)
  assert.ifError(processResult.error);assert.equal(processResult.signal,null,processResult.stderr);assert.equal(processResult.status,0,processResult.stderr)
  const runtime=journal.filter(row=>row.event==='runtime-loaded');assert.equal(runtime.length,1)
  const childPid=runtime[0].pid,parentPid=runtime[0].ppid,child=journal.filter(row=>row.pid===childPid),order=name=>child.findIndex(row=>row.event===name)
  assert.notEqual(childPid,parentPid);assert.equal(alive(childPid),false,'Real child must be reaped');assert.equal(alive(parentPid),false,'Coordinator must exit naturally')
  assert.equal(child.filter(row=>row.event==='resume-prerequisites-read').length,1,'Exactly the new prerequisite reader must run')
  assert.equal(child.filter(row=>row.event==='prerequisites-read').length,0,'The original state01 prerequisite must not handle state02')
  assert.ok(order('resume-prerequisites-read')<order('runtime-loaded'))
  const stem='c25-analysis-'+kind+'-child',invocation=read(state,stem+'-invocation-private.json'),lifecycle=read(state,stem+'-process-result-private.json'),result=read(state,stem+'-result-private.json'),parent=read(state,'fixture-parent-result.json')
  const argv=[process.execPath,'--require',path.join(graph,'loopback-only.cjs'),path.join(graph,'c25-analysis-child.mjs'),state,'--child',kind,invocation.nonce]
  assert.deepEqual(invocation.argv,argv);assert.deepEqual(lifecycle.argv,argv)
  assert.deepEqual(runtime[0].argv,[process.execPath,path.join(graph,'c25-analysis-child.mjs'),state,'--child',kind,invocation.nonce])
  assert.equal(invocation.phasePid,parentPid);assert.equal(invocation.kind,kind)
  assert.equal(lifecycle.pid,childPid);assert.equal(lifecycle.phasePid,parentPid);assert.equal(lifecycle.nonce,invocation.nonce)
  assert.equal(lifecycle.closeObserved,true);assert.equal(lifecycle.code,0);assert.equal(lifecycle.signal,null)
  assert.equal(lifecycle.timedOut,false);assert.equal(lifecycle.interrupted,false);assert.deepEqual(lifecycle.terminationSignals,[])
  assert.ok(lifecycle.closedMonotonicMs>=lifecycle.issuedMonotonicMs)
  assert.equal(result.passed,true);assert.equal(result.kind,kind);assert.equal(result.nonce,invocation.nonce);assert.equal(result.phasePid,parentPid);assert.equal(result.pid,childPid)
  assert.equal(parent.passed,true);assert.equal(parent.value.file,stem+'-result-private.json');assert.equal(parent.value.sha256,sha(fs.readFileSync(path.join(state,parent.value.file))))
  assert.equal(parent.value.process.file,stem+'-process-result-private.json');assert.equal(parent.value.process.sha256,sha(fs.readFileSync(path.join(state,parent.value.process.file))))
  for(const name of ['c25-analysis-child.mjs','c25-analysis-export.mjs',...(kind==='report'?['c25-analysis-http.mjs']:[])]){
   const url=pathToFileURL(path.join(graph,name)).href,loaded=child.filter(row=>row.event==='real-module-loaded'&&row.url===url)
   assert.equal(loaded.length,1,'Load the actual unchanged module once: '+name);assert.equal(loaded[0].sha256,sha(fs.readFileSync(path.join(directory,name))))
  }
  assert.equal(child.filter(row=>row.event==='task-start').length,kind==='report'?3:1)
  assert.equal(child.filter(row=>row.event==='task-complete').length,kind==='report'?3:1)
  assert.ok(order('queues-close-start')>order('task-start'));assert.ok(order('queues-closed')>order('queues-close-start'))
  assert.ok(order('prisma-disconnected')>order('queues-closed'));assert.ok(order('runtime-exit')>order('prisma-disconnected'))
  assert.equal(child.find(row=>row.event==='runtime-exit').code,0)
  assert.ok(journal.findIndex(row=>row.pid===childPid&&row.event==='runtime-exit')<journal.findIndex(row=>row.event==='parent-return'))
  if(kind==='report'){assert.equal(result.evidence.processed.length,3);assert.equal(result.evidence.lockedOldJobIds.length,148);assert.ok(order('gate-disconnected')>order('task-start'))}
  else{assert.equal(result.evidence.outcome.status,'READY');assert.equal(result.evidence.redisBefore.invocation.attemptsMade,1);assert.equal(result.evidence.redisBefore.invocation.opts.attempts,3);assert.deepEqual(result.evidence.redisAfter.invocation,result.evidence.redisBefore.invocation)}
  for(const name of [stem+'-invocation-private.json',stem+'-started-private.json',stem+'-process-private.log',stem+'-process-result-private.json',stem+'-result-private.json'])assert.equal(fs.statSync(path.join(state,name)).mode&0o777,0o600)
 }finally{
  for(const pid of new Set([...journal,...events(state)].filter(row=>row.event==='runtime-loaded').map(row=>row.pid))){
   if(alive(pid)){process.kill(pid,'SIGKILL');for(let i=0;i<40&&alive(pid);i++)await new Promise(resolve=>setTimeout(resolve,25))}
  }
  fs.rmSync(root,{recursive:true,force:true})
 }
}
for(const kind of ['report','export'])test('real '+kind+' leaf CLI uses exact resume prerequisite before synthetic runtime and closes successfully',{timeout:15000},()=>run(kind))
