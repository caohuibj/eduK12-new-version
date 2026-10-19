/** Pure parser/accounting checks. No DB, API, Redis or benchmark is started. */
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import {parseProcStat,numericDeltas,summarizeProcesses} from './c20-efficiency-observer.mjs'

test('proc stat parser handles spaces and parentheses in comm and separate CPU ticks',()=>{
 const fields=Array.from({length:42},()=> '0');fields[0]='S';fields[1]='42';fields[11]='31';fields[12]='17';fields[19]='98123'
 const parsed=parseProcStat('123 (worker (export) job) '+fields.join(' '),100)
 assert.deepEqual(parsed,{state:'S',parentPid:42,userTicks:31,systemTicks:17,startTicks:98123,userSeconds:.31,systemSeconds:.17})
})
test('counter deltas preserve negative/reset evidence and exclude nonnumeric fields',()=>{
 assert.deepEqual(numericDeltas({calls:4,bytes:10,stats_reset:'x'},{calls:6,bytes:3,stats_reset:'y',new:2}),{calls:2,bytes:-7})
})
const proc=(pid,startTicks,userTicks,systemTicks,rssBytes,role='direct_producer')=>({pid,startTicks,userTicks,systemTicks,rssBytes,vmHwmLifetimeBytes:9000,role,io:{rchar:userTicks*10,write_bytes:systemTicks*10},ioUnavailable:null})
test('summaries retain physical roles, sampled RSS and lifetime HWM without conflating them',()=>{
 const rows=summarizeProcesses([
  {elapsedMs:0,processes:[proc(100,9,10,3,1000),proc(200,2,1,1,800,'api')]},
  {elapsedMs:100,processes:[proc(100,9,12,4,3000),proc(200,2,1,1,900,'api')]},
  {elapsedMs:200,processes:[proc(100,9,12,5,1500),proc(200,2,1,1,700,'api')]},
 ],100)
 assert.equal(rows[0].userCpuSeconds,.02);assert.equal(rows[0].systemCpuSeconds,.02)
 assert.equal(rows[0].rssSampledPeakBytes,3000);assert.equal(rows[0].rssStartBytes,1000);assert.equal(rows[0].rssEndBytes,1500)
 assert.equal(rows[0].vmHwmLifetimeEndBytes,9000);assert.deepEqual(rows[0].roles,['direct_producer'])
 assert.deepEqual(rows[0].ioDelta,{rchar:20,write_bytes:20})
 assert.equal(rows[1].userCpuSeconds,0);assert.equal(rows[1].systemCpuSeconds,0)
 assert.match(rows[1].coverage,/FIRST_TO_LAST/)
})
test('kernel start time separates reused PIDs and roles retain later socket attribution',()=>{
 const rows=summarizeProcesses([
  {elapsedMs:0,processes:[proc(123,10,8,1,100,'pg_background_unclassified')]},
  {elapsedMs:100,processes:[proc(123,10,9,2,200,'pg_direct_producer_backend')]},
  {elapsedMs:200,processes:[proc(123,50,1,1,50,'pg_unattributed_client_backend')]},
 ],100)
 assert.equal(rows.length,2);assert.deepEqual(rows[0].roles,['pg_background_unclassified','pg_direct_producer_backend']);assert.equal(rows[1].userCpuSeconds,0)
})
test('observer source keeps read-only counters, explicit error propagation, and no forced cleanup tricks',()=>{
 const source=fs.readFileSync(new URL('./c20-efficiency-observer.mjs',import.meta.url),'utf8')
 for(const required of ['application_name:\'c20_efficiency_observer\'','queriesDeltaFullEnvelope','queriesDeltaOperation','pg_stat_clear_snapshot','postOperationSettleMs:1100','resource windows cannot overlap or nest',"path.join(directory,'stop')",'observerOperationEnvelopeMs','rawJournalBasename'])assert.ok(source.includes(required),required)
 assert.ok(!/pg_stat_reset|pg_stat_statements_reset|global\.gc\(|drop_caches|ALTER SYSTEM|CREATE EXTENSION/.test(source))
 assert.ok(!source.includes('result.measurements='),'existing consumer measurements must not be overwritten')
})
