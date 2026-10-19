/** C26 preparation only: importing this file starts no process or service.
 * Linux /proc observations and cooperative Node child resources are separate
 * clocks/scopes. A terminal sample is NOT an OS exit-rusage record: ACK/exit
 * overhead follows it. No actual report/export workload is implemented here. */
import assert from 'node:assert/strict'
import fs from 'node:fs'

export const PROCESS_ROLES=Object.freeze(['api','report_worker','export_worker','pg_postmaster','pg_background','pg_api_backend','pg_worker_backend','pg_observer_backend','pg_unattributed_backend','redis','driver','observer'])
const TYPE='c26:resources',ACK='c26:resources:ack'
const integer=(value,label)=>assert.ok(Number.isSafeInteger(value)&&value>=0,`invalid ${label}`)
const roleCheck=role=>assert.ok(PROCESS_ROLES.includes(role),'unknown process role')
const nonceCheck=nonce=>assert.match(nonce,/^[a-f0-9]{32,128}$/,'fresh random hex nonce required')
const identityKey=value=>{
 integer(value.pid,'pid');assert.ok(value.pid>0)
 assert.equal(typeof value.startTicks,'string');assert.match(value.startTicks,/^(0|[1-9][0-9]*)$/,'exact startTicks required')
 return `${value.pid}:${value.startTicks}`
}
const monotonic=(before,after,label)=>{
 for(const key of Object.keys(before)){integer(after[key],`${label}.${key}`);assert.ok(after[key]>=before[key],`${label}.${key} counter went backwards`)}
}

export function parseProcStat(text){
 assert.equal(typeof text,'string');assert.ok(text.length<=65536,'oversized proc stat')
 // comm may contain spaces, newlines, and right parentheses. Only the final
 // ") " precedes the numeric tail; do not split the whole line on whitespace.
 const open=text.indexOf(' ('),end=text.lastIndexOf(') ')
 assert.ok(open>0&&end>open,'invalid proc stat delimiters')
 const pidText=text.slice(0,open),fields=text.slice(end+2).trim().split(/\s+/)
 assert.match(pidText,/^[1-9][0-9]*$/);assert.ok(fields.length>=22,'truncated proc stat')
 assert.match(fields[0],/^[RSDZTtXxKWPI]$/,'invalid process state')
 const number=(index,label)=>{assert.match(fields[index],/^\d+$/,`invalid ${label}`);const value=Number(fields[index]);integer(value,label);return value}
 const pid=Number(pidText);integer(pid,'pid');assert.match(fields[19],/^\d+$/,'invalid startTicks')
 return {pid,state:fields[0],parentPid:number(1,'parentPid'),processGroupId:number(2,'processGroupId'),userTicks:number(11,'userTicks'),systemTicks:number(12,'systemTicks'),startTicks:BigInt(fields[19]).toString()}
}
const procIdentity=pid=>{integer(pid,'pid');assert.ok(pid>0);const value=parseProcStat(fs.readFileSync(`/proc/${pid}/stat`,'utf8'));assert.equal(value.pid,pid);return value}

export function readProcSample(pid,role){
 roleCheck(role)
 const before=procIdentity(pid),status=fs.readFileSync(`/proc/${pid}/status`,'utf8'),after=procIdentity(pid)
 assert.equal(identityKey(after),identityKey(before),'PID reused during proc sample')
 monotonic({userTicks:before.userTicks,systemTicks:before.systemTicks},after,'proc')
 const bytes=key=>{const match=status.match(new RegExp(`^${key}:\\s+(\\d+) kB$`,'m'));assert.ok(match,`missing ${key}`);const value=Number(match[1])*1024;integer(value,key);return value}
 return {...after,role,rssBytes:bytes('VmRSS'),vmHwmLifetimeBytes:bytes('VmHWM')}
}

