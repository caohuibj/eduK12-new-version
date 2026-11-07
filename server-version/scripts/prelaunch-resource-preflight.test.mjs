import {test} from 'node:test'
import assert from 'node:assert/strict'
import {inspectResourceContract} from './prelaunch-resource-preflight.mjs'
const fixture=()=>{
 const env={CORS_ORIGIN:'https://app.test',COOKIE_SECURE:'true',TRUST_PROXY_HOPS:'1',ASSET_MIGRATION_COMPLETE:'true',DATABASE_URL:'postgresql://u:secret@db/app',PRISMA_CONNECTION_POOL_SIZE:'10',PRISMA_POOL_TIMEOUT:'30',EXPORT_CONCURRENCY:'1',NODE_OPTIONS:'--max-old-space-size=640',BACKGROUND_WORKERS_ENABLED:'false',UNIT_SUBMIT_ADMISSION_LIMIT:'7',AGGREGATE_FINALIZATION_ADMISSION_LIMIT:'3',QUESTIONNAIRE_COMPLETION_ADMISSION_LIMIT:'8'}
 return {services:{postgres:{cpus:1,mem_limit:1073741824,command:['postgres','-c','shared_buffers=256MB','-c','max_connections=80']},redis:{cpus:.25,mem_limit:268435456,command:['redis-server','--maxmemory','128mb','--maxmemory-policy','noeviction']},backend:{cpus:1.75,mem_limit:1073741824,environment:env},worker:{cpus:.75,mem_limit:805306368,stop_grace_period:'45s',environment:{...env,NODE_OPTIONS:'--max-old-space-size=192',PRISMA_CONNECTION_POOL_SIZE:'4',BACKGROUND_WORKERS_ENABLED:'true',WORKER_SHUTDOWN_TIMEOUT_SECONDS:'30'}},frontend:{cpus:.25,mem_limit:134217728,ports:[{host_ip:'127.0.0.1'}]}}}
}
test('reports safe effective budgets including subprocess heaps/pools, never secrets',()=>{
 const report=inspectResourceContract(fixture())
 assert.equal(report.totalCpu,4);assert.equal(report.totalMemoryMiB,3200);assert.equal(report.maximumConfiguredAppConnections,18)
 assert.equal(report.capacityCertified,false);assert.ok(!JSON.stringify(report).includes('secret'))
})
test('rejects public bypass, unsafe cookies, invalid knobs and parent-child heap overcommit',()=>{
 for(const mutate of [f=>f.services.backend.ports=[{host_ip:'0.0.0.0'}],f=>f.services.backend.environment.COOKIE_SECURE='false',f=>f.services.worker.environment.NODE_OPTIONS='--max-old-space-size=384',f=>f.services.backend.environment.EXPORT_CONCURRENCY='bad',f=>f.services.backend.environment.TRUST_PROXY_HOPS='0']) {
  const f=fixture();mutate(f)
  assert.throws(()=>inspectResourceContract(f))
 }
 const f=fixture();f.services.redis.command[f.services.redis.command.length-1]='allkeys-lru';assert.throws(()=>inspectResourceContract(f))
 const g=fixture();g.services.worker.cpus=2;assert.throws(()=>inspectResourceContract(g))
})
test('capacity overlay may expose only localhost API; URL pool overrides are validated',()=>{
 const f=fixture();f.services.backend.ports=[{host_ip:'127.0.0.1'}]
 assert.throws(()=>inspectResourceContract(f));assert.doesNotThrow(()=>inspectResourceContract(f,{capacity:true}))
 f.services.backend.environment.DATABASE_URL+='?connection_limit=0';assert.throws(()=>inspectResourceContract(f,{capacity:true}))
})

