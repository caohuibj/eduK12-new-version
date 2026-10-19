/** Passive resource observer for the separate C20 efficiency experiment.
 * The sampler lives in a different process: synchronous work in the producer
 * cannot suppress the 100ms /proc timer. It never resets statistics, changes PG
 * configuration, forces GC, changes source facts, or retries the measured fn.
 * Per-process attribution is physical; report/export code in the producer is
 * explicitly an activity of that producer, not an invented worker process.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {fork,execFileSync} from 'node:child_process'

const filename=fileURLToPath(import.meta.url)
const backend=path.resolve(path.dirname(filename),'../../backend')
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const CALLERS=new Set(['api','direct_producer','report_worker_in_producer','export_worker_in_producer','idle'])
const LIMITATIONS=[
 'CPU is /proc user/system tick deltas; a zero delta below one tick does not establish zero cost or an improvement.',
 'RSS peak is a 100ms sampled peak and may miss shorter peaks. VmHWM is lifetime high water, never a window peak.',
 'PG statistics are cumulative database/instance counters. A separate 1100ms settle is recorded; later publication may still lag.',
 'PG tuple counters are returned/fetched/changed tuples, not physical tuples examined or SQL statement counts.',
 'Observer PG queries and CPU remain in raw counters and are not blindly subtracted. Observer and producer instrumentation perturb timing.',
 'A window is serial or at most two concurrent operations; this is not throughput, user capacity, or browser/human timing.',
 'API CPU cannot represent direct producer export/report work. In-process report/export calls share producer CPU and memory.',
 'Process exit between samples can omit its final ticks/peak; process reuse is separated by kernel start time.',
 'proc IO is per-process accounting and cache-sensitive; relation bytes are allocated storage, not logical payload bytes.',
 'Prisma/SQL/decrypt/response byte instrumentation belongs to the producer and is reported separately from these raw resource observations.',
]

export function parseProcStat(text,hz){
 const end=text.lastIndexOf(') ');assert.ok(end>0,'invalid proc stat')
 const fields=text.slice(end+2).trim().split(/\s+/)
 return {state:fields[0],parentPid:Number(fields[1]),userTicks:Number(fields[11]),systemTicks:Number(fields[12]),startTicks:Number(fields[19]),userSeconds:Number(fields[11])/hz,systemSeconds:Number(fields[12])/hz}
}
export function numericDeltas(before,after){
 const out={}
 for(const [key,value]of Object.entries(after??{})){
  if(typeof value==='number'&&typeof before?.[key]==='number')out[key]=value-before[key]
 }
 return out
}
function procRead(pid,hz){
 try{
  const stat=parseProcStat(fs.readFileSync(`/proc/${pid}/stat`,'utf8'),hz)
  const status=fs.readFileSync(`/proc/${pid}/status`,'utf8')
  const kb=name=>{const match=status.match(new RegExp(`^${name}:\\s+(\\d+) kB$`,'m'));return match?Number(match[1])*1024:null}
  let io=null,ioUnavailable=null
  try{io=Object.fromEntries(fs.readFileSync(`/proc/${pid}/io`,'utf8').trim().split('\n').map(line=>{const [key,value]=line.split(':');return [key,Number(value.trim())]}))}catch(error){ioUnavailable=error.code??error.name}
  return {pid,...stat,rssBytes:kb('VmRSS'),vmHwmLifetimeBytes:kb('VmHWM'),io,ioUnavailable}
 }catch(error){if(['ENOENT','ESRCH'].includes(error.code))return null;throw error}
}
function pgClientPorts(pid,pgPort){
 const sockets=new Set()
 try{for(const fd of fs.readdirSync(`/proc/${pid}/fd`)){try{const target=fs.readlinkSync(`/proc/${pid}/fd/${fd}`);if(target.startsWith('socket:['))sockets.add(target.slice(8,-1))}catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error}}}catch(error){if(['ENOENT','ESRCH'].includes(error.code))return new Set();throw error}
 const ports=new Set()
 for(const kind of ['tcp','tcp6']){
  for(const line of fs.readFileSync(`/proc/${pid}/net/${kind}`,'utf8').trim().split('\n').slice(1)){
   const f=line.trim().split(/\s+/)
   if(sockets.has(f[9])&&parseInt(f[2].split(':').at(-1),16)===pgPort&&f[3]==='01')ports.add(parseInt(f[1].split(':').at(-1),16))
  }
 }
 return ports
}
export function summarizeProcesses(samples,hz){
 const seen=new Map()
 for(const sample of samples)for(const proc of sample.processes){
  const identity=`${proc.pid}:${proc.startTicks}`,entry=seen.get(identity)
  if(!entry)seen.set(identity,{first:proc,last:proc,firstMs:sample.elapsedMs,lastMs:sample.elapsedMs,peak:proc.rssBytes,samples:1,roles:new Set([proc.role])})
  else{entry.last=proc;entry.lastMs=sample.elapsedMs;entry.peak=Math.max(entry.peak??0,proc.rssBytes??0);entry.samples++;entry.roles.add(proc.role)}
 }
 return [...seen.values()].map(({first,last,firstMs,lastMs,peak,samples:count,roles})=>({pid:first.pid,startTicks:first.startTicks,roles:[...roles],firstObservedMs:firstMs,lastObservedMs:lastMs,samples:count,userTicks:last.userTicks-first.userTicks,systemTicks:last.systemTicks-first.systemTicks,userCpuSeconds:(last.userTicks-first.userTicks)/hz,systemCpuSeconds:(last.systemTicks-first.systemTicks)/hz,rssStartBytes:first.rssBytes,rssEndBytes:last.rssBytes,rssSampledPeakBytes:peak,vmHwmLifetimeEndBytes:last.vmHwmLifetimeBytes,ioDelta:first.io&&last.io?numericDeltas(first.io,last.io):null,ioUnavailable:first.ioUnavailable??last.ioUnavailable,coverage:'FIRST_TO_LAST_OBSERVED_SAMPLE; EXIT_TAIL_MAY_BE_MISSING'}))
}
function validateMetadata(metadata){
 assert.ok(metadata&&typeof metadata==='object'&&!Array.isArray(metadata))
 assert.ok(CALLERS.has(metadata.actualCaller),'explicit actualCaller is required')
 assert.ok([1,2].includes(metadata.concurrency??1),'maximum concurrency is two')
 const visit=(value,key='')=>{
  assert.ok(!/(?:password|token|cookie|secret|database.?url|authorization|username|email|^query$|^sql$|^params$)/i.test(key),'secret/SQL metadata is forbidden')
  if(Array.isArray(value)){assert.ok(value.length<=100);value.forEach(x=>visit(x));return}
  if(value&&typeof value==='object'){Object.entries(value).forEach(([k,v])=>visit(v,k));return}
  assert.ok(value===null||['number','boolean','string'].includes(typeof value))
  if(typeof value==='number')assert.ok(Number.isFinite(value))
  if(typeof value==='string')assert.ok(value.length<=300&&!value.includes('://'),'metadata must contain bounded safe labels/hashes, not URLs')
 }
 visit(metadata);return metadata
}

/** Returns fn's original arbitrary value; resource evidence is appended only to
 * result.resourceMeasurements, preserving existing result.measurements/errors.
 * A failed fn is never retried. Failed observer measurement also fails the run.
 */
