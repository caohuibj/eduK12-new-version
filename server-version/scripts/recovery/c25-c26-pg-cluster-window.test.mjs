/** Pure window/protocol contracts: synthetic SQL/proc/clock, no services. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {createPgClusterWindow} from './c25-c26-pg-cluster-window.mjs'
import {createOwnedPidRegistry,PG_OBSERVER_SQL,TARGET_DATABASE} from './c25-c26-pg-observer.mjs'
import {PG_CLUSTER_SCOPE} from './c25-c26-pg-cluster.mjs'
const databaseKeys=['xact_commit','xact_rollback','blks_read','blks_hit','tup_returned','tup_fetched','tup_inserted','tup_updated','tup_deleted','temp_files','temp_bytes','deadlocks'],walKeys=['wal_records','wal_fpi','wal_bytes','wal_buffers_full','wal_write','wal_sync']
const identity=(pid,role)=>({pid,startTicks:String(pid*10),processGroupId:pid,parentPid:1,role,...(role==='pg_postmaster'?{}:{applicationName:`c26:${role}`})})
function harness(){
 const entries=[identity(10,'pg_postmaster'),identity(20,'observer'),identity(30,'report_worker')],registry=createOwnedPidRegistry(entries),events=[],stops=[],calls=[],intervals=new Map(),timeouts=new Map();let time=0,timerId=0,sequence=0
 const target={database:TARGET_DATABASE,systemIdentifier:'999',primarySystemIdentifier:'999',primaryDatabase:'eduk12_recovery',postmasterStartedAt:'2026-10-19 00:00:00+00',port:5432,observerBackendPid:100}
 const row={databaseName:TARGET_DATABASE,systemIdentifier:'999',postmasterStartedAt:target.postmasterStartedAt,serverPort:5432,observerBackendPid:100,statementTimeout:'200ms',transactionReadOnly:'on',statsFetchConsistency:'none',database:{...Object.fromEntries(databaseKeys.map(k=>[k,'10'])),blk_read_time:0,blk_write_time:0,stats_reset:null},wal:{...Object.fromEntries(walKeys.map(k=>[k,'10'])),wal_write_time:0,wal_sync_time:0,stats_reset:null},activity:[{pid:100,backend_type:'client backend',backend_start:'fixed',datname:TARGET_DATABASE,state:'active',client_addr:'127.0.0.1',application_name:'observer-label-only'},{pid:9999,backend_type:'client backend',backend_start:'later-than-proc',datname:TARGET_DATABASE,state:'idle',client_addr:'::1',application_name:'no-owner-map'}],databaseBytes:'1000',relations:[]}
 const h={row,events,stops,calls,registry,intervals,timeouts,observation:'OBSERVED',kids:[11],hold:false,afterRecord:null,cpuTicks:4,readIdentity:p=>({...entries.find(e=>e.pid===p),state:'S'}),setTime:value=>time=value,fire(ms){for(const timer of [...intervals.values()])if(timer.ms===ms)timer.fn()},fireTimeout(ms){for(const timer of [...timeouts.values()])if(timer.ms===ms)timer.fn()}}
 const timers={setInterval(fn,ms){const key=++timerId;intervals.set(key,{fn,ms});return key},clearInterval:key=>intervals.delete(key),setTimeout(fn,ms){const key=++timerId;timeouts.set(key,{fn,ms});return key},clearTimeout:key=>timeouts.delete(key)}
 h.window=createPgClusterWindow({registry,target,query:async request=>{calls.push(request);assert.ok(Object.values(PG_OBSERVER_SQL).includes(request.text));assert.equal(request.readOnly,true);assert.deepEqual(request.values,[]);assert.equal(request.statementTimeoutMs,200);if(h.hold)return new Promise(resolve=>h.release=()=>resolve({rows:[structuredClone(row)]}));return {rows:[structuredClone(row)]}},readProc:()=>({schemaVersion:1,scope:PG_CLUSTER_SCOPE,sequence:++sequence,observation:h.observation,completedAtMs:time,processes:[10,...h.kids].map(pid=>({...identity(pid,'pg_postmaster'),parentPid:pid===10?1:10,state:'S',userTicks:h.cpuTicks,systemTicks:2,rssBytes:4096,vmHwmRawBytes:2048,terminal:false,observedAtMs:time})),events:h.observation==='PARTIAL'?[{reason:'CHILD_EXITED'}]:[],readCost:{reads:10,bytes:1000,elapsedMs:1,cpuMicroseconds:{user:10,system:5},omittedEvents:0}}),remainingMs:()=>80000-time,record:value=>{events.push(value);h.afterRecord?.(value)},onStop:error=>stops.push(error),now:()=>time,cpuUsage:()=>({pid:20,user:100+time,system:20}),timers,readIdentity:pid=>h.readIdentity(pid),pgStatStatements:{mode:'unsupported',reason:'EXPLICITLY_UNAVAILABLE_IN_TEST'}})
 return h
}
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()}
async function finish(h){h.setTime(10);await h.window.operationEnd();h.setTime(1110);return h.window.settledEnd()}

test('cluster window keeps raw readonly activity independent from dynamic proc sets and includes observer cost',async()=>{
 const h=harness();await h.window.begin();h.kids=[12,13];h.observation='PARTIAL';h.cpuTicks=8;h.setTime(100);h.fire(100);h.setTime(120);await h.window.operationEnd();h.kids=[];h.setTime(1220);const result=await h.window.settledEnd()
 assert.equal(result.metricCoverage.pgCluster.status,'INCOMPLETE_SAMPLED_LOWER_BOUND');assert.equal(result.metricCoverage.pgConnectionRoles,'NOT_OBSERVED_BY_DESIGN');assert.equal(result.cluster.metricCoverage.includesObserverBackend,true);assert.equal(h.stops.length,0)
 assert.equal(result.before.activity[1].pid,9999);assert.equal(result.cluster.processes.some(p=>p.pid===9999),false);assert.equal(result.cluster.processes.some(p=>p.pid===12),true)
 assert.equal(result.observerCost.issued,3);assert.equal(result.observerCost.completed,3);assert.equal(result.observerCost.cpuMicroseconds.user,1220);assert.match(result.observerCost.scope,/NEVER_SUBTRACT/);assert.equal(result.walScope,undefined);assert.match(result.settledEnd.walScope,/INCLUDES_OBSERVER/)
 assert.ok(result.cluster.processes.every(p=>!('observations' in p)&&!('intervals' in p)));assert.equal(h.intervals.size,0);assert.equal(h.timeouts.size,0)
})

test('same-identity counter unreliability becomes explicit missing metric while readonly boundaries still complete',async()=>{
 const h=harness();await h.window.begin();h.cpuTicks=1;const result=await finish(h);assert.equal(h.stops.length,0);assert.equal(result.metricCoverage.pgCluster.status,'NOT_OBSERVED');assert.equal(result.cluster.sampledCpuDeltaTicksLowerBound,null);assert.match(result.cluster.metricFault.message,/counter reversed/);assert.equal(result.metricCoverage.pgReadonlyStats,'OBSERVED')
})

test('Node prepare and retirement need exact live identity and terminal close quiet proof, without any extra SQL',async()=>{
 const h=harness();await h.window.begin();const owner=h.registry.entries().find(p=>p.pid===30),prepared=await h.window.prepareOwnerClose(owner);assert.equal(prepared.prepared,true);assert.equal(h.calls.length,1)
 const proof={pid:30,startTicks:'300',closeObserved:true,terminalObserved:true,groupQuiescent:true,terminalCpu:{pid:30,startTicks:'300',user:7,system:2}}
 const retired=await h.window.retireOwner(proof);assert.match(retired.status,/NODE_TERMINAL_CLOSE_GROUP/);assert.equal(h.calls.length,1);assert.equal(h.registry.entries().some(p=>p.pid===30),false)
 const result=await finish(h);assert.equal(result.retirements.length,1);assert.equal(result.settledEnd.activity.some(p=>p.pid===9999),true)
 for(const mutate of [proof=>proof.groupQuiescent=false,proof=>proof.startTicks='reused',proof=>proof.terminalCpu.startTicks='reused']){
  const bad=harness();await bad.window.begin();await bad.window.prepareOwnerClose(owner);const value=structuredClone(proof);mutate(value);await assert.rejects(bad.window.retireOwner(value));assert.equal(bad.stops.length,1);await bad.window.stop()
 }
 const reused=harness();await reused.window.begin();reused.readIdentity=()=>({...owner,startTicks:'999',state:'S'});await assert.rejects(reused.window.prepareOwnerClose(owner));assert.equal(reused.stops.length,1);await reused.window.stop()
})

test('boundaries serialize behind one periodic query and no sampled process churn creates SQL refreshes',async()=>{
 const h=harness();await h.window.begin();h.hold=true;h.setTime(250);h.fire(250);await flush();assert.equal(h.calls.length,2)
 const end=h.window.operationEnd();await flush();assert.equal(h.calls.length,2);h.kids=[14,15];h.fire(100);assert.equal(h.calls.length,2)
 h.hold=false;h.release();await end;assert.equal(h.calls.length,3);h.setTime(1350);await h.window.settledEnd();assert.equal(h.calls.length,4);assert.equal(h.stops.length,0)
})

test('wrong cluster, writable SQL, reset counters and malformed mandatory evidence still stop without retry',async()=>{
 for(const change of [h=>h.row.systemIdentifier='other',h=>h.row.transactionReadOnly='off',h=>h.row.activity=[],h=>h.row.database=null]){const h=harness();change(h);await assert.rejects(h.window.begin());assert.equal(h.stops.length,1);assert.equal(h.calls.length,1);await h.window.stop()}
 const reset=harness();await reset.window.begin();reset.row.wal.stats_reset='changed';await assert.rejects(reset.window.operationEnd(),/stats_reset/);assert.equal(reset.stops.length,1);await reset.window.stop()
})

test('SQL timeout, aggregate deadline and final synchronous record cannot yield late success',async()=>{
 const timeout=harness();timeout.hold=true;const begin=timeout.window.begin();await flush();timeout.setTime(200);timeout.fireTimeout(200);await assert.rejects(begin,/deadline/);assert.equal(timeout.stops.length,1);await timeout.window.stop()
 const late=harness();await late.window.begin();late.afterRecord=value=>{if(value.kind==='pg_cluster_window_summary')late.setTime(80000)};await assert.rejects(finish(late),/deadline/);assert.equal(late.stops.length,1);assert.equal(late.window.state().phase,'failed');await late.window.stop()
 const waiting=harness();await waiting.window.begin();await waiting.window.prepareOwnerClose(identity(30,'report_worker'));await assert.rejects(waiting.window.operationEnd(),/retirement/);await waiting.window.stop()
})


test('cluster activity isolation marks foreign DB or non-loopback contamination and forbids comparison without socket mapping',async()=>{
 const clean=harness();await clean.window.begin();const accepted=await finish(clean);assert.equal(accepted.metricCoverage.comparisonEligible,true);assert.equal(accepted.metricCoverage.activityIsolation.status,'OBSERVED_ACTIVITY_LABEL_CHECKS_PASSED');assert.equal(accepted.metricCoverage.activityIsolation.connectionOwnership,'NOT_PROVEN_BY_ACTIVITY_LABELS')
 for(const mutate of [h=>h.row.activity[1].datname='eduk12_recovery',h=>h.row.activity[1].client_addr='203.0.113.1',h=>h.row.activity[1].client_addr=null]){const h=harness();mutate(h);await h.window.begin();const result=await finish(h);assert.equal(result.metricCoverage.comparisonEligible,false);assert.equal(result.metricCoverage.activityIsolation.status,'CONTAMINATED');assert.ok(result.metricCoverage.activityIsolation.findings.length>=3);assert.equal(h.stops.length,0)}
})


test('cluster comparison eligibility never promotes incomplete sampled bounds into full PG CPU or gain',async()=>{
 for(const mode of ['complete-observed-window','partial','birth','missing-tail','invalid-counter']){
  const h=harness();await h.window.begin();
  if(mode==='partial')h.observation='PARTIAL';if(mode==='birth')h.kids.push(12);if(mode==='missing-tail')h.kids=[];if(mode==='invalid-counter')h.cpuTicks=1;
  const result=await finish(h),coverage=result.metricCoverage;
  assert.equal(coverage.comparisonEligible,mode==='complete-observed-window');assert.equal(coverage.completePgCpuOrGainComparison,false);assert.equal(coverage.comparisonScope,'OBSERVED_INTERVALS_ONLY; REQUIRES_IDENTICAL_SAMPLING_CONTRACT_AND_COMPARABLE_COVERAGE_WINDOWS');assert.equal(h.stops.length,0);
  if(mode==='partial')assert.equal(coverage.pgCluster.status,'INCOMPLETE_SAMPLED_LOWER_BOUND');if(mode==='invalid-counter')assert.equal(coverage.pgCluster.status,'NOT_OBSERVED');if(mode==='missing-tail')assert.ok(result.cluster.processes.some(p=>p.tailCoverage==='NOT_OBSERVED_AFTER_LAST_SAMPLE'));
 }
})
