/** C26 cluster measurements only. No FD/socket attribution and NO signal or
 * cleanup authority. The caller separately owns exact process lifecycle proof.
 * Importing is inert. Dynamic child sets are sampled, never forced to stabilize.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {parseProcStat} from './c25-c26-observer.mjs'

export const PG_CLUSTER_SCOPE='CONTROLLED_POSTMASTER_AND_DIRECT_CHILDREN_INCLUDES_OBSERVER_BACKEND'
const TERMINAL=new Set(['Z','X','x'])
const missing=error=>['ENOENT','ESRCH'].includes(error.code)
const id=p=>`${p.pid}:${p.startTicks}`
const integer=(value,label)=>assert.ok(Number.isSafeInteger(value)&&value>=0,`invalid ${label}`)
const exact=(a,b)=>{for(const key of ['pid','startTicks','parentPid','processGroupId'])assert.equal(a[key],b[key],`postmaster ${key} changed`)}
const realIo={
 readdir:directory=>fs.readdirSync(directory),
 readText(file,max){const fd=fs.openSync(file,'r');try{const buf=Buffer.alloc(max+1);let used=0;while(used<=max){const n=fs.readSync(fd,buf,used,buf.length-used,null);if(!n)break;used+=n}assert.ok(used<=max,'proc text bound');return buf.subarray(0,used).toString('utf8')}finally{fs.closeSync(fd)}},
}

/** One bounded enumeration, no retry or global-set equality. An unclassified
 * disappearing numeric PID is a coverage gap, not proof it was unrelated or a
 * zero-cost PG process. Permission/parse/identity errors are retained as missing
 * measurement, never accepted as valid counters. Budget/output errors throw.
 * Only exact postmaster identity and PPID prove this metric scope. PGID is raw
 * diagnostic for children (PostgreSQL legitimately setsid after fork).
 */
