/** Actual spawned Node CLI/module graph contracts. Synthetic runtime only;
 * these tests open no database, API, Redis connection or business worker. */
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
const baseline='cd8484e91129cdc79c953d666c0b53f9d648d941'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const input=kind=>kind==='report'?{
 attempts:['MA','SA','MB'].map(attemptId=>({attemptId,jobId:'job-'+attemptId,attemptEpoch:1})),
 oldJobIds:Array.from({length:148},(_,i)=>'old-'+String(i).padStart(3,'0')),
}:{batchId:'batch',artifactId:'artifact',courseId:'course'}
function alive(pid){try{process.kill(pid,0);return true}catch(error){if(error.code==='ESRCH')return false;throw error}}
function read(state,name){return JSON.parse(fs.readFileSync(path.join(state,name)))}
function events(state){const file=path.join(state,'fixture-events.jsonl');return fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]}
function frozenGraph(state){
 const graph=path.join(state,'frozen-graph');fs.mkdirSync(graph)
 for(const name of ['c25-analysis-export.mjs','c25-analysis-http.mjs','c25-client.mjs','c21-error-redaction.mjs','loopback-only.cjs']){
  const result=spawnSync('git',['show',baseline+':server-version/scripts/recovery/'+name],{cwd:directory,maxBuffer:1024*1024})
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr.toString());fs.writeFileSync(path.join(graph,name),result.stdout)
 }
 return graph
}
async function run(kind,mode,{legacy=false}={}){
 assert.equal(process.version,'v24.21.0','CLI contract must use the same pinned Node version as the real harness')
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'c25-analysis-cli-contract-'))
 let journal=[]
 try{
  const graph=legacy?frozenGraph(state):directory,remainingMs=mode==='timeout'?4500:12000
  fs.writeFileSync(path.join(state,'fixture-config.json'),JSON.stringify({scope:'SYNTHETIC_CLI_LIFECYCLE_ONLY',kind,mode,input:input(kind),remainingMs}),{mode:0o600})
  const processResult=spawnSync(process.execPath,[fixture],{env:{...process.env,
   NODE_OPTIONS:'--import '+pathToFileURL(fixture).href,NODE_ENV:'test',
   C25_CHILD_CONTRACT_STATE:state,C25_CHILD_CONTRACT_GRAPH:graph,
   BACKGROUND_WORKERS_ENABLED:'false',HEAVY_PROCESSING_ENABLED:'false',VIDEO_PROCESSING_ENABLED:'false',ASSESSMENT_REPORT_ASYNC_ENABLED:'true',
   DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/never-connect',
  },encoding:'utf8',timeout:12000,killSignal:'SIGKILL',maxBuffer:1024*1024})
  journal=events(state)
  assert.ifError(processResult.error);assert.equal(processResult.signal,null,processResult.stderr)
  assert.equal(processResult.status,mode==='success'?0:1,processResult.stderr)
  const parent=read(state,'fixture-parent-result.json'),childEvents=journal.filter(row=>row.event==='runtime-loaded')
  assert.equal(childEvents.length,1,'Exactly one real child runtime must load')
  const childPid=childEvents[0].pid,parentPid=childEvents[0].ppid
  assert.notEqual(childPid,parentPid);assert.equal(alive(childPid),false,'runAnalysisChild must return only after its child is reaped')
  assert.equal(alive(parentPid),false,'The test coordinator must also exit naturally')
  const child=journal.filter(row=>row.pid===childPid),order=name=>child.findIndex(row=>row.event===name)
  assert.ok(order('prerequisites-read')>=0);assert.ok(order('prerequisites-read')<order('runtime-loaded'))
  assert.equal(path.resolve(childEvents[0].argv[1]),path.join(graph,legacy?'c25-analysis-export.mjs':'c25-analysis-child.mjs'),'The actual CLI file must be the entry')
  for(const name of ['c25-analysis-export.mjs',...(kind==='report'?['c25-analysis-http.mjs']:[]),...(!legacy?['c25-analysis-child.mjs']:[])]){
   const url=pathToFileURL(path.join(graph,name)).href,loaded=child.filter(row=>row.event==='real-module-loaded'&&row.url===url)
   assert.equal(loaded.length,1,'Actual child module must be loaded once: '+name)
   assert.equal(loaded[0].sha256,sha(fs.readFileSync(path.join(graph,name))))
  }
  const stem='c25-analysis-'+kind+'-child'
  const invocation=read(state,stem+'-invocation-private.json')
  assert.equal(invocation.phasePid,parentPid);assert.equal(invocation.kind,kind)
  for(const name of [stem+'-invocation-private.json',stem+'-started-private.json',stem+'-process-private.log'])assert.equal(fs.statSync(path.join(state,name)).mode&0o777,0o600)
  let lifecycle
  if(!legacy){
   lifecycle=read(state,stem+'-process-result-private.json')
   assert.equal(lifecycle.pid,childPid)
   assert.equal(lifecycle.phasePid,parentPid);assert.equal(lifecycle.nonce,invocation.nonce)
   assert.deepEqual(lifecycle.argv,invocation.argv)
   assert.deepEqual(lifecycle.argv,[process.execPath,'--require',path.join(graph,'loopback-only.cjs'),path.join(graph,'c25-analysis-child.mjs'),state,'--child',kind,invocation.nonce])
   assert.equal(lifecycle.closeObserved,true);assert.equal(lifecycle.interrupted,false)
   assert.equal(lifecycle.timedOut,mode==='timeout')
   assert.ok(lifecycle.closedMonotonicMs>=lifecycle.issuedMonotonicMs)
   assert.equal(lifecycle.code,mode==='timeout'?null:mode==='success'?0:1)
   assert.equal(lifecycle.signal,mode==='timeout'?'SIGKILL':null)
  }
  if(mode==='timeout'){
   assert.equal(parent.passed,false);assert.match(parent.error.message,/shared deadline/)
   assert.ok(order('sigterm-observed')>=0,'The real child must observe SIGTERM before forced reap')
   assert.equal(order('runtime-exit'),-1,'The deliberately unresponsive fixture must require forced termination')
   assert.equal(fs.existsSync(path.join(state,stem+'-result-private.json')),false,'A killed task cannot produce a successful child result')
   assert.ok(parent.elapsedMs>=invocation.budget.work+invocation.budget.killGrace-150)
   assert.ok(parent.elapsedMs<10000,'Shared timeout and reap must stay bounded')
   if(lifecycle){
    assert.deepEqual(lifecycle.terminationSignals.map(row=>row.signal),['SIGTERM','SIGKILL'])
    for(const signal of lifecycle.terminationSignals)assert.equal(signal.sent,true)
    assert.ok(lifecycle.terminationSignals[0].atMonotonicMs>=lifecycle.issuedMonotonicMs+invocation.budget.work-100)
    assert.ok(lifecycle.terminationSignals[1].atMonotonicMs>=lifecycle.terminationSignals[0].atMonotonicMs+invocation.budget.killGrace-100)
    assert.ok(lifecycle.closedMonotonicMs>=lifecycle.terminationSignals[1].atMonotonicMs)
   }
   if(legacy)assert.equal(order('task-start'),-1,'Frozen cyclic entry must stall on real HTTP import before any task runs')
   else assert.ok(order('task-start')>=0,'The new leaf entry must reach the intentionally hanging task')
  }else{
   assert.deepEqual(lifecycle.terminationSignals,[])
   const result=read(state,stem+'-result-private.json')
   assert.equal(result.passed,mode==='success');assert.equal(result.pid,childPid);assert.equal(result.phasePid,parentPid);assert.equal(result.nonce,invocation.nonce);assert.equal(result.kind,kind)
   assert.equal(parent.passed,mode==='success')
   assert.ok(order('task-start')>=0);assert.ok(order('queues-close-start')>order('task-start'))
   assert.ok(order('queues-closed')>order('queues-close-start'));assert.ok(order('prisma-disconnected')>order('queues-closed'));assert.ok(order('runtime-exit')>order('prisma-disconnected'))
   assert.equal(child.find(row=>row.event==='runtime-exit').code,mode==='success'?0:1)
   assert.ok(journal.findIndex(row=>row.pid===childPid&&row.event==='runtime-exit')<journal.findIndex(row=>row.event==='parent-return'))
   if(kind==='report')assert.ok(order('gate-disconnected')>order('task-start'))
   assert.equal(fs.statSync(path.join(state,stem+'-result-private.json')).mode&0o777,0o600)
   if(mode==='error'){
    assert.match(fs.readFileSync(path.join(state,stem+'-error-private.log'),'utf8'),new RegExp('Synthetic '+kind+' task failure'))
    assert.equal(result.error.message,'Qualification phase failed; inspect its private error log.')
    assert.equal(result.evidence,undefined)
   }else{
    assert.equal(parent.value.sha256,sha(fs.readFileSync(path.join(state,stem+'-result-private.json'))))
    assert.equal(parent.value.process.file,stem+'-process-result-private.json')
    assert.equal(parent.value.process.sha256,sha(fs.readFileSync(path.join(state,parent.value.process.file))))
    if(kind==='report')assert.equal(result.evidence.processed.length,3)
    else assert.equal(result.evidence.outcome.status,'READY')
   }
  }
 }finally{
  // Even a regression in the production timeout cannot leak a fixture child.
  for(const pid of new Set([...journal,...events(state)].filter(row=>row.event==='runtime-loaded').map(row=>row.pid))){
   if(alive(pid)){process.kill(pid,'SIGKILL');for(let i=0;i<40&&alive(pid);i++)await new Promise(resolve=>setTimeout(resolve,25))}
  }
  fs.rmSync(state,{recursive:true,force:true})
 }
}
for(const kind of ['report','export'])for(const mode of ['success','error','timeout'])test('real '+kind+' CLI '+mode+' preserves close and reap contract',{timeout:15000},()=>run(kind,mode))
test('frozen original report CLI reproduces the real ESM cycle and is forcibly reaped within its shortened budget',{timeout:15000},()=>run('report','timeout',{legacy:true}))
