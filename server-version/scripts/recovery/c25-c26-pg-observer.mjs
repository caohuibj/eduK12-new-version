/** C26 preparation only; importing constructs no client, process, timer or service.
 * Caller owns an already-authorized dedicated PG connection and /proc reader.
 * query({text, values, statementTimeoutMs, remainingMs, signal, readOnly:true})
 * must execute one autocommit SELECT, honor cancellation and NEVER retry. The
 * connection must already have default_transaction_read_only=on, a positive
 * statement_timeout <=200ms and stats_fetch_consistency=none. Settings are
 * verified in every response; this module does not SET/reset/install anything.
 * A changed PG child set queues one bounded serialized attribution refresh;
 * raw CPU/RSS stays in pending evidence until fresh SQL proves ownership.
 * prepareOwnerClose is asynchronous: await its fresh attribution proof before
 * sending any child cleanup/disconnect permission. It drains existing refreshes.
 * readProc() synchronously returns {processes, sockets, pgChildren}; terminated
 * PG children require terminatedPgChildObservations plus complete
 * enumeratedPgChildIdentities (live + terminated, exact PID/startTicks/PGID/parent).
 * Only a fresh-bound prepared owner's backend may lose its FD or become Z/X;
 * raw live/terminal CPU remains visible and final disappearance is still required.
 * Socket
 * evidence comes from the owner's /proc/PID/fd inode plus net/tcp{,6}, never
 * guessed application_name. pgChildren lists live children; the complete list
 * also includes the explicitly retained terminal PG identities.
 * Before authorizing child prisma.$disconnect/cleanup, await
 * prepareOwnerClose({pid,startTicks}); only its freshly-attributed PG backends
 * may disappear pending a bounded fresh query. The exact prepared worker is
 * sampled while live; its exit before Node's close callback is recorded as a
 * pending missing-owner observation, never zero CPU. PID reuse still stops. The
 * prepare-to-proven-close uses the existing window/aggregate budget unchanged;
 * no boundary can finish before the real terminal/close proof is accepted.
 * Call observer.retireOwner immediately after verified terminal/close/reap,
 * with {pid,startTicks,closeObserved,terminalObserved,groupQuiescent,
 * terminalCpu:{pid,startTicks,user,system}} from the real child terminal sample.
 * Do not retire the registry directly while a window is observing that owner.
 * Only that exact report/export owner's prior PG backends get a bounded fresh
 * retirement check; no missing CPU is synthesized and other missing PIDs stop.
 * cpuUsage returns {pid,user,system}, with real process.cpuUsage microseconds.
 * The default is this observer process; a mismatched PID fails closed.
 */
import assert from 'node:assert/strict'

export const TARGET_DATABASE='eduk12_c25_joint_restore'
export const OBSERVER_INTERVALS=Object.freeze({procMs:100,pgMs:250,settleMs:1100,maxStatementMs:200})
const ROLES=new Set(['api','report_worker','export_worker','driver','observer','redis','pg_postmaster','pg_background'])
const CLIENT_ROLES=new Set(['api','report_worker','export_worker','driver','observer'])
const BACKGROUND_TYPES=new Set(['autovacuum launcher','autovacuum worker','logical replication launcher','background writer','checkpointer','walwriter','archiver','startup'])
const DATABASE_COUNTERS=['xact_commit','xact_rollback','blks_read','blks_hit','tup_returned','tup_fetched','tup_inserted','tup_updated','tup_deleted','temp_files','temp_bytes','deadlocks']
const WAL_COUNTERS=['wal_records','wal_fpi','wal_bytes','wal_buffers_full','wal_write','wal_sync']
const integer=(v,label)=>assert.ok(Number.isSafeInteger(v)&&v>=0,`invalid ${label}`)
const positive=(v,label)=>{integer(v,label);assert.ok(v>0,`missing ${label}`)}
const decimal=(v,label)=>assert.ok(typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v),`invalid exact ${label}`)
const identity=p=>{positive(p.pid,'pid');decimal(p.startTicks,'startTicks');return `${p.pid}:${p.startTicks}`}
const clone=v=>structuredClone(v)
const list=(v,label,max=512)=>{assert.ok(Array.isArray(v)&&v.length<=max,`missing/oversized ${label}`);return v}

/** Live entries cannot change roles or reuse PIDs. Retire after terminal/reap
 * proof, then register a new identity. All former identities remain reserved. */
export function createOwnedPidRegistry(entries=[]){
 const live=new Map(),seen=new Set()
 const api={
  register(entry){
   const id=identity(entry);assert.ok(ROLES.has(entry.role),'unknown owned role')
   assert.ok(!live.has(entry.pid)&&!seen.has(id),'PID/role binding already exists')
   assert.ok(live.size<512,'owned process bound')
   if(CLIENT_ROLES.has(entry.role))assert.match(entry.applicationName,/^c26:[a-z0-9:_-]{1,59}$/,'exact owned application_name required')
   if(['observer','pg_postmaster'].includes(entry.role))assert.ok(![...live.values()].some(x=>x.role===entry.role),'duplicate singleton role')
   const frozen=Object.freeze({...entry});live.set(entry.pid,frozen);seen.add(id);return frozen
  },
  retire({pid,startTicks,closeObserved,terminalObserved,groupQuiescent}){
   const found=live.get(pid);assert.ok(found&&identity(found)===identity({pid,startTicks}),'unknown retirement identity')
   assert.ok(['report_worker','export_worker'].includes(found.role),'only child worker retirement allowed')
   assert.ok(closeObserved===true&&terminalObserved===true&&groupQuiescent===true,'retirement requires terminal and reaping proof');live.delete(pid)
  },
  entries(){return [...live.values()].map(clone)},
 }
 for(const entry of entries)api.register(entry)
 return Object.freeze(api)
}

