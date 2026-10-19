/** Inert Linux /proc adapter for C26's injected readProc contract.
 * Only explicit registry owners and ALL direct postmaster children are read.
 * No PG port/application-name filtering: attribution belongs to pg-observer.
 * record is mandatory: a discarded racing snapshot retains its actual samples.
 * One complete retry is allowed for explicit fd/child-list races only, within
 * the SAME <=100ms and caller budget. Permission/parse/PID reuse never retries.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import {parseProcStat} from './c25-c26-observer.mjs'

const MAX_PROCESSES=512,MAX_FDS=2048,MAX_ROWS=8192,MAX_TEXT=1024*1024
const STATES=Object.freeze({'01':'ESTABLISHED','02':'SYN_SENT','03':'SYN_RECV','04':'FIN_WAIT1','05':'FIN_WAIT2','06':'TIME_WAIT','07':'CLOSE','08':'CLOSE_WAIT','09':'LAST_ACK','0A':'LISTEN','0B':'CLOSING','0C':'NEW_SYN_RECV'})
const ROLES=new Set(['api','report_worker','export_worker','driver','observer','redis','pg_postmaster','pg_background'])
const exact=(value,label)=>{assert.equal(typeof value,'string',label);assert.match(value,/^(0|[1-9][0-9]*)$/,label);return value}
const integer=(value,label,positive=false)=>{assert.ok(Number.isSafeInteger(value)&&value>=(positive?1:0),`invalid ${label}`);return value}
const identity=value=>`${integer(value.pid,'PID',true)}:${exact(value.startTicks,'startTicks')}`
const missing=error=>['ENOENT','ESRCH'].includes(error?.code)
class SnapshotRace extends Error{constructor(reason){super(reason);this.code='PROC_SNAPSHOT_RACE'}}
const race=reason=>{throw new SnapshotRace(reason)}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
function boundedText(path,maxBytes){
 const fd=fs.openSync(path,'r'),buffer=Buffer.allocUnsafe(maxBytes+1);let used=0
 try{while(used<buffer.length){const n=fs.readSync(fd,buffer,used,buffer.length-used,null);if(n===0)break;used+=n}assert.ok(used<=maxBytes,'oversized proc file');return buffer.toString('utf8',0,used)}finally{fs.closeSync(fd)}
}
const realIo=Object.freeze({readText:boundedText,readdir:path=>fs.readdirSync(path),readlink:path=>fs.readlinkSync(path),
 openDirectory(path,max){const handle=fs.opendirSync(path);const entries=[];try{let entry;while((entry=handle.readSync())){entries.push(entry.name);assert.ok(entries.length<=max,'proc directory bound')}return {entries,close:()=>handle.closeSync()}}catch(error){handle.closeSync();throw error}},
})
function address(hex,family,byteOrder){
 assert.ok(['LE','BE'].includes(byteOrder),'unknown native byte order');assert.match(hex,new RegExp(`^[0-9A-Fa-f]{${family===4?8:32}}$`),'invalid proc address')
 const bytes=[]
 for(let i=0;i<hex.length;i+=8){const word=hex.slice(i,i+8).match(/../g);bytes.push(...(byteOrder==='LE'?word.reverse():word).map(x=>parseInt(x,16)))}
 if(family===4)return bytes.join('.')
 const words=Array.from({length:8},(_,i)=>(bytes[2*i]*256+bytes[2*i+1]).toString(16))
 // Preserve the real mapped IPv4 address; it is NOT rewritten to loopback ::1.
 if(words.slice(0,5).every(x=>x==='0')&&words[5]==='ffff')return `::ffff:${bytes.slice(12).join('.')}`
 let start=-1,length=0
 for(let i=0;i<8;){if(words[i]!=='0'){i++;continue}let end=i;while(end<8&&words[end]==='0')end++;if(end-i>length){start=i;length=end-i}i=end}
 if(length<2)return words.join(':')
 return `${words.slice(0,start).join(':')}::${words.slice(start+length).join(':')}`
}
/** Strict native-endian /proc/net/{tcp,tcp6,udp,udp6}; keeps every table row. */
export function parseProcInet(text,{family=4,protocol='tcp',byteOrder=os.endianness()}={}){
 assert.ok([4,6].includes(family)&&['tcp','udp'].includes(protocol),'invalid inet table kind')
 assert.equal(typeof text,'string');assert.ok(Buffer.byteLength(text)<=MAX_TEXT,'oversized inet table')
 const lines=text.trimEnd().split('\n');assert.match(lines.shift(),/^\s*sl\s+local_address\s+rem(?:ote)?_address\s+st\s/,'invalid inet header');assert.ok(lines.length<=MAX_ROWS,'inet row bound')
 return lines.map(line=>{
  const f=line.trim().split(/\s+/);assert.ok(f.length>=10,'truncated inet row');assert.match(f[0],/^\d+:$/,'invalid inet slot')
  const endpoint=value=>{const match=value.match(/^([0-9A-Fa-f]+):([0-9A-Fa-f]{4})$/);assert.ok(match,'invalid inet endpoint');return {address:address(match[1],family,byteOrder),port:parseInt(match[2],16)}}
  const local=endpoint(f[1]),remote=endpoint(f[2]),stateCode=f[3].toUpperCase();assert.ok(STATES[stateCode],'unknown inet state');exact(f[9],'socket inode')
  assert.match(f[4],/^[0-9A-Fa-f]{8}:[0-9A-Fa-f]{8}$/,'invalid inet queue');assert.match(f[5],/^[0-9A-Fa-f]{2}:[0-9A-Fa-f]{8}$/,'invalid inet timer');assert.match(f[6],/^[0-9A-Fa-f]{8}$/,'invalid inet retransmit');exact(f[7],'socket UID');exact(f[8],'socket timeout')
  return {protocol,family,localAddress:local.address,localPort:local.port,remoteAddress:remote.address,remotePort:remote.port,state:STATES[stateCode],stateCode,inode:f[9]}
 })
}
export function parseProcUnix(text){
 assert.equal(typeof text,'string');assert.ok(Buffer.byteLength(text)<=MAX_TEXT,'oversized unix table');const lines=text.trimEnd().split('\n')
 assert.match(lines.shift(),/^Num\s+RefCount\s+Protocol\s+Flags\s+Type\s+St\s+Inode(?:\s+Path)?$/,'invalid unix header');assert.ok(lines.length<=MAX_ROWS,'unix row bound')
 return lines.map(line=>{const f=line.trim().split(/\s+/);assert.ok(f.length>=7,'truncated unix row');assert.match(f[0],/^[0-9a-fA-F]+:$/);for(const i of [1,2,3])assert.match(f[i],/^[0-9a-fA-F]{8}$/);assert.equal(f[2],'00000000','unknown unix protocol');assert.match(f[4],/^(0001|0002|0005)$/,'unknown unix socket type');assert.match(f[5],/^(01|02|03|04)$/,'unknown unix socket state');exact(f[6],'unix inode');return {protocol:'unix',family:'unix',inode:f[6],socketType:f[4],state:`UNIX_${f[5]}`}})
}