function validateResources(sample){
 assert.ok(sample&&sample.type===TYPE&&sample.schemaVersion===1,'invalid resource sample')
 nonceCheck(sample.nonce);roleCheck(sample.role);identityKey(sample)
 assert.ok(['start','terminal'].includes(sample.phase),'invalid resource phase')
 assert.match(sample.monotonicNs,/^(0|[1-9][0-9]*)$/)
 for(const [section,keys] of Object.entries({cpu:['user','system'],memory:['rss','heapTotal','heapUsed','external','arrayBuffers'],resource:['userCPUTime','systemCPUTime','maxRSS','sharedMemorySize','unsharedDataSize','unsharedStackSize','minorPageFault','majorPageFault','swappedOut','fsRead','fsWrite','ipcSent','ipcReceived','signalsCount','voluntaryContextSwitches','involuntaryContextSwitches']})){
  assert.ok(sample[section]&&typeof sample[section]==='object'&&!Array.isArray(sample[section]),`missing ${section}`)
  assert.deepEqual(Object.keys(sample[section]).sort(),keys.slice().sort(),`invalid ${section} keys`)
  for(const key of keys)integer(sample[section][key],`${section}.${key}`)
 }
 return sample
}

export function sampleNodeResources({nonce,role,phase}){
 nonceCheck(nonce);roleCheck(role);assert.ok(['start','terminal'].includes(phase))
 const {pid,startTicks}=procIdentity(process.pid)
 const resource=process.resourceUsage(),memory=process.memoryUsage(),cpu=process.cpuUsage()
 return validateResources({type:TYPE,schemaVersion:1,nonce,role,phase,pid,startTicks,monotonicNs:process.hrtime.bigint().toString(),cpu,resource,memory})
}

export function validateNodeResourceSample(sample,{nonce,role,pid,startTicks,phase,previous}={}){
 validateResources(sample)
 for(const [key,value]of Object.entries({nonce,role,pid,startTicks,phase})){assert.notEqual(value,undefined,`expected ${key} required`);assert.equal(sample[key],value,`${key} mismatch`)}
 if(previous){
  validateResources(previous)
  assert.equal(previous.phase,'start');assert.equal(sample.phase,'terminal')
  for(const key of ['nonce','role','pid','startTicks'])assert.equal(previous[key],sample[key],`${key} mismatch`)
  assert.ok(BigInt(sample.monotonicNs)>BigInt(previous.monotonicNs),'resource clock went backwards')
  monotonic(previous.cpu,sample.cpu,'cpu');monotonic(previous.resource,sample.resource,'resource')
 }
 return sample
}

/** Call start before work, terminal only after work/cleanup is quiescent. Await
 * both calls. Terminal ACK disconnects IPC; caller must do no more work and
 * allow a normal exit. Parent still requires successful close, not just ACK. */
export function reportNodeResources(options){
 const timeoutMs=options.timeoutMs??2000
 assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=9000,'invalid ACK timeout')
 assert.ok(process.connected&&typeof process.send==='function','child IPC required')
 const sample=sampleNodeResources(options)
 return new Promise((resolve,reject)=>{
  let finished=false
  const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);process.off('message',message);process.off('disconnect',disconnected);if(error)reject(error);else{if(sample.phase==='terminal')process.disconnect();resolve(sample)}}
  const message=ack=>{
   if(ack?.type!==ACK)return
   try{for(const key of ['nonce','role','phase','pid','startTicks'])assert.equal(ack[key],sample[key],`ACK ${key} mismatch`);finish()}catch(error){finish(error)}
  }
  const disconnected=()=>finish(new Error('IPC closed before resource ACK'))
  const timer=setTimeout(()=>finish(new Error('resource ACK timeout')),timeoutMs)
  process.on('message',message);process.once('disconnect',disconnected)
  process.send(sample,error=>{if(error)finish(error)})
 })
}

/** Attach immediately after detached fork/spawn with IPC. Owns this process group.
 * A failed sample/deadline sends TERM then KILL and awaits close. A hard reap
 * deadline fails explicitly with closeObserved=false, never a successful tail.
 * All deadlines including escalation are at most 90 seconds and must fit the
 * caller's remaining aggregate window. ACK/exit CPU is not measured. */