const envelope=`current_database() AS "databaseName",pg_backend_pid() AS "observerBackendPid",(SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier",pg_postmaster_start_time()::text AS "postmasterStartedAt",inet_server_port() AS "serverPort",current_setting('statement_timeout') AS "statementTimeout",current_setting('transaction_read_only') AS "transactionReadOnly",current_setting('stats_fetch_consistency') AS "statsFetchConsistency"`
const databaseSql=`(SELECT row_to_json(d) FROM (SELECT ${DATABASE_COUNTERS.map(k=>`${k}::text AS ${k}`).join(',')},blk_read_time,blk_write_time,stats_reset::text FROM pg_stat_database WHERE datname=current_database()) d) AS database`
const walSql=`(SELECT row_to_json(w) FROM (SELECT ${WAL_COUNTERS.map(k=>`${k}::text AS ${k}`).join(',')},wal_write_time,wal_sync_time,stats_reset::text FROM pg_stat_wal) w) AS wal`
// Deliberately ALL databases: a second DB on this cluster is not isolation.
const activitySql=`(SELECT coalesce(json_agg(a),'[]'::json) FROM (SELECT pid,datname,backend_type,backend_start::text,host(client_addr) AS client_addr,client_port,state,wait_event_type,wait_event,application_name FROM pg_stat_activity ORDER BY pid LIMIT 513) a) AS activity`
const boundarySql=`(SELECT pg_database_size(current_database())::text) AS "databaseBytes",(SELECT coalesce(json_agg(r),'[]'::json) FROM (SELECT c.oid::text AS oid,n.nspname,c.relname,pg_relation_size(c.oid)::text AS heap_bytes,pg_indexes_size(c.oid)::text AS index_bytes,pg_total_relation_size(c.oid)::text AS total_bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','m') ORDER BY c.oid LIMIT 2049) r) AS relations`
export const PG_OBSERVER_SQL=Object.freeze({
 activity:`SELECT ${envelope},${databaseSql},${walSql},${activitySql}`,
 boundary:`SELECT ${envelope},${databaseSql},${walSql},${activitySql},${boundarySql}`,
 statements:`SELECT ${envelope},(SELECT row_to_json(s) FROM (SELECT coalesce(sum(calls),0)::text AS calls,coalesce(sum(total_exec_time),0)::float8 AS total_exec_time_ms,coalesce(sum(rows),0)::text AS returned_rows FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())) s) AS statements`,
})

function timeoutMs(value){
 const match=typeof value==='string'&&value.match(/^(\d+(?:\.\d+)?)\s*(ms|s|min)?$/)
 assert.ok(match,'unreadable server statement_timeout')
 const result=Number(match[1])*({ms:1,s:1000,min:60000}[match[2]??'ms']);assert.ok(result>0&&Number.isFinite(result),'unbounded server statement_timeout');return result
}
function validateIdentity(row,target,budget){
 assert.equal(row.databaseName,TARGET_DATABASE,'wrong observer database')
 assert.equal(row.observerBackendPid,target.observerBackendPid,'observer backend PID changed')
 assert.equal(row.systemIdentifier,target.systemIdentifier,'wrong physical PG cluster')
 assert.equal(row.postmasterStartedAt,target.postmasterStartedAt,'postmaster restarted')
 assert.equal(row.serverPort,target.port,'wrong PG port')
 assert.equal(row.transactionReadOnly,'on','observer connection is not read-only')
 assert.equal(row.statsFetchConsistency,'none','stats snapshot cache is not disabled')
 assert.ok(timeoutMs(row.statementTimeout)<=budget,'server statement_timeout exceeds remaining query budget')
}
function validateStats(row,previous){
 for(const [section,keys,times]of [['database',DATABASE_COUNTERS,['blk_read_time','blk_write_time']],['wal',WAL_COUNTERS,['wal_write_time','wal_sync_time']]]){
  const stats=row[section];assert.ok(stats&&typeof stats==='object',`missing required ${section} stats`)
  assert.ok(stats.stats_reset===null||(typeof stats.stats_reset==='string'&&stats.stats_reset.length>0),'missing stats_reset')
  if(previous)assert.equal(stats.stats_reset,previous[section].stats_reset,`${section} stats_reset changed`)
  for(const key of keys){decimal(stats[key],`${section}.${key}`);if(previous)assert.ok(BigInt(stats[key])>=BigInt(previous[section][key]),`${section}.${key} counter went backwards`)}
  for(const key of times){assert.ok(Number.isFinite(stats[key])&&stats[key]>=0,`missing ${section}.${key}`);if(previous)assert.ok(stats[key]>=previous[section][key],`${section}.${key} counter went backwards`)}
 }
}
function processMap(frame,registry){
 const map=new Map()
 for(const p of list(frame.processes,'proc samples')){
  const id=identity(p);assert.ok(!map.has(p.pid),'duplicate process PID')
  assert.match(p.state,/^[RSDTtKWPI]$/,'unknown/dead process state')
  for(const key of ['parentPid','userTicks','systemTicks','rssBytes','vmHwmLifetimeBytes'])integer(p[key],key)
  assert.ok(p.vmHwmLifetimeBytes>=p.rssBytes,'VmHWM smaller than RSS');map.set(p.pid,{...p,identity:id})
 }
 for(const owned of registry.entries()){assert.equal(map.get(owned.pid)?.identity,identity(owned),'owned process missing or PID reused');if(owned.role==='api')assert.ok(map.get(owned.pid).rssBytes<1024**3,'API reached 1GiB RSS stop line')}
 return map
}

/** Requires both an exact application label and a real owner socket. Observer
 * clients are tagged/excluded from businessActive, never from raw PG totals. */