export function createPgClusterReader({postmaster,remainingMs,record,io=realIo,now=()=>performance.now(),maxReadMs=100}){
 assert.ok(postmaster&&postmaster.role==='pg_postmaster');integer(postmaster.pid,'postmaster PID');assert.ok(postmaster.pid>0);assert.match(postmaster.startTicks,/^[0-9]+$/)
 for(const key of ['parentPid','processGroupId'])integer(postmaster[key],key)
 for(const value of [remainingMs,record,now,io.readText,io.readdir])assert.equal(typeof value,'function')
 assert.ok(Number.isSafeInteger(maxReadMs)&&maxReadMs>0&&maxReadMs<=100)
 postmaster=Object.freeze({...postmaster});let sequence=0,lastTime=-Infinity
 return function readCluster(){
  const clock=()=>{const value=now();assert.ok(Number.isFinite(value)&&value>=lastTime,'cluster clock reversed');lastTime=value;return value}
  const started=clock(),cpuStarted=process.cpuUsage(),frame={schemaVersion:1,sequence:++sequence,scope:PG_CLUSTER_SCOPE,observation:'OBSERVED',postmaster,processes:[],events:[],enumeration:'ONE_BOUNDED_PROC_PPID_SCAN',roleAttribution:'NOT_OBSERVED_BY_DESIGN',hwm:'UNRELIABLE_RAW_DIAGNOSTIC_ONLY',unknownBetweenSamples:'PROCESSES_BORN_AND_EXITED_BETWEEN_SAMPLES_MAY_BE_UNOBSERVED'}
  let reads=0,bytes=0,listed=0,omittedEvents=0
  const guard=()=>{const remaining=remainingMs();if(!(Number.isFinite(remaining)&&remaining>0&&clock()-started<maxReadMs&&reads<=6148&&bytes<=8*1024**2))throw Object.assign(new Error('cluster sample budget exhausted'),{code:'C26_MEASUREMENT_GUARD'})}
  const event=value=>{frame.observation='PARTIAL';if(frame.events.length<256)frame.events.push(value);else omittedEvents++}
  const errorEvent=(error,pid,operation,before=null,after=null)=>({pid,operation,path:error.procPath??`/proc/${pid}/stat`,error:{name:error.name,code:error.code??null,message:error.message},observation:'NOT_OBSERVED',before,after})
  const read=(file,max=65536)=>{guard();reads++;try{const text=io.readText(file,max);assert.equal(typeof text,'string');const size=Buffer.byteLength(text);assert.ok(size<=max,'proc input bound');bytes+=size;guard();return text}catch(error){error.procPath=file;throw error}}
  const stat=pid=>{const p=parseProcStat(read(`/proc/${pid}/stat`));assert.equal(p.pid,pid,'proc PID differs from path');return p}
  const safeError=(error,pid,operation,before,after)=>{if(error.code==='C26_MEASUREMENT_GUARD')throw error;event(errorEvent(error,pid,operation,before,after))}
  const sample=before=>{
   const observedAtMs=clock(),terminal=TERMINAL.has(before.state)
   let status=null,after=null
   if(!terminal){
    try{status=read(`/proc/${before.pid}/status`)}catch(error){safeError(error,before.pid,'status',before)}
    try{after=stat(before.pid)}catch(error){safeError(error,before.pid,'stat-after',before)}
   }
   if(after){
    if(id(after)!==id(before)||after.parentPid!==before.parentPid){event({pid:before.pid,operation:'identity-bracket',observation:'NOT_OBSERVED',reason:'IDENTITY_OR_PARENT_CHANGED',before,after});status=null;after=null}
    else if(after.userTicks<before.userTicks||after.systemTicks<before.systemTicks){event({pid:before.pid,operation:'counter-bracket',observation:'NOT_OBSERVED',reason:'COUNTER_REVERSED',before,after});return}
   }
   const point=after??before;let rssBytes=null,vmHwmRawBytes=null
   if(status&&after&&!TERMINAL.has(after.state)){
    try{
     const kb=key=>{const matches=[...status.matchAll(new RegExp(`^${key}:\\s+(\\d+) kB$`,'gm'))];assert.equal(matches.length,1,`missing/duplicate ${key}`);const result=Number(matches[0][1])*1024;integer(result,key);return result}
     rssBytes=kb('VmRSS');vmHwmRawBytes=kb('VmHWM')
    }catch(error){safeError(error,before.pid,'status-parse',before,after);rssBytes=null;vmHwmRawBytes=null}
   }
   frame.processes.push({...point,observedAtMs:after?clock():observedAtMs,rssBytes,vmHwmRawBytes,rssObservation:rssBytes===null?'NOT_OBSERVED':'SAMPLED',terminal:TERMINAL.has(point.state),counterScope:'ACTUAL_PROCESS_LIFETIME_COUNTER_AT_OBSERVATION'})
  }
  try{
   const before=stat(postmaster.pid);exact(before,postmaster);assert.ok(!TERMINAL.has(before.state),'postmaster terminal');sample(before)
   guard();reads++;const names=io.readdir('/proc');assert.ok(Array.isArray(names)&&names.length<=8192,'proc directory bound')
   const pids=names.filter(name=>typeof name==='string'&&/^[1-9][0-9]*$/.test(name)).map(Number);assert.ok(pids.length<=2048,'proc numeric PID bound');assert.equal(new Set(pids).size,pids.length,'duplicate numeric PID');listed=pids.length
   for(const pid of pids){
    if(pid===postmaster.pid)continue
    let child
    try{child=stat(pid)}catch(error){safeError(error,pid,missing(error)?'enumeration-disappearance':'enumeration-error');continue}
    if(child.parentPid===postmaster.pid){assert.ok(frame.processes.length<512,'cluster process bound');sample(child)}
   }
   const after=stat(postmaster.pid);exact(after,postmaster);assert.ok(!TERMINAL.has(after.state),'postmaster terminal');frame.postmasterBracket={before,after}
  }catch(error){
   if(error.code==='C26_MEASUREMENT_GUARD')throw error
   frame.observation='NOT_OBSERVED';frame.scopeFailure=errorEvent(error,postmaster.pid,'cluster-scope');frame.discardedProcessObservations=frame.processes;frame.processes=[]
  }
  guard();frame.completedAtMs=clock();frame.readCost={reads,bytes,listedNumericPids:listed,elapsedMs:clock()-started,cpuMicroseconds:process.cpuUsage(cpuStarted),omittedEvents};record(structuredClone(frame));guard();return frame
 }
}

