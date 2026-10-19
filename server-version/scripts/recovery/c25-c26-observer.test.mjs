/** New no-service C26 preparation tests. Run only under the coordinator's lock.
 * These synthetic children establish transport/accounting, not worker capture. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {parseProcStat,readProcSample,sampleNodeResources,validateNodeResourceSample,observeResourceChild,summarizeProcesses} from './c25-c26-observer.mjs'

const nonce=()=>randomBytes(16).toString('hex')
const proc=(role='driver',patch={})=>({pid:123,startTicks:'9007199254740993',userTicks:10,systemTicks:2,rssBytes:1024,vmHwmLifetimeBytes:2048,role,...patch})
const frames=(a,b)=>[{elapsedMs:0,processes:a},{elapsedMs:10,processes:b}]
const moduleUrl=new URL('./c25-c26-observer.mjs',import.meta.url).href

function launch(mode,role='report_worker'){
 const runNonce=nonce()
 const source=`
  import {reportNodeResources,sampleNodeResources} from ${JSON.stringify(moduleUrl)};
  const options={nonce:${JSON.stringify(runNonce)},role:${JSON.stringify(role)},timeoutMs:1500};
  const start=await reportNodeResources({...options,phase:'start'});
  const mode=${JSON.stringify(mode)};
  if(mode==='timeout'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000)}
  else if(mode==='missing'){process.disconnect()}
  else {
   const allocation=Buffer.alloc(1024*1024,7);globalThis.syntheticAllocation=allocation;let n=0;
   for(let i=0;i<300000;i++)n=(n+i*allocation[i%allocation.length])%1000000007;
   if(!Number.isFinite(n))throw new Error('synthetic work failed');
   if(['identity','nonce','backwards'].includes(mode)){
    const terminal=sampleNodeResources({...options,phase:'terminal'});
    if(mode==='identity')terminal.startTicks=(BigInt(terminal.startTicks)+1n).toString();
    if(mode==='nonce')terminal.nonce='f'.repeat(32);
    if(mode==='backwards')terminal.cpu.user=start.cpu.user-1;
    process.send(terminal);setInterval(()=>{},1000);
   }else{await reportNodeResources({...options,phase:'terminal'});if(mode==='nonzero')process.exitCode=7}
  }
 `
 const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','ignore','ignore','ipc'],detached:true})
 const result=observeResourceChild(child,{nonce:runNonce,role,deadlineMs:mode==='timeout'?2000:5000,killGraceMs:100,reapMs:1000})
 return {child,result}
}

test('parse /proc comm delimiters and exact large startTicks; reject malformed counters',()=>{
 const fields=['S',1,0,0,0,0,0,0,0,0,0,12,4,0,0,0,0,1,0,'9007199254740993',0,1]
 const line=`123 (a ) tricky\ncomm) ${fields.join(' ')}`
 assert.deepEqual(parseProcStat(line),{pid:123,state:'S',parentPid:1,processGroupId:0,userTicks:12,systemTicks:4,startTicks:'9007199254740993'})
 assert.throws(()=>parseProcStat('123 broken'),/delimiters/)
 assert.throws(()=>parseProcStat('123 (short) S 1'),/truncated/)
 const invalid=fields.slice();invalid[11]='-1';assert.throws(()=>parseProcStat(`123 (x) ${invalid.join(' ')}`),/userTicks/)
 invalid[11]='9007199254740992';assert.throws(()=>parseProcStat(`123 (x) ${invalid.join(' ')}`),/userTicks/)
})

test('physical accounting separates reused PID and references shared driver/report once',()=>{
 const result=summarizeProcesses([
  {elapsedMs:0,processes:[proc(),proc('report_worker')]},
  {elapsedMs:10,processes:[proc('driver',{userTicks:20}),proc('report_worker',{userTicks:20})]},
  {elapsedMs:20,processes:[proc('api',{startTicks:'9007199254740994',userTicks:0,systemTicks:0})]},
  {elapsedMs:30,processes:[proc('api',{startTicks:'9007199254740994',userTicks:3,systemTicks:1})]},
 ],100)
 assert.equal(result.physical.length,2);assert.equal(result.physicalTotals.userMicroseconds,130000)
 assert.deepEqual(result.roles.driver.physicalIdentities,result.roles.report_worker.physicalIdentities)
 assert.equal(result.physical[0].sharedPhysicalProcess,true)
 assert.equal(result.roles.api.physicalIdentities.length,1);assert.deepEqual(result.roles.pg_background.physicalIdentities,[])
})

test('reject backwards proc counters, inconsistent duplicates, unknown roles and missing required tail',()=>{
 assert.throws(()=>summarizeProcesses(frames([proc()],[proc('driver',{userTicks:9})]),100),/backwards/)
 assert.throws(()=>summarizeProcesses([{elapsedMs:0,processes:[proc(),proc('report_worker',{userTicks:12})]}],100),/inconsistent/)
 assert.throws(()=>summarizeProcesses([{elapsedMs:0,processes:[proc(),proc('driver',{startTicks:'2'})]}],100),/two identities/)
 assert.throws(()=>summarizeProcesses(frames([proc('unknown')],[]),100),/unknown/)
 assert.throws(()=>summarizeProcesses([],100,{requiredChildren:[proc()]}),/missing terminal/)
 assert.throws(()=>summarizeProcesses(frames([proc('export_worker')],[]),100),/missing terminal/)
})

test('real local Node sampling validates exact identity and monotonic counters',()=>{
 const options={nonce:nonce(),role:'observer'},start=sampleNodeResources({...options,phase:'start'})
 const terminal=sampleNodeResources({...options,phase:'terminal'})
 const expected={...options,pid:start.pid,startTicks:start.startTicks,phase:'terminal',previous:start}
 assert.equal(validateNodeResourceSample(terminal,expected),terminal)
 const observed=readProcSample(process.pid,'observer');assert.equal(observed.startTicks,start.startTicks);assert.ok(observed.rssBytes>0)
 assert.throws(()=>validateNodeResourceSample({...terminal,pid:start.pid+1},expected),/pid mismatch/)
 assert.throws(()=>validateNodeResourceSample({...terminal,cpu:{...terminal.cpu,user:start.cpu.user-1}},expected),/backwards|invalid/)
 assert.throws(()=>validateNodeResourceSample({...terminal,resource:{...terminal.resource,maxRSS:start.resource.maxRSS-1}},expected),/backwards|invalid/)
})

for(const role of ['report_worker','export_worker'])test(`real ${role} synthetic child start/final/ACK/close and deduplicated accounting`,{timeout:8000},async()=>{
 const {child,result}=launch('success',role),receipt=await result
 assert.equal(child.exitCode,0);assert.equal(receipt.lifecycle.closeObserved,true)
 assert.equal(receipt.lifecycle.processGroupId,child.pid);assert.equal(receipt.lifecycle.startAck,true);assert.equal(receipt.lifecycle.terminalAck,true)
 assert.ok(receipt.terminal.cpu.user+receipt.terminal.cpu.system>receipt.start.cpu.user+receipt.start.cpu.system)
 assert.ok(receipt.terminal.memory.rss>0);assert.ok(receipt.terminal.memory.arrayBuffers>=1024*1024)
 const summary=summarizeProcesses([],100,{children:[receipt],requiredChildren:[receipt.start]})
 assert.equal(summary.physical.length,1);assert.equal(summary.physicalTotals.userMicroseconds,receipt.terminal.cpu.user)
 assert.deepEqual(summary.roles[role].physicalIdentities,[`${child.pid}:${receipt.start.startTicks}`])
 assert.throws(()=>summarizeProcesses([],100,{children:[receipt,receipt]}),/duplicate terminal/)
 const broken=structuredClone(receipt);broken.lifecycle.terminalAck=false
 assert.throws(()=>summarizeProcesses([],100,{children:[broken]}),/handshake/)
})

for(const [mode,pattern]of [['missing',/missing start or terminal/],['identity',/startTicks mismatch/],['nonce',/nonce mismatch/],['backwards',/backwards|invalid/],['nonzero',/abnormal close/],['timeout',/deadline exceeded/]])test(`real child rejects ${mode} and is closed/reaped`,{timeout:8000},async()=>{
 const {child,result}=launch(mode)
 await assert.rejects(result,error=>{
  assert.match(error.message,pattern);assert.equal(error.lifecycle.closeObserved,true)
  if(mode==='timeout')assert.deepEqual(error.lifecycle.terminationSignals.map(value=>value.signal),['SIGTERM','SIGKILL'])
  return true
 })
 assert.ok(child.exitCode!==null||child.signalCode!==null,'owned child must be reaped')
})