export function attributeActivity(rows,frame,registry,target){
 const processes=processMap(frame,registry),owners=registry.entries(),postmaster=owners.find(p=>p.role==='pg_postmaster')
 assert.ok(postmaster,'missing owned postmaster');assert.ok(owners.some(p=>p.role==='observer'),'missing observer process')
 const childIds=new Set(list(frame.pgChildren,'complete PG children').map(identity))
 assert.equal(childIds.size,frame.pgChildren.length,'duplicate PG child')
 for(const child of frame.pgChildren){assert.equal(processes.get(child.pid)?.identity,identity(child),'unobserved PG child');assert.equal(processes.get(child.pid).parentPid,postmaster.pid,'PG child not owned by postmaster')}
 const sockets=list(frame.sockets,'socket mapping',2048),seenPids=new Set(),seenEndpoints=new Set(),result=[]
 for(const row of list(rows,'cluster activity')){
  positive(row.pid,'backend PID');assert.ok(!seenPids.has(row.pid),'duplicate backend');seenPids.add(row.pid)
  const proc=processes.get(row.pid);assert.ok(proc&&childIds.has(proc.identity),'PG backend CPU identity missing');if(row.startTicks!==undefined)assert.equal(proc.startTicks,row.startTicks,'PG backend PID reused between samples')
  assert.ok(typeof row.backend_start==='string'&&row.backend_start.length>0,'unknown backend start')
  let role,ownerIdentity=null,ownerRole=null
  if(row.backend_type==='client backend'){
   assert.equal(row.datname,TARGET_DATABASE,'foreign database connection on shared cluster')
   assert.ok(['active','idle','idle in transaction','idle in transaction (aborted)','fastpath function call','disabled'].includes(row.state),'unknown/null backend state')
   assert.ok(row.state!=='disabled','backend tracking disabled')
   positive(row.client_port,'TCP client port');assert.ok(row.client_port<=65535,'invalid client port')
   const endpoint=`${row.client_addr}:${row.client_port}`;assert.ok(!seenEndpoints.has(endpoint),'duplicate backend socket endpoint');seenEndpoints.add(endpoint)
   assert.ok(['127.0.0.1','::1'].includes(row.client_addr),'non-loopback PG client')
   const socketOwners=sockets.filter(socket=>{
    if(socket.localPort!==row.client_port||socket.remotePort!==target.port||socket.localAddress!==row.client_addr||!['127.0.0.1','::1'].includes(socket.remoteAddress))return false
    identity({pid:socket.ownerPid,startTicks:socket.ownerStartTicks});decimal(socket.inode,'socket inode');assert.notEqual(socket.inode,'0','missing socket inode');integer(socket.ownerFd,'socket fd')
    assert.equal(socket.state,'ESTABLISHED','unknown socket state');return true
   })
   const ownerIds=new Set(socketOwners.map(socket=>`${socket.ownerPid}:${socket.ownerStartTicks}`))
   assert.equal(ownerIds.size,1,'unknown or ambiguous backend socket ownership')
   const owner=owners.find(candidate=>identity(candidate)===[...ownerIds][0])
   assert.ok(owner&&CLIENT_ROLES.has(owner.role)&&owner.applicationName===row.application_name,'unknown or ambiguous backend socket ownership')
   ownerIdentity=identity(owner);ownerRole=owner.role
   if(row.pid===target.observerBackendPid)assert.equal(owner.role,'observer','observer backend/socket PID mismatch')
   if(owner.role==='observer')assert.equal(row.pid,target.observerBackendPid,'unexpected additional observer connection')
   role=owner.role==='api'?'pg_api_backend':owner.role==='observer'?'pg_observer_backend':'pg_worker_backend'
  }else{
   assert.ok(BACKGROUND_TYPES.has(row.backend_type),'unknown PG backend type')
   assert.ok(row.datname===null||row.datname===TARGET_DATABASE,'foreign database background activity')
   role='pg_background'
  }
  result.push({...row,startTicks:proc.startTicks,role,ownerIdentity,ownerRole,isObserver:role==='pg_observer_backend'})
 }
 assert.ok(result.some(row=>row.pid===target.observerBackendPid&&row.isObserver),'observer missing from activity')
 for(const child of frame.pgChildren)assert.ok(seenPids.has(child.pid)||owners.some(owner=>identity(owner)===identity(child)&&owner.role==='pg_background'),'unknown PG child process')
 for(const p of processes.values())assert.ok(owners.some(owner=>identity(owner)===p.identity)||childIds.has(p.identity),'unknown process in proc scope')
 return {rows:result,businessActive:result.filter(row=>row.backend_type==='client backend'&&!row.isObserver&&row.state==='active'),observerActive:result.filter(row=>row.isObserver&&row.state==='active')}
}

/** One instance = one before/end/settled window, <=90 seconds including settle.
 * onStop must stop the owner workload; it is invoked once on any observation
 * failure. stop() itself neither closes the injected DB nor kills any process.
 * A boundary serializes behind a pending periodic read. Scheduled PG ticks
 * covered by boundary collection are counted separately, never run in parallel.
 * Evidence is streamed via record; limit is per instance and must also be
 * enforced by the aggregate caller. No raw SQL, params or credentials emitted. */
