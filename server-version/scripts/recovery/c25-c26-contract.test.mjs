import test from 'node:test'
import assert from 'node:assert/strict'
import {C26_LIMITS as L,COLD_COUNTS,workloadPlan,assertWorkloadCounts,assertResources,aggregateDeadline,operationJournal} from './c25-c26-contract.mjs'
test('C26 plan is one four-child cold chain plus 24 single reads and six two-read waves',()=>{
 const plan=workloadPlan();assert.equal(plan.cold.counts.parentAttempts,1)
 assert.equal(['formFinals','scaleFinals','cognitiveFinals','sjtFinals'].reduce((n,k)=>n+plan.cold.counts[k],0),4)
 assert.equal(plan.serial.length,24);assert.equal(plan.serial.reduce((n,x)=>n+x.requests,0),24)
 assert.equal(plan.waves.length,6);assert.equal(plan.waves.reduce((n,x)=>n+x.requests,0),12)
 assert.ok(plan.serial.every(x=>x.readOnly)&&plan.waves.every(x=>x.readOnly&&x.concurrency===2))
 const counts={phase:'A',cold:{...COLD_COUNTS},serialRequests:24,concurrentWaves:6,concurrentRequests:12,maxConcurrency:2,extraFinals:0,automaticRetries:0}
 assertWorkloadCounts(counts)
 for(const change of [{phase:'B'},{serialRequests:25},{concurrentRequests:24},{maxConcurrency:3},{extraFinals:1},{automaticRetries:1},{cold:{...COLD_COUNTS,parentAttempts:4}}])assert.throws(()=>assertWorkloadCounts({...counts,...change}))
})
test('entry buffer is consumable but runtime floors and API RSS cannot be lowered',()=>{
 const x={diskBytes:L.entryDiskBytes,memoryBytes:L.memoryBytes,tmpBytes:L.tmpBytes,apiRssBytes:L.apiRssExclusiveMaxBytes-1}
 assertResources(x,{entry:true});assertResources({...x,diskBytes:L.runDiskBytes})
 assert.throws(()=>assertResources({...x,diskBytes:L.entryDiskBytes-1},{entry:true}))
 for(const change of [{diskBytes:L.runDiskBytes-1},{memoryBytes:L.memoryBytes-1},{tmpBytes:L.tmpBytes-1},{apiRssBytes:L.apiRssExclusiveMaxBytes},{memoryBytes:NaN}])assert.throws(()=>assertResources({...x,...change}))
})
test('one monotonic 1200s budget includes setup/audits with reserved bounded cleanup',()=>{
 let now=0;const d=aggregateDeadline(()=>now)
 assert.equal(d.childBudget(90_000),90_000);now=1_130_000;assert.equal(d.childBudget(90_000),10_000)
 now=1_140_000;assert.throws(()=>d.remaining());assert.equal(d.childBudget(90_000,{cleanup:true}),60_000)
 now=1_200_000;assert.throws(()=>d.remaining({cleanup:true}))
 now=100;assert.throws(()=>d.remaining());assert.throws(()=>aggregateDeadline(()=>0,{totalMs:1_300_000}))
})
test('uncertain write retains intent and permanently stops without automatic resubmission',()=>{
 const raw=[],j=operationJournal(x=>raw.push(x))
 j.issue({id:'cold-scale-final',kind:'write'});j.uncertain('TimeoutError')
 assert.deepEqual(raw.map(x=>x.event),['ISSUED','UNCERTAIN'])
 assert.throws(()=>j.issue({id:'cold-scale-final',kind:'write'}));assert.throws(()=>j.issue({id:'new-id',kind:'write'}));assert.throws(()=>j.complete())
 const ok=operationJournal(()=>{});ok.issue({id:'status-0',kind:'read'});ok.received({id:'status-0',accepted:true});assert.deepEqual(ok.complete(),{issued:1})
 assert.throws(()=>ok.issue({id:'status-0',kind:'read'}))
})
test('journal I/O failure and rejected response stop before another business operation',()=>{
 const j=operationJournal(()=>{throw Error('synthetic journal error')});assert.throws(()=>j.issue({id:'write-0',kind:'write'}));assert.equal(j.state().stopped,true);assert.throws(()=>j.complete())
 const rejected=operationJournal(()=>{});rejected.issue({id:'read-0',kind:'read'});assert.throws(()=>rejected.received({id:'read-0',accepted:false}));assert.throws(()=>rejected.issue({id:'read-1',kind:'read'}))
})
