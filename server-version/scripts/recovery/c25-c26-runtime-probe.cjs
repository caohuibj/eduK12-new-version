'use strict'
/** Test-only IPC SQL-event mirror. No HTTP endpoint, DB operation, metric
 * scrape/reset, GC or product edit. Fixed CommonJS consumer only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {createHash}=require('node:crypto'),{createRequire}=require('node:module')
const backend=path.resolve(__dirname,'../../backend')
const PINNED=Object.freeze({
 'dist/services/runtimeObservability.js':'f56cd11706b377a06245f740cbf46cd6e63c30a30387a3577984696441eb9e0d',
 'dist/utils/logger.js':'9ec9cc50dddde3731d66cafce411fa44dcb5a61ece4e0132208a0ba5cd0a389f',
 'dist/config/database.js':'51903e5601d1ff62ef615ffd293be25093c58762b8d68559ca7d9a16b4262d52',
 'dist/config/databasePool.js':'aef5b57d056234ba6205816bde5f5caf248fde3f3cda96ffaf10356e48b38b06',
})
const marker=Symbol.for('eduk12.c25.c26.runtime-probe')
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function procIdentity(){
 const text=fs.readFileSync('/proc/self/stat','utf8'),end=text.lastIndexOf(') ')
 assert.ok(end>0);const fields=text.slice(end+2).trim().split(/\s+/)
 assert.match(fields[19],/^[0-9]+$/)
 return {pid:process.pid,startTicks:fields[19]}
}
function transparentMirror(original,eligible,mirror,onFailure){
 assert.equal(typeof original,'function')
 return function(...args){
  // Preserve receiver, arguments, return identity and thrown exception identity.
  const value=Reflect.apply(original,this,args)
  try{if(eligible(args))mirror(args)}catch(error){onFailure(error)}
  return value
 }
}
function install(){
 assert.equal(process.env.NODE_ENV,'test');assert.equal(process.env.PERF_ISOLATED_TEST_MODE,'1')
 assert.equal(process.env.PERF_SQL_EVENT_COUNT,'1');assert.equal(process.env.C26_RUNTIME_PROBE_ENABLE,'1')
 const nonce=process.env.C26_PROBE_NONCE,role=process.env.C26_PROBE_ROLE
 assert.match(nonce??'',/^[a-f0-9]{64}$/);assert.ok(['api','report','export'].includes(role))
 assert.equal(typeof process.send,'function','IPC fork channel required')
 assert.ok(!globalThis[marker],'duplicate probe installation')
 const runtimeFile=path.join(backend,'dist/services/runtimeObservability.js'),consumerFile=path.join(backend,'dist/config/database.js')
 assert.ok(!require.cache[runtimeFile]&&!require.cache[consumerFile],'consumer/runtime loaded before probe; captured references unsupported')
 for(const [relative,sha]of Object.entries(PINNED)){
  const filename=path.join(backend,relative);assert.equal(fs.realpathSync(filename),filename)
  assert.equal(hash(filename),sha,'unreviewed producer/consumer bytes; ESM or changed captures require review')
 }
 const fromConsumer=createRequire(consumerFile)
 assert.equal(fromConsumer.resolve('../services/runtimeObservability'),runtimeFile)
 const runtime=require(runtimeFile),record=runtime.recordPrismaSqlEvent,enabled=runtime.sqlEventCollectionEnabled
 const runtimeCache=require.cache[runtimeFile]
 assert.equal(typeof record,'function');assert.equal(enabled(),true)
 let events=0,durationMs=0,mirrorCalls=0,snapshots=0,ipcMessages=0,ipcBytes=0,lastSequence=0,closed=false,fault=null
 let mirrorCpuUser=0,mirrorCpuSystem=0,snapshotCpuUser=0,snapshotCpuSystem=0,mirrorWallNs=0,snapshotWallNs=0
 const environment={NODE_ENV:'test',PERF_ISOLATED_TEST_MODE:'1',PERF_SQL_EVENT_COUNT:'1',C26_RUNTIME_PROBE_ENABLE:'1',C26_PROBE_NONCE:nonce,C26_PROBE_ROLE:role}
 const identity=procIdentity()
 const wrapped=transparentMirror(record,args=>enabled()&&Number.isFinite(args[0])&&args[0]>=0,args=>{
  const cpu=process.cpuUsage(),at=process.hrtime.bigint()
  if(closed){fault='SQL_EVENT_AFTER_PROBE_CLOSE';send({type:'c26-runtime-probe-fault',nonce,errorClass:'SQL_EVENT_AFTER_PROBE_CLOSE'})}
  events++;durationMs+=args[0];mirrorCalls++
  const elapsed=process.cpuUsage(cpu);mirrorCpuUser+=elapsed.user;mirrorCpuSystem+=elapsed.system
  mirrorWallNs+=Number(process.hrtime.bigint()-at)
 },()=>{fault='MIRROR_INSTRUMENTATION_FAILED'})
 runtime.recordPrismaSqlEvent=wrapped
 function check({consumerRequired=true}={}){
  assert.ok(!fault,fault??'mirror fault');assert.deepEqual(procIdentity(),identity)
  for(const [k,v]of Object.entries(environment))assert.equal(process.env[k],v,'probe environment drift')
  assert.equal(require.cache[runtimeFile],runtimeCache);assert.equal(runtimeCache.exports,runtime)
  assert.equal(runtime.recordPrismaSqlEvent,wrapped,'record export replaced')
  assert.equal(runtime.sqlEventCollectionEnabled,enabled)
  for(const file of Object.keys(require.cache))if(file.endsWith('/services/runtimeObservability.js'))assert.equal(file,runtimeFile,'duplicate runtime singleton')
  const consumer=require.cache[consumerFile]
  if(consumerRequired){
   assert.ok(consumer?.loaded,'real frozen CommonJS DB consumer not loaded')
   assert.ok(consumer.children.includes(runtimeCache),'consumer did not bind the runtime singleton')
   assert.equal(consumer.exports.prisma,globalThis.prismaObservabilityClient,'consumer event registration identity changed')
  }
  assert.ok(Number.isSafeInteger(events)&&Number.isFinite(durationMs)&&durationMs>=0)
  return Boolean(consumer?.loaded)
 }
 function snapshot(){
  assert.ok(!closed,'probe is closed');const cpu=process.cpuUsage(),at=process.hrtime.bigint()
  const consumerLoaded=check();snapshots++
  const value={schemaVersion:1,role,...identity,consumerLoaded,sql:{scope:'MIRROR_OF_THIS_FROZEN_PRISMA_EVENT_CONSUMER_NOT_ALL_DATABASE_SQL',events,durationMs},
   cpuUsageMicros:process.cpuUsage(),memoryUsageBytes:process.memoryUsage(),
   instrumentation:{mirrorCalls,snapshots,ipcMessages,ipcBytes,mirrorCpuUserMicros:mirrorCpuUser,mirrorCpuSystemMicros:mirrorCpuSystem,mirrorWallNs,snapshotCpuUserMicros:snapshotCpuUser,snapshotCpuSystemMicros:snapshotCpuSystem,snapshotWallNs,
    boundary:'Sampled instrumentation bodies only; IPC serialization and sampling-call tails remain in total process cost; never blindly subtract.'}}
  const elapsed=process.cpuUsage(cpu);snapshotCpuUser+=elapsed.user;snapshotCpuSystem+=elapsed.system;snapshotWallNs+=Number(process.hrtime.bigint()-at)
  return value
 }
 function close(){const value=snapshot();closed=true;return {...value,closed:true}}
 function send(value){
  try{ipcBytes+=Buffer.byteLength(JSON.stringify(value));process.send(value,error=>{if(error)fault??='IPC_SEND_FAILED'})}
  catch{fault??='IPC_SEND_FAILED'}
 }
 function onMessage(message){
  if(message?.type!=='c26-runtime-probe')return
  ipcMessages++
  try{
   assert.ok(!closed);assert.deepEqual(Object.keys(message).sort(),['action','nonce','sequence','type'])
   assert.equal(message.type,'c26-runtime-probe');assert.equal(message.nonce,nonce)
   assert.ok(Number.isSafeInteger(message.sequence)&&message.sequence===lastSequence+1);lastSequence=message.sequence
   assert.ok(['snapshot','close'].includes(message.action),'read-only probe command')
   const value=message.action==='close'?close():snapshot()
   send({type:'c26-runtime-probe-result',nonce,sequence:message.sequence,ok:true,value})
  }catch(error){
   fault??='IPC_PROTOCOL_OR_BINDING_FAILURE'
   send({type:'c26-runtime-probe-result',nonce,sequence:message?.sequence??null,ok:false,errorClass:error.name})
  }
 }
 const probe=Object.freeze({snapshot,close,check,identity,bindings:PINNED})
 globalThis[marker]=probe;process.on('message',onMessage)
 send({type:'c26-runtime-probe-ready',nonce,role,...identity,bindings:PINNED})
 return probe
}
module.exports={install,transparentMirror,PINNED,marker}
if(process.env.C26_RUNTIME_PROBE_ENABLE==='1')install()