export async function createEfficiencyObserver({state,status,result={},artifactPrefix='c20-efficiency-resource'}){
 assert.match(artifactPrefix,/^c20-efficiency-[a-z0-9-]+$/)
 assert.equal(process.version,'v24.21.0');assert.equal(process.env.NODE_ENV,'test')
 assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1')
 const directory=path.resolve(state),journal=path.join(directory,`${artifactPrefix}-${process.pid}-private.jsonl`)
 const log=fs.openSync(path.join(directory,`${artifactPrefix}-${process.pid}-observer-private.log`),'wx',0o600)
 const child=fork(filename,['--observer-worker',directory,String(process.pid),journal],{execPath:process.execPath,execArgv:process.execArgv,stdio:['ignore',log,log,'ipc'],env:{...process.env}})
 fs.closeSync(log)
 const pending=new Map();let sequence=0,closed=false,active=false,terminalError=null
 const fail=error=>{terminalError??=error;for(const item of pending.values()){clearTimeout(item.timer);item.reject(error)}pending.clear()}
 child.on('error',fail)
 child.on('exit',(code,signal)=>{if(!closed||pending.size)fail(Object.assign(new Error('Efficiency observer exited before completion'),{code,signal}))})
 child.on('message',message=>{
  if(message.fatal){fail(Object.assign(new Error(message.fatal.message),{name:message.fatal.name}));return}
  const item=pending.get(message.id);if(!item)return
  pending.delete(message.id);clearTimeout(item.timer)
  if(message.ok)item.resolve(message.value);else item.reject(Object.assign(new Error(message.error?.message??'Efficiency observer failed'),{name:message.error?.name??'Error'}))
 })
 const rpc=(command,payload={},timeoutMs=30000)=>new Promise((resolve,reject)=>{
  if(terminalError)return reject(terminalError)
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Efficiency observer command timed out: '+command))},timeoutMs)
  pending.set(id,{resolve,reject,timer});child.send({id,command,...payload},error=>{if(error){clearTimeout(timer);pending.delete(id);reject(error)}})
 })
 try{await rpc('init',{status},30000)}catch(error){closed=true;child.kill('SIGTERM');throw error}
 const measurements=result.resourceMeasurements??=[]
 return {measurements,journalBasename:path.basename(journal),observerPid:child.pid,
  async measure(label,fn,metadata={}){
   assert.equal(closed,false);assert.equal(active,false,'resource windows cannot overlap or nest')
   assert.match(label,/^[a-zA-Z0-9_.:-]{1,160}$/);validateMetadata(metadata)
   active=true;let value,failure,measurementFailure,summary
   try{
    await rpc('begin',{label,metadata});const before={cpu:process.cpuUsage(),memory:process.memoryUsage()},started=performance.now()
    try{value=await fn()}catch(error){failure=error}
    const producer={before,after:{cpu:process.cpuUsage(),memory:process.memoryUsage()},operationElapsedMs:performance.now()-started}
    try{summary=await rpc('end',{producer,outcome:failure?'failed':'completed',errorClass:failure?.name??null});measurements.push(summary)}catch(error){measurementFailure=error}
    if(failure&&measurementFailure)throw new AggregateError([failure,measurementFailure],'Measured operation and resource observation both failed; neither was retried')
    if(failure)throw failure
    if(measurementFailure)throw measurementFailure
    return value
   }finally{active=false}
  },
  async close(){
   if(closed)return
   assert.equal(active,false,'cannot close an active measurement')
   try{await rpc('close');closed=true;child.disconnect();await new Promise((resolve,reject)=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('Observer shutdown exceeded five seconds'))},5000);child.once('exit',()=>{clearTimeout(timer);resolve()})})}
   catch(error){closed=true;child.kill('SIGTERM');throw error}
  },
 }
}

