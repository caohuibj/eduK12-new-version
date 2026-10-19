/** Targeted PG16 host/address, changed-child attribution and partial-close tests.
 * Injected only; importing the historical test file is deliberately avoided. */
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

function addBackend(h,{pid=106,startTicks='1006',ownerPid=20,port=40106,app='c26:api',address='127.0.0.1'}={}){
 const owner=owned.find(p=>p.pid===ownerPid)
 h.frame.processes.push({...proc(pid,startTicks,10),userTicks:7,systemTicks:3});h.frame.pgChildren.push({pid,startTicks})
 h.frame.sockets.push({...socket(ownerPid,owner.startTicks,port),localAddress:address,remoteAddress:address})
 h.row.activity.push({...client(pid,port,app),client_addr:address});return pid
}
function removeBackend(h,pid){
 const backend=h.row.activity.find(p=>p.pid===pid)
 h.frame.processes=h.frame.processes.filter(p=>p.pid!==pid);h.frame.pgChildren=h.frame.pgChildren.filter(p=>p.pid!==pid);h.frame.sockets=h.frame.sockets.filter(p=>p.localPort!==backend.client_port);h.row.activity=h.row.activity.filter(p=>p.pid!==pid)
}
const proof=()=>({pid:40,startTicks:'400',closeObserved:true,terminalObserved:true,groupQuiescent:true,terminalCpu:{pid:40,startTicks:'400',user:1200,system:300}})

