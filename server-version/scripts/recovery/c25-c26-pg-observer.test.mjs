/** Source-only preparation tests: injected SQL/proc/timers; no real DB/services. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {TARGET_DATABASE,PG_OBSERVER_SQL,createOwnedPidRegistry,createPgObserver,attributeActivity} from './c25-c26-pg-observer.mjs'

const owned=[
 {pid:10,startTicks:'100',role:'pg_postmaster'},
 {pid:11,startTicks:'101',role:'pg_background'},
 {pid:20,startTicks:'200',role:'api',applicationName:'c26:api'},
 {pid:30,startTicks:'300',role:'observer',applicationName:'c26:observer'},
 {pid:40,startTicks:'400',role:'report_worker',applicationName:'c26:report'},
 {pid:50,startTicks:'500',role:'export_worker',applicationName:'c26:export'},
]
const target={database:TARGET_DATABASE,systemIdentifier:'9001',primarySystemIdentifier:'9001',primaryDatabase:'eduk12_primary',postmasterStartedAt:'2026-10-19 00:00:00+00',port:5433,observerBackendPid:103}
const proc=(pid,startTicks,parentPid=1)=>({pid,startTicks,parentPid,state:'S',userTicks:4,systemTicks:2,rssBytes:4096,vmHwmLifetimeBytes:8192})
const client=(pid,port,app)=>({pid,datname:TARGET_DATABASE,backend_type:'client backend',backend_start:'2026-10-19 00:00:01+00',client_addr:'127.0.0.1',client_port:port,state:'active',wait_event_type:null,wait_event:null,application_name:app})
const socket=(ownerPid,ownerStartTicks,localPort)=>({ownerPid,ownerStartTicks,localPort,localAddress:'127.0.0.1',remoteAddress:'127.0.0.1',remotePort:5433,state:'ESTABLISHED',inode:String(localPort),ownerFd:12})
const databaseKeys=['xact_commit','xact_rollback','blks_read','blks_hit','tup_returned','tup_fetched','tup_inserted','tup_updated','tup_deleted','temp_files','temp_bytes','deadlocks']
const walKeys=['wal_records','wal_fpi','wal_bytes','wal_buffers_full','wal_write','wal_sync']
function fixture(){
 const frame={processes:[...owned.map(p=>proc(p.pid,p.startTicks,p.pid===11?10:1)),proc(102,'1002',10),proc(103,'1003',10),proc(104,'1004',10),proc(105,'1005',10)],pgChildren:[{pid:11,startTicks:'101'},{pid:102,startTicks:'1002'},{pid:103,startTicks:'1003'},{pid:104,startTicks:'1004'},{pid:105,startTicks:'1005'}],sockets:[socket(20,'200',40102),socket(30,'300',40103),socket(40,'400',40104),socket(50,'500',40105)]}
 const row={databaseName:TARGET_DATABASE,observerBackendPid:103,systemIdentifier:'9001',postmasterStartedAt:target.postmasterStartedAt,serverPort:5433,statementTimeout:'100ms',transactionReadOnly:'on',statsFetchConsistency:'none',database:{...Object.fromEntries(databaseKeys.map(k=>[k,'10'])),blk_read_time:0,blk_write_time:0,stats_reset:'2026-10-19 00:00:00+00'},wal:{...Object.fromEntries(walKeys.map(k=>[k,'10'])),wal_write_time:0,wal_sync_time:0,stats_reset:'2026-10-19 00:00:00+00'},activity:[client(102,40102,'c26:api'),client(103,40103,'c26:observer'),client(104,40104,'c26:report'),client(105,40105,'c26:export')],databaseBytes:'1048576',relations:[{oid:'1234',nspname:'public',relname:'synthetic',heap_bytes:'8192',index_bytes:'8192',total_bytes:'16384'}],statements:{calls:'5',returned_rows:'10',total_exec_time_ms:2}}
 return {frame,row}
}
function harness(options={}){
 const {frame,row}=fixture(),registry=createOwnedPidRegistry(owned),events=[],stops=[],calls=[],intervals=new Map(),timeouts=new Map();let id=0,time=0
 const timers={setInterval(fn,ms){const key=++id;intervals.set(key,{fn,ms});return key},clearInterval(key){intervals.delete(key)},setTimeout(fn,ms){const key=++id;timeouts.set(key,{fn,ms});return key},clearTimeout(key){timeouts.delete(key)}}
 const h={frame,row,registry,events,stops,calls,intervals,timeouts,hold:false,queryError:null,
  setTime(value){time=value},fireInterval(ms){for(const item of [...intervals.values()])if(item.ms===ms)item.fn()},fireTimeout(ms){for(const [key,item]of [...timeouts])if(item.ms===ms){timeouts.delete(key);item.fn()}},
 }
 h.observer=createPgObserver({query:async request=>{
  calls.push(request);assert.ok(Object.values(PG_OBSERVER_SQL).includes(request.text));assert.equal(request.readOnly,true);assert.ok(request.statementTimeoutMs>0&&request.statementTimeoutMs<=200);assert.ok(request.remainingMs>=request.statementTimeoutMs)
  if(h.queryError)throw h.queryError
  if(h.hold)return new Promise((resolve,reject)=>{h.release=()=>resolve({rows:[structuredClone(row)]});h.releaseRow=value=>resolve({rows:[structuredClone(value)]});const abort=()=>reject(new Error('injected cancellation'));if(request.signal.aborted)abort();else request.signal.addEventListener('abort',abort,{once:true})})
  return {rows:[structuredClone(row)]}
 },readProc:()=>structuredClone(frame),registry,target,remainingMs:()=>80000-time,record:value=>events.push(value),onStop:error=>stops.push(error),now:()=>time,cpuUsage:()=>({pid:30,user:100+time,system:20}),timers,pgStatStatements:{mode:'unsupported',reason:'EXPLICITLY_UNAVAILABLE_IN_TEST'},...options})
 return h
}
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()}

test('fixed SQL is SELECT-only and cluster activity is not database-filtered',()=>{
 for(const sql of Object.values(PG_OBSERVER_SQL)){assert.match(sql,/^SELECT /);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|VACUUM|CHECKPOINT|RESET|SET|pg_stat_clear_snapshot|pg_stat_reset|set_config)\b/i);assert.doesNotMatch(sql,/;/)}
 assert.match(PG_OBSERVER_SQL.activity,/FROM pg_stat_activity ORDER BY pid LIMIT 513/)
})

test('before, operation end and settled end preserve raw totals and disclose observer costs',async()=>{
 const h=harness();await h.observer.begin();assert.equal(h.calls.length,1)
 h.setTime(10);await h.observer.operationEnd();h.setTime(1110);const result=await h.observer.settledEnd()
 assert.equal(result.observerCost.issued,3);assert.equal(result.observerCost.completed,3);assert.equal(result.observerCost.failed,0)
 assert.equal(result.before.database.xact_commit,'10');assert.equal(result.settledEnd.database.xact_commit,'10')
 assert.equal(result.settledEnd.activity.businessActive.length,3);assert.equal(result.settledEnd.activity.observerActive.length,1)
 assert.equal(result.observerCost.cpuMicroseconds.user,1110);assert.equal(result.intervals.procMs,100);assert.equal(result.intervals.pgMs,250)
 assert.equal(result.statements.available,false);assert.match(result.observerCost.scope,/NEVER_SUBTRACT/)
 assert.equal(h.events.find(x=>x.kind==='cluster_scope').samePhysicalCluster,true)
 assert.equal(h.observer.state().phase,'settled');assert.equal(h.intervals.size,0);assert.equal(h.timeouts.size,0);assert.equal(h.stops.length,0)
})

test('actual socket and app label are both required for every API/report/export/observer backend',()=>{
 const {frame,row}=fixture(),registry=createOwnedPidRegistry(owned)
 const result=attributeActivity(row.activity,frame,registry,target)
 assert.deepEqual(result.rows.map(x=>x.role),['pg_api_backend','pg_observer_backend','pg_worker_backend','pg_worker_backend'])
 frame.sockets=[];assert.throws(()=>attributeActivity(row.activity,frame,registry,target),/socket ownership/)
})

for(const [label,mutate,pattern]of [
 ['wrong database',h=>{h.row.databaseName='eduk12_primary'},/wrong observer database/],
 ['wrong observer PID',h=>{h.row.observerBackendPid=999},/backend PID/],
 ['wrong cluster',h=>{h.row.systemIdentifier='9002'},/physical PG cluster/],
 ['foreign DB connection',h=>{h.row.activity[0].datname='eduk12_primary'},/foreign database connection/],
 ['unknown connection',h=>{h.row.activity[0].application_name='unowned'},/socket ownership/],
 ['unknown inactive connection',h=>{h.row.activity[0].application_name='unowned';h.row.activity[0].state='idle'},/socket ownership/],
 ['wrong observer socket PID',h=>{h.row.activity[1].application_name='c26:api';h.row.activity[1].client_port=40102},/observer backend\/socket|duplicate backend socket endpoint/],
 ['missing required CPU',h=>{delete h.frame.processes[0].userTicks},/userTicks/],
 ['PID reuse',h=>{h.frame.processes.find(p=>p.pid===20).startTicks='201'},/PID reused/],
 ['unknown process state',h=>{h.frame.processes[0].state='?'},/process state/],
 ['unknown backend state',h=>{h.row.activity[0].state=null},/backend state/],
 ['missing required DB stats',h=>{h.row.database=null},/required database stats/],
 ['unbounded timeout',h=>{h.row.statementTimeout='0'},/unbounded/],
 ['excess server timeout',h=>{h.row.statementTimeout='1s'},/exceeds remaining/],
 ['writable connection',h=>{h.row.transactionReadOnly='off'},/not read-only/],
 ['cached stats',h=>{h.row.statsFetchConsistency='cache'},/snapshot cache/],
])test(`fail closed: ${label}`,async()=>{
 const h=harness();mutate(h);await assert.rejects(h.observer.begin(),pattern);assert.equal(h.observer.state().phase,'failed');assert.equal(h.stops.length,1);assert.equal(h.calls.length,1);await h.observer.stop()
})

for(const section of ['database','wal'])test(`changed ${section} stats_reset stops without retry`,async()=>{
 const h=harness();await h.observer.begin();h.row[section].stats_reset='2026-10-19 00:10:00+00'
 await assert.rejects(h.observer.operationEnd(),/stats_reset changed/);assert.equal(h.stops.length,1);assert.equal(h.calls.length,2)
})

test('required PG permission and SQL failures are not converted to unsupported',async()=>{
 for(const code of ['42501','42P01','42703','55000']){const h=harness();h.queryError=Object.assign(new Error('required SQL unavailable'),{code});await assert.rejects(h.observer.begin(),/required SQL unavailable/);assert.equal(h.stops.length,1);assert.equal(h.observer.state().cost.failed,1)}
})

test('required pg_stat_statements errors stop; only explicit unsupported policy skips it',async()=>{
 const h=harness({pgStatStatements:{mode:'required'}});await h.observer.begin();await h.observer.operationEnd();h.setTime(1100);h.row.statements=null
 await assert.rejects(h.observer.settledEnd(),/statement calls/);assert.equal(h.calls.length,4);assert.equal(h.stops.length,1)
})

test('250ms overrun aborts one pending query and never starts an overlapping query',async()=>{
 const h=harness();await h.observer.begin();h.hold=true;h.setTime(250);h.fireInterval(250);await flush();assert.equal(h.observer.state().queryPending,true)
 h.setTime(500);h.fireInterval(250);await flush();assert.equal(h.calls.length,2);assert.equal(h.stops.length,1);assert.match(h.observer.state().failure,/overrun/);assert.equal(h.observer.state().queryPending,false);await h.observer.stop()
})

test('SQL watchdog aborts within bounded remaining budget',async()=>{
 const h=harness();h.hold=true;const begin=h.observer.begin();await flush();h.setTime(200);h.fireTimeout(200)
 await assert.rejects(begin,/deadline|cancellation/);assert.equal(h.calls.length,1);assert.equal(h.stops.length,1)
})

test('100ms proc sampling stops on missing CPU and never substitutes zero',async()=>{
 const h=harness();await h.observer.begin();delete h.frame.processes[0].systemTicks;h.setTime(100);h.fireInterval(100)
 assert.equal(h.observer.state().phase,'failed');assert.match(h.observer.state().failure,/systemTicks/);assert.equal(h.stops.length,1)
})

test('same backend physical identity cannot change its role or owner',async()=>{
 const h=harness();await h.observer.begin();h.row.activity[0].application_name='c26:report';h.row.activity[0].client_port=40106;h.frame.sockets.push(socket(40,'400',40106))
 await assert.rejects(h.observer.operationEnd(),/binding changed/);assert.equal(h.stops.length,1)
})

test('owned registry role is immutable and child retirement requires terminal/reap proof',()=>{
 const registry=createOwnedPidRegistry(owned);assert.throws(()=>registry.register({...owned[2],role:'report_worker'}),/binding already exists/)
 registry.entries()[2].role='driver';assert.equal(registry.entries()[2].role,'api')
 assert.throws(()=>registry.retire({pid:40,startTicks:'400',closeObserved:true}),/terminal and reaping/)
 registry.retire({pid:40,startTicks:'400',closeObserved:true,terminalObserved:true,groupQuiescent:true});assert.equal(registry.entries().length,5)
 assert.throws(()=>registry.register(owned[4]),/binding already exists/)
})

test('settle boundary cannot be shortened and evidence exhaustion fails closed',async()=>{
 const h=harness();await h.observer.begin();await h.observer.operationEnd();h.setTime(1099);await assert.rejects(h.observer.settledEnd(),/shorter than 1100/)
 const bounded=harness({maxEvidenceBytes:1});await assert.rejects(bounded.observer.begin(),/evidence budget/);assert.equal(bounded.stops.length,1)
})


test('inherited/shared socket ownership cannot be resolved by application_name alone',()=>{
 const {frame,row}=fixture(),registry=createOwnedPidRegistry(owned)
 frame.sockets.push({...frame.sockets[0],ownerPid:40,ownerStartTicks:'400'})
 assert.throws(()=>attributeActivity(row.activity,frame,registry,target),/ambiguous backend socket ownership/)
})

test('cached activity cannot attribute a reused PG backend PID at the next proc tick',async()=>{
 const h=harness();await h.observer.begin();h.frame.processes.find(p=>p.pid===102).startTicks='2002';h.frame.pgChildren.find(p=>p.pid===102).startTicks='2002';h.setTime(100);h.fireInterval(100)
 assert.match(h.observer.state().failure,/PG backend PID reused/);assert.equal(h.stops.length,1)
})


test('observer CPU must come from its registered physical process',async()=>{
 const h=harness({cpuUsage:()=>({pid:999,user:100,system:20})});await assert.rejects(h.observer.begin(),/CPU source PID mismatch/);assert.equal(h.calls.length,0);assert.equal(h.stops.length,1)
})

test('required counters cannot go backwards',async()=>{
 const h=harness();await h.observer.begin();h.row.wal.wal_bytes='9';await assert.rejects(h.observer.operationEnd(),/counter went backwards/);assert.equal(h.stops.length,1)
})

test('aggregate budget exhaustion prevents dispatch, without an invented zero sample',async()=>{
 const h=harness({remainingMs:()=>0});await assert.rejects(h.observer.begin(),/aggregate deadline exhausted/);assert.equal(h.calls.length,0);assert.equal(h.stops.length,1)
})


test('operation boundary serializes behind the pending bounded periodic read',async()=>{
 const h=harness();await h.observer.begin();h.hold=true;h.setTime(250);h.fireInterval(250);await flush()
 const end=h.observer.operationEnd();h.fireInterval(250);assert.equal(h.observer.state().cost.boundaryCoveredPgTicks,1);assert.equal(h.stops.length,0)
 h.hold=false;h.setTime(260);h.release();await end;assert.equal(h.calls.length,3);assert.equal(h.observer.state().phase,'settling');assert.equal(h.stops.length,0);await h.observer.stop()
})

const retirementProof=()=>({pid:40,startTicks:'400',closeObserved:true,terminalObserved:true,groupQuiescent:true,terminalCpu:{pid:40,startTicks:'400',user:1200,system:300}})
function removeReportOwner(h,{backend=true}={}){
 h.frame.processes=h.frame.processes.filter(p=>p.pid!==40&&(!backend||p.pid!==104));h.frame.sockets=h.frame.sockets.filter(s=>s.ownerPid!==40)
 if(backend){h.frame.pgChildren=h.frame.pgChildren.filter(p=>p.pid!==104);h.row.activity=h.row.activity.filter(p=>p.pid!==104)}
}

test('verified worker retirement refreshes stale PG attribution without zero-filling its CPU',async()=>{
 const h=harness();await h.observer.begin();removeReportOwner(h);h.setTime(100)
 const retiring=h.observer.retireOwner(retirementProof());h.fireInterval(100);h.fireInterval(250)
 assert.equal(h.stops.length,0);const result=await retiring
 assert.equal(result.status,'CLOSED_VERIFIED_BY_FRESH_PG_AND_PROC');assert.deepEqual(result.backendIdentities,['104:1004']);assert.equal(result.terminalCpu.user,1200);assert.match(result.backendCpuExitTail,/NOT_OBSERVED/)
 assert.equal(h.observer.state().cost.retirementRefreshes,1);assert.equal(h.observer.state().cost.retirementCoveredPgTicks,1)
 assert.ok(h.events.some(event=>event.kind==='proc'&&event.processes.some(p=>p.pid===40)))
 assert.ok(h.events.some(event=>event.kind==='proc'&&event.missingBackendIdentities.includes('104:1004')&&!event.processes.some(p=>p.pid===104)))
 await h.observer.operationEnd();h.setTime(1200);const summary=await h.observer.settledEnd();assert.equal(summary.retirements.length,1);assert.equal(h.stops.length,0)
})

test('worker disappearance without terminal/close retirement notification still stops',async()=>{
 const h=harness();await h.observer.begin();removeReportOwner(h);h.setTime(100);h.fireInterval(100)
 assert.match(h.observer.state().failure,/owned process missing/);assert.equal(h.stops.length,1)
})

test('retirement requires an actual identity-bound terminal CPU record',async()=>{
 const h=harness();await h.observer.begin();const proof=retirementProof();delete proof.terminalCpu
 await assert.rejects(h.observer.retireOwner(proof),/terminal CPU PID mismatch/);assert.equal(h.stops.length,1)
})

test('retirement fresh PG check refuses a still-present backend',async()=>{
 const h=harness();await h.observer.begin();removeReportOwner(h,{backend:false})
 await assert.rejects(h.observer.retireOwner(retirementProof()),/did not disappear/);assert.equal(h.stops.length,1)
})

test('retiring backend PID reuse is not a missing-process exception',async()=>{
 const h=harness();await h.observer.begin();removeReportOwner(h,{backend:false});h.row.activity=h.row.activity.filter(p=>p.pid!==104)
 h.frame.processes.find(p=>p.pid===104).startTicks='9999';h.frame.pgChildren.find(p=>p.pid===104).startTicks='9999'
 await assert.rejects(h.observer.retireOwner(retirementProof()),/retiring PG backend PID reused/);assert.equal(h.stops.length,1)
})

test('retirement never relaxes missing API or unknown new backend checks',async()=>{
 for(const mode of ['api','unknown']){
  const h=harness();await h.observer.begin();removeReportOwner(h)
  if(mode==='api')h.frame.processes=h.frame.processes.filter(p=>p.pid!==20)
  else{h.frame.processes.push(proc(106,'1006',10));h.frame.pgChildren.push({pid:106,startTicks:'1006'});h.row.activity.push(client(106,40106,'unregistered'))}
  await assert.rejects(h.observer.retireOwner(retirementProof()),mode==='api'?/owned process missing/:/socket ownership/);assert.equal(h.stops.length,1)
 }
})


test('retirement serializes a fresh query after an older in-flight snapshot',async()=>{
 const h=harness();await h.observer.begin();h.hold=true;h.setTime(250);h.fireInterval(250);await flush();const oldRow=structuredClone(h.row)
 removeReportOwner(h);const retirement=h.observer.retireOwner(retirementProof());h.setTime(260);h.fireInterval(100);h.fireInterval(250);assert.equal(h.stops.length,0)
 h.hold=false;h.releaseRow(oldRow);const result=await retirement
 assert.equal(result.status,'CLOSED_VERIFIED_BY_FRESH_PG_AND_PROC');assert.equal(h.calls.length,3);assert.equal(h.observer.state().cost.retirementRefreshes,1);assert.equal(h.stops.length,0);await h.observer.stop()
})

test('prepare-close covers real disconnect before terminal/close without hiding live worker CPU',async()=>{
 const h=harness();await h.observer.begin();const prepared=await h.observer.prepareOwnerClose({pid:40,startTicks:'400'});assert.equal(prepared.prepared,true)
 h.frame.processes=h.frame.processes.filter(p=>p.pid!==104);h.frame.pgChildren=h.frame.pgChildren.filter(p=>p.pid!==104);h.frame.sockets=h.frame.sockets.filter(s=>s.ownerPid!==40);h.row.activity=h.row.activity.filter(p=>p.pid!==104)
 h.frame.processes.find(p=>p.pid===40).userTicks=8;h.setTime(100);h.fireInterval(100);h.fireInterval(250);await flush()
 assert.equal(h.stops.length,0);assert.equal(h.calls.length,3);assert.ok(h.events.some(e=>e.kind==='prepared_backend_close_verified'))
 assert.ok(h.events.some(e=>e.kind==='proc'&&e.processes.some(p=>p.pid===40&&p.userTicks===8)))
 h.frame.processes=h.frame.processes.filter(p=>p.pid!==40);h.setTime(110);const result=await h.observer.retireOwner(retirementProof())
 assert.equal(result.status,'CLOSED_VERIFIED_BY_FRESH_PG_AND_PROC');assert.equal(result.terminalCpu.user,1200);assert.equal(result.closePreparationElapsedMs,110);assert.equal(result.backendTailIntervals[0].tailCpu,'NOT_OBSERVED');assert.equal(h.stops.length,0);assert.equal(h.observer.state().cost.retirementRefreshes,2);await h.observer.stop()
})

test('prepared close cannot silently omit worker terminal/close proof',async()=>{
 const h=harness();await h.observer.begin();await h.observer.prepareOwnerClose({pid:40,startTicks:'400'});h.setTime(80000);h.fireTimeout(80000)
 assert.match(h.observer.state().failure,/aggregate\/window deadline exhausted/);assert.equal(h.stops.length,1)
})

test('prepared close does not relax API disappearance',async()=>{
 const h=harness();await h.observer.begin();await h.observer.prepareOwnerClose({pid:40,startTicks:'400'});h.frame.processes=h.frame.processes.filter(p=>p.pid!==20);h.setTime(100);h.fireInterval(100)
 assert.match(h.observer.state().failure,/owned process missing/);assert.equal(h.stops.length,1)
})

test('prepared owner may exit before the Node close callback without zero CPU or completion',async()=>{
 const h=harness();await h.observer.begin();await h.observer.prepareOwnerClose({pid:40,startTicks:'400'});removeReportOwner(h);h.setTime(100);h.fireInterval(100);await flush()
 assert.equal(h.stops.length,0);assert.ok(h.events.some(e=>e.kind==='proc'&&e.missingOwnerIdentities.includes('40:400')&&!e.processes.some(p=>p.pid===40)))
 assert.ok(h.registry.entries().some(p=>p.pid===40),'owner stays registered pending actual close proof')
 h.setTime(120);const retirement=await h.observer.retireOwner(retirementProof());assert.equal(retirement.terminalCpu.user,1200);assert.equal(retirement.closePreparationElapsedMs,120)
 await h.observer.operationEnd();h.setTime(1220);const summary=await h.observer.settledEnd();assert.equal(summary.retirements.length,1);assert.equal(h.stops.length,0)
})

test('prepared missing-owner grace cannot accept PID reuse',async()=>{
 const h=harness();await h.observer.begin();await h.observer.prepareOwnerClose({pid:40,startTicks:'400'});h.frame.processes.find(p=>p.pid===40).startTicks='401';h.setTime(100);h.fireInterval(100)
 assert.match(h.observer.state().failure,/prepared owner PID reused/);assert.equal(h.stops.length,1)
})

test('prepared missing owner cannot complete the window without genuine close proof',async()=>{
 const h=harness();await h.observer.begin();await h.observer.prepareOwnerClose({pid:40,startTicks:'400'});removeReportOwner(h);h.setTime(100);h.fireInterval(100);await flush()
 await assert.rejects(h.observer.operationEnd(),/await owner retirement refresh/);assert.equal(h.stops.length,1)
})


test('reported cloud VmHWM may fall without clamping; RSS sampled peak and CPU identity remain strict',async()=>{
 const h=harness();await h.observer.begin();h.setTime(10)
 for(const p of h.frame.processes){p.vmHwmLifetimeBytes=5000;p.rssBytes=3000}
 await h.observer.operationEnd();h.setTime(1110);const result=await h.observer.settledEnd()
 const frames=h.events.filter(x=>x.kind==='proc');assert.ok(frames.length>=2)
 assert.equal(frames[0].processes[0].vmHwmLifetimeBytes,8192);assert.equal(frames.at(-1).processes[0].vmHwmLifetimeBytes,5000)
 assert.equal(frames.at(-1).vmHwmReliability,'UNRELIABLE_ENVIRONMENT_REPORTED_VALUE_ONLY');assert.match(result.limitations.join(' '),/VmHWM is unreliable/)
 const {summarizeProcesses}=await import('./c25-c26-observer.mjs')
 const justApi=frames.map(f=>({...f,processes:f.processes.filter(p=>p.role==='api')})),summary=summarizeProcesses(justApi,100)
 assert.equal(summary.physical[0].proc.reportedVmHwmEndBytes,5000);assert.equal(summary.physical[0].proc.rssSampledPeakBytes,4096)
 assert.match(summary.physical[0].proc.rssPeakScope,/LOWER_BOUND/);assert.equal(summary.physical[0].proc.vmHwmLifetimeEndBytes,undefined)
 const bad=structuredClone(justApi);bad.at(-1).processes[0].userTicks=0;assert.throws(()=>summarizeProcesses(bad,100),/counter went backwards/)
 const cpu=harness();await cpu.observer.begin();cpu.frame.processes[0].userTicks=0;await assert.rejects(cpu.observer.operationEnd(),/counter went backwards/);await cpu.observer.stop()
})