export function observeResourceChild(child,{nonce,role,deadlineMs=5000,killGraceMs=250,reapMs=1000,abortSignal}){
 nonceCheck(nonce);assert.ok(['report_worker','export_worker'].includes(role),'only report/export children allowed')
 for(const value of [deadlineMs,killGraceMs,reapMs])assert.ok(Number.isInteger(value)&&value>0)
 assert.ok(deadlineMs+killGraceMs+reapMs<=90000,'child aggregate budget exceeds 90 seconds')
 assert.ok(child&&Number.isSafeInteger(child.pid)&&child.pid>0&&child.connected,'live IPC child required')
 const owned=procIdentity(child.pid);assert.equal(owned.parentPid,process.pid,'resource child must be a direct owned child');assert.equal(owned.processGroupId,child.pid,'detached owned process group required')
 return new Promise((resolve,reject)=>{
  let start,terminal,failure,done=false,killer,reaper,groupPoll,startAck=false,terminalAck=false
  const hardDeadline=performance.now()+deadlineMs+killGraceMs+reapMs
  const lifecycle={pid:child.pid,processGroupId:owned.processGroupId,startTicks:owned.startTicks,nonce,role,closeObserved:false,code:null,signal:null,terminationSignals:[],groupQuiescent:false,issuedMonotonicNs:process.hrtime.bigint().toString(),aggregateBudgetMs:deadlineMs+killGraceMs+reapMs,terminalToCloseWallNs:null,terminalToCloseCpu:'NOT_OBSERVED'}
  const finish=()=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(killer);clearTimeout(reaper);clearTimeout(groupPoll);child.off('message',message);child.off('error',fail);child.off('close',closed);abortSignal?.removeEventListener('abort',aborted);if(failure){failure.lifecycle={...lifecycle};reject(failure)}else resolve({start,terminal,lifecycle:{...lifecycle,startAck,terminalAck}})}
  const signal=name=>{let sent=false;try{process.kill(-owned.processGroupId,name);sent=true}catch(error){if(error.code!=='ESRCH')failure??=error}lifecycle.terminationSignals.push({signal:name,sent})}
  const fail=error=>{
   if(done||failure)return
   failure=error;signal('SIGTERM')
   killer=setTimeout(()=>{signal('SIGKILL');reaper=setTimeout(()=>{failure.message+='; child close not observed after SIGKILL';finish()},reapMs)},killGraceMs)
  }
  const message=sample=>{
   if(done||failure||sample?.type!==TYPE)return
   try{
    assert.ok(!terminal,'duplicate resource terminal')
    const live=procIdentity(child.pid),phase=start?'terminal':'start'
    assert.equal(identityKey(live),identityKey(owned),'owned PID reused');assert.equal(live.processGroupId,owned.processGroupId,'process group changed')
    validateNodeResourceSample(sample,{nonce,role,pid:child.pid,startTicks:live.startTicks,phase,previous:start})
    if(start){terminal=sample;lifecycle.terminalReceivedMonotonicNs=process.hrtime.bigint().toString();assert.ok(BigInt(lifecycle.terminalReceivedMonotonicNs)>=BigInt(terminal.monotonicNs),'terminal sample is in the future')}else start=sample
    const ack={type:ACK,nonce,role,pid:child.pid,startTicks:live.startTicks,phase}
    child.send(ack,error=>{if(error)fail(error);else if(phase==='start')startAck=true;else terminalAck=true})
   }catch(error){fail(error)}
  }
  const groupMembers=()=>{
   const members=[]
   for(const name of fs.readdirSync('/proc'))if(/^[1-9][0-9]*$/.test(name)){
    try{const member=procIdentity(Number(name));if(member.processGroupId===owned.processGroupId)members.push(member)}
    catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error}
   }
   return members.sort((a,b)=>a.pid-b.pid)
  }
  const liveMembers=members=>members.filter(member=>!['Z','X','x'].includes(member.state))
  const closed=(code,signalName)=>{
   lifecycle.closeObserved=true;lifecycle.code=code;lifecycle.signal=signalName;lifecycle.closedMonotonicNs=process.hrtime.bigint().toString()
   if(terminal)lifecycle.terminalToCloseWallNs=(BigInt(lifecycle.closedMonotonicNs)-BigInt(terminal.monotonicNs)).toString()
   failure??=code!==0||signalName?new Error('resource child abnormal close'):!start||!terminal?new Error('missing start or terminal resource sample'):!startAck||!terminalAck?new Error('missing resource ACK'):null
   // Reaping the leader does not prove its owned session/process group is idle.
   clearTimeout(timer);clearTimeout(killer);clearTimeout(reaper)
   const groupStarted=performance.now(),groupDeadline=Math.min(hardDeadline,groupStarted+reapMs)
   try{
    lifecycle.groupMembersAtClose=groupMembers()
    if(liveMembers(lifecycle.groupMembersAtClose).length){
     failure??=new Error('live descendant remained after resource leader close')
     signal('SIGKILL')
    }
   }catch(error){failure??=error;signal('SIGKILL')}
   const settle=()=>{
    try{
     lifecycle.finalGroupMembers=groupMembers()
     lifecycle.groupQuiescent=liveMembers(lifecycle.finalGroupMembers).length===0
     lifecycle.groupWaitMs=performance.now()-groupStarted
     if(lifecycle.groupQuiescent){finish();return}
     if(performance.now()>=groupDeadline){failure??=new Error('owned process group still live after bounded cleanup');finish();return}
     groupPoll=setTimeout(settle,20)
    }catch(error){failure??=error;finish()}
   }
   settle()
  }
  const timer=setTimeout(()=>fail(new Error('resource child deadline exceeded')),deadlineMs)
  const aborted=()=>fail(abortSignal.reason instanceof Error?abortSignal.reason:new Error('resource coordinator aborted'))
  child.on('message',message);child.on('error',fail);child.once('close',closed)
  if(abortSignal){if(abortSignal.aborted)aborted();else abortSignal.addEventListener('abort',aborted,{once:true})}
 })
}

