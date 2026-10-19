/** Injected-only async close preparation and held-boundary attribution tests. */
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

test('prepareOwnerClose awaits fresh binding of a backend born before the next proc tick, and denies unknown ownership',async()=>{
 const h=harness();await h.observer.begin();addBackend(h,{ownerPid:40,app:'c26:report'});h.setTime(50);h.hold=true
 let permissionGranted=false
 const preparing=h.observer.prepareOwnerClose({pid:40,startTicks:'400'}).then(value=>{permissionGranted=true;return value})
 await flush();assert.equal(h.calls.length,2);assert.equal(permissionGranted,false);assert.equal(h.events.some(e=>e.kind==='owner_close_prepared'),false)
 h.setTime(70);h.hold=false;h.release();const permission=await preparing
 assert.equal(permission.prepared,true);assert.equal(permissionGranted,true)
 const prepared=h.events.find(e=>e.kind==='owner_close_prepared');assert.deepEqual(prepared.backendIdentities,['104:1004','106:1006']);assert.equal(prepared.preparationElapsedMs,20)
 assert.equal(h.observer.state().cost.closePreparationRefreshes,1);assert.equal(h.observer.state().cost.issued,2);assert.equal(h.observer.state().cost.queryElapsedMs,20)
 const raw=h.events.filter(e=>e.kind==='proc').at(-1).processes.find(p=>p.pid===106);assert.equal(raw.userTicks,7);assert.equal(raw.systemTicks,3);assert.equal(raw.role,'pg_worker_backend')
 removeBackend(h,104);removeBackend(h,106);h.frame.processes=h.frame.processes.filter(p=>p.pid!==40);h.setTime(80)
 const retired=await h.observer.retireOwner(proof());assert.deepEqual(retired.backendIdentities,['104:1004','106:1006']);assert.equal(retired.terminalCpu.user,1200);assert.equal(h.calls.length,3);assert.equal(h.stops.length,0);await h.observer.stop()

 const unknown=harness();await unknown.observer.begin();addBackend(unknown,{ownerPid:40,app:'unowned'})
 await assert.rejects(unknown.observer.prepareOwnerClose({pid:40,startTicks:'400'}),/socket ownership/)
 assert.equal(unknown.events.some(e=>e.kind==='owner_close_prepared'),false);assert.equal(unknown.calls.length,2);assert.equal(unknown.stops.length,1)
})

test('new PG children during held operation and settled boundary queries wait for complete collection without overlap or retry',async()=>{
 for(const boundaryName of ['operationEnd','settledEnd']){
  const h=harness();await h.observer.begin();if(boundaryName==='settledEnd')await h.observer.operationEnd()
  const baselineCalls=h.calls.length,start=boundaryName==='settledEnd'?1200:50;h.setTime(start);h.hold=true
  const boundary=h.observer[boundaryName]();await flush();assert.equal(h.calls.length,baselineCalls+1)
  const oldRow=structuredClone(h.row);addBackend(h);h.setTime(start+50);h.fireInterval(100);await flush()
  assert.equal(h.observer.state().attributionPending,true);assert.equal(h.calls.length,baselineCalls+1);assert.equal(h.stops.length,0)
  const pending=h.events.filter(e=>e.kind==='proc').at(-1).processes.find(p=>p.pid===106);assert.equal(pending.attribution,'PENDING_FRESH_PG');assert.equal(pending.userTicks,7);assert.equal(pending.systemTicks,3)
  h.fireInterval(250);assert.equal(h.observer.state().cost.attributionCoveredPgTicks,1)
  h.hold=false;h.releaseRow(oldRow);const result=await boundary
  assert.equal(h.calls.length,baselineCalls+2);assert.equal(h.observer.state().cost.failed,0);assert.equal(h.observer.state().cost.attributionRefreshes,1);assert.equal(h.stops.length,0)
  assert.deepEqual(h.events.find(e=>e.kind==='pg_attribution_verified').bindings,[{identity:'106:1006',role:'pg_api_backend',ownerIdentity:'20:200'}])
  if(boundaryName==='settledEnd'){assert.equal(result.observerCost.issued,baselineCalls+2);assert.equal(h.observer.state().phase,'settled')}
  else assert.equal(h.observer.state().phase,'settling')
  await h.observer.stop()
 }
})
