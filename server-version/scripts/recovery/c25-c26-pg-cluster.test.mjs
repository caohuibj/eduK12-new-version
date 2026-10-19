/** Only synthetic files and a real short-lived Node child. No PG/API/service. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {parseProcStat} from './c25-c26-observer.mjs'
import {createPgClusterReader,createPgClusterSeries,PG_CLUSTER_SCOPE} from './c25-c26-pg-cluster.mjs'

const stat=(pid,{startTicks=String(pid*10),parentPid=1,processGroupId=pid,userTicks=4,systemTicks=2,state='S'}={})=>`${pid} (synthetic ) comm) ${[state,parentPid,processGroupId,0,0,0,0,0,0,0,0,userTicks,systemTicks,0,0,0,0,1,0,startTicks,0,1].join(' ')}\n`
function fixture(){
 const files=new Map(),events=[],calls=[];let time=0,hook=null,names=['10','11','50']
 const put=(pid,options={})=>{files.set(`/proc/${pid}/stat`,stat(pid,options));files.set(`/proc/${pid}/status`,'VmRSS:\t4 kB\nVmHWM:\t2 kB\n')}
 put(10);put(11,{parentPid:10});put(50)
 const postmaster={...parseProcStat(files.get('/proc/10/stat')),role:'pg_postmaster'}
 const io={readdir:name=>{assert.equal(name,'/proc');calls.push(name);return names.slice()},readText:name=>{calls.push(name);hook?.(name);if(!files.has(name))throw Object.assign(new Error('synthetic absent'),{code:'ENOENT'});return files.get(name)}}
 const read=createPgClusterReader({postmaster,remainingMs:()=>80000,record:value=>events.push(value),io,now:()=>time})
 return {put,files,events,calls,read,postmaster,setHook:value=>hook=value,setNames:value=>names=value,setTime:value=>time=value}
}
const row=(pid,startTicks,userTicks,systemTicks,rssBytes=4096,terminal=false)=>({pid,startTicks,parentPid:10,processGroupId:pid,state:terminal?'Z':'S',userTicks,systemTicks,rssBytes,vmHwmRawBytes:2048,terminal,observedAtMs:0})
const frame=(sequence,rows,observation='OBSERVED')=>({scope:PG_CLUSTER_SCOPE,sequence,observation,completedAtMs:sequence*100,processes:rows.map(p=>({...p,observedAtMs:sequence*100-1})),events:[],readCost:{reads:10,bytes:1000,elapsedMs:2,cpuMicroseconds:{user:20,system:10},omittedEvents:0}})

test('cluster reader selects exact postmaster/direct children without sockets or stable child sets',()=>{
 const h=fixture(),first=h.read();assert.equal(first.observation,'OBSERVED');assert.deepEqual(first.processes.map(p=>p.pid),[10,11]);assert.equal(first.scope,PG_CLUSTER_SCOPE)
 h.put(12,{parentPid:10});h.setNames(['10','11','12','50']);h.setTime(100)
 const second=h.read();assert.deepEqual(second.processes.map(p=>p.pid),[10,11,12]);assert.equal(second.observation,'OBSERVED')
 h.files.delete('/proc/11/stat');h.setNames(['10','12','50']);h.setTime(200)
 assert.deepEqual(h.read().processes.map(p=>p.pid),[10,12]);assert.ok(h.calls.every(p=>p==='/proc'||/^\/proc\/\d+\/(stat|status)$/.test(p)))
 assert.equal(first.processes[0].vmHwmRawBytes,2048);assert.equal(first.processes[0].rssBytes,4096);assert.equal(first.hwm,'UNRELIABLE_RAW_DIAGNOSTIC_ONLY')
})

test('normal disappearance, unclassified churn and unavailable RSS retain partial evidence without zero filling',()=>{
 const h=fixture();h.setNames(['10','11','50','999']);let childStats=0
 h.setHook(name=>{if(name==='/proc/11/stat'&&++childStats===2)throw Object.assign(new Error('child exited'),{code:'ESRCH'});if(name==='/proc/50/stat')throw Object.assign(new Error('unrelated may have exited'),{code:'ESRCH'})})
 const got=h.read();assert.equal(got.observation,'PARTIAL');assert.equal(got.processes.find(p=>p.pid===11).rssBytes,null);assert.equal(got.processes.find(p=>p.pid===11).userTicks,4)
 assert.ok(got.events.some(p=>p.pid===11&&p.operation==='stat-after'&&p.error.code==='ESRCH'));assert.ok(got.events.some(p=>p.pid===999&&p.operation==='enumeration-disappearance'))
 const series=createPgClusterSeries();series.add(got);const summary=series.snapshot();assert.equal(summary.sampledCpuDeltaTicksLowerBound,null);assert.equal(summary.frames[0].rssMissingMembers,1);assert.equal(summary.frames[0].rssAggregateCompleteForObservedMembers,false)
 const none=createPgClusterSeries();none.add(frame(1,[row(11,'110',4,2,null)]));assert.equal(none.snapshot().sampledRssSumPeakBytes,null)
})

test('permission, parsing, child identity/counter contradictions and postmaster replacement never become valid measurements',()=>{
 for(const fault of ['EACCES','EIO','ENOTDIR','malformed']){
  const h=fixture();h.setHook(name=>{if(name==='/proc/11/stat'){if(fault==='malformed')h.files.set(name,'not a stat');else throw Object.assign(new Error(fault),{code:fault})}})
  const got=h.read();assert.equal(got.observation,'PARTIAL');assert.deepEqual(got.processes.map(p=>p.pid),[10]);assert.equal(got.events[0].operation,'enumeration-error')
 }
 const reuse=fixture();let reads=0;reuse.setHook(name=>{if(name==='/proc/11/stat'&&++reads===2)reuse.put(11,{parentPid:10,startTicks:'999',userTicks:900})})
 const reused=reuse.read();assert.equal(reused.observation,'PARTIAL');assert.equal(reused.processes.find(p=>p.pid===11).startTicks,'110');assert.equal(reused.processes.find(p=>p.pid===11).userTicks,4);assert.ok(reused.events.some(e=>e.reason==='IDENTITY_OR_PARENT_CHANGED'))
 const reverse=fixture();let count=0;reverse.setHook(name=>{if(name==='/proc/11/stat'&&++count===2)reverse.put(11,{parentPid:10,userTicks:0})});const reversed=reverse.read();assert.equal(reversed.processes.some(p=>p.pid===11),false);assert.ok(reversed.events.some(e=>e.reason==='COUNTER_REVERSED'))
 const pm=fixture();let n=0;pm.setHook(name=>{if(name==='/proc/10/stat'&&++n===3)pm.put(10,{startTicks:'999'})});const bad=pm.read();assert.equal(bad.observation,'NOT_OBSERVED');assert.deepEqual(bad.processes,[]);assert.ok(bad.discardedProcessObservations.length>0)
})

test('cluster series uses same-identity actual intervals, separate generations and explicit missing first/last counters',()=>{
 const s=createPgClusterSeries();s.add(frame(1,[row(10,'100',100,50),row(11,'110',900,800)]));s.add(frame(2,[row(10,'100',103,52),row(11,'110',902,801),row(12,'120',700,600)]));s.add(frame(3,[row(10,'100',104,54),row(12,'120',701,603,null,true)]));s.add(frame(4,[row(10,'100',106,55),row(11,'999',500,400)]))
 const result=s.snapshot();assert.deepEqual(result.sampledCpuDeltaTicksLowerBound,{user:9,system:9});assert.equal(result.processes.find(p=>p.startTicks==='999').observedCpuDeltaTicks,null)
 const gone=result.processes.find(p=>p.startTicks==='110');assert.equal(gone.tailCoverage,'NOT_OBSERVED_AFTER_LAST_SAMPLE');assert.equal(gone.gaps[0].terminalCounter,null)
 const born=result.processes.find(p=>p.startTicks==='120');assert.equal(born.headCoverage,'NOT_OBSERVED_BEFORE_FIRST_SAMPLE');assert.equal(born.tailCoverage,'TERMINAL_COUNTER_OBSERVED')
 assert.equal(result.metricCoverage.includesObserverBackend,true);assert.equal(result.metricCoverage.completeLifetimeCpu,false);assert.equal(result.metricCoverage.roleAttribution,'NOT_OBSERVED_BY_DESIGN');assert.equal(result.observerReadCost.cpuMicroseconds.user,80);assert.match(result.costSubtraction,/NONE/)
 const wrong=createPgClusterSeries();wrong.add(frame(1,[row(11,'110',5,2)]));assert.throws(()=>wrong.add(frame(2,[row(11,'110',4,2)])),/counter reversed/);assert.equal(wrong.snapshot().metricCoverage.status,'NOT_OBSERVED');assert.equal(wrong.snapshot().sampledCpuDeltaTicksLowerBound,null)
})

test('sampler budget, final callback and retained evidence limits remain hard bounds with bounded diagnostics',()=>{
 const h=fixture();h.setNames(['10',...Array.from({length:300},(_,i)=>String(i+1000))]);const got=h.read();assert.equal(got.events.length,256);assert.equal(got.readCost.omittedEvents,44)
 const expired=fixture();expired.setHook(()=>expired.setTime(100));assert.throws(()=>expired.read(),/budget exhausted/)
 let time=0;const reader=createPgClusterReader({postmaster:h.postmaster,remainingMs:()=>1000,now:()=>time,io:{readdir:()=>['10'],readText:p=>h.files.get(p)},record:()=>{time=100}});assert.throws(()=>reader(),/budget exhausted/)
 const capped=createPgClusterSeries({maxEvidenceBytes:10});assert.throws(()=>capped.add(frame(1,[])),/evidence byte bound/)
})

test('real bounded Node child birth and exit are observed without PG services or FD stability requirements',async()=>{
 const root=process.env.C26_PREPARE_EVIDENCE_ROOT;assert.ok(root);const out=path.join(root,'cluster-real-child-private.json');assert.equal(fs.existsSync(out),false)
 const self={...parseProcStat(fs.readFileSync(`/proc/${process.pid}/stat`,'utf8')),role:'pg_postmaster'},events=[]
 const deadline=performance.now()+4000,reader=createPgClusterReader({postmaster:self,remainingMs:()=>deadline-performance.now(),record:e=>events.push(e)})
 const before=reader(),child=spawn(process.execPath,['-e',"process.send({ready:true});process.on('message',()=>process.exit(0));setTimeout(()=>process.exit(7),2500)"],{stdio:['ignore','ignore','ignore','ipc']})
 const closed=once(child,'close');let code,signal,during,after
 try{
  await Promise.race([once(child,'message'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('synthetic child readiness deadline')),2000);timer.unref()})])
  during=reader();assert.notEqual(during.observation,'NOT_OBSERVED');assert.ok(during.processes.some(p=>p.pid===child.pid));child.send('exit');[code,signal]=await closed;assert.equal(code,0);assert.equal(signal,null);after=reader();assert.equal(after.processes.some(p=>p.pid===child.pid),false)
  const series=createPgClusterSeries();for(const f of [before,during,after])series.add(f);const summary=series.snapshot(),owned=summary.processes.find(p=>p.pid===child.pid);assert.ok(owned);assert.equal(owned.observedCpuDeltaTicks,null);assert.equal(owned.tailCoverage,'NOT_OBSERVED_AFTER_LAST_SAMPLE')
  fs.writeFileSync(out,JSON.stringify({scope:'SYNTHETIC_NODE_FAMILY_NO_PG_OR_API',parent:self,childPid:child.pid,exit:{code,signal},events,summary},null,2)+'\n',{flag:'wx',mode:0o600})
 }finally{if(code===undefined){child.kill('SIGKILL');await closed}}
})