/** Role groups reference physical accounts and MUST NOT be summed. Only
 * physicalTotals counts each PID+startTicks once. Child lifetime CPU replaces
 * its sampled /proc delta; raw /proc deltas remain separately visible.
 * A required child without its successful handshake+close fails closed. */
export function summarizeProcesses(samples,hz,{children=[],requiredChildren=[]}={}){
 assert.ok(Number.isSafeInteger(hz)&&hz>0,'explicit CLK_TCK required')
 assert.ok(Array.isArray(samples)&&samples.length<=20000);assert.ok(children.length<=512&&requiredChildren.length<=512)
 const accounts=new Map(),roles=Object.fromEntries(PROCESS_ROLES.map(role=>[role,{physicalIdentities:[]}]))
 let lastMs=-1
 for(const frame of samples){
  assert.ok(Number.isFinite(frame.elapsedMs)&&frame.elapsedMs>=lastMs,'sample time went backwards');lastMs=frame.elapsedMs
  assert.ok(Array.isArray(frame.processes)&&frame.processes.length<=512)
  const framePids=new Map(),frameAccounts=new Map()
  for(const proc of frame.processes){
   const id=identityKey(proc);roleCheck(proc.role)
   for(const key of ['userTicks','systemTicks','rssBytes','vmHwmLifetimeBytes'])integer(proc[key],key)
   assert.ok(!framePids.has(proc.pid)||framePids.get(proc.pid)===id,'two identities for one live PID');framePids.set(proc.pid,id)
   const duplicate=frameAccounts.get(id)
   if(duplicate)for(const key of ['userTicks','systemTicks','rssBytes','vmHwmLifetimeBytes'])assert.equal(proc[key],duplicate[key],'inconsistent shared physical sample')
   frameAccounts.set(id,proc)
   const entry=accounts.get(id)
   if(!entry)accounts.set(id,{id,pid:proc.pid,startTicks:proc.startTicks,roles:new Set([proc.role]),first:proc,last:proc,firstMs:frame.elapsedMs,lastMs:frame.elapsedMs,peak:proc.rssBytes})
   else{monotonic({userTicks:entry.last.userTicks,systemTicks:entry.last.systemTicks,vmHwmLifetimeBytes:entry.last.vmHwmLifetimeBytes},proc,'proc');entry.roles.add(proc.role);entry.last=proc;entry.lastMs=frame.elapsedMs;entry.peak=Math.max(entry.peak,proc.rssBytes)}
  }
 }
 const terminalIds=new Set()
 for(const child of children){
  const {start,terminal,lifecycle}=child,id=identityKey(start)
  assert.ok(!terminalIds.has(id),'duplicate terminal physical account');terminalIds.add(id)
  validateNodeResourceSample(terminal,{nonce:start.nonce,role:start.role,pid:start.pid,startTicks:start.startTicks,phase:'terminal',previous:start})
  assert.ok(lifecycle?.closeObserved&&lifecycle.startAck&&lifecycle.terminalAck&&lifecycle.groupQuiescent,'missing terminal handshake/close or owned group still live')
  assert.equal(lifecycle.code,0);assert.equal(lifecycle.signal,null);assert.equal(lifecycle.pid,start.pid);assert.equal(lifecycle.nonce,start.nonce);assert.equal(lifecycle.role,start.role)
  const entry=accounts.get(id)??{id,pid:start.pid,startTicks:start.startTicks,roles:new Set()}
  entry.roles.add(start.role);entry.child=child;accounts.set(id,entry)
 }
 for(const required of requiredChildren)assert.ok(terminalIds.has(identityKey(required)),'required child missing terminal resource sample')
 const physical=[...accounts.values()].map(entry=>{
  if([...entry.roles].some(role=>['report_worker','export_worker'].includes(role))&&!entry.roles.has('driver'))assert.ok(entry.child,'worker missing terminal resource sample')
  const {first,last,child}=entry,proc=first?{userTicks:last.userTicks-first.userTicks,systemTicks:last.systemTicks-first.systemTicks,firstMs:entry.firstMs,lastMs:entry.lastMs,rssStartBytes:first.rssBytes,rssEndBytes:last.rssBytes,rssSampledPeakBytes:entry.peak,vmHwmLifetimeEndBytes:last.vmHwmLifetimeBytes}:null
  const cpu=child?{user:child.terminal.cpu.user,system:child.terminal.cpu.system}:{user:proc.userTicks*1e6/hz,system:proc.systemTicks*1e6/hz}
  for(const role of entry.roles)roles[role].physicalIdentities.push(entry.id)
  return {identity:entry.id,pid:entry.pid,startTicks:entry.startTicks,roles:[...entry.roles],sharedPhysicalProcess:entry.roles.size>1,cpuMicroseconds:cpu,cpuScope:child?'PROCESS_START_TO_TERMINAL_SAMPLE; ACK_EXIT_TAIL_EXCLUDED':'FIRST_TO_LAST_PROC_SAMPLE; EXIT_TAIL_MAY_BE_MISSING',proc,child:child??null}
 })
 return {physical,roles,physicalTotals:physical.reduce((sum,entry)=>({userMicroseconds:sum.userMicroseconds+entry.cpuMicroseconds.user,systemMicroseconds:sum.systemMicroseconds+entry.cpuMicroseconds.system}),{userMicroseconds:0,systemMicroseconds:0}),limitations:['Role references overlap; sum only physical accounts. Different coverage intervals remain explicit.','Node terminal counters include startup and work through sampling, not subsequent ACK/exit overhead.','RSS is sampled; VmHWM/resource.maxRSS are lifetime high water. maxRSS uses KiB; memoryUsage uses bytes.','Below-tick CPU does not establish zero cost. No actual report/export, API, PG or Redis workload is executed by this module.']}
}