const optionalAssessmentCaps=[
 'PUBLIC_ASSESSMENT_IP_GET_LIMIT','PUBLIC_ASSESSMENT_IP_FINAL_LIMIT',
 'PUBLIC_ASSESSMENT_TOKEN_GET_LIMIT','PUBLIC_ASSESSMENT_TOKEN_FINAL_LIMIT',
 'PUBLIC_ASSESSMENT_RECOVERY_GET_LIMIT','PUBLIC_ASSESSMENT_RECOVERY_FINAL_LIMIT',
]
test('accepts only omitted optional assessment caps and preserves configured resource checks',()=>{
 const f=fixture()
 for(const service of ['backend','worker']) {
  for(const cap of optionalAssessmentCaps)f.services[service].environment[cap]=''
  f.services[service].environment.PUBLIC_ASSESSMENT_EXPECTED_CLASS_SIZE='60'
 }
 const inspected=inspectResourceContract(f)
 assert.equal(inspected.totalCpu,4)
 assert.equal(inspected.maximumConfiguredAppConnections,18)
 for(const service of ['backend','worker'])for(const cap of optionalAssessmentCaps)
  assert.equal(Object.hasOwn(inspected.services[service],cap),false)
})
test('rejects invalid explicit assessment caps and unrelated empty required limits',()=>{
 for(const cap of optionalAssessmentCaps){
  for(const value of ['0','-1','not-an-integer','1.5']){
   const f=fixture()
   f.services.backend.environment[cap]=value
   assert.throws(()=>inspectResourceContract(f),new RegExp('Invalid '+cap))
  }
  const f=fixture()
  f.services.backend.environment[cap]='15'
  assert.equal(inspectResourceContract(f).services.backend[cap],15)
 }
 for(const key of ['REGISTRATION_ACCOUNT_LIMIT','EXPORT_CONCURRENCY','UNIT_SUBMIT_ADMISSION_LIMIT']){
  const f=fixture()
  f.services.backend.environment[key]=''
  assert.throws(()=>inspectResourceContract(f),new RegExp('Invalid '+key))
 }
})
test('FINAL gate limits stay within the API pool: conservative envelope passes, fallbacks fail',()=>{
 const conservative=fixture()
 const report=inspectResourceContract(conservative)
 assert.equal(report.finalGateConcurrencyTotal,18)
 assert.equal(report.services.backend.UNIT_SUBMIT_ADMISSION_LIMIT,7)
 assert.equal(report.services.backend.AGGREGATE_FINALIZATION_ADMISSION_LIMIT,3)
 assert.equal(report.services.backend.QUESTIONNAIRE_COMPLETION_ADMISSION_LIMIT,8)
 // The previous Compose fallbacks (50/20/50 vs pool 20): a single gate already exceeds the pool.
 const fallback=fixture()
 fallback.services.backend.environment.UNIT_SUBMIT_ADMISSION_LIMIT='50'
 fallback.services.backend.environment.AGGREGATE_FINALIZATION_ADMISSION_LIMIT='20'
 fallback.services.backend.environment.QUESTIONNAIRE_COMPLETION_ADMISSION_LIMIT='50'
 fallback.services.backend.environment.PRISMA_CONNECTION_POOL_SIZE='20'
 assert.throws(()=>inspectResourceContract(fallback),/FINAL admission limit exceeds Prisma pool/)
 // A single gate above the pool fails even when the total stays within 2x.
 const single=fixture()
 single.services.backend.environment.UNIT_SUBMIT_ADMISSION_LIMIT='11'
 single.services.backend.environment.AGGREGATE_FINALIZATION_ADMISSION_LIMIT='3'
 single.services.backend.environment.QUESTIONNAIRE_COMPLETION_ADMISSION_LIMIT='3'
 assert.throws(()=>inspectResourceContract(single),/FINAL admission limit exceeds Prisma pool/)
 // The total above 2x the pool fails even when every gate is within the pool.
 const total=fixture()
 total.services.backend.environment.UNIT_SUBMIT_ADMISSION_LIMIT='7'
 total.services.backend.environment.AGGREGATE_FINALIZATION_ADMISSION_LIMIT='7'
 total.services.backend.environment.QUESTIONNAIRE_COMPLETION_ADMISSION_LIMIT='7'
 assert.throws(()=>inspectResourceContract(total),/FINAL admission limits exceed twice the Prisma pool/)
 // A missing gate limit is a contract violation, not a silent code default.
 const missing=fixture()
 delete missing.services.backend.environment.QUESTIONNAIRE_COMPLETION_ADMISSION_LIMIT
 assert.throws(()=>inspectResourceContract(missing),/Missing QUESTIONNAIRE_COMPLETION_ADMISSION_LIMIT/)
})

test('worker stop grace must exceed the internal shutdown budget by 15s',()=>{
 // Defaults (45s grace vs 30s budget) pass with exactly the 15s margin.
 const defaults=inspectResourceContract(fixture())
 assert.equal(defaults.services.worker.stopGracePeriodSeconds,45)
 assert.equal(defaults.services.worker.workerShutdownTimeoutSeconds,30)
 // Raising the internal budget without raising the grace fails.
 const tight=fixture()
 tight.services.worker.environment.WORKER_SHUTDOWN_TIMEOUT_SECONDS='60'
 assert.throws(()=>inspectResourceContract(tight),/stop_grace_period must exceed WORKER_SHUTDOWN_TIMEOUT_SECONDS by at least 15s/)
 // Raising both keeps the 15s margin and passes.
 const raised=fixture()
 raised.services.worker.environment.WORKER_SHUTDOWN_TIMEOUT_SECONDS='60'
 raised.services.worker.stop_grace_period='75s'
 assert.equal(inspectResourceContract(raised).services.worker.stopGracePeriodSeconds,75)
 // Compound durations parse ('1m30s' = 90s >= 60 + 15).
 const compound=fixture()
 compound.services.worker.environment.WORKER_SHUTDOWN_TIMEOUT_SECONDS='60'
 compound.services.worker.stop_grace_period='1m30s'
 assert.equal(inspectResourceContract(compound).services.worker.stopGracePeriodSeconds,90)
 // A grace equal to the budget (zero margin) fails.
 const zero=fixture()
 zero.services.worker.stop_grace_period='30s'
 assert.throws(()=>inspectResourceContract(zero),/stop_grace_period must exceed WORKER_SHUTDOWN_TIMEOUT_SECONDS/)
 // No explicit grace falls back to the 10s Compose default and fails.
 const missing=fixture()
 delete missing.services.worker.stop_grace_period
 assert.throws(()=>inspectResourceContract(missing),/stop_grace_period must exceed WORKER_SHUTDOWN_TIMEOUT_SECONDS/)
 // An unparseable grace is a contract violation, not a silent default.
 const invalid=fixture()
 invalid.services.worker.stop_grace_period='soon'
 assert.throws(()=>inspectResourceContract(invalid),/Invalid worker stop_grace_period/)
})