async function workerMain(){
 const [directory,producerString,journal]=process.argv.slice(3),producerPid=Number(producerString)
 assert.ok(Number.isSafeInteger(producerPid)&&producerPid>0)
 assert.equal(path.dirname(journal),directory)
 const fd=fs.openSync(journal,'wx',0o600),write=value=>fs.writeSync(fd,JSON.stringify(value)+'\n')
 const hz=Number(execFileSync('getconf',['CLK_TCK'],{encoding:'utf8'}));assert.ok(hz>0)
 let client,status,pgObserverPid,window=null,pgActivity=[],procTimer,pgTimer,pgPending=null,observerFailure=null,initialized=false
 const queryCost={issued:0,completed:0,failed:0,elapsedMs:0,returnedRows:0}
 const queryCostSnapshot=()=>({...queryCost})
 const pgQuery=async(text,values=[])=>{
  const started=performance.now();queryCost.issued++
  try{const response=await client.query(text,values);queryCost.completed++;queryCost.returnedRows+=response.rows.length;return response}
  catch(error){queryCost.failed++;throw error}
  finally{queryCost.elapsedMs+=performance.now()-started}
 }
 const ownRole=pid=>pid===producerPid?'direct_producer':pid===status.pids.api?'api':pid===status.pids.redis?'redis':pid===process.pid?'observer':pid===status.pids.postgres?'pg_postmaster':null
 const safeQuery=async(text,values=[])=>{
  try{return {available:true,rows:(await pgQuery(text,values)).rows}}
  catch(error){if(['42501','42P01','42703','55000'].includes(error.code))return {available:false,reason:error.code};throw error}
 }
 const snapshot=async()=>{
  await pgQuery('SELECT pg_stat_clear_snapshot()')
  const database=await safeQuery('SELECT xact_commit::float8,xact_rollback::float8,blks_read::float8,blks_hit::float8,tup_returned::float8,tup_fetched::float8,tup_inserted::float8,tup_updated::float8,tup_deleted::float8,temp_files::float8,temp_bytes::float8,deadlocks::float8,blk_read_time,blk_write_time,stats_reset FROM pg_stat_database WHERE datname=current_database()')
  const wal=await safeQuery('SELECT wal_records::float8,wal_fpi::float8,wal_bytes::float8,wal_buffers_full::float8,wal_write::float8,wal_sync::float8,wal_write_time,wal_sync_time,stats_reset FROM pg_stat_wal')
  const sizes=await safeQuery("SELECT c.relname,pg_relation_size(c.oid)::float8 AS heap_bytes,pg_indexes_size(c.oid)::float8 AS index_bytes,pg_total_relation_size(c.oid)::float8 AS total_bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','m') ORDER BY c.relname")
  const databaseSize=await safeQuery('SELECT pg_database_size(current_database())::float8 AS bytes')
  const extension=await safeQuery("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements') AS installed")
  let statements={available:false,reason:'N/A: pg_stat_statements is not installed; no configuration change'}
  if(extension.available&&extension.rows[0]?.installed)statements=await safeQuery('SELECT sum(calls)::float8 AS calls,sum(total_exec_time)::float8 AS total_exec_time_ms,sum(rows)::float8 AS returned_rows FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())')
  return {at:new Date().toISOString(),database,wal,relations:sizes,databaseSize,statements}
 }
 const sampleProc=()=>{
  if(!window)return
  const pidRoles=new Map([[producerPid,'direct_producer'],[status.pids.api,'api'],[status.pids.redis,'redis'],[status.pids.postgres,'pg_postmaster'],[process.pid,'observer']])
  for(const row of pgActivity){
   let role='pg_background'
   if(row.pid===pgObserverPid)role='pg_observer_backend'
   else if(row.backend_type==='client backend')role=row.ownerRole?`pg_${row.ownerRole}_backend`:'pg_unattributed_client_backend'
   pidRoles.set(row.pid,role)
  }
  // Background processes can exist without a pg_stat_activity row.
  const childrenFile=`/proc/${status.pids.postgres}/task/${status.pids.postgres}/children`
  try{for(const pid of fs.readFileSync(childrenFile,'utf8').trim().split(/\s+/).filter(Boolean).map(Number))if(!pidRoles.has(pid))pidRoles.set(pid,'pg_background_unclassified')}catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error}
  const processes=[...pidRoles].flatMap(([pid,role])=>{const proc=procRead(pid,hz);return proc?[{...proc,role:ownRole(pid)??role}]:[]})
  const sample={kind:'proc',windowId:window.id,elapsedMs:performance.now()-window.started,processes};window.proc.push(sample);write(sample)
  for(const proc of processes)if(['api','direct_producer'].includes(proc.role))assert.ok(proc.rssBytes<1024**3,`${proc.role} reached 1GiB RSS stop line`)
 }
 const samplePg=async()=>{
  const owners=[['api',status.pids.api],['direct_producer',producerPid],['observer',process.pid]].map(([role,pid])=>({role,ports:pgClientPorts(pid,status.ports.postgres)}))
  const activity=await safeQuery("SELECT pid,backend_type,client_port,state,wait_event_type,wait_event,application_name FROM pg_stat_activity WHERE datname=current_database() OR backend_type<>'client backend'")
  pgActivity=activity.available?activity.rows.map(row=>({...row,ownerRole:owners.find(owner=>owner.ports.has(row.client_port))?.role??null})):[]
  if(window){const sample={kind:'pg_activity',windowId:window.id,elapsedMs:performance.now()-window.started,available:activity.available,reason:activity.reason,rows:pgActivity};window.pg.push(sample);write(sample)}
 }
 const collectPg=()=>{if(pgPending)return pgPending;pgPending=samplePg().finally(()=>{pgPending=null});return pgPending}
 const failObserver=error=>{observerFailure??=error;write({kind:'observer_error',errorClass:error.name,code:error.code??null});clearInterval(procTimer);clearInterval(pgTimer);fs.writeFileSync(path.join(directory,'stop'),JSON.stringify({source:'efficiency_observer',errorClass:error.name}),{mode:0o600});process.send?.({fatal:{name:error.name,message:'Efficiency observer failed; launcher stop requested; no measured operation is retried'}})}
 const startTimers=()=>{
  procTimer=setInterval(()=>{try{sampleProc()}catch(error){failObserver(error)}},100)
  pgTimer=setInterval(()=>{collectPg().catch(failObserver)},250)
 }
 const stopTimers=async()=>{clearInterval(procTimer);clearInterval(pgTimer);if(pgPending)await pgPending;if(observerFailure)throw observerFailure}
 const handle=async message=>{
  if(message.command==='init'){
   assert.equal(initialized,false);status=message.status
   const runtime=JSON.parse(fs.readFileSync(path.join(directory,'runtime-private.json'),'utf8')),url=new URL(runtime.DATABASE_URL_OWNER)
   assert.equal(url.hostname,'127.0.0.1');assert.equal(Number(url.port),status.ports.postgres);assert.equal(url.username,'eduk12_owner');assert.equal(url.pathname,'/eduk12_recovery')
   const require=createRequire(path.join(backend,'package.json')),{Client}=require('pg')
   client=new Client({connectionString:url.toString(),application_name:'c20_efficiency_observer',connectionTimeoutMillis:3000,query_timeout:8000});await client.connect()
   pgObserverPid=(await pgQuery('SELECT pg_backend_pid() AS pid')).rows[0].pid
   initialized=true;write({kind:'observer_initialized',hz,procIntervalMs:100,pgIntervalMs:250,producerPid,observerPid:process.pid,pgObserverPid});return {observerPid:process.pid,hz}
  }
  assert.ok(initialized)
  if(message.command==='begin'){
   assert.equal(window,null);validateMetadata(message.metadata)
   const observerBefore={queries:queryCostSnapshot(),cpu:process.cpuUsage(),memory:process.memoryUsage()},before=await snapshot();window={id:message.id,label:message.label,metadata:message.metadata,started:performance.now(),startedAt:new Date().toISOString(),before,observerBefore,observerAfterBaselineSnapshot:queryCostSnapshot(),proc:[],pg:[]}
   await collectPg();sampleProc();startTimers();write({kind:'window_begin',windowId:window.id,label:window.label,metadata:window.metadata,before});return {windowId:window.id}
  }
  if(message.command==='end'){
   assert.ok(window);await stopTimers();sampleProc();await collectPg()
   const operationEndMs=performance.now()-window.started,observerAtOperationEnd=queryCostSnapshot(),operationEnd=await snapshot(),observerAfterOperationEndSnapshot=queryCostSnapshot()
   // Separate settle, never added to the producer's measured operation duration.
   await pause(1100);const settledEnd=await snapshot(),observerAfterSettle={queries:queryCostSnapshot(),cpu:process.cpuUsage(),memory:process.memoryUsage()}
   const delta=(before,after)=>before?.available&&after?.available?numericDeltas(before.rows[0],after.rows[0]):null
   const sizes=phase=>Object.fromEntries((phase.relations.rows??[]).map(row=>[row.relname,{heapBytes:row.heap_bytes,indexBytes:row.index_bytes,totalBytes:row.total_bytes}]))
   const relationBefore=sizes(window.before),relationAfter=sizes(settledEnd),growth={}
   for(const [name,bytes]of Object.entries(relationAfter)){const changes=numericDeltas(relationBefore[name]??{heapBytes:0,indexBytes:0,totalBytes:0},bytes);if(Object.values(changes).some(Boolean))growth[name]=changes}
   const summary={label:window.label,metadata:window.metadata,outcome:message.outcome,errorClass:message.errorClass,startedAt:window.startedAt,producerOperationElapsedMs:message.producer.operationElapsedMs,observerOperationEnvelopeMs:operationEndMs,postOperationSettleMs:1100,observerEnvelopeIncludesIpcAndEndpointSampling:true,procIntervalMs:100,pgIntervalMs:250,cpuTickHz:hz,cpuTickSeconds:1/hz,observerCost:{beforeBaseline:window.observerBefore,afterBaselineSnapshot:window.observerAfterBaselineSnapshot,atOperationEnd:observerAtOperationEnd,afterOperationEndSnapshot:observerAfterOperationEndSnapshot,afterSettle:observerAfterSettle,queriesDeltaFullEnvelope:numericDeltas(window.observerBefore.queries,observerAfterSettle.queries),queriesDeltaOperation:numericDeltas(window.observerAfterBaselineSnapshot,observerAtOperationEnd),cpuMicrosecondsFullEnvelope:numericDeltas(window.observerBefore.cpu,observerAfterSettle.cpu),scope:'Explicit observer counters; full envelope includes baseline/end/settle SQL. No subtraction from application or database totals.'},processes:summarizeProcesses(window.proc,hz),producerInProcess:{cpuMicroseconds:numericDeltas(message.producer.before.cpu,message.producer.after.cpu),memoryBefore:message.producer.before.memory,memoryAfter:message.producer.after.memory,scope:'Producer process only; includes its measurement wrappers, never API heap'},pg:{observerBackendPid:pgObserverPid,observerQueriesIncluded:true,before:window.before,operationEnd,settledEnd,databaseDeltaOperationEnd:delta(window.before.database,operationEnd.database),databaseDeltaSettled:delta(window.before.database,settledEnd.database),walDeltaSettled:delta(window.before.wal,settledEnd.wal),databaseAllocatedBytesDelta:delta(window.before.databaseSize,settledEnd.databaseSize),relationAllocatedBytesDelta:growth,activitySamples:window.pg.length,backendAttribution:'OS-owned socket inode -> local TCP client_port -> pg_stat_activity PID; unavailable identities remain unattributed'},rawJournalBasename:path.basename(journal),procSamples:window.proc.length,limitations:LIMITATIONS}
   for(const key of ['database','wal'])if(window.before[key].available&&settledEnd[key].available)assert.equal(String(window.before[key].rows[0].stats_reset),String(settledEnd[key].rows[0].stats_reset),'PG statistics reset during measurement')
   write({kind:'window_end',windowId:window.id,summary});window=null;return summary
  }
  if(message.command==='close'){clearInterval(procTimer);clearInterval(pgTimer);if(pgPending)await pgPending.catch(()=>{});if(window){write({kind:'window_abandoned',windowId:window.id,reason:'FAILED_MEASUREMENT_NOT_RETRIED'});window=null}await client.end();write({kind:'observer_closed'});fs.closeSync(fd);return {closed:true}}
  throw new Error('Unknown efficiency observer command')
 }
 let serial=Promise.resolve()
 process.on('message',message=>{serial=serial.then(async()=>{try{const value=await handle(message);process.send({id:message.id,ok:true,value})}catch(error){process.send({id:message.id,ok:false,error:{name:error.name,message:error.message}})}})})
 process.on('disconnect',()=>{clearInterval(procTimer);clearInterval(pgTimer);client?.end().finally(()=>process.exit(0))})
}
if(process.argv[2]==='--observer-worker')await workerMain()
