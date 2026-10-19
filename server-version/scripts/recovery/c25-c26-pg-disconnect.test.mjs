/** Injected prepared-disconnect FD-first and terminated-PG-child contracts. */
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
const proc=(pid,startTicks,parentPid=1)=>({pid,startTicks,parentPid,processGroupId:parentPid===10?10:pid,state:'S',userTicks:4,systemTicks:2,rssBytes:4096,vmHwmLifetimeBytes:8192})
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

function enumerate(h){
 const terminals=h.frame.terminatedPgChildObservations??[]
 h.frame.enumeratedPgChildIdentities=[...h.frame.pgChildren.map(child=>h.frame.processes.find(p=>p.pid===child.pid)),...terminals].map(({pid,startTicks,parentPid,processGroupId})=>({pid,startTicks,parentPid,processGroupId}))
}
function terminateBackend(h,pid=104){
 const p=h.frame.processes.find(p=>p.pid===pid)
 h.frame.terminatedPgChildObservations=[{pid:p.pid,startTicks:p.startTicks,parentPid:p.parentPid,processGroupId:p.processGroupId,state:'Z',userTicks:12,systemTicks:3}]
 h.frame.processes=h.frame.processes.filter(p=>p.pid!==pid);h.frame.pgChildren=h.frame.pgChildren.filter(p=>p.pid!==pid);h.frame.sockets=h.frame.sockets.filter(s=>s.localPort!==(pid===104?40104:40106));enumerate(h)
}

test('prepared FD-first close retains live backend CPU until verified disappearance, while unprepared loss and endpoint drift stop',async()=>{
 const h=harness();await h.observer.begin();await h.observer.prepareOwnerClose({pid:40,startTicks:'400'})
 h.frame.sockets=h.frame.sockets.filter(s=>s.ownerPid!==40);h.frame.processes.find(p=>p.pid===104).userTicks=9;h.setTime(100);h.fireInterval(100);await h.observer.waitForAttribution()
 assert.equal(h.stops.length,0);assert.ok(h.events.some(e=>e.kind==='proc'&&e.processes.some(p=>p.pid===104&&p.userTicks===9)))
 const fresh=h.events.filter(e=>e.kind==='pg_activity').at(-1);assert.equal(fresh.activity.rows.find(p=>p.pid===104).connectionAttribution,'PREPARED_CLOSE_SOCKET_LOSS');assert.equal(fresh.activity.businessActive.some(p=>p.pid===104),true)
 assert.deepEqual(h.events.filter(e=>e.kind==='prepared_backend_close_verified').at(-1).remainingBackendIdentities,['104:1004'])
 removeBackend(h,104);h.frame.processes=h.frame.processes.filter(p=>p.pid!==40);h.setTime(120);const retired=await h.observer.retireOwner(proof());assert.equal(retired.status,'CLOSED_VERIFIED_BY_FRESH_PG_AND_PROC');assert.equal(retired.backendTailIntervals[0].lastUserTicks,9);assert.equal(h.stops.length,0);await h.observer.stop()
 for(const mode of ['unprepared','endpoint','inode']){
  const bad=harness();await bad.observer.begin();if(mode!=='unprepared')await bad.observer.prepareOwnerClose({pid:40,startTicks:'400'})
  if(mode==='inode')bad.frame.sockets.find(s=>s.ownerPid===40).inode='999'
  else bad.frame.sockets=bad.frame.sockets.filter(s=>s.ownerPid!==40)
  if(mode==='endpoint')bad.row.activity.find(p=>p.pid===104).client_port=49999
  bad.setTime(100);bad.fireInterval(100)
  if(mode==='endpoint')await assert.rejects(bad.observer.waitForAttribution(),/retiring backend identity changed/)
  else assert.match(bad.observer.state().failure,mode==='unprepared'?/socket ownership/:/socket identity\/endpoint changed/)
  assert.equal(bad.stops.length,1)
 }
})

test('prepared zombie PG backend retains exact stat CPU and complete child enumeration; unknown, changed and unreaped identities stop',async()=>{
 const h=harness();await h.observer.begin();await h.observer.prepareOwnerClose({pid:40,startTicks:'400'});terminateBackend(h);h.setTime(100);h.fireInterval(100);await h.observer.waitForAttribution()
 assert.equal(h.stops.length,0);const raw=h.events.filter(e=>e.kind==='proc').at(-1)
 assert.equal(raw.processes.some(p=>p.pid===104),false);assert.equal(raw.terminatedPgChildObservations[0].userTicks,12);assert.equal(raw.terminatedPgChildObservations[0].rssBytes,undefined);assert.ok(raw.enumeratedPgChildIdentities.some(p=>p.pid===104))
 assert.deepEqual(h.events.filter(e=>e.kind==='prepared_backend_close_verified').at(-1).remainingBackendIdentities,['104:1004'])
 h.frame.terminatedPgChildObservations=[];h.row.activity=h.row.activity.filter(p=>p.pid!==104);enumerate(h);h.frame.processes=h.frame.processes.filter(p=>p.pid!==40);h.setTime(120)
 const retired=await h.observer.retireOwner(proof());assert.equal(retired.terminatedPgChildObservations[0].userTicks,12);assert.equal(retired.backendTailIntervals[0].absenceVerifiedAtMs,120);assert.equal(h.stops.length,0);await h.observer.stop()
 for(const mode of ['unprepared','unknown','reused','group','parent','missing-enumeration','unreaped']){
  const bad=harness();await bad.observer.begin();if(mode!=='unprepared')await bad.observer.prepareOwnerClose({pid:40,startTicks:'400'})
  terminateBackend(bad)
  const terminal=bad.frame.terminatedPgChildObservations[0]
  if(mode==='unknown')terminal.pid=999
  if(mode==='reused')terminal.startTicks='9999'
  if(mode==='group')terminal.processGroupId=999
  if(mode==='parent')terminal.parentPid=999
  if(mode==='missing-enumeration')bad.frame.enumeratedPgChildIdentities=bad.frame.enumeratedPgChildIdentities.filter(p=>p.pid!==104)
  bad.setTime(100);bad.fireInterval(100)
  if(mode==='unreaped'){
   await bad.observer.waitForAttribution();bad.frame.processes=bad.frame.processes.filter(p=>p.pid!==40)
   await assert.rejects(bad.observer.retireOwner(proof()),/terminated PG child|did not disappear/)
  }else assert.match(bad.observer.state().failure,/terminated PG child|PG child enumeration/)
  assert.equal(bad.stops.length,1)
 }
})
