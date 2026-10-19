/** Targeted SERVICE-FREE CLI contracts. Real detached Node children, IPC,
 * journals, timers and group cleanup; no listener, PostgreSQL, Redis, business
 * consumer or application service. Each run has one <=7s aggregate; all runs
 * together have <90s aggregate allowance. Not an integration/acceptance claim.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createOwnedPidRegistry} from './c25-c26-pg-observer.mjs'
import {parseProcStat} from './c25-c26-observer.mjs'
import {startPgObserverSession} from './c25-c26-pg-session.mjs'
const fixture=fileURLToPath(new URL('c25-c26-pg-session-fixture.mjs',import.meta.url)),node=fs.realpathSync(process.execPath)
const proc=pid=>parseProcStat(fs.readFileSync(`/proc/${pid}/stat`,'utf8'))
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const write=(name,value)=>{const temporary=name+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value),{mode:0o600});fs.renameSync(temporary,name)}
const rows=name=>fs.existsSync(name)?fs.readFileSync(name,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]
const liveGroup=pgid=>fs.readdirSync('/proc').filter(name=>/^[1-9][0-9]*$/.test(name)).flatMap(name=>{try{const p=proc(Number(name));return p.processGroupId===pgid&&!['Z','X','x'].includes(p.state)?[p]:[]}catch(error){if(['ENOENT','ESRCH'].includes(error.code))return [];throw error}})
async function holder(role){
 const source="process.send({ready:true});process.on('message',value=>{if(value==='close'){process.send({terminal:{pid:process.pid,cpu:process.cpuUsage()}},()=>process.disconnect())}})"
 const child=spawn(node,['-e',source],{detached:true,stdio:['ignore','ignore','ignore','ipc']});let terminal,closed=false,closeResolve
 const close=new Promise(resolve=>closeResolve=resolve);child.once('close',(code,signal)=>{closed=true;closeResolve({code,signal})})
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('holder boot timeout')),1000);child.on('message',value=>{if(value.ready){clearTimeout(timer);resolve()}if(value.terminal)terminal=value.terminal});child.once('error',reject)})
 const identity={...proc(child.pid),role,...(['api','report_worker','export_worker'].includes(role)?{applicationName:`c26:${role}:${child.pid}`}:{})}
 return {child,identity,async close(){if(!closed)child.send('close');const result=await close;assert.deepEqual(result,{code:0,signal:null});assert.ok(terminal);assert.deepEqual(liveGroup(identity.processGroupId),[]);return {pid:identity.pid,startTicks:identity.startTicks,closeObserved:true,terminalObserved:true,groupQuiescent:true,terminalCpu:{pid:identity.pid,startTicks:identity.startTicks,...terminal.cpu}}},async kill(){if(!closed){try{process.kill(-identity.processGroupId,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}await close}}}
}
async function run(mode,action=async h=>h.session.close(),options={}){
 assert.equal(process.version,'v24.21.0');const root=process.env.C26_PREPARE_EVIDENCE_ROOT;assert.ok(root,'explicit private evidence root required')
 const directory=fs.mkdtempSync(path.join(root,`pg-session-${mode}-`));fs.chmodSync(directory,0o700)
 write(path.join(directory,'fixture-config.json'),{scope:'NO_SERVICE_PG_SESSION',mode});write(path.join(directory,'fixture-control.json'),{connected:[]})
 const pm=await holder('pg_postmaster'),holders=[pm],registry=createOwnedPidRegistry([{...proc(process.pid),role:'driver',applicationName:'c26:driver:fixture'},pm.identity])
 const events=[],faults=[],end=performance.now()+7000,h={directory,registry,events,faults,externalLeft:Infinity,failRecord:false,session:null,connect:null,async add(role){const own=await holder(role);holders.push(own);return own},connectOwner(own,on=true){const current=JSON.parse(fs.readFileSync(path.join(directory,'fixture-control.json'))),id=`${own.identity.pid}:${own.identity.startTicks}`;current.connected=current.connected.filter(value=>value!==id);if(on)current.connected.push(id);write(path.join(directory,'fixture-control.json'),current)}}
 let result,error,child
 try{
  h.session=await startPgObserverSession({directory,node,env:{PATH:process.env.PATH},registry,remainingMs:()=>Math.min(h.externalLeft,end-performance.now()),record:value=>{events.push(value);if(h.failRecord)throw new Error('Synthetic mandatory record failure');options.onRecord?.(value,h)},onFault:value=>faults.push(value),...(options.maxJournalBytes?{maxJournalBytes:options.maxJournalBytes}:{})},{spawnChild:(exe,argv,opts)=>{
   child=spawn(exe,[fixture,argv[1]],opts)
   if(mode==='async-fault-future'||mode==='async-fault-wrong-operation'){const emit=child.emit;child.emit=function(name,...args){if(name==='message'&&args[0]?.kind==='fault')args[0]={...args[0],...(mode==='async-fault-future'?{seq:5}:{seq:2})};return Reflect.apply(emit,this,[name,...args])}}
   if(mode==='wrong-sequence'||mode==='missing-close'){
    const emit=child.emit;child.emit=function(name,...args){if(mode==='wrong-sequence'&&name==='message'&&args[0]?.kind==='reply'&&args[0]?.op==='connect')args[0]={...args[0],seq:args[0].seq+1};if(mode==='missing-close'&&name==='close'){write(path.join(directory,'actual-dropped-close.json'),{code:args[0],signal:args[1]});return false}return Reflect.apply(emit,this,[name,...args])}
   }
   return child
  }})
  assert.notEqual(h.session.identity.pid,process.pid);assert.deepEqual(registry.entries().find(p=>p.role==='observer'),h.session.identity)
  // Boot itself must not construct a PG Client, much less open a connection.
  assert.equal(rows(path.join(directory,'fixture-events-private.jsonl')).length,0)
  h.connect=await h.session.connect({ownerUrl:'postgresql://eduk12_owner:synthetic@127.0.0.1:54399/eduk12_c25_joint_restore',port:54399,expectedSystemIdentifier:'456',primaryDatabase:'eduk12_recovery'})
  result=await action(h)
 }catch(caught){error=caught}
 finally{if(h.session)try{await h.session.close()}catch(caught){error??=caught}for(const own of holders)await own.kill()}
 const receiptPath=path.join(directory,'observer-session-private.json'),receipt=fs.existsSync(receiptPath)?JSON.parse(fs.readFileSync(receiptPath)):null
 return {...h,result,error,receipt,child,fixtureEvents:rows(path.join(directory,'fixture-events-private.jsonl'))}
}
async function window(session){await session.begin({maxWindowMs:3000});await session.operationEnd();await delay(1120);return session.settledEnd()}

test('gated separate process reuses one readonly connection across sequential real-clock windows',{timeout:10000},async()=>{
 const r=await run('success',async h=>{const a=await window(h.session),b=await window(h.session);assert.equal(a.observerCost.observerProcessIdentity,`${h.session.identity.pid}:${h.session.identity.startTicks}`);assert.equal(b.observerCost.observerProcessIdentity,a.observerCost.observerProcessIdentity);assert.ok(a.observerCost.cpuMicroseconds.user+a.observerCost.cpuMicroseconds.system>0);return h.session.close()})
 assert.ifError(r.error);assert.equal(r.receipt.passed,true);assert.equal(r.receipt.windows,2);assert.equal(r.fixtureEvents.filter(e=>e.stage==='CLIENT_CONSTRUCTED').length,1);assert.equal(r.fixtureEvents.filter(e=>e.stage==='CLIENT_CONNECTED').length,1);assert.equal(r.fixtureEvents.filter(e=>e.stage==='CLIENT_ENDED').length,1);assert.equal(r.faults.length,0)
 assert.equal(r.receipt.closeObserved,true);assert.equal(r.receipt.groupQuiescent,true);assert.equal(r.receipt.result.terminal.pid,r.session.identity.pid);assert.match(r.receipt.terminalToCloseCpu,/NOT_OBSERVED/);assert.equal(BigInt(r.receipt.terminalToCloseWallNs),BigInt(r.receipt.closedMonotonicNs)-BigInt(r.receipt.result.terminal.monotonicNs));assert.ok(BigInt(r.receipt.cleanupFinishedMonotonicNs)>=BigInt(r.receipt.closedMonotonicNs))
 for(const name of ['observer-parent-raw-private.jsonl','observer-child-raw-private.jsonl','observer-session-private.json'])assert.equal(fs.statSync(path.join(r.directory,name)).mode&0o777,0o600)
 const pinned=r.events.findIndex(e=>e.value?.stage==='OBSERVER_REGISTRY_PINNED_BEFORE_CONNECT'),connected=r.events.findIndex(e=>e.value?.stage==='PG_ADAPTER_CONNECTED');assert.ok(pinned>=0&&connected>pinned)
})

test('API and sequential report/export registration gates consumers; prepared drain and real terminal/reap proof retire owners',{timeout:10000},async()=>{
 const r=await run('success',async h=>{
  const api=await h.add('api');await h.session.register(api.identity);h.connectOwner(api)
  await h.session.begin({maxWindowMs:4000})
  for(const role of ['report_worker','export_worker']){
   const own=await h.add(role);await h.session.register(own.identity);h.connectOwner(own)
   const prepared=await h.session.prepareClose(own.identity);assert.equal(prepared.prepared,true)
   h.connectOwner(own,false);const proof=await own.close(),retired=await h.session.retire(proof)
   assert.equal(retired.status,'CLOSED_VERIFIED_BY_FRESH_PG_AND_PROC');assert.equal(retired.terminalCpu.user,proof.terminalCpu.user);assert.match(retired.backendCpuExitTail,/NOT_OBSERVED/);assert.ok(!h.registry.entries().some(p=>p.pid===own.identity.pid))
  }
  await h.session.operationEnd();await delay(1120);const measured=await h.session.settledEnd();assert.equal(measured.retirements.length,2)
  const receipt=await h.session.close();assert.ok(proc(api.identity.pid),'API remains live until observer is reaped');await api.close();return receipt
 })
 assert.ifError(r.error);assert.equal(r.receipt.passed,true);assert.equal(r.events.filter(e=>e.value?.stage==='OBSERVER_OWNER_REGISTERED').length,3);assert.equal(r.faults.length,0)
})

test('unknown IPC and incorrect exact sequence abort the actual leaf and propagate globally',{timeout:15000},async()=>{
 for(const mode of ['bad-ipc','wrong-sequence']){const r=await run(mode);assert.ok(r.error);assert.equal(r.receipt.passed,false);assert.equal(r.receipt.closeObserved,true);assert.equal(r.receipt.groupQuiescent,true);assert.equal(r.faults.length,1);assert.deepEqual(liveGroup(r.receipt.identity.processGroupId),[])}
})

test('mandatory record failure and bounded private journal exhaustion latch failure and reap',{timeout:15000},async()=>{
 const record=await run('success',async h=>{h.failRecord=true;await h.session.begin({maxWindowMs:3000})});assert.match(record.error.message,/mandatory record failure/);assert.equal(record.receipt.passed,false);assert.equal(record.receipt.closeObserved,true);assert.equal(record.receipt.groupQuiescent,true);assert.equal(record.faults.length,1)
 const capped=await run('success',undefined,{maxJournalBytes:1024});assert.match(capped.error.message,/journal limit/);assert.equal(capped.receipt.passed,false);assert.equal(capped.receipt.closeObserved,true);assert.equal(capped.receipt.groupQuiescent,true);assert.ok(capped.receipt.journalBytes<=1024)
})

test('required SELECT failure and original aggregate exhaustion cannot reset a window or qualify cleanup',{timeout:15000},async()=>{
 const query=await run('query-fault',async h=>h.session.begin({maxWindowMs:3000}));assert.ok(query.error);assert.equal(query.receipt.passed,false);assert.equal(query.receipt.closeObserved,true);assert.equal(query.receipt.groupQuiescent,true);assert.equal(query.faults.length,1)
 const exhausted=await run('success',async h=>{h.externalLeft=1200;return h.session.begin({maxWindowMs:3000})});assert.match(exhausted.error.message,/deadline/);assert.equal(exhausted.receipt.passed,false);assert.equal(exhausted.receipt.closeObserved,true);assert.equal(exhausted.receipt.groupQuiescent,true)
})

test('bounded stuck connection escalation and missing close retain explicit failed lifecycle and unknown exit tail',{timeout:15000},async()=>{
 const stuck=await run('hang-connect-ignore-term');assert.ok(stuck.error);assert.equal(stuck.receipt.passed,false);assert.equal(stuck.receipt.closeObserved,true);assert.equal(stuck.receipt.groupQuiescent,true);assert.ok(stuck.receipt.signals.some(s=>s.name==='SIGKILL'&&s.sent));assert.deepEqual(liveGroup(stuck.receipt.identity.processGroupId),[])
 const missing=await run('missing-close');assert.ok(missing.error);assert.equal(missing.receipt.passed,false);assert.equal(missing.receipt.closeObserved,false);assert.equal(missing.receipt.closedMonotonicNs,null);assert.equal(missing.receipt.terminalToCloseWallNs,null);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(missing.directory,'actual-dropped-close.json'))),{code:0,signal:null})
})


test('last settled record and final journal fsync cannot qualify past their original deadlines',{timeout:15000},async()=>{
 // Actual session/leaf and RPC, with a synchronous mandatory-record stall only
 // after the real settled reply has arrived. The original window must survive
 // the handler's otherwise-successful phase transition.
 let stalled=false
 const late=await run('success',async h=>{await h.session.begin({maxWindowMs:1700});await h.session.operationEnd();await delay(1120);await h.session.settledEnd();assert.fail('late settled reply must not resolve')},{onRecord(value){if(value.stage==='OBSERVER_RPC_COMPLETED'&&value.op==='settledEnd'){stalled=true;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,900)}}})
 assert.equal(stalled,true);assert.match(late.error.message,/deadline/);assert.equal(late.receipt.passed,false);assert.equal(late.receipt.closeObserved,true);assert.equal(late.receipt.groupQuiescent,true);assert.equal(late.faults.length,1);assert.deepEqual(liveGroup(late.receipt.identity.processGroupId),[])
 // The final mandatory I/O itself succeeds. Its injected elapsed budget is
 // exhausted after the real fsync, before the final success decision.
 let expired=false,finish
 const originalFsync=fs.fsyncSync
 try{
  finish=await run('success',async h=>{
   fs.fsyncSync=function(fd){const value=Reflect.apply(originalFsync,this,[fd]);if(fs.readlinkSync(`/proc/self/fd/${fd}`)===path.join(h.directory,'observer-parent-raw-private.jsonl')){expired=true;h.externalLeft=0}return value}
   return h.session.close()
  })
 }finally{fs.fsyncSync=originalFsync}
 assert.equal(expired,true);assert.match(finish.error.message,/deadline/);assert.equal(finish.receipt.passed,false);assert.equal(finish.receipt.closeObserved,true);assert.equal(finish.receipt.groupQuiescent,true);assert.equal(finish.faults.length,1);assert.deepEqual(liveGroup(finish.receipt.identity.processGroupId),[])
})

async function asynchronousFault(h){
 await h.session.begin({maxWindowMs:3000});const api=await h.add('api');await h.session.register(api.identity)
 fs.writeFileSync(path.join(h.directory,'fault-arm'),'armed',{mode:0o600})
 const until=performance.now()+1200
 while(!fs.existsSync(path.join(h.directory,'fault-entered'))){assert.ok(performance.now()<until,'parent barrier deadline');await delay(1)}
 // rpc() sends synchronously before its first await. The real child is blocked
 // inside its periodic read at seq3, so command4 cannot yet be consumed.
 const pending=h.session.operationEnd();fs.writeFileSync(path.join(h.directory,'fault-release'),'release',{mode:0o600})
 return pending
}
test('actual CLI asynchronous fault3 while RPC4 is pending preserves the original owned-socket failure and cleans up',{timeout:10000},async()=>{
 const r=await run('async-fault-history',asynchronousFault)
 assert.match(r.error.message,/observer child Error: ambiguous owned socket inode across network tables/);assert.equal(r.faults.length,1);assert.equal(r.faults[0].message,r.error.message)
 const context=r.receipt.childFault;assert.equal(context.envelope.seq,3);assert.equal(context.envelope.op,'register');assert.deepEqual(context.pending,{seq:4,op:'operationEnd'});assert.deepEqual(context.issuedHistory.map(({seq,op})=>({seq,op})),[{seq:1,op:'connect'},{seq:2,op:'begin'},{seq:3,op:'register'},{seq:4,op:'operationEnd'}]);assert.ok(context.issuedHistory.every(x=>!('payload' in x)))
 const completed3=r.events.findIndex(x=>x.stage==='OBSERVER_RPC_COMPLETED'&&x.seq===3),issued4=r.events.findIndex(x=>x.stage==='OBSERVER_RPC_ISSUED'&&x.seq===4),fault=r.events.findIndex(x=>x.stage==='OBSERVER_CHILD_FAULT')
 assert.ok(completed3>=0&&issued4>completed3&&fault>issued4);assert.equal(r.events.some(x=>x.stage==='OBSERVER_RPC_COMPLETED'&&x.seq===4),false)
 const raw=rows(path.join(r.directory,'observer-child-raw-private.jsonl')),evidence=raw.find(x=>x.value?.socketAttribution)?.value??raw.find(x=>x.socketAttribution)
 assert.ok(evidence,'actual leaf must retain conflict candidates');assert.equal(evidence.socketAttribution.observation,'NOT_OBSERVED');assert.equal(evidence.socketAttribution.bracketVerified,true)
 assert.equal(r.receipt.passed,false);assert.equal(r.receipt.closeObserved,true);assert.equal(r.receipt.groupQuiescent,true);assert.deepEqual(liveGroup(r.receipt.identity.processGroupId),[])
 assert.ok(rows(path.join(r.directory,'observer-parent-raw-private.jsonl')).some(x=>x.stage==='OBSERVER_CHILD_FAULT'&&x.envelope.seq===3))
})
test('actual CLI fault history rejects unissued future and mismatched historical operation without losing raw error',{timeout:15000},async()=>{
 for(const mode of ['async-fault-future','async-fault-wrong-operation']){
  const r=await run(mode,asynchronousFault);assert.match(r.error.message,mode==='async-fault-future'?/unissued\/future RPC/:/issued RPC operation mismatch/)
  assert.match(r.receipt.childFault.envelope.error.message,/ambiguous owned socket inode/);assert.deepEqual(r.receipt.childFault.pending,{seq:4,op:'operationEnd'});assert.equal(r.receipt.childFault.envelope.seq,mode==='async-fault-future'?5:2)
  assert.equal(r.receipt.passed,false);assert.equal(r.receipt.closeObserved,true);assert.equal(r.receipt.groupQuiescent,true);assert.equal(r.faults.length,1);assert.deepEqual(liveGroup(r.receipt.identity.processGroupId),[])
 }
})