/** Registry entries MUST include the actual, pinned processGroupId.
 * Missing workers are returned as explicit missingProcessIdentities, never zero
 * rows: the PG observer alone permits its exact prepared-owner close gap.
 * All other missing owners fail here. Reuse/PGID changes are never close gaps.
 * sockets contains every owned TCP ESTABLISHED row; socketInventory retains
 * UDP, Unix, listening and other known states explicitly. Unknown socket inodes
 * fail rather than being misclassified as an irrelevant descriptor.
 */
export function createProcSocketReader({registry,remainingMs,record,io=realIo,now=()=>performance.now(),maxReadMs=100,byteOrder=os.endianness()}){
 assert.equal(typeof registry?.entries,'function');for(const fn of [remainingMs,record,now,io.readText,io.readdir,io.readlink])assert.equal(typeof fn,'function')
 assert.ok(Number.isSafeInteger(maxReadMs)&&maxReadMs>0&&maxReadMs<=100,'proc budget exceeds sample interval');assert.ok(['LE','BE'].includes(byteOrder))
 const seen=new Map();let lastNow=-Infinity,childEnumerationMethod=null
 return function readProc(){
  const clock=()=>{const value=now();assert.ok(Number.isFinite(value)&&value>=lastNow,'proc clock went backwards');lastNow=value;return value}
  const started=clock(),cpuStarted=process.cpuUsage();let readCount=0,bytesRead=0,globalProcScans=0,globalProcRows=0,globalProcElapsedMs=0;let directoryHandles=[]
  const check=()=>{const left=remainingMs();assert.ok(Number.isFinite(left)&&left>0&&clock()-started<maxReadMs,'proc sample deadline exhausted');assert.ok(readCount<=12000,'proc read count bound')}
  const readText=(path,max=65536)=>{check();readCount++;let value;try{value=io.readText(path,max)}catch(error){error.procPath=path;throw error}assert.equal(typeof value,'string');const bytes=Buffer.byteLength(value);assert.ok(bytes<=max,'oversized proc input');bytesRead+=bytes;assert.ok(bytesRead<=8*MAX_TEXT,'proc input byte bound');return value}
  const readlink=path=>{check();readCount++;let value;try{value=io.readlink(path)}catch(error){error.procPath=path;throw error}assert.ok(typeof value==='string'&&value.length<=4096,'invalid proc symlink');return value}
  const directory=(path,max)=>{check();readCount++;let entries;try{if(io.openDirectory){const opened=io.openDirectory(path,max);directoryHandles.push(opened);entries=opened.entries}else entries=io.readdir(path)}catch(error){error.procPath=path;throw error}assert.ok(Array.isArray(entries)&&entries.length<=max,'proc directory bound');assert.ok(entries.every(x=>typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x)),'invalid proc directory name');assert.equal(new Set(entries).size,entries.length,'duplicate proc entry');return entries.sort((a,b)=>Number(a)-Number(b))}
  const stat=pid=>{const p=parseProcStat(readText(`/proc/${pid}/stat`));assert.equal(p.pid,pid,'proc PID mismatch');assert.match(p.state,/^[RSDTtZXxKWPI]$/,'unknown process state');integer(p.processGroupId,'process group',true);return p}
  const pin=p=>{const old=seen.get(p.pid);if(old)assert.ok(old.startTicks===p.startTicks&&old.processGroupId===p.processGroupId&&old.parentPid===p.parentPid,'PID reused or process group/parent changed');else{assert.ok(seen.size<2048,'proc identity history bound');seen.set(p.pid,{startTicks:p.startTicks,processGroupId:p.processGroupId,parentPid:p.parentPid})}}
  const attempts=[]
  for(let attempt=1;attempt<=2;attempt++){
   const processes=[],missingProcessIdentities=[],terminatedProcessObservations=[],terminatedPgChildObservations=[]
   try{
    check();const owners=registry.entries();assert.ok(Array.isArray(owners)&&owners.length>0&&owners.length<=MAX_PROCESSES,'owned process bound');const ownerPids=new Set()
    for(const owner of owners){identity(owner);integer(owner.processGroupId,'owned process group',true);assert.ok(ROLES.has(owner.role),'unknown owned role');assert.ok(!ownerPids.has(owner.pid),'duplicate owner PID');ownerPids.add(owner.pid)}
    const postmasters=owners.filter(p=>p.role==='pg_postmaster');assert.equal(postmasters.length,1,'one owned postmaster required');const postmaster=postmasters[0]
    const namespace=readlink('/proc/self/ns/net');assert.match(namespace,/^net:\[\d+\]$/,'invalid network namespace')
    const terminated=(p,owner)=>{
     if(!['Z','X','x'].includes(p.state))return false
     if(!owner){assert.equal(p.parentPid,postmaster.pid,'terminal PG child parent changed');pin(p);terminatedPgChildObservations.push({...p});return true}
     assert.ok(['report_worker','export_worker'].includes(owner.role),'required process became terminal')
     assert.equal(identity(p),identity(owner));assert.equal(p.processGroupId,owner.processGroupId);if(owner.parentPid!==undefined)assert.equal(p.parentPid,owner.parentPid);pin(p)
     const id=identity(owner);if(!missingProcessIdentities.includes(id))missingProcessIdentities.push(id)
     terminatedProcessObservations.push({...p,rssObservation:'NOT_AVAILABLE_AFTER_TERMINATION',terminalCloseProof:'STILL_REQUIRED_BY_PG_OBSERVER'})
     return true
    }
    const sample=(pid,owner)=>{
     let before
     try{before=stat(pid)}catch(error){
      if(!missing(error))throw error
      if(!owner)race('PG child disappeared during process sample')
      assert.ok(['report_worker','export_worker'].includes(owner.role),'required owned process missing')
      try{const returned=stat(pid);assert.equal(identity(returned),identity(owner),'owned PID reused after disappearance');assert.equal(returned.processGroupId,owner.processGroupId,'owned process group changed after disappearance');race('missing owner reappeared during sample')}catch(again){if(!missing(again))throw again}
      missingProcessIdentities.push(identity(owner));return
     }
     if(owner){assert.equal(identity(before),identity(owner),'owned PID reused');assert.equal(before.processGroupId,owner.processGroupId,'owned process group changed')}
     else assert.equal(before.parentPid,postmaster.pid,'PG child is not a direct postmaster child')
     pin(before);if(terminated(before,owner))return;assert.equal(readlink(`/proc/${pid}/ns/net`),namespace,'process network namespace differs')
     const status=readText(`/proc/${pid}/status`),after=stat(pid);assert.equal(identity(after),identity(before),'PID reused during proc sample');assert.equal(after.processGroupId,before.processGroupId,'process group changed during sample');assert.equal(after.parentPid,before.parentPid,'parent changed during sample');pin(after);if(terminated(after,owner))return
     assert.ok(after.userTicks>=before.userTicks&&after.systemTicks>=before.systemTicks,'CPU counter went backwards')
     const kb=key=>{const matches=[...status.matchAll(new RegExp(`^${key}:\\s+(\\d+) kB$`,'gm'))];assert.equal(matches.length,1,`missing/duplicate ${key}`);return integer(Number(matches[0][1])*1024,key)}
     const p={...after,rssBytes:kb('VmRSS'),vmHwmLifetimeBytes:kb('VmHWM')};assert.ok(p.vmHwmLifetimeBytes>=p.rssBytes,'VmHWM smaller than RSS');processes.push(p)
    }
    for(const owner of owners)sample(owner.pid,owner)
    const children=()=>{
     const tids=directory(`/proc/${postmaster.pid}/task`,MAX_PROCESSES);assert.ok(tids.includes(String(postmaster.pid)),'postmaster task missing');const pids=[]
     if(childEnumerationMethod!=='COMPLETE_PROC_PPID'){
      try{
       for(const tid of tids){const text=readText(`/proc/${postmaster.pid}/task/${tid}/children`).trim();if(text)for(const value of text.split(/\s+/)){assert.match(value,/^[1-9][0-9]*$/,'invalid PG child PID');pids.push(integer(Number(value),'PG child PID',true))}}
       childEnumerationMethod='TASK_CHILDREN';assert.ok(pids.length<=MAX_PROCESSES,'PG child bound');assert.equal(new Set(pids).size,pids.length,'duplicate PG child');return {method:childEnumerationMethod,tids,pids:pids.sort((a,b)=>a-b)}
      }catch(error){
       // Only a genuinely absent children interface permits this alternative.
       // A previously available interface disappearing remains a snapshot race.
       if(childEnumerationMethod||error.code!=='ENOENT'||!/^\/proc\/[0-9]+\/task\/[0-9]+\/children$/.test(error.procPath??''))throw error
       const still=stat(postmaster.pid);assert.equal(identity(still),identity(postmaster));assert.equal(still.processGroupId,postmaster.processGroupId)
       assert.ok(directory(`/proc/${postmaster.pid}/task`,MAX_PROCESSES).includes(String(postmaster.pid)),'postmaster disappeared during interface detection')
       childEnumerationMethod='COMPLETE_PROC_PPID'
      }
     }
     // This kernel omits task/<tid>/children. Enumerate every numeric /proc PID;
     // no missing stat, permission error or parse error may be treated as empty.
     const scanAt=clock();check();readCount++;const raw=io.readdir('/proc');assert.ok(Array.isArray(raw)&&raw.length<=8192,'global proc directory bound')
     const ids=raw.filter(x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x)).sort((a,b)=>Number(a)-Number(b));assert.ok(ids.length<=2048,'global process bound');assert.equal(new Set(ids).size,ids.length,'duplicate global PID')
     const all=ids.map(value=>{const p=stat(Number(value));return {pid:p.pid,startTicks:p.startTicks,parentPid:p.parentPid,processGroupId:p.processGroupId}})
     check();readCount++;const after=io.readdir('/proc');assert.ok(Array.isArray(after)&&after.length<=8192,'global proc directory bound');const afterIds=after.filter(x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x)).sort((a,b)=>Number(a)-Number(b))
     if(!same(ids,afterIds))race('global process set changed during child enumeration')
     const children=all.filter(p=>p.parentPid===postmaster.pid);assert.ok(children.length<=MAX_PROCESSES,'PG child bound');for(const child of children)pin(child) // Bind the FIRST PPID scan, before sample(pid) can observe a reused PID.
     globalProcScans++;globalProcRows+=all.length;globalProcElapsedMs+=clock()-scanAt;check()
     return {method:childEnumerationMethod,tids,pids:children.map(p=>p.pid),globalIdentities:all}
    }
    const firstChildren=children();for(const pid of firstChildren.pids)if(!ownerPids.has(pid))sample(pid)
    assert.ok(processes.length<=MAX_PROCESSES,'combined process bound')
    for(const pid of firstChildren.pids)assert.equal((processes.find(p=>p.pid===pid)??terminatedPgChildObservations.find(p=>p.pid===pid))?.parentPid,postmaster.pid,'registered PG child parent mismatch')
    const descriptors=()=>{
     const found=[];let total=0
     for(const p of processes){const fds=directory(`/proc/${p.pid}/fd`,MAX_FDS);total+=fds.length;assert.ok(total<=MAX_FDS,'combined fd bound')
      for(const fd of fds){const link=readlink(`/proc/${p.pid}/fd/${fd}`);if(link.startsWith('socket:')){const match=link.match(/^socket:\[([1-9][0-9]*)\]$/);assert.ok(match,'invalid socket inode link');found.push({ownerPid:p.pid,ownerStartTicks:p.startTicks,ownerProcessGroupId:p.processGroupId,ownerFd:integer(Number(fd),'fd'),inode:match[1]})}}
     }return found
    }
    const firstFds=descriptors(),table=[]
    for(const protocol of ['tcp','udp'])for(const family of [4,6])table.push(...parseProcInet(readText(`/proc/net/${protocol}${family===6?'6':''}`,MAX_TEXT),{family,protocol,byteOrder}))
    table.push(...parseProcUnix(readText('/proc/net/unix',MAX_TEXT)))
    const byInode=new Map();for(const row of table)if(row.inode!=='0'){assert.ok(!byInode.has(row.inode),'ambiguous socket inode across network tables');byInode.set(row.inode,row)}
    const socketInventory=firstFds.map(fd=>{const row=byInode.get(fd.inode);if(!row)race('owned socket inode absent from supported network tables');return {...row,...fd}})
    if(!same(firstFds,descriptors()))race('socket fd/inode set changed during sample')
    if(!same(firstChildren,children()))race('postmaster child/task set changed during sample')
    for(const p of processes){const end=stat(p.pid);assert.equal(identity(end),identity(p),'PID reused after socket sample');assert.equal(end.processGroupId,p.processGroupId,'process group changed after socket sample');assert.equal(end.parentPid,p.parentPid,'parent changed after socket sample');assert.ok(end.userTicks>=p.userTicks&&end.systemTicks>=p.systemTicks,'CPU counter went backwards after sockets');pin(end);if(terminated(end,owners.find(owner=>owner.pid===p.pid)))continue;assert.equal(readlink(`/proc/${p.pid}/ns/net`),namespace,'network namespace changed');Object.assign(p,end)}
    for(const observation of [...terminatedProcessObservations,...terminatedPgChildObservations]){try{const end=stat(observation.pid);assert.equal(identity(end),identity(observation),'terminated PID reused');assert.equal(end.processGroupId,observation.processGroupId);assert.equal(end.parentPid,observation.parentPid);assert.ok(['Z','X','x'].includes(end.state),'terminated owner reappeared alive');assert.ok(end.userTicks>=observation.userTicks&&end.systemTicks>=observation.systemTicks);Object.assign(observation,end)}catch(error){if(!missing(error))throw error}}
    const terminatedIds=new Set([...terminatedProcessObservations,...terminatedPgChildObservations].map(identity));for(let i=processes.length-1;i>=0;i--)if(terminatedIds.has(identity(processes[i])))processes.splice(i,1)
    for(const id of missingProcessIdentities.filter(id=>!terminatedIds.has(id))){const pid=Number(id.split(':')[0]);try{const returned=stat(pid);assert.equal(identity(returned),id,'owned PID reused after disappearance');assert.equal(returned.processGroupId,owners.find(p=>p.pid===pid).processGroupId,'owned process group changed after disappearance');race('missing owner reappeared after sample')}catch(error){if(!missing(error))throw error}}
    assert.ok(same(owners,registry.entries()),'owned registry changed during proc read');check()
    const enumeratedPgChildIdentities=firstChildren.pids.map(pid=>{const p=processes.find(p=>p.pid===pid)??terminatedPgChildObservations.find(p=>p.pid===pid);assert.ok(p,'enumerated PG child omitted');return {pid,startTicks:p.startTicks,processGroupId:p.processGroupId,parentPid:p.parentPid}})
    const pgChildren=enumeratedPgChildIdentities.filter(p=>!terminatedIds.has(identity(p))).map(({parentPid,...p})=>p)
    const evidence={kind:'proc_socket_snapshot',attempts:attempt,elapsedMs:clock()-started,readCount,bytesRead,childEnumerationMethod,globalProcScans,globalProcRows,globalProcElapsedMs,observerCpu:process.cpuUsage(cpuStarted),missingProcessIdentities,terminatedProcessObservations,terminatedPgChildObservations,enumeratedPgChildIdentities,discardedAttempts:attempts}
    record(evidence);check();const sockets=socketInventory.filter(row=>row.protocol==='tcp'&&row.state==='ESTABLISHED'&&!terminatedIds.has(`${row.ownerPid}:${row.ownerStartTicks}`));return {processes,sockets,socketInventory,pgChildren,missingProcessIdentities,terminatedProcessObservations,terminatedPgChildObservations,enumeratedPgChildIdentities,snapshotEvidence:evidence}
   }catch(error){
    // A disappearance after a successful initial stat/fd listing is a snapshot
    // race, not permission to omit a row. Exactly one whole resnapshot follows.
    if(missing(error)&&/^\/proc\/[1-9][0-9]*\//.test(error.procPath??'')){const original=error;error=new SnapshotRace('proc entry disappeared during snapshot');error.procPath=original.procPath}
    const evidence={attempt,reason:error.code??error.name,detail:error.message,procPath:error.procPath??null,childEnumerationMethod,globalProcScans,globalProcRows,globalProcElapsedMs,observerCpu:process.cpuUsage(cpuStarted),processes,missingProcessIdentities,terminatedProcessObservations,terminatedPgChildObservations,elapsedMs:clock()-started}
    attempts.push(evidence);record({kind:'proc_socket_snapshot_failure',...evidence,retryAllowed:error instanceof SnapshotRace&&attempt===1})
    if(!(error instanceof SnapshotRace)||attempt===2)throw error
   }finally{for(const handle of directoryHandles.reverse())handle.close();directoryHandles=[]}
  }
  throw new Error('unreachable proc snapshot state')
 }
}
