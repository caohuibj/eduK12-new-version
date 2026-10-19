/** A bounded cluster measurement window, independent of socket/worker mapping.
 * Owns no connection or process. Safety/SQL/protocol/budget failures still fail
 * closed; proc coverage gaps are explicit metric results, not product errors.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {parseProcStat} from './c25-c26-observer.mjs'
import {PG_OBSERVER_SQL,OBSERVER_INTERVALS,TARGET_DATABASE,validateIdentity,validateStats} from './c25-c26-pg-observer.mjs'
import {createPgClusterSeries,PG_CLUSTER_SCOPE} from './c25-c26-pg-cluster.mjs'
const id=p=>`${p.pid}:${p.startTicks}`
const exactNumber=value=>assert.ok(Number.isSafeInteger(value)&&value>=0)
const decimal=value=>assert.match(value,/^(0|[1-9][0-9]*)$/)
const actualIdentity=pid=>parseProcStat(fs.readFileSync(`/proc/${pid}/stat`,'utf8'))

export function createPgClusterWindow({query,readProc,registry,target,remainingMs,record,onStop,now=()=>performance.now(),cpuUsage=()=>({pid:process.pid,...process.cpuUsage()}),timers=globalThis,readIdentity=actualIdentity,maxWindowMs=90000,maxEvidenceBytes=8*1024**2,pgStatStatements}){
 for(const fn of [query,readProc,remainingMs,record,onStop,now,cpuUsage,readIdentity])assert.equal(typeof fn,'function')
 assert.equal(target.database,TARGET_DATABASE);assert.equal(target.systemIdentifier,target.primarySystemIdentifier);decimal(target.systemIdentifier);assert.ok(target.primaryDatabase&&target.primaryDatabase!==TARGET_DATABASE)
 assert.ok(Number.isSafeInteger(maxWindowMs)&&maxWindowMs>1100&&maxWindowMs<=90000);assert.ok(Number.isSafeInteger(maxEvidenceBytes)&&maxEvidenceBytes>0&&maxEvidenceBytes<=8*1024**2)
 assert.ok(['unsupported','required'].includes(pgStatStatements?.mode));if(pgStatStatements.mode==='unsupported')assert.match(pgStatStatements.reason,/^[A-Z0-9_]{1,100}$/)
 const observer=registry.entries().find(p=>p.role==='observer');assert.ok(observer)
 const series=createPgClusterSeries({maxEvidenceBytes}),snapshots={},retirements=[]
 const cost={issued:0,completed:0,failed:0,queryElapsedMs:0,procSamples:0,pgSamples:0,boundaryCoveredPgTicks:0}
 const isolationFindings=[]
 let phase='new',failure=null,started,lastNow=-Infinity,cpuBefore,endAt,procTimer,pgTimer,deadlineTimer,pending=null,controller=null,periodicPending=false,boundary=false,prepared=null,previousStats=null,evidenceBytes=0,metricFault=null
 const clock=()=>{const value=now();assert.ok(Number.isFinite(value)&&value>=lastNow,'cluster window clock reversed');lastNow=value;return value}
 const clear=()=>{timers.clearInterval(procTimer);timers.clearInterval(pgTimer);timers.clearTimeout(deadlineTimer)}
 const fail=error=>{if(!failure){failure=error;phase='failed';clear();controller?.abort();try{onStop(error)}catch(extra){failure=new AggregateError([error,extra],'cluster observation stop failed')}}return failure}
 const budget=()=>{if(failure)throw failure;const external=remainingMs(),local=maxWindowMs-(clock()-started);assert.ok(Number.isFinite(external)&&external>0&&local>0,'cluster window/aggregate deadline');return Math.min(external,local)}
 const emit=value=>{budget();const bytes=Buffer.byteLength(JSON.stringify(value));assert.ok(evidenceBytes+bytes<=maxEvidenceBytes,'cluster window evidence bound');const result=record(structuredClone(value));assert.ok(!result?.then,'synchronous mandatory record required');evidenceBytes+=bytes;budget()}
 const guard=async fn=>{try{budget();const value=await fn();budget();return value}catch(error){throw fail(error)}}
 const sample=()=>{
  budget();const frame=readProc();assert.ok(frame&&!frame.then,'synchronous cluster sampler required');cost.procSamples++;evidenceBytes+=Buffer.byteLength(JSON.stringify(frame));assert.ok(evidenceBytes<=maxEvidenceBytes,'cluster window evidence bound')
  // Reader emits exact raw observations. A series error invalidates only this
  // metric, while lifecycle/SQL identity and the work deadline remain strict.
  if(!metricFault)try{series.add(frame)}catch(error){if(!/same identity CPU counter reversed|terminal process revived/.test(error.message))throw error;metricFault={name:error.name,message:error.message};emit({kind:'pg_cluster_metric_invalid',error:metricFault,coverage:'NOT_OBSERVED'})}
  budget();return {sequence:frame.sequence,observation:frame.observation,processesObserved:frame.processes.length}
 }
 const sql=async kind=>{
  const left=budget();assert.ok(left>=200,'fixed readonly SQL timeout must fit window');const at=clock();controller=new AbortController();const signal=controller.signal;cost.issued++;let timer
  try{
   const response=await Promise.race([Promise.resolve().then(()=>{budget();assert.ok(!signal.aborted);return query({text:PG_OBSERVER_SQL[kind],values:[],statementTimeoutMs:200,remainingMs:left,signal,readOnly:true})}),new Promise((_,reject)=>timer=timers.setTimeout(()=>{controller?.abort();reject(new Error('cluster readonly query deadline'))},200))])
   budget();assert.ok(clock()-at<=200,'cluster readonly query returned late');assert.equal(response?.rows?.length,1);const row=response.rows[0];validateIdentity(row,target,200);cost.completed++;return structuredClone(row)
  }catch(error){cost.failed++;throw error}finally{timers.clearTimeout(timer);cost.queryElapsedMs+=clock()-at;controller=null}
 }
 const collect=async isBoundary=>{
  const row=await sql(isBoundary?'boundary':'activity');validateStats(row,previousStats);previousStats=structuredClone(row)
  assert.ok(Array.isArray(row.activity)&&row.activity.length<=512);assert.equal(new Set(row.activity.map(p=>p.pid)).size,row.activity.length)
  for(const entry of row.activity){exactNumber(entry.pid);assert.ok(entry.pid>0);assert.ok(typeof entry.backend_type==='string'&&entry.backend_type.length>0);assert.ok(typeof entry.backend_start==='string'&&entry.backend_start.length>0)}
  assert.ok(row.activity.some(p=>p.pid===target.observerBackendPid),'observer backend absent from actual activity')
  for(const entry of row.activity.filter(p=>p.backend_type==='client backend')){
   const reasons=[];if(entry.datname!==TARGET_DATABASE)reasons.push('FOREIGN_DATABASE_CLIENT');if(!['127.0.0.1','::1'].includes(entry.client_addr))reasons.push('NON_LOOPBACK_OR_UNOBSERVED_CLIENT_ADDRESS')
   if(reasons.length){assert.ok(isolationFindings.length<2048,'activity isolation evidence bound');isolationFindings.push({elapsedMs:clock()-started,pid:entry.pid,backend_start:entry.backend_start,datname:entry.datname??null,client_addr:entry.client_addr??null,reasons})}
  }
  if(isBoundary){decimal(row.databaseBytes);assert.ok(Array.isArray(row.relations)&&row.relations.length<=2048);for(const p of row.relations){decimal(p.oid);for(const key of ['heap_bytes','index_bytes','total_bytes'])decimal(p[key])}}
  cost.pgSamples++;const procSample=sample(),value={elapsedMs:clock()-started,...row,procSample,activityScope:'ALL_CLUSTER_ACTIVITY; NO_API_OR_WORKER_CONNECTION_ATTRIBUTION',walScope:'PHYSICAL_CLUSTER_INCLUDES_OBSERVER_AND_BACKGROUND'}
  emit({kind:isBoundary?'pg_cluster_boundary':'pg_cluster_activity',...value});return value
 }
 // Every query, including operation/settled boundaries, shares one chain.
 const serialize=fn=>{
  const before=pending,job=Promise.resolve().then(async()=>{if(before)await before;budget();const value=await fn();budget();return value})
  const tracked=job.finally(()=>{if(pending===tracked)pending=null});pending=tracked;return tracked
 }
 const observation=()=>{
  const all=series.snapshot(),cpu=cpuUsage();assert.equal(cpu.pid,observer.pid)
  for(const key of ['user','system']){exactNumber(cpu[key]);assert.ok(cpu[key]>=cpuBefore[key],'observer CPU counter reversed')}
  // Full samples already streamed into private raw; reply only bounded summary.
  const summary={scope:all.scope,metricCoverage:all.metricCoverage,sampledCpuDeltaTicksLowerBound:all.sampledCpuDeltaTicksLowerBound,sampledRssSumPeakBytes:all.sampledRssSumPeakBytes,frameCount:all.frames.length,gapFrameCount:all.gaps.length,processes:all.processes.map(({observations,intervals,gaps,...p})=>({...p,observationCount:observations.length,intervalCount:intervals.length,gapCount:gaps.length,firstObservation:observations[0],lastObservation:observations.at(-1)})),observerReadCost:all.observerReadCost,readCostScope:all.readCostScope}
  if(metricFault){summary.metricCoverage={...summary.metricCoverage,status:'NOT_OBSERVED'};summary.sampledCpuDeltaTicksLowerBound=null;summary.metricFault=metricFault}
  const isolation={status:isolationFindings.length?'CONTAMINATED':'OBSERVED_ACTIVITY_LABEL_CHECKS_PASSED',findings:structuredClone(isolationFindings),connectionOwnership:'NOT_PROVEN_BY_ACTIVITY_LABELS'}
  return {cluster:summary,metricCoverage:{pgCluster:summary.metricCoverage,pgReadonlyStats:'OBSERVED',pgConnectionRoles:'NOT_OBSERVED_BY_DESIGN',activityIsolation:isolation,comparisonEligible:!isolationFindings.length&&summary.metricCoverage.status==='SAMPLED_LOWER_BOUND'&&all.processes.length>0&&all.processes.every(p=>p.headCoverage==='FIRST_FRAME_SAMPLE'&&p.tailCoverage==='FINAL_FRAME_SAMPLE'&&!p.gaps.length&&p.intervals.length>0),comparisonScope:'OBSERVED_INTERVALS_ONLY; REQUIRES_IDENTICAL_SAMPLING_CONTRACT_AND_COMPARABLE_COVERAGE_WINDOWS',completePgCpuOrGainComparison:false},observerCost:{...cost,observerProcessIdentity:id(observer),cpuMicroseconds:{user:cpu.user-cpuBefore.user,system:cpu.system-cpuBefore.system},scope:'OBSERVER_NODE_AND_OWN_QUERY_EVENTS; NEVER_SUBTRACT_FROM_PG_TOTALS',cpuTail:'AFTER_THIS_SAMPLE_SERIALIZATION_ACK_EXIT_NOT_OBSERVED'}}
 }
 return Object.freeze({
  async begin(){
   try{
    assert.equal(phase,'new');phase='starting';started=clock();cpuBefore=cpuUsage();assert.equal(cpuBefore.pid,observer.pid);for(const key of ['user','system'])exactNumber(cpuBefore[key]);budget()
    snapshots.before=await serialize(()=>collect(true));phase='running';budget()
    procTimer=timers.setInterval(()=>{try{sample()}catch(error){fail(error)}},OBSERVER_INTERVALS.procMs)
    pgTimer=timers.setInterval(()=>{
     if(failure)return
     if(boundary){cost.boundaryCoveredPgTicks++;return}
     if(periodicPending){fail(new Error('cluster periodic query overrun'));return}
     periodicPending=true;void serialize(()=>collect(false)).catch(fail).finally(()=>periodicPending=false)
    },OBSERVER_INTERVALS.pgMs)
    deadlineTimer=timers.setTimeout(()=>fail(new Error('cluster original window deadline')),budget());return structuredClone(snapshots.before)
   }catch(error){throw fail(error)}
  },
  operationEnd:()=>guard(async()=>{assert.equal(phase,'running');assert.equal(prepared,null,'real Node retirement still required');phase='ending';boundary=true;endAt=clock();snapshots.operationEnd=await serialize(()=>collect(true));phase='settling';boundary=false;return structuredClone(snapshots.operationEnd)}),
  settledEnd:()=>guard(async()=>{
   assert.equal(phase,'settling');assert.equal(prepared,null);assert.ok(clock()-endAt>=1100,'stats settle below original 1100ms');phase='finishing';boundary=true;snapshots.settledEnd=await serialize(()=>collect(true))
   let statements={available:false,reason:pgStatStatements.reason}
   if(pgStatStatements.mode==='required'){const row=await serialize(()=>sql('statements'));decimal(row.statements?.calls);decimal(row.statements?.returned_rows);assert.ok(Number.isFinite(row.statements.total_exec_time_ms)&&row.statements.total_exec_time_ms>=0);statements={available:true,...row.statements}}
   const result={...structuredClone(snapshots),...observation(),statements,retirements:structuredClone(retirements),intervals:OBSERVER_INTERVALS,statsSettleMs:clock()-endAt,scope:PG_CLUSTER_SCOPE}
   emit({kind:'pg_cluster_window_summary',...result.cluster,observerCost:result.observerCost});clear();budget();phase='settled';boundary=false;return result
  }),
  prepareOwnerClose:entry=>guard(async()=>{
   assert.ok(['running','settling'].includes(phase)&&!boundary&&!prepared);const owner=registry.entries().find(p=>p.pid===entry.pid);assert.ok(owner&&id(owner)===id(entry)&&['report_worker','export_worker'].includes(owner.role))
   const live=readIdentity(owner.pid);for(const key of ['pid','startTicks','processGroupId','parentPid'])if(owner[key]!==undefined)assert.equal(live[key],owner[key]);assert.ok(!['Z','X','x'].includes(live.state),'worker not live at prepare close')
   prepared=structuredClone(owner);const result={prepared:true,ownerIdentity:id(owner),identity:live,scope:'NODE_LIFECYCLE_ONLY; NO_PG_SOCKET_OR_BACKEND_DISAPPEARANCE_GATE'};emit({kind:'node_prepare_close',...result});return result
  }),
  retireOwner:proof=>guard(async()=>{
   assert.ok(prepared&&id(proof)===id(prepared),'exact prior Node preparation required');assert.equal(proof.terminalCpu?.pid,prepared.pid);assert.equal(proof.terminalCpu?.startTicks,prepared.startTicks);for(const key of ['user','system'])exactNumber(proof.terminalCpu[key])
   registry.retire(proof);const result={ownerIdentity:id(prepared),role:prepared.role,status:'CLOSED_VERIFIED_BY_NODE_TERMINAL_CLOSE_GROUP_QUIESCENCE',terminalCpu:structuredClone(proof.terminalCpu),backendCpuExitTail:'NOT_OBSERVED; PG_FAMILY_SAMPLED_INDEPENDENTLY'};emit({kind:'node_retirement_verified',...result});retirements.push(result);prepared=null;return result
  }),
  async stop(){clear();controller?.abort();if(pending)await pending.catch(()=>{});if(!failure)phase='closed';return {phase,failure:failure?.message??null,evidenceBytes}},
  state:()=>({phase,failure:failure?.message??null,queryPending:pending!==null,evidenceBytes,cost:{...cost}}),
 })
}