export function createPgObserver({query,readProc,registry,target,remainingMs,record,onStop,now=()=>performance.now(),cpuUsage=()=>({pid:process.pid,...process.cpuUsage()}),timers=globalThis,maxWindowMs=90_000,maxEvidenceBytes=8*1024**2,pgStatStatements}){
 for(const value of [query,readProc,remainingMs,record,onStop,now,cpuUsage])assert.equal(typeof value,'function','required injected observer function')
 assert.equal(target.database,TARGET_DATABASE);decimal(target.systemIdentifier,'system identifier');decimal(target.primarySystemIdentifier,'primary system identifier')
 assert.ok(typeof target.primaryDatabase==='string'&&target.primaryDatabase!==TARGET_DATABASE,'explicit distinct primary database required')
 assert.ok(typeof target.postmasterStartedAt==='string'&&target.postmasterStartedAt.length>0)
 positive(target.observerBackendPid,'expected observer backend PID');positive(target.port,'PG port')
 assert.ok(Number.isSafeInteger(maxWindowMs)&&maxWindowMs>1100&&maxWindowMs<=90_000,'window budget exceeds 90 seconds')
 assert.ok(Number.isSafeInteger(maxEvidenceBytes)&&maxEvidenceBytes>0&&maxEvidenceBytes<=8*1024**2,'evidence bound')
 assert.ok(pgStatStatements&&['unsupported','required'].includes(pgStatStatements.mode),'explicit pg_stat_statements policy')
 if(pgStatStatements.mode==='unsupported')assert.match(pgStatStatements.reason,/^[A-Z0-9_]{1,100}$/)
 target=Object.freeze({...target})
 const observerProcess=registry.entries().find(entry=>entry.role==='observer');assert.ok(observerProcess,'missing observer process identity')
 let phase='new',failure=null,started,lastNow=-Infinity,procTimer,pgTimer,deadlineTimer,inFlight=null,collectionPending=null,currentCollection=null,boundaryPending=false,retirementPending=null,closureRefresh=null,attributionPending=null,attributionRefresh=null,refreshTail=null,controller=null,previousStats=null,activity=null,frame=null,evidenceBytes=0,endAt=null,cpuBefore=null
 const snapshots={},cost={issued:0,completed:0,failed:0,queryElapsedMs:0,returnedRows:0,procSamples:0,pgSamples:0,boundaryCoveredPgTicks:0,retirementCoveredPgTicks:0,retirementRefreshes:0,attributionRefreshes:0,attributionCoveredPgTicks:0,closePreparationRefreshes:0},bindings=new Map(),backendPids=new Map(),procCounters=new Map(),retirements=[],attributionResolutions=[],terminatedPgHistory=new Map()
 const clock=()=>{const value=now();assert.ok(Number.isFinite(value)&&value>=lastNow,'observer clock went backwards');lastNow=value;return value}
 const clear=()=>{for(const timer of [procTimer,pgTimer])if(timer!==undefined)timers.clearInterval(timer);if(deadlineTimer!==undefined)timers.clearTimeout(deadlineTimer)}
 const fail=error=>{if(!failure){failure=error;phase='failed';clear();controller?.abort();try{onStop(error)}catch(stopError){failure=new AggregateError([error,stopError],'observer and stop callback failed')}}return failure}
 const healthy=()=>{if(failure)throw failure;assert.ok(!['closed','settled'].includes(phase),'observer already closed')}
 const budget=()=>{const external=remainingMs();assert.ok(Number.isFinite(external)&&external>0,'aggregate deadline exhausted');const local=maxWindowMs-(clock()-started);assert.ok(local>0,'observer window deadline exhausted');return Math.min(external,local)}
 const emit=value=>{const bytes=Buffer.byteLength(JSON.stringify(value)+'\n');assert.ok(evidenceBytes+bytes<=maxEvidenceBytes,'observer evidence budget exhausted');record(clone(value));evidenceBytes+=bytes}
 const registryForFrame=next=>{
  if(!retirementPending?.prepared)return registry
  const owner=registry.entries().find(p=>identity(p)===retirementPending.ownerIdentity)
  assert.ok(owner&&['report_worker','export_worker'].includes(owner.role),'prepared owner identity lost')
  const live=next.processes.find(p=>p.pid===owner.pid)
  if(live){assert.equal(identity(live),identity(owner),'prepared owner PID reused');return registry}
  // Only an explicitly prepared exact owner may be temporarily absent. It is
  // still in the real registry, and genuine terminal/close/reap proof remains
  // mandatory before a boundary or the original deadline can complete.
  return {entries:()=>registry.entries().filter(p=>identity(p)!==identity(owner))}
 }
 const validatePgTerminations=next=>{
  const terminated=list(next.terminatedPgChildObservations??[],'terminated PG children'),all=next.enumeratedPgChildIdentities
  const terminalPids=new Set(),postmaster=registry.entries().find(p=>p.role==='pg_postmaster')
  for(const p of terminated){
   const id=identity(p);assert.ok(!terminalPids.has(p.pid),'duplicate terminated PG child');terminalPids.add(p.pid)
   const candidate=retirementPending?.prepared&&retirementPending.backends.find(b=>identity(b)===id),bound=retirementPending?.backendProcesses?.find(b=>identity(b)===id)
   assert.ok(candidate&&bound,'unknown or unprepared terminated PG child');assert.match(p.state,/^[ZXx]$/,'invalid terminated PG child state')
   assert.equal(p.parentPid,postmaster?.pid,'terminated PG child parent mismatch');assert.equal(p.parentPid,bound.parentPid,'terminated PG child parent changed');positive(bound.processGroupId,'prepared PG process group');assert.equal(p.processGroupId,bound.processGroupId,'terminated PG child process group changed')
   assert.ok(!next.processes.some(live=>live.pid===p.pid)&&!next.pgChildren.some(live=>live.pid===p.pid),'terminated PG child also marked live')
   assert.ok(p.rssBytes===undefined&&p.vmHwmLifetimeBytes===undefined,'terminated PG RSS cannot be synthesized')
   const before=terminatedPgHistory.get(id)??procCounters.get(id);assert.ok(before,'terminated PG child has no observed CPU baseline')
   for(const key of ['userTicks','systemTicks']){integer(p[key],`terminated ${key}`);assert.ok(p[key]>=before[key],'terminated PG CPU counter went backwards')}
   terminatedPgHistory.set(id,{...clone(p),observedElapsedMs:clock()-started})
  }
  for(const live of next.pgChildren)assert.ok(!terminatedPgHistory.has(identity(live)),'terminated PG child reappeared live')
  if(terminated.length||all!==undefined){
   const complete=list(all,'enumerated PG children'),seen=new Set(),expected=[...next.pgChildren,...terminated]
   assert.equal(complete.length,expected.length,'incomplete live plus terminated PG child enumeration')
   for(const p of complete){const id=identity(p);assert.ok(!seen.has(p.pid),'duplicate enumerated PG child');seen.add(p.pid);const actual=expected.find(item=>identity(item)===id);assert.ok(actual,'unknown enumerated PG child');const proc=terminalPids.has(p.pid)?actual:next.processes.find(item=>identity(item)===id);assert.ok(proc,'enumerated PG child CPU identity missing');assert.equal(p.parentPid,postmaster?.pid,'enumerated PG parent mismatch');assert.equal(p.parentPid,proc.parentPid);positive(proc.processGroupId,'PG process group');assert.equal(p.processGroupId,proc.processGroupId,'enumerated PG process group mismatch')}
  }
 }
 const closingSocketLoss=(candidate,next)=>{
  const originals=retirementPending.preparedSockets.filter(socket=>socket.localPort===candidate.client_port&&socket.localAddress===candidate.client_addr)
  assert.ok(originals.length,'missing prepared socket binding')
  if(next.sockets.some(socket=>originals.some(old=>['ownerPid','ownerStartTicks','ownerFd','inode','localPort','localAddress','remotePort','remoteAddress'].every(key=>socket[key]===old[key]))&&socket.state==='ESTABLISHED')){assert.ok(!retirementPending.socketLossAt.has(identity(candidate)),'prepared closing socket reappeared established');return false}
  const inventory=next.socketInventory??next.sockets
  for(const socket of list(inventory,'socket inventory',2048)){
   const endpoint=socket.localPort===candidate.client_port&&socket.localAddress===candidate.client_addr
   const oldFd=originals.some(old=>socket.ownerPid===old.ownerPid&&socket.ownerFd===old.ownerFd)
   const oldInode=originals.some(old=>socket.inode===old.inode)
   if(!endpoint&&!oldFd&&!oldInode)continue
   const exact=originals.some(old=>['ownerPid','ownerStartTicks','ownerFd','inode','localPort','localAddress','remotePort','remoteAddress'].every(key=>socket[key]===old[key]))
   assert.ok(exact,'prepared closing socket identity/endpoint changed')
   if(socket.protocol!==undefined)assert.equal(socket.protocol,'tcp','prepared socket protocol changed')
   for(const key of ['family','ownerProcessGroupId']){const old=originals.find(old=>old.ownerFd===socket.ownerFd&&old.inode===socket.inode);if(old[key]!==undefined)assert.equal(socket[key],old[key],`prepared socket ${key} changed`)}
   assert.ok(['ESTABLISHED','FIN_WAIT1','FIN_WAIT2','CLOSE_WAIT','LAST_ACK','CLOSING','TIME_WAIT','CLOSE'].includes(socket.state),'invalid prepared closing socket state')
  }
  return true
 }
 const closingState=(candidate,next)=>next.terminatedPgChildObservations?.some(p=>identity(p)===identity(candidate))?'TERMINATED':!next.processes.some(p=>p.pid===candidate.pid)?'ABSENT':closingSocketLoss(candidate,next)?'SOCKET_CLOSING':'LIVE'
 const attributeCurrent=(rows,next,{verifyRetirement=false,verifyClosureProgress=false}={})=>{
  if(!retirementPending)return attributeActivity(rows,next,registry,target)
  assert.equal(new Set(list(rows,'cluster activity').map(row=>row.pid)).size,rows.length,'duplicate backend')
  const candidates=retirementPending.backends,excluded=new Set(),closingRows=[]
  for(const candidate of candidates){
   const id=identity(candidate),live=next.processes.find(p=>p.pid===candidate.pid),child=next.pgChildren.find(p=>p.pid===candidate.pid),row=rows.find(p=>p.pid===candidate.pid),terminal=next.terminatedPgChildObservations?.find(p=>p.pid===candidate.pid)
   if(live)assert.equal(live.startTicks,candidate.startTicks,'retiring PG backend PID reused')
   if(child)assert.equal(child.startTicks,candidate.startTicks,'retiring PG child PID reused')
   if(row){for(const key of ['backend_start','application_name','client_port','client_addr','datname','backend_type'])assert.equal(row[key],candidate[key],'retiring backend identity changed');assert.ok(['active','idle','idle in transaction','idle in transaction (aborted)','fastpath function call'].includes(row.state),'unknown retiring backend state')}
   if(verifyRetirement||retirementPending.closedAt.has(id)){
    assert.ok(!row&&!live&&!child&&!terminal,'retired owner backend did not disappear in fresh PG/proc snapshot');excluded.add(candidate.pid)
    if(verifyRetirement&&!retirementPending.closedAt.has(id))retirementPending.closedAt.set(id,clock()-started)
   }else if(terminal){excluded.add(candidate.pid);if(verifyClosureProgress)retirementPending.closureVerifiedStates.set(id,'TERMINATED')}
   else if(!live&&!child){
    excluded.add(candidate.pid)
    if(verifyClosureProgress){assert.ok(!row,'inconsistent fresh partial-close PG/proc snapshot');retirementPending.closedAt.set(id,clock()-started);retirementPending.closureVerifiedStates.set(id,'ABSENT')}
   }else{
    assert.ok(live&&child&&row,'inconsistent fresh partial-close PG/proc snapshot')
    if(retirementPending.prepared&&closingSocketLoss(candidate,next)){
     const bound=retirementPending.backendProcesses.find(p=>identity(p)===id);assert.ok(bound,'missing prepared backend process binding');assert.equal(live.parentPid,bound.parentPid,'closing backend parent changed');positive(bound.processGroupId,'prepared PG process group');assert.equal(live.processGroupId,bound.processGroupId,'closing backend process group changed')
     excluded.add(candidate.pid);closingRows.push({...row,startTicks:live.startTicks,role:candidate.role,ownerIdentity:candidate.ownerIdentity,ownerRole:candidate.ownerRole,isObserver:false,connectionAttribution:'PREPARED_CLOSE_SOCKET_LOSS'})
     if(!retirementPending.socketLossAt.has(id))retirementPending.socketLossAt.set(id,clock()-started)
     if(verifyClosureProgress)retirementPending.closureVerifiedStates.set(id,'SOCKET_CLOSING')
    }
   }
  }
  // Only exact prepared closing backends bypass a now-absent client FD. Their
  // actual live CPU rows remain in raw proc evidence; no synthetic socket exists.
  const result=attributeActivity(rows.filter(p=>!excluded.has(p.pid)),{...next,processes:next.processes.filter(p=>!excluded.has(p.pid)),pgChildren:next.pgChildren.filter(p=>!excluded.has(p.pid))},registryForFrame(next),target)
  result.rows.push(...closingRows);result.rows.sort((a,b)=>a.pid-b.pid);result.businessActive=result.rows.filter(row=>row.backend_type==='client backend'&&!row.isObserver&&row.state==='active');return result
 }
 const addedPgChildren=next=>{
  const owned=registry.entries(),postmaster=owned.find(p=>p.role==='pg_postmaster'),seen=new Set(),added=[]
  assert.ok(postmaster,'missing owned postmaster')
  for(const child of list(next.pgChildren,'complete PG children')){
   const id=identity(child);assert.ok(!seen.has(child.pid),'duplicate PG child PID');seen.add(child.pid)
   const proc=next.processes.find(p=>p.pid===child.pid);assert.ok(proc&&identity(proc)===id,'unobserved PG child');assert.equal(proc.parentPid,postmaster.pid,'PG child not owned by postmaster')
   assert.ok(!backendPids.has(child.pid)||backendPids.get(child.pid)===child.startTicks,'PG backend PID reused between samples')
   if(!activity?.rows.some(p=>identity(p)===id)&&!owned.some(p=>p.role==='pg_background'&&identity(p)===id)&&!retirementPending?.backends.some(p=>identity(p)===id))added.push({...child})
  }
  return added
 }
 const attributeCached=(rows,next,options={})=>{
  if(!attributionPending||options.verifyAttribution)return attributeCurrent(rows,next,options)
  const pending=new Set(attributionPending.children.map(identity))
  return attributeCurrent(rows.filter(p=>!attributionPending.children.some(child=>child.pid===p.pid)),{...next,processes:next.processes.filter(p=>!pending.has(identity(p))),pgChildren:next.pgChildren.filter(p=>!pending.has(identity(p)))},options)
 }
 const rememberPendingChildren=children=>{
  if(!children.length)return
  if(!attributionPending)attributionPending={children:[],startedAt:clock()}
  for(const child of children){const old=attributionPending.children.find(p=>p.pid===child.pid);if(old)assert.equal(identity(old),identity(child),'pending PG child PID reused');else{assert.ok(attributionPending.children.length<512,'pending attribution bound');attributionPending.children.push(child)}}
  if(!attributionRefresh)queueAttributionRefresh()
 }
 const sampleProc=()=>{
  healthy();budget();const next=readProc();assert.ok(next&&!next.then,'proc reader must be synchronous');processMap(next,registryForFrame(next));validatePgTerminations(next)
  for(const proc of next.processes){const key=identity(proc),old=procCounters.get(key);if(old)for(const field of ['userTicks','systemTicks','vmHwmLifetimeBytes'])assert.ok(proc[field]>=old[field],`process ${field} counter went backwards`);procCounters.set(key,{...clone(proc),observedElapsedMs:clock()-started})}
  if(activity){
   rememberPendingChildren(addedPgChildren(next))
   attributeCached(activity.rows,next)
  }
  if(retirementPending?.prepared&&!closureRefresh&&retirementPending.backends.some(p=>!retirementPending.closedAt.has(identity(p))&&closingState(p,next)!=='LIVE'&&retirementPending.closureVerifiedStates.get(identity(p))!==closingState(p,next)))queueClosureRefresh()
  frame=clone(next);cost.procSamples++;const owned=registry.entries();const processes=frame.processes.map(p=>({...p,role:owned.find(o=>identity(o)===identity(p))?.role??activity?.rows.find(a=>a.pid===p.pid&&a.startTicks===p.startTicks)?.role??retirementPending?.backends.find(a=>a.pid===p.pid&&a.startTicks===p.startTicks)?.role??null,attribution:attributionPending?.children.some(child=>identity(child)===identity(p))?'PENDING_FRESH_PG':'VERIFIED'}));assert.ok(processes.every(p=>p.role||p.attribution==='PENDING_FRESH_PG'),'unknown process role');emit({kind:'proc',elapsedMs:clock()-started,processes,retiringOwnerIdentity:retirementPending?.ownerIdentity??null,missingOwnerIdentities:retirementPending?.prepared&&!frame.processes.some(p=>identity(p)===retirementPending.ownerIdentity)?[retirementPending.ownerIdentity]:[],missingOwnerProofPolicy:'EXACT_PREPARED_OWNER_ONLY; REAL_TERMINAL_CLOSE_REAP_STILL_REQUIRED',missingBackendIdentities:(retirementPending?.backends??[]).filter(p=>!frame.processes.some(live=>live.pid===p.pid)).map(identity),pendingPgChildIdentities:(attributionPending?.children??[]).map(identity),terminatedPgChildObservations:clone(next.terminatedPgChildObservations??[]),enumeratedPgChildIdentities:clone(next.enumeratedPgChildIdentities??null),preparedSocketLosses:[...(retirementPending?.socketLossAt??new Map())].map(([identity,observedAtMs])=>({identity,observedAtMs})),missingCpuPolicy:'NOT_OBSERVED; NEVER_IMPUTE_ZERO'});return frame
 }
 const sql=async kind=>{
  healthy();assert.equal(inFlight,null,'overlapping PG query')
  const left=budget(),limit=Math.floor(Math.min(OBSERVER_INTERVALS.maxStatementMs,left));assert.ok(limit>0,'no bounded SQL budget')
  const begin=clock();controller=new AbortController();cost.issued++;let watchdog
  const signal=controller.signal
  const pending=Promise.resolve().then(()=>{healthy();assert.ok(!signal.aborted,'query cancelled before dispatch');return query({text:PG_OBSERVER_SQL[kind],values:[],statementTimeoutMs:limit,remainingMs:left,signal,readOnly:true})})
  const bounded=Promise.race([pending,new Promise((_,reject)=>{watchdog=timers.setTimeout(()=>{controller?.abort();reject(new Error('PG query deadline exceeded'))},limit)})])
  inFlight=bounded
  try{
   const response=await bounded
   healthy();assert.ok(clock()-begin<=limit,'PG query exceeded bounded deadline');assert.equal(response?.rows?.length,1,'missing/ambiguous PG response')
   const row=response.rows[0];validateIdentity(row,target,limit);cost.completed++;cost.returnedRows+=response.rows.length;return row
  }catch(error){cost.failed++;throw fail(error)}finally{timers.clearTimeout(watchdog);cost.queryElapsedMs+=clock()-begin;inFlight=null;controller=null}
 }
 const collectNow=async(boundary,{verifyRetirement=false,verifyClosureProgress=false,verifyAttribution=false}={})=>{
  const row=await sql(boundary?'boundary':'activity');validateStats(row,previousStats);previousStats=clone(row)
  const next=readProc();validatePgTerminations(next);if(activity&&!verifyAttribution)rememberPendingChildren(addedPgChildren(next).filter(child=>!row.activity.some(row=>row.pid===child.pid)))
  const observed=attributeCached(row.activity,next,{verifyRetirement,verifyClosureProgress,verifyAttribution})
  for(const backend of observed.rows){assert.ok(!backendPids.has(backend.pid)||backendPids.get(backend.pid)===backend.startTicks,'PG backend PID reused across snapshots');backendPids.set(backend.pid,backend.startTicks);const key=`${backend.pid}:${backend.startTicks}`,binding=JSON.stringify([backend.backend_start,backend.role,backend.ownerIdentity,backend.application_name]);assert.ok(!bindings.has(key)||bindings.get(key)===binding,'backend role/owner binding changed');bindings.set(key,binding)}
  activity=observed;sampleProc();cost.pgSamples++
  if(boundary){decimal(row.databaseBytes,'database allocated bytes');for(const relation of list(row.relations,'relation sizes',2048)){decimal(relation.oid,'relation oid');for(const key of ['heap_bytes','index_bytes','total_bytes'])decimal(relation[key],key)}}
  const value={elapsedMs:clock()-started,...row,activity:observed,pendingPgChildIdentities:verifyAttribution?[]:(attributionPending?.children??[]).map(identity),retiringBackends:row.activity.filter(p=>retirementPending?.backends.some(candidate=>candidate.pid===p.pid)),walScope:'PHYSICAL_CLUSTER_INCLUDING_OBSERVER_AND_BACKGROUND'}
  emit({kind:boundary?'pg_boundary':'pg_activity',...value});return value
 }
 // Track the complete SQL + proc + attribution collection, including direct
 // boundaries. A refresh discovered by a 100ms tick waits for this whole unit.
 const serializeCollection=task=>{
  const before=currentCollection
  const pending=Promise.resolve().then(async()=>{if(before)await before;healthy();return task()})
  const tracked=pending.finally(()=>{if(currentCollection===tracked)currentCollection=null})
  currentCollection=tracked;return tracked
 }
 const collect=(boundary,options)=>serializeCollection(()=>collectNow(boundary,options))
 const enqueueRefresh=task=>{
  const before=refreshTail
  const job=Promise.resolve().then(async()=>{if(before)await before;if(currentCollection)await currentCollection;healthy();return task()})
  refreshTail=job.catch(()=>{});return job
 }
 const drainRefreshes=async()=>{while(attributionRefresh||closureRefresh){const current=refreshTail;assert.ok(current,'missing refresh queue');await current;healthy()}}
 const queueAttributionRefresh=()=>{
  assert.ok(attributionPending&&!attributionRefresh,'unexpected attribution refresh')
  attributionRefresh=enqueueRefresh(async()=>{
   await collect(false,{verifyAttribution:true})
   const bindings=attributionPending.children.map(child=>{
    const row=activity.rows.find(p=>identity(p)===identity(child)),owned=registry.entries().find(p=>identity(p)===identity(child)&&p.role==='pg_background')
    assert.ok(row||owned,'new PG child disappeared before attribution could be verified')
    return {identity:identity(child),role:row?.role??owned.role,ownerIdentity:row?.ownerIdentity??null}
   })
   cost.attributionRefreshes++;const resolution={bindings,verifiedAtMs:clock()-started,refreshElapsedMs:clock()-attributionPending.startedAt,cpuPolicy:'RAW_PENDING_SAMPLES_PRESERVED; NEVER_IMPUTE_ZERO'};attributionResolutions.push(resolution);emit({kind:'pg_attribution_verified',...resolution});attributionPending=null
  }).catch(fail).finally(()=>{attributionRefresh=null})
 }
 const queueClosureRefresh=()=>{
  const pending=retirementPending;assert.ok(pending?.prepared&&!closureRefresh,'unexpected closure refresh')
  closureRefresh=enqueueRefresh(async()=>{
   await collect(false,{verifyClosureProgress:true});cost.retirementRefreshes++
   emit({kind:'prepared_backend_close_verified',ownerIdentity:pending.ownerIdentity,closedBackendIdentities:[...pending.closedAt.keys()],remainingBackendIdentities:pending.backends.filter(p=>!pending.closedAt.has(identity(p))).map(identity),terminalProofStillRequired:true,backendCpuExitTail:'NOT_OBSERVED; NEVER_IMPUTE_ZERO'})
  }).catch(fail).finally(()=>{closureRefresh=null})
 }
 const guarded=async fn=>{try{return await fn()}catch(error){throw fail(error)}}
 const periodic=fn=>{if(failure)return;try{healthy();if(attributionRefresh){cost.attributionCoveredPgTicks++;return}if(retirementPending&&(!retirementPending.prepared||closureRefresh)){cost.retirementCoveredPgTicks++;return}if(boundaryPending){cost.boundaryCoveredPgTicks++;return}if(inFlight||collectionPending)throw new Error('periodic PG sample overrun; no overlapping query');collectionPending=Promise.resolve(fn()).catch(fail).finally(()=>{collectionPending=null})}catch(error){fail(error)}}
 const costSnapshot=()=>{const cpu=cpuUsage();assert.equal(cpu.pid,observerProcess.pid,'observer CPU source PID mismatch');for(const key of ['user','system']){integer(cpu[key],`observer CPU ${key}`);assert.ok(cpu[key]>=cpuBefore[key],'observer CPU counter went backwards')}return {...cost,observerProcessIdentity:identity(observerProcess),cpuMicroseconds:{user:cpu.user-cpuBefore.user,system:cpu.system-cpuBefore.system},scope:'OBSERVER_PROCESS_AND_OWN_QUERY_EVENTS; NEVER_SUBTRACT_FROM_RAW_BUSINESS_OR_DATABASE_TOTALS'}}
 return Object.freeze({
  begin:()=>guarded(async()=>{
   assert.equal(phase,'new','observer cannot restart/retry');phase='starting';started=clock();cpuBefore=cpuUsage();assert.equal(cpuBefore.pid,observerProcess.pid,'observer CPU source PID mismatch');for(const key of ['user','system'])integer(cpuBefore[key],`observer CPU ${key}`)
   snapshots.before=await collect(true);phase='running'
   emit({kind:'cluster_scope',primaryDatabase:target.primaryDatabase,restoreDatabase:TARGET_DATABASE,samePhysicalCluster:target.primarySystemIdentifier===target.systemIdentifier,scope:'WAL_AND_PG_BACKGROUND_ARE_CLUSTER_WIDE'})
   procTimer=timers.setInterval(()=>{try{sampleProc()}catch(error){fail(error)}},100)
   pgTimer=timers.setInterval(()=>periodic(()=>collect(false)),250)
   deadlineTimer=timers.setTimeout(()=>fail(new Error('observer aggregate/window deadline exhausted')),Math.min(budget(),maxWindowMs))
   return clone(snapshots.before)
  }),
  operationEnd:()=>guarded(async()=>{
   healthy();assert.equal(phase,'running','operation end out of order');assert.ok(!boundaryPending&&!retirementPending,'await owner retirement refresh before operation boundary; preparation must also finish')
   phase='ending';boundaryPending=true;endAt=clock();if(collectionPending)await collectionPending;await drainRefreshes();healthy();snapshots.operationEnd=await collect(true);await drainRefreshes();phase='settling';boundaryPending=false;return clone(snapshots.operationEnd)
  }),
  settledEnd:()=>guarded(async()=>{
   healthy();assert.equal(phase,'settling','settled end out of order');assert.ok(!boundaryPending&&!retirementPending,'await owner retirement refresh before settled boundary; preparation must also finish');assert.ok(clock()-endAt>=1100,'stats settle shorter than 1100ms')
   phase='finishing';boundaryPending=true;if(collectionPending)await collectionPending;await drainRefreshes();healthy();snapshots.settledEnd=await collect(true);await drainRefreshes()
   let statements={available:false,reason:pgStatStatements.reason}
   if(pgStatStatements.mode==='required'){const row=await serializeCollection(()=>sql('statements'));decimal(row.statements?.calls,'statement calls');decimal(row.statements?.returned_rows,'statement rows');assert.ok(Number.isFinite(row.statements.total_exec_time_ms)&&row.statements.total_exec_time_ms>=0,'required pg_stat_statements timing');statements={available:true,...row.statements}}
   await drainRefreshes();healthy()
   const result={...clone(snapshots),statements,retirements:clone(retirements),attributionResolutions:clone(attributionResolutions),observerCost:costSnapshot(),intervals:OBSERVER_INTERVALS,statsSettleMs:clock()-endAt,limitations:['Database tuples are not SQL counts; query duration is not CPU.','WAL includes shared-cluster background and observer work.','Sampled /proc misses short peaks and exit tails; child terminal evidence remains required.','CPU below one tick is not proof of zero; no observer costs are subtracted.']}
   emit({kind:'observer_cost',...result.observerCost});phase='settled';boundaryPending=false;clear();return result
  }),
  waitForAttribution:()=>guarded(async()=>{healthy();await drainRefreshes();healthy();return {pending:false,refreshes:cost.attributionRefreshes}}),
  prepareOwnerClose:({pid,startTicks})=>guarded(async()=>{
   healthy();assert.ok(['running','settling'].includes(phase)&&!boundaryPending&&!retirementPending,'prepare close overlaps another boundary')
   const owner=registry.entries().find(p=>p.pid===pid);assert.ok(owner&&identity(owner)===identity({pid,startTicks}),'unknown prepare-close owner')
   assert.ok(['report_worker','export_worker'].includes(owner.role),'only report/export may prepare close')
   const preparingAt=clock();boundaryPending=true
   if(collectionPending)await collectionPending;await drainRefreshes();healthy()
   // A backend may have been born after the last 100ms proc sample. Always
   // collect fresh SQL + proc before granting the child permission to close.
   await collect(false);cost.closePreparationRefreshes++;await drainRefreshes();healthy()
   assert.ok(registry.entries().some(p=>identity(p)===identity(owner)&&p.role===owner.role),'prepare-close owner binding changed')
   const backends=activity.rows.filter(p=>p.ownerIdentity===identity(owner))
   const remaining=budget();retirementPending={ownerIdentity:identity(owner),backends:clone(backends),backendProcesses:clone(frame.processes.filter(p=>backends.some(b=>identity(b)===identity(p)))),preparedSockets:clone(frame.sockets.filter(socket=>`${socket.ownerPid}:${socket.ownerStartTicks}`===identity(owner))),socketLossAt:new Map(),closureVerifiedStates:new Map(),prepared:true,closedAt:new Map(),preparedAt:clock()}
   emit({kind:'owner_close_prepared',ownerIdentity:identity(owner),backendIdentities:backends.map(identity),backendProcessBindings:retirementPending.backendProcesses.map(({pid,startTicks,parentPid,processGroupId})=>({pid,startTicks,parentPid,processGroupId})),backendSocketBindings:retirementPending.preparedSockets.filter(socket=>backends.some(backend=>socket.localPort===backend.client_port&&socket.localAddress===backend.client_addr)),terminalProofRequired:true,remainingMs:remaining,preparationElapsedMs:clock()-preparingAt,budgetPolicy:'EXISTING_AGGREGATE_AND_WINDOW_DEADLINE_NOT_RESET'})
   boundaryPending=false;return {prepared:true,ownerIdentity:identity(owner),remainingMs:remaining}
  }),
  retireOwner:proof=>guarded(async()=>{
   healthy();assert.ok(['running','settling'].includes(phase)&&!boundaryPending&&(!retirementPending||retirementPending.prepared&&retirementPending.ownerIdentity===identity(proof)),'retirement notification overlaps another boundary')
   const owner=registry.entries().find(p=>p.pid===proof.pid);assert.ok(owner&&identity(owner)===identity(proof),'unknown retirement owner')
   assert.ok(['report_worker','export_worker'].includes(owner.role),'API/driver/observer retirement is forbidden')
   assert.equal(proof.terminalCpu?.pid,owner.pid,'terminal CPU PID mismatch');assert.equal(proof.terminalCpu?.startTicks,owner.startTicks,'terminal CPU identity mismatch')
   for(const key of ['user','system'])integer(proof.terminalCpu[key],`terminal CPU ${key}`)
   const backends=retirementPending?.backends??(activity?.rows??[]).filter(p=>p.ownerIdentity===identity(owner));assert.ok(backends.every(p=>p.ownerRole===owner.role),'retirement backend role mismatch')
   const at=clock(),preparedAt=retirementPending?.preparedAt??null,closedAt=retirementPending?.closedAt??new Map(),previousRetirement=retirementPending;registry.retire(proof);retirementPending={...previousRetirement,ownerIdentity:identity(owner),backends:clone(backends),prepared:false,closedAt,closureVerifiedStates:previousRetirement?.closureVerifiedStates??new Map()}
   emit({kind:'owner_retirement_pending',ownerIdentity:identity(owner),backendIdentities:backends.map(identity),terminalCpu:clone(proof.terminalCpu),closeObserved:true,terminalObserved:true,groupQuiescent:true})
   if(collectionPending)await collectionPending;await drainRefreshes();healthy();await collect(false,{verifyRetirement:true});cost.retirementRefreshes++
   const result={ownerIdentity:identity(owner),role:owner.role,backendIdentities:backends.map(identity),terminalCpu:clone(proof.terminalCpu),status:'CLOSED_VERIFIED_BY_FRESH_PG_AND_PROC',refreshElapsedMs:clock()-at,closePreparationElapsedMs:preparedAt===null?null:clock()-preparedAt,backendTailIntervals:backends.map(backend=>{const last=procCounters.get(identity(backend));assert.ok(last,'missing prior backend CPU sample');return {identity:identity(backend),lastObservedAtMs:last.observedElapsedMs,absenceVerifiedAtMs:closedAt.get(identity(backend)),lastUserTicks:last.userTicks,lastSystemTicks:last.systemTicks,tailCpu:'NOT_OBSERVED'}}),terminatedPgChildObservations:backends.map(b=>terminatedPgHistory.get(identity(b))).filter(Boolean).map(clone),backendCpuExitTail:'NOT_OBSERVED; PRIOR_SAMPLES_PRESERVED; NEVER_IMPUTE_ZERO'}
   retirements.push(result);emit({kind:'owner_retirement_verified',...result});retirementPending=null;return clone(result)
  }),
  async stop(){clear();controller?.abort();if(inFlight)await inFlight.catch(()=>{});if(collectionPending)await collectionPending;if(currentCollection)await currentCollection.catch(()=>{});if(closureRefresh)await closureRefresh;if(attributionRefresh)await attributionRefresh;if(!failure)phase='closed';return {phase,failure:failure?.message??null,evidenceBytes}},
  state(){return {phase,failure:failure?.message??null,queryPending:inFlight!==null,attributionPending:attributionPending!==null,evidenceBytes,cost:{...cost}}},
 })
}
