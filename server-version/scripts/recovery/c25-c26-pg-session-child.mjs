/** Gated observer leaf. Only the explicit CLI entry starts it. Test injection
 * replaces PG Client and proc file I/O, never the adapter, observer or protocol.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {parseProcStat} from './c25-c26-observer.mjs'
import {createOwnedPidRegistry,createPgObserver} from './c25-c26-pg-observer.mjs'
import {openReadonlyPgObserver} from './c25-c26-pg-connection.mjs'
import {createProcSocketReader} from './c25-c26-proc-sockets.mjs'
const TYPE='c26:pg-session:v1'
const keys=(value,expected)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),expected.slice().sort(),'unexpected observer command fields')}
const proc=pid=>parseProcStat(fs.readFileSync(`/proc/${pid}/stat`,'utf8'))
const sameIdentity=(actual,expected)=>{for(const key of ['pid','startTicks','processGroupId','parentPid'])assert.equal(actual[key],expected[key],`observer identity ${key} mismatch`)}

export async function runPgSessionChild({createIo}={}){
 process.umask(0o077);assert.equal(process.version,'v24.21.0');assert.equal(process.argv.length,3);assert.ok(process.connected&&typeof process.send==='function')
 const invocationFile=process.argv[2],directory=path.dirname(invocationFile);assert.equal(path.basename(invocationFile),'observer-invocation-private.json');assert.equal(fs.realpathSync(directory),directory)
 const dirStat=fs.lstatSync(directory),inputStat=fs.lstatSync(invocationFile);assert.ok(dirStat.isDirectory());assert.equal(dirStat.mode&0o777,0o700);assert.equal(dirStat.uid,process.getuid());assert.ok(inputStat.isFile());assert.equal(inputStat.nlink,1);assert.equal(inputStat.mode&0o777,0o600);assert.equal(inputStat.uid,process.getuid());assert.ok(inputStat.size<=4096)
 const config=JSON.parse(fs.readFileSync(invocationFile,'utf8'));keys(config,['schemaVersion','nonce','parentPid','deadlineNs','reserveMs','maxJournalBytes']);assert.equal(config.schemaVersion,1);assert.match(config.nonce,/^[a-f0-9]{64}$/);assert.equal(config.parentPid,process.ppid);assert.equal(config.reserveMs,1500);assert.match(config.deadlineNs,/^[0-9]+$/);assert.ok(Number.isSafeInteger(config.maxJournalBytes)&&config.maxJournalBytes>=1024&&config.maxJournalBytes<=64*1024**2)
 const self=proc(process.pid);assert.equal(self.pid,self.processGroupId);assert.equal(self.parentPid,config.parentPid)
 const totalRemaining=()=>{const left=Number(BigInt(config.deadlineNs)-process.hrtime.bigint())/1e6;assert.ok(left>0&&left<=1200000,'observer leaf aggregate deadline');return left}
 const remaining=()=>{const left=totalRemaining()-config.reserveMs;assert.ok(left>0,'observer leaf work deadline');return left}
 const journal=fs.openSync(path.join(directory,'observer-child-raw-private.jsonl'),'wx',0o600),hash=createHash('sha256')
 let journalBytes=0,journalClosed=false,eventSequence=0,currentSequence=0,currentOperation='boot',busy=false,failure=null,connection=null,registry=null,readProc=null,lastCompleteProc=null,procReadSequence=0,observer=null,windowPhase='none',windows=0,commandTimer,ackTimer,closing=false,normalDisconnect=false,sendBytes=0,sending=false,queued=[],drainers=[],closeAckResolve,sessionTimer,currentDeadline=null
 const wire=extra=>({type:TYPE,nonce:config.nonce,pid:self.pid,startTicks:self.startTicks,...extra})
 const flush=()=>sending||queued.length?new Promise((resolve,reject)=>drainers.push({resolve,reject})):failure?Promise.reject(failure):Promise.resolve()
 function pump(){
  if(sending||!queued.length)return
  sending=true;const item=queued.shift()
  try{assert.ok(process.connected,'observer IPC already disconnected');process.send(item.value,error=>{
   sending=false;sendBytes-=item.bytes;if(error){item.reject(error);fault(error);for(const pending of queued.splice(0))pending.reject(error);sendBytes=0;for(const waiter of drainers.splice(0))waiter.reject(error);return}
   item.resolve();if(queued.length)pump();else for(const waiter of drainers.splice(0))waiter.resolve()
  })}catch(error){sending=false;sendBytes-=item.bytes;item.reject(error);fault(error)}
 }
 const send=value=>new Promise((resolve,reject)=>{
  const bytes=Buffer.byteLength(JSON.stringify(value));try{assert.ok(queued.length<128&&sendBytes+bytes<=4*1024**2,'observer IPC backpressure limit');sendBytes+=bytes;queued.push({value,bytes,resolve,reject});pump()}catch(error){reject(error);fault(error)}
 })
 const record=value=>{
  if(failure)throw failure;assert.ok(!journalClosed,'observer raw journal closed');const copy=structuredClone(value),bytes=Buffer.from(JSON.stringify(copy)+'\n');assert.ok(journalBytes+bytes.length<=config.maxJournalBytes,'observer child journal limit')
  fs.writeFileSync(journal,bytes);hash.update(bytes);journalBytes+=bytes.length
  commandHealthy(currentDeadline)
  void send(wire({kind:'event',seq:++eventSequence,op:'record',value:copy})).catch(fault)
 }
 const commandHealthy=deadline=>{if(failure)throw failure;if(closing)totalRemaining();else remaining();assert.ok(deadline===null||process.hrtime.bigint()<deadline,'observer command deadline exceeded after callback')}
 const healthy=()=>{if(failure)throw failure;remaining();sameIdentity(proc(process.pid),self);assert.equal(process.ppid,config.parentPid)}
 function fault(error){
  if(failure)return failure
  failure=error instanceof Error?error:new Error(String(error));clearTimeout(commandTimer);clearTimeout(ackTimer);clearTimeout(sessionTimer)
  // Parent has an independent TERM/KILL/reap watchdog. This child also bounds
  // shutdown when its parent or IPC disappears; no new PG connection is made.
  let left=1;try{left=Math.min(1000,totalRemaining())}catch{}
  const hard=setTimeout(()=>process.exit(1),Math.max(1,left))
  void (async()=>{
   try{await send(wire({kind:'fault',seq:currentSequence,op:currentOperation,error:{name:failure.name,message:failure.message}}))}catch{}
   try{await observer?.stop()}catch{}
   try{await connection?.close()}catch{}
   if(!journalClosed){try{fs.fsyncSync(journal)}catch{};try{fs.closeSync(journal)}catch{};journalClosed=true}
   clearTimeout(hard);normalDisconnect=true;if(process.connected)process.disconnect();process.exitCode=1
  })().catch(()=>process.exit(1))
  return failure
 }
 const observerStopped=error=>{
  if(failure){fault(error);return}
  try{
   record({kind:'observer_fault_proc_frame',error:{name:error.name,message:error.message},window:windows,readAttempt:procReadSequence,lastCompleteRead:lastCompleteProc,frameScope:lastCompleteProc?.sequence===procReadSequence&&lastCompleteProc?.window===windows?'LAST_COMPLETED_RAW_READ_BEFORE_OBSERVER_REJECTION':'LATEST_COMPLETE_FRAME_ONLY; FAILED_OR_CURRENT_WINDOW_READ_MAY_BE_UNAVAILABLE',valuesPolicy:'UNMODIFIED_RAW_VALUES; NO_CLAMP_OR_ZERO_FILL'})
  }catch(diagnosticError){fault(new AggregateError([error,diagnosticError],`observer failure: ${error.message}; raw failure diagnostic: ${diagnosticError.message}`));return}
  fault(error)
 }
 const validateEntry=entry=>{
  assert.ok(['api','report_worker','export_worker'].includes(entry.role));assert.equal(entry.parentPid,config.parentPid);assert.equal(entry.processGroupId,entry.pid)
  const live=proc(entry.pid);sameIdentity(live,entry);assert.ok(!['Z','X','x'].includes(live.state));assert.ok(entry.role!=='api'||registry.entries().every(p=>p.role!=='api'),'one active API permitted')
 }
 async function execute(op,payload){
  healthy()
  if(op==='connect'){
   keys(payload,['ownerUrl','port','expectedSystemIdentifier','primaryDatabase','identity','registry']);assert.equal(connection,null);assert.equal(registry,null);sameIdentity(payload.identity,self);assert.equal(payload.identity.role,'observer');assert.equal(payload.identity.applicationName,`c26:observer:${config.nonce.slice(0,16)}`)
   assert.ok(Array.isArray(payload.registry)&&payload.registry.length<=512);assert.equal(payload.registry.filter(p=>p.role==='observer').length,1);assert.ok(payload.registry.filter(p=>p.role==='api').length<=1);assert.equal(payload.registry.filter(p=>p.role==='pg_postmaster').length,1)
   assert.deepEqual(payload.registry.find(p=>p.role==='observer'),payload.identity);assert.ok(payload.registry.some(p=>p.role==='driver'&&p.pid===config.parentPid))
   for(const entry of payload.registry){const live=proc(entry.pid);assert.equal(live.startTicks,entry.startTicks);assert.equal(live.processGroupId,entry.processGroupId);if(entry.parentPid!==undefined)assert.equal(live.parentPid,entry.parentPid);assert.ok(!['Z','X','x'].includes(live.state))}
   registry=createOwnedPidRegistry(payload.registry)
   // This event proves that the exact immutable copy exists BEFORE connect().
   record({stage:'OBSERVER_REGISTRY_PINNED_BEFORE_CONNECT',identities:registry.entries(),observerPid:process.pid})
   const io=createIo?createIo({registry,config:payload,self,directory}):{}
   keys(io,Object.keys(io));assert.ok(Object.keys(io).every(key=>['Client','procIo'].includes(key)),'only PG/proc I/O may be replaced')
   connection=await openReadonlyPgObserver({...payload,applicationName:payload.identity.applicationName,remainingMs:remaining,record,onFault:fault},{...(io.Client?{Client:io.Client}:{})})
   const readCompleteFrame=createProcSocketReader({registry,remainingMs:remaining,record,...(io.procIo?{io:io.procIo}:{})})
   readProc=()=>{
    const sequence=++procReadSequence,frame=readCompleteFrame()
    // Keep one exact complete raw frame. Normal sampling writes no duplicate;
    // the original observer may reject a counter BEFORE emitting its proc row.
    lastCompleteProc={sequence,window:windows,completedMonotonicNs:process.hrtime.bigint().toString(),frame:structuredClone(frame)}
    return frame
   }
   return {target:connection.target,pgStatStatements:connection.pgStatStatements,observerIdentity:payload.identity}
  }
  assert.ok(connection&&registry&&readProc,'connect required before observer commands')
  if(op==='register'){keys(payload,['entry']);validateEntry(payload.entry);registry.register(payload.entry);record({stage:'OBSERVER_OWNER_REGISTERED',identity:payload.entry,consumerPermission:'PARENT_MAY_NOW_GRANT_LOAD'});return {registered:true,identity:payload.entry}}
  if(op==='begin'){
   keys(payload,['maxWindowMs']);assert.ok(['none','settled'].includes(windowPhase),'previous window not settled');assert.ok(Number.isSafeInteger(payload.maxWindowMs)&&payload.maxWindowMs>1100&&payload.maxWindowMs<=90000)
   if(observer)await observer.stop()
   const maxWindowMs=Math.floor(Math.min(payload.maxWindowMs,remaining()));assert.ok(maxWindowMs>1100)
   observer=createPgObserver({query:connection.query,readProc,registry,target:connection.target,remainingMs:remaining,record,onStop:observerStopped,maxWindowMs,pgStatStatements:connection.pgStatStatements})
   windows++;windowPhase='running';record({stage:'OBSERVER_WINDOW_BEGIN',window:windows,maxWindowMs,observerPid:process.pid});return observer.begin()
  }
  if(op==='operationEnd'){keys(payload,[]);assert.equal(windowPhase,'running');const result=await observer.operationEnd();windowPhase='settling';return result}
  if(op==='settledEnd'){keys(payload,[]);assert.equal(windowPhase,'settling');const result=await observer.settledEnd();windowPhase='settled';return result}
  if(op==='prepareClose'){keys(payload,['pid','startTicks']);assert.ok(['running','settling'].includes(windowPhase));return observer.prepareOwnerClose(payload)}
  if(op==='retire'){keys(payload,['proof']);assert.ok(['running','settling'].includes(windowPhase));return observer.retireOwner(payload.proof)}
  assert.equal(op,'close','unknown observer RPC operation');keys(payload,[]);assert.ok(['none','settled'].includes(windowPhase),'cannot close an unfinished measurement')
  closing=true;clearTimeout(sessionTimer);const stop=await observer?.stop(),adapter=await connection.close();if(failure)throw failure
  record({stage:'OBSERVER_SESSION_CLOSED',windows,adapter,terminalCpuScope:'PROCESS_START_TO_TERMINAL_SAMPLE; SERIALIZATION_ACK_EXIT_CPU_EXCLUDED'})
  await flush();fs.fsyncSync(journal);fs.closeSync(journal);journalClosed=true
  const terminal={pid:self.pid,startTicks:self.startTicks,monotonicNs:process.hrtime.bigint().toString(),cpu:process.cpuUsage(),memory:process.memoryUsage()}
  return {windows,adapter,stop:stop??null,terminal,journalBytes,journalSha256:hash.digest('hex'),cpuScope:'PROCESS_START_TO_TERMINAL_SAMPLE; SERIALIZATION_ACK_EXIT_CPU_EXCLUDED'}
 }
 process.on('message',value=>{
  try{
   if(failure)return
   if(value?.kind==='ack'){
    keys(value,['type','kind','nonce','seq','op','pid','startTicks']);assert.equal(value.type,TYPE);assert.equal(value.nonce,config.nonce);assert.ok(closing&&closeAckResolve,'unexpected terminal ACK');assert.equal(value.seq,currentSequence);assert.equal(value.op,'close');assert.equal(value.pid,self.pid);assert.equal(value.startTicks,self.startTicks)
    commandHealthy(currentDeadline);const resolve=closeAckResolve;closeAckResolve=null;clearTimeout(ackTimer);resolve();return
   }
   keys(value,['type','kind','nonce','seq','op','deadlineNs','payload']);assert.equal(value.type,TYPE);assert.equal(value.kind,'command');assert.equal(value.nonce,config.nonce);assert.equal(value.seq,currentSequence+1);assert.ok(!busy&&!closing,'single outstanding observer command required');assert.ok(['connect','begin','operationEnd','settledEnd','register','prepareClose','retire','close'].includes(value.op));assert.match(value.deadlineNs,/^[0-9]+$/)
   const deadline=BigInt(value.deadlineNs);assert.ok(deadline<=BigInt(config.deadlineNs),'RPC exceeds aggregate deadline');const left=Number(deadline-process.hrtime.bigint())/1e6;assert.ok(left>0&&left<=90000,'RPC deadline outside bound')
   busy=true;currentDeadline=deadline;currentSequence=value.seq;currentOperation=value.op;commandTimer=setTimeout(()=>fault(new Error('observer child RPC deadline')),left)
   void (async()=>{
    const result=await execute(value.op,value.payload);commandHealthy(deadline);await flush();commandHealthy(deadline)
    if(value.op==='close'){
     const ack=new Promise(resolve=>closeAckResolve=resolve)
     ackTimer=setTimeout(()=>fault(new Error('observer terminal ACK deadline')),Math.max(1,Number(deadline-process.hrtime.bigint())/1e6))
     await send(wire({kind:'reply',seq:value.seq,op:value.op,result}));commandHealthy(deadline);clearTimeout(commandTimer);await ack;commandHealthy(deadline);clearTimeout(ackTimer)
     busy=false;currentDeadline=null;normalDisconnect=true;process.disconnect();return
    }
    await send(wire({kind:'reply',seq:value.seq,op:value.op,result}));commandHealthy(deadline);clearTimeout(commandTimer);busy=false;currentDeadline=null
   })().catch(fault)
  }catch(error){fault(error)}
 })
 process.once('disconnect',()=>{if(!normalDisconnect)fault(new Error('observer parent disconnected'))})
 process.once('SIGTERM',()=>fault(new Error('observer received parent stop')))
 process.once('uncaughtException',fault);process.once('unhandledRejection',fault)
 sessionTimer=setTimeout(()=>fault(new Error('observer leaf aggregate work deadline')),Math.floor(remaining()))
 await send(wire({kind:'boot',seq:0,op:'boot',parentPid:self.parentPid,processGroupId:self.processGroupId}))
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runPgSessionChild().catch(error=>{process.stderr.write(`${error.name}: ${error.message}\n`);process.exitCode=1;if(process.connected)process.disconnect()})
