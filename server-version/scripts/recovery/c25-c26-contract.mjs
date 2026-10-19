/** C26 preparation only. No DB, transport, service, benchmark or automatic B run. */
import assert from 'node:assert/strict'

export const C26_LIMITS=Object.freeze({
 totalMs:1_200_000,cleanupReserveMs:60_000,childMaxMs:90_000,
 entryDiskBytes:8*1024**3+512*1024**2,runDiskBytes:8*1024**3,
 memoryBytes:2*1024**3,tmpBytes:512*1024**2,apiRssExclusiveMaxBytes:1024**3,
 idleMs:30_000,tailMs:60_000,pgSettleMs:1100,
})
export const READ_CATEGORIES=Object.freeze([
 'checkpoint-recovery-read','report-status','full-report',
 'cognitive-result-or-history','teacher-analysis','existing-artifact-download',
])
export const COLD_COUNTS=Object.freeze({
 parentAttempts:1,formFinals:1,scaleFinals:1,cognitiveFinals:1,sjtFinals:1,
 reportDrainInvocations:1,reportJobs:1,exportEnqueues:1,exportTasks:1,
})
export function workloadPlan(categories=READ_CATEGORIES){
 assert.deepEqual(categories,READ_CATEGORIES,'Freeze the six route categories before measurement')
 return Object.freeze({
  phase:'A',cold:{counts:COLD_COUNTS,scope:'ONE_PARENT_FOUR_NATIVE_CHILD_FINALS_ONCE; NOT_ONE_WHOLE_FINAL'},
  serial:categories.flatMap(category=>Array.from({length:4},(_,sample)=>({category,sample,requests:1,readOnly:true}))),
  waves:categories.map(category=>({category,requests:2,concurrency:2,readOnly:true,sqlAttribution:'ONE_WAVE_PROCESS_TOTAL'})),
  requestUnits:'Each serial/wave member is one frozen read endpoint request, never an entire assessment chain.',
  coldEndpointCount:'Fixture/login/admission/native reads are separately enumerated setup/cold HTTP, not hidden inside the 36 reads.',
  noAutomaticB:true,
 })
}
export function assertWorkloadCounts(value){
 assert.deepEqual(Object.keys(value).sort(),['phase','cold','serialRequests','concurrentWaves','concurrentRequests','maxConcurrency','extraFinals','automaticRetries'].sort())
 assert.deepEqual(value.cold,COLD_COUNTS)
 assert.equal(value.serialRequests,24);assert.equal(value.concurrentWaves,6)
 assert.equal(value.concurrentRequests,12);assert.equal(value.maxConcurrency,2)
 assert.equal(value.extraFinals,0);assert.equal(value.automaticRetries,0)
 assert.equal(value.phase,'A');return true
}
export function assertResources(value,{entry=false}={}){
 assert.ok(value.diskBytes >= (entry?C26_LIMITS.entryDiskBytes:C26_LIMITS.runDiskBytes),'disk floor')
 assert.ok(value.memoryBytes>=C26_LIMITS.memoryBytes,'memory floor')
 assert.ok(value.tmpBytes>=C26_LIMITS.tmpBytes,'tmp recovery floor')
 if(value.apiRssBytes!==undefined)assert.ok(value.apiRssBytes<C26_LIMITS.apiRssExclusiveMaxBytes,'API RSS floor')
 for(const v of Object.values(value))assert.ok(Number.isSafeInteger(v)&&v>=0,'finite resource values')
 return true
}
export function aggregateDeadline(now,{totalMs=C26_LIMITS.totalMs,cleanupMs=C26_LIMITS.cleanupReserveMs}={}){
 assert.equal(totalMs,C26_LIMITS.totalMs);assert.equal(cleanupMs,C26_LIMITS.cleanupReserveMs)
 const started=now();assert.ok(Number.isFinite(started))
 let last=started
 function remaining({cleanup=false}={}){
  const value=now();assert.ok(Number.isFinite(value)&&value>=last,'monotonic clock moved backwards');last=value
  const available=started+totalMs-value-(cleanup?0:cleanupMs)
  assert.ok(available>0,'aggregate deadline exhausted');return available
 }
 return Object.freeze({
  remaining,
  childBudget(requestedMs,options){
   assert.ok(Number.isFinite(requestedMs)&&requestedMs>0&&requestedMs<=C26_LIMITS.childMaxMs,'child deadline')
   return Math.min(requestedMs,remaining(options))
  },
  started,totalMs,cleanupMs,
 })
}
/** Intent is journaled before a transport may run. Failure/uncertain writes latch
 * the entire driver; the caller must preserve the real request and stop. */
export function operationJournal(write){
 let stopped=false,active=null;const issued=new Set()
 return Object.freeze({
  issue(operation){
   assert.ok(!stopped&&!active,'driver stopped or another operation pending')
   assert.ok(operation&&/^[a-z0-9-]{1,80}$/.test(operation.id))
   assert.ok(['read','write'].includes(operation.kind)&&!issued.has(operation.id),'duplicate operation/retry')
   // No body/token/SQL is accepted by this summary boundary.
   assert.deepEqual(Object.keys(operation).sort(),['id','kind'])
   try{write({event:'ISSUED',...operation})}catch(error){stopped=true;throw error}
   issued.add(operation.id);active={...operation}
  },
  received({id,accepted}){
   assert.ok(!stopped&&active&&active.id===id)
   try{write({event:'RECEIVED',id,accepted:accepted===true})}catch(error){stopped=true;throw error}
   if(accepted!==true){stopped=true;throw new Error('response failed; no retry')}
   active=null
  },
  uncertain(errorClass){
   assert.ok(active&&!stopped);stopped=true
   assert.match(errorClass,/^[A-Za-z][A-Za-z0-9]{0,79}$/)
   write({event:'UNCERTAIN',id:active.id,kind:active.kind,errorClass})
  },
  complete(){assert.ok(!stopped&&!active,'incomplete/uncertain operation cannot pass');return {issued:issued.size}},
  state(){return {stopped,active:active?{...active}:null,issued:issued.size}},
 })
}
