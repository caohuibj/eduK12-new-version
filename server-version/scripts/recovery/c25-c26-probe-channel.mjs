/** Inert parent-side IPC contract for the single pinned production preload. */
import assert from 'node:assert/strict'
export function createProbeChannel(child,{nonce,role,identity,bindings,remainingMs,record,onFault}){
 assert.equal(child.pid,identity.pid);assert.match(nonce,/^[a-f0-9]{64}$/);assert.ok(['api','report','export'].includes(role))
 let ready=false,closed=false,failure=null,sequence=0,pending=null,previous=null,readyResolve,readyReject
 const readyPromise=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});readyPromise.catch(()=>{})
 const budget=()=>{const left=remainingMs();assert.ok(Number.isFinite(left)&&left>0);return Math.max(1,Math.floor(Math.min(2000,left)))}
 let readyTimer=setTimeout(()=>fault(new Error('probe ready deadline')),budget())
 function fault(error){
  if(failure)return;failure=error;clearTimeout(readyTimer);readyReject(error)
  if(pending){clearTimeout(pending.timer);pending.reject(error);pending=null}
  // A failed journal is itself a stop condition; it must never prevent the
  // coordinator's independent stop callback from seeing the failure.
  try{record({stage:'PROBE_FAULT',errorClass:error.name,pid:child.pid})}catch{}
  try{onFault(error)}catch{}
 }
 function message(value){
  if(!value?.type?.startsWith('c26-runtime-probe'))return
  try{
   assert.equal(value.nonce,nonce,'probe nonce mismatch')
   if(value.type==='c26-runtime-probe-fault')throw new Error('runtime probe fault after close or instrumentation')
   if(value.type==='c26-runtime-probe-ready'){
    assert.ok(!ready&&!closed,'duplicate probe ready');assert.equal(value.role,role);assert.equal(value.pid,identity.pid);assert.equal(value.startTicks,identity.startTicks);assert.deepEqual(value.bindings,bindings)
    ready=true;clearTimeout(readyTimer);record({stage:'PROBE_READY',pid:child.pid,startTicks:identity.startTicks,role,bindings});readyResolve();return
   }
   assert.equal(value.type,'c26-runtime-probe-result');assert.ok(ready&&pending&&!closed,'unsolicited probe response');assert.equal(value.sequence,pending.sequence);assert.equal(value.ok,true,'probe rejected request')
   const sample=value.value;assert.equal(sample.schemaVersion,1);assert.equal(sample.role,role);assert.equal(sample.pid,identity.pid);assert.equal(sample.startTicks,identity.startTicks);assert.equal(sample.consumerLoaded,true)
   assert.equal(sample.sql.scope,'MIRROR_OF_THIS_FROZEN_PRISMA_EVENT_CONSUMER_NOT_ALL_DATABASE_SQL');assert.ok(Number.isSafeInteger(sample.sql.events)&&sample.sql.events>=0&&Number.isFinite(sample.sql.durationMs)&&sample.sql.durationMs>=0)
   assert.ok(sample.cpuUsageMicros&&sample.memoryUsageBytes&&sample.instrumentation)
   assert.deepEqual(Object.keys(sample.cpuUsageMicros).sort(),['system','user']);assert.deepEqual(Object.keys(sample.memoryUsageBytes).sort(),['arrayBuffers','external','heapTotal','heapUsed','rss'])
   for(const name of ['mirrorCalls','snapshots','ipcMessages','ipcBytes','mirrorCpuUserMicros','mirrorCpuSystemMicros','mirrorWallNs','snapshotCpuUserMicros','snapshotCpuSystemMicros','snapshotWallNs'])assert.ok(Number.isSafeInteger(sample.instrumentation[name])&&sample.instrumentation[name]>=0)
   if(previous){for(const key of ['events','durationMs'])assert.ok(sample.sql[key]>=previous.sql[key],'SQL counter moved backwards');for(const key of ['user','system'])assert.ok(sample.cpuUsageMicros[key]>=previous.cpuUsageMicros[key],'CPU counter moved backwards')}
   for(const n of Object.values(sample.cpuUsageMicros))assert.ok(Number.isSafeInteger(n)&&n>=0)
   for(const n of Object.values(sample.memoryUsageBytes))assert.ok(Number.isSafeInteger(n)&&n>=0)
   const current=pending
   if(current.action==='close'){assert.equal(sample.closed,true);closed=true}else assert.equal(sample.closed,undefined)
   record({stage:'PROBE_RESULT',sequence:current.sequence,action:current.action,sample});previous=sample;pending=null;clearTimeout(current.timer);current.resolve(sample)
  }catch(error){fault(error)}
 }
 child.on('message',message);child.once('error',fault)
 child.once('disconnect',()=>{if(!closed)fault(new Error('probe IPC disconnected before close'))})
 child.once('close',(code,signal)=>{if(!closed||code!==0||signal)fault(new Error('probe process closed before a successful quiescent close'))})
 return Object.freeze({
  ready:()=>readyPromise,
  async request(action='snapshot'){
   try{assert.ok(['snapshot','close'].includes(action));await readyPromise;if(failure)throw failure;assert.ok(!closed&&!pending,'probe closed or another snapshot pending')}catch(error){fault(error);throw error}
   return new Promise((resolve,reject)=>{
    const current=++sequence,timer=setTimeout(()=>fault(new Error('probe response deadline')),budget());pending={sequence:current,action,timer,resolve,reject}
    try{record({stage:'PROBE_ISSUED',sequence:current,action,pid:child.pid});child.send({type:'c26-runtime-probe',nonce,sequence:current,action},error=>{if(error)fault(error)})}catch(error){fault(error)}
   })
  },
  assertHealthy(){if(failure)throw failure;assert.ok(ready&&!pending);return {ready,closed,sequence}},
  stop(error){fault(error)},
 })
}