/** Accumulate only real same-PID/startTicks counter intervals. First lifetime
 * totals are never used as window deltas; vanished tails are never filled with
 * the last value. A later generation of one numeric PID is a separate series.
 * The sum is always a sampled lower bound, not complete cluster CPU or RSS.
 */
export function createPgClusterSeries({maxEvidenceBytes=8*1024**2}={}){
 assert.ok(Number.isSafeInteger(maxEvidenceBytes)&&maxEvidenceBytes>0&&maxEvidenceBytes<=8*1024**2)
 const processes=new Map(),frames=[],gaps=[];let previousSequence=0,lastCompleted=-Infinity,retainedBytes=0,failure=null
 return Object.freeze({
  add(frame){
   if(failure)throw failure
   try{
   retainedBytes+=Buffer.byteLength(JSON.stringify(frame));assert.ok(retainedBytes<=maxEvidenceBytes,'cluster series evidence byte bound');
   assert.equal(frame.scope,PG_CLUSTER_SCOPE);assert.equal(frame.sequence,previousSequence+1);assert.ok(['OBSERVED','PARTIAL','NOT_OBSERVED'].includes(frame.observation));assert.ok(Number.isFinite(frame.completedAtMs)&&frame.completedAtMs>=lastCompleted)
   assert.ok(frames.length<2048&&frame.processes.length<=512&&processes.size<=4096,'cluster series bound')
   const present=new Set(),numeric=new Set()
   for(const p of frame.processes){
    integer(p.pid,'PID');assert.match(p.startTicks,/^[0-9]+$/);for(const key of ['userTicks','systemTicks'])integer(p[key],key);assert.ok(Number.isFinite(p.observedAtMs)&&p.observedAtMs<=frame.completedAtMs)
    assert.ok(!numeric.has(p.pid),'duplicate PID in one sample');numeric.add(p.pid);const key=id(p);present.add(key)
    let series=processes.get(key)
    if(!series){series={pid:p.pid,startTicks:p.startTicks,firstSequence:frame.sequence,observations:[],intervals:[],gaps:[]};processes.set(key,series)}
    const prior=series.observations.at(-1)
    if(prior){
     assert.ok(p.observedAtMs>=prior.observedAtMs,'process observation clock reversed');assert.ok(p.userTicks>=prior.userTicks&&p.systemTicks>=prior.systemTicks,'same identity CPU counter reversed');assert.ok(!prior.terminal||p.terminal,'terminal process revived')
     series.intervals.push({fromSequence:prior.sequence,toSequence:frame.sequence,fromMs:prior.observedAtMs,toMs:p.observedAtMs,userTicks:p.userTicks-prior.userTicks,systemTicks:p.systemTicks-prior.systemTicks,crossesUnsampledFrames:prior.sequence+1!==frame.sequence})
    }
    if(p.rssBytes!==null)integer(p.rssBytes,'sampled RSS')
    series.observations.push({...structuredClone(p),sequence:frame.sequence})
   }
   for(const [key,series] of processes){if(!present.has(key)&&series.observations.at(-1).sequence===previousSequence&&!series.observations.at(-1).terminal)series.gaps.push({afterSequence:previousSequence,atSequence:frame.sequence,observation:'NOT_OBSERVED',terminalCounter:null})}
   if(frame.observation!=='OBSERVED')gaps.push({sequence:frame.sequence,observation:frame.observation,events:structuredClone(frame.events),scopeFailure:frame.scopeFailure??null,omittedEvents:frame.readCost.omittedEvents})
   const rssObserved=frame.processes.filter(p=>p.rssBytes!==null),rss=rssObserved.length?rssObserved.reduce((sum,p)=>sum+p.rssBytes,0):null
   frames.push({sequence:frame.sequence,completedAtMs:frame.completedAtMs,observation:frame.observation,processIdentities:[...present],sampledRssSumBytes:rss,rssObservedMembers:rssObserved.length,rssMissingMembers:frame.processes.length-rssObserved.length,rssAggregateCompleteForObservedMembers:frame.processes.length>0&&rssObserved.length===frame.processes.length,readCost:structuredClone(frame.readCost)})
   previousSequence=frame.sequence;lastCompleted=frame.completedAtMs
   }catch(error){failure=error;throw error}
  },
  snapshot(){
   const rows=[...processes.values()].map(series=>{
    const first=series.observations[0],last=series.observations.at(-1),observed=series.intervals.length>0
    return {...structuredClone(series),observedCpuDeltaTicks:observed?series.intervals.reduce((sum,p)=>({user:sum.user+p.userTicks,system:sum.system+p.systemTicks}),{user:0,system:0}):null,headCoverage:series.firstSequence===1?'FIRST_FRAME_SAMPLE':'NOT_OBSERVED_BEFORE_FIRST_SAMPLE',tailCoverage:last.terminal?'TERMINAL_COUNTER_OBSERVED':last.sequence===previousSequence?'FINAL_FRAME_SAMPLE':'NOT_OBSERVED_AFTER_LAST_SAMPLE',sampledRssPeakBytes:series.observations.filter(p=>p.rssBytes!==null).reduce((peak,p)=>Math.max(peak??0,p.rssBytes),null),cpuScope:'ONLY_ACTUAL_SAME_IDENTITY_COUNTER_INTERVALS',firstObservedAtMs:first.observedAtMs,lastObservedAtMs:last.observedAtMs}
   })
   const observed=rows.filter(row=>row.observedCpuDeltaTicks!==null)
   return {schemaVersion:1,scope:PG_CLUSTER_SCOPE,retainedInputBytes:retainedBytes,invalidReason:failure?{name:failure.name,message:failure.message}:null,metricCoverage:{status:failure||!frames.length?'NOT_OBSERVED':gaps.length?'INCOMPLETE_SAMPLED_LOWER_BOUND':'SAMPLED_LOWER_BOUND',completeLifetimeCpu:false,roleAttribution:'NOT_OBSERVED_BY_DESIGN',includesObserverBackend:true,betweenSamplesBirthExit:'NOT_OBSERVED',rssScope:'SEQUENTIAL_OBSERVED_SUBSET_SUM; NOT_ATOMIC_OR_A_BOUND_ON_SIMULTANEOUS_CLUSTER_PEAK',hwm:'UNRELIABLE_RAW_DIAGNOSTIC_ONLY'},sampledCpuDeltaTicksLowerBound:!failure&&observed.length?observed.reduce((sum,p)=>({user:sum.user+p.observedCpuDeltaTicks.user,system:sum.system+p.observedCpuDeltaTicks.system}),{user:0,system:0}):null,sampledRssSumPeakBytes:frames.filter(f=>f.sampledRssSumBytes!==null).reduce((peak,f)=>Math.max(peak??0,f.sampledRssSumBytes),null),processes:rows,frames:structuredClone(frames),gaps:structuredClone(gaps),observerReadCost:frames.reduce((sum,f)=>({samples:sum.samples+1,reads:sum.reads+f.readCost.reads,bytes:sum.bytes+f.readCost.bytes,elapsedMs:sum.elapsedMs+f.readCost.elapsedMs,cpuMicroseconds:{user:sum.cpuMicroseconds.user+f.readCost.cpuMicroseconds.user,system:sum.cpuMicroseconds.system+f.readCost.cpuMicroseconds.system}}),{samples:0,reads:0,bytes:0,elapsedMs:0,cpuMicroseconds:{user:0,system:0}}),readCostScope:'SAMPLER_BODY_TO_COST_SAMPLE; RECORD_CALLBACK_EXCLUDED',costSubtraction:'NONE; OBSERVER_NODE_COST_IS_NOT_PG_BACKEND_COST'}
  },
 })
}