test('PG16 fixed SQL uses host(client_addr), preserving SQL NULL for background rows',async()=>{
 for(const kind of ['activity','boundary']){assert.match(PG_OBSERVER_SQL[kind],/host\(client_addr\) AS client_addr/);assert.doesNotMatch(PG_OBSERVER_SQL[kind],/client_addr::text|coalesce\(host\(client_addr\)/)}
 const h=harness();h.row.activity.unshift({pid:11,datname:null,backend_type:'background writer',backend_start:'2026-10-19 00:00:01+00',client_addr:null,client_port:null,state:null,wait_event_type:null,wait_event:null,application_name:''})
 const before=await h.observer.begin();assert.equal(before.activity.rows.find(p=>p.pid===11).client_addr,null);await h.observer.stop()
})

for(const address of ['127.0.0.1','::1'])test(`host-projected ${address} matches the actual socket address`,async()=>{
 const h=harness();for(const row of h.row.activity)row.client_addr=address;for(const socket of h.frame.sockets){socket.localAddress=address;socket.remoteAddress=address}
 await h.observer.begin();assert.equal(h.stops.length,0);await h.observer.stop()
})

for(const address of ['127.0.0.1/32','::1/128','127.0.0.2','2001:db8::1'])test(`unprojected/non-loopback address ${address} is never silently normalized`,async()=>{
 const h=harness();h.row.activity[0].client_addr=address;await assert.rejects(h.observer.begin(),/non-loopback PG client/);assert.equal(h.stops.length,1)
})

for(const [ownerPid,app,role]of [[20,'c26:api','pg_api_backend'],[40,'c26:report','pg_worker_backend'],[50,'c26:export','pg_worker_backend']])test(`new ${app} backend gets one bounded fresh attribution, retaining real raw CPU`,async()=>{
 const h=harness();await h.observer.begin();addBackend(h,{ownerPid,app});h.setTime(100);h.fireInterval(100)
 assert.equal(h.stops.length,0);assert.equal(h.observer.state().attributionPending,true)
 const pending=h.events.filter(e=>e.kind==='proc').at(-1).processes.find(p=>p.pid===106)
 assert.equal(pending.userTicks,7);assert.equal(pending.systemTicks,3);assert.equal(pending.rssBytes,4096);assert.equal(pending.role,null);assert.equal(pending.attribution,'PENDING_FRESH_PG')
 await h.observer.waitForAttribution();assert.equal(h.calls.length,2);assert.equal(h.observer.state().cost.attributionRefreshes,1);assert.equal(h.observer.state().cost.issued,2)
 const verified=h.events.find(e=>e.kind==='pg_attribution_verified');assert.deepEqual(verified.bindings,[{identity:'106:1006',role,ownerIdentity:`${ownerPid}:${owned.find(p=>p.pid===ownerPid).startTicks}`}]);assert.equal(h.stops.length,0);await h.observer.stop()
})

for(const mode of ['unknown','ambiguous','foreign','missing-stats-row'])test(`fresh new-backend attribution rejects ${mode}`,async()=>{
 const h=harness();await h.observer.begin();addBackend(h)
 if(mode==='unknown')h.row.activity.at(-1).application_name='unowned'
 if(mode==='ambiguous')h.frame.sockets.push({...h.frame.sockets.at(-1),ownerPid:40,ownerStartTicks:'400'})
 if(mode==='foreign')h.row.activity.at(-1).datname='eduk12_primary'
 if(mode==='missing-stats-row')h.row.activity.pop()
 h.setTime(100);h.fireInterval(100);await assert.rejects(h.observer.waitForAttribution(),mode==='foreign'?/foreign database/:mode==='missing-stats-row'?/unknown PG child/:/socket ownership/)
 assert.equal(h.calls.length,2);assert.equal(h.stops.length,1);assert.equal(h.events.some(e=>e.kind==='pg_attribution_verified'),false)
})

test('changed PG child identity is PID reuse, not a new attribution opportunity',async()=>{
 const h=harness();await h.observer.begin();h.frame.processes.find(p=>p.pid===102).startTicks='9002';h.frame.pgChildren.find(p=>p.pid===102).startTicks='9002';h.setTime(100);h.fireInterval(100)
 assert.match(h.observer.state().failure,/PG backend PID reused/);assert.equal(h.calls.length,1);assert.equal(h.stops.length,1)
})

test('one fresh query waits behind an already-issued cached activity read',async()=>{
 const h=harness();await h.observer.begin();h.hold=true;h.setTime(250);h.fireInterval(250);await flush();const oldRow=structuredClone(h.row)
 addBackend(h);h.setTime(300);h.fireInterval(100);h.fireInterval(100);h.fireInterval(250);assert.equal(h.stops.length,0);assert.equal(h.calls.length,2)
 h.hold=false;h.setTime(310);h.releaseRow(oldRow);await h.observer.waitForAttribution()
 assert.equal(h.calls.length,3);assert.equal(h.observer.state().cost.attributionRefreshes,1);assert.equal(h.observer.state().cost.attributionCoveredPgTicks,1);assert.equal(h.stops.length,0);await h.observer.stop()
})

test('operation boundary waits for attribution rather than overlapping its query',async()=>{
 const h=harness();await h.observer.begin();addBackend(h);h.hold=true;h.setTime(100);h.fireInterval(100);await flush()
 const end=h.observer.operationEnd();h.hold=false;h.setTime(110);h.release();await end
 assert.equal(h.calls.length,3);assert.equal(h.observer.state().phase,'settling');assert.equal(h.stops.length,0);await h.observer.stop()
})

test('new-attribution SQL watchdog is bounded and a failed query is not retried',async()=>{
 const h=harness();await h.observer.begin();addBackend(h);h.hold=true;h.setTime(100);h.fireInterval(100);await flush();const waiting=h.observer.waitForAttribution()
 h.setTime(300);h.fireTimeout(200);await assert.rejects(waiting,/deadline|cancellation/);assert.equal(h.calls.length,2);assert.equal(h.stops.length,1)
})

test('two owned pool backends may close separately before genuine owner retirement',async()=>{
 const h=harness();addBackend(h,{ownerPid:40,app:'c26:report'});await h.observer.begin();await h.observer.prepareOwnerClose({pid:40,startTicks:'400'})
 removeBackend(h,104);h.setTime(100);h.fireInterval(100);await h.observer.waitForAttribution()
 const first=h.events.filter(e=>e.kind==='prepared_backend_close_verified').at(-1);assert.deepEqual(first.closedBackendIdentities,['104:1004']);assert.deepEqual(first.remainingBackendIdentities,['106:1006']);assert.equal(h.stops.length,0)
 removeBackend(h,106);h.setTime(200);h.fireInterval(100);await h.observer.waitForAttribution();assert.equal(h.observer.state().cost.retirementRefreshes,2)
 h.frame.processes=h.frame.processes.filter(p=>p.pid!==40);h.setTime(210);const result=await h.observer.retireOwner(proof())
 assert.equal(result.backendTailIntervals.find(p=>p.identity==='104:1004').absenceVerifiedAtMs,100);assert.equal(result.backendTailIntervals.find(p=>p.identity==='106:1006').absenceVerifiedAtMs,200);assert.equal(result.terminalCpu.user,1200);assert.equal(h.calls.length,5);assert.equal(h.stops.length,0);await h.observer.stop()
})

test('still-live member of a closing pool retains actual socket validation',async()=>{
 const h=harness();addBackend(h,{ownerPid:40,app:'c26:report'});await h.observer.begin();await h.observer.prepareOwnerClose({pid:40,startTicks:'400'})
 removeBackend(h,104);h.frame.sockets.find(p=>p.localPort===40106).inode='49999';h.setTime(100);h.fireInterval(100)
 assert.match(h.observer.state().failure,/socket.*(identity|ownership)|inode/);assert.equal(h.stops.length,1)
})

test('final retirement still requires every previously attributed backend gone',async()=>{
 const h=harness();addBackend(h,{ownerPid:40,app:'c26:report'});await h.observer.begin();await h.observer.prepareOwnerClose({pid:40,startTicks:'400'})
 removeBackend(h,104);h.setTime(100);h.fireInterval(100);await h.observer.waitForAttribution();h.frame.processes=h.frame.processes.filter(p=>p.pid!==40)
 await assert.rejects(h.observer.retireOwner(proof()),/did not disappear/);assert.equal(h.stops.length,1)
})

test('new API attribution and partial worker close share the same serial refresh queue',async()=>{
 const h=harness();addBackend(h,{ownerPid:40,app:'c26:report'});await h.observer.begin();await h.observer.prepareOwnerClose({pid:40,startTicks:'400'})
 removeBackend(h,104);addBackend(h,{pid:107,startTicks:'1007',port:40107});h.setTime(100);h.fireInterval(100);await h.observer.waitForAttribution()
 assert.equal(h.calls.length,4);assert.equal(h.observer.state().cost.attributionRefreshes,1);assert.equal(h.observer.state().cost.retirementRefreshes,1);assert.equal(h.stops.length,0);await h.observer.stop()
})

test('a child born after the SQL snapshot but before proc reading gets one fresh attribution',async()=>{
 const h=harness();await h.observer.begin();h.hold=true;h.setTime(250);h.fireInterval(250);await flush();const oldRow=structuredClone(h.row)
 addBackend(h);h.hold=false;h.setTime(260);h.releaseRow(oldRow);await flush();await h.observer.waitForAttribution()
 assert.equal(h.calls.length,3);assert.equal(h.observer.state().cost.attributionRefreshes,1);assert.equal(h.stops.length,0);await h.observer.stop()
})
