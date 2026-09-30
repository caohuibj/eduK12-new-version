import {test} from 'node:test'
import assert from 'node:assert/strict'
import {inspectResourceContract} from './prelaunch-resource-preflight.mjs'
const fixture=()=>{
 const env={CORS_ORIGIN:'https://app.test',COOKIE_SECURE:'true',TRUST_PROXY_HOPS:'1',ASSET_MIGRATION_COMPLETE:'true',DATABASE_URL:'postgresql://u:secret@db/app',PRISMA_CONNECTION_POOL_SIZE:'10',PRISMA_POOL_TIMEOUT:'30',EXPORT_CONCURRENCY:'1',NODE_OPTIONS:'--max-old-space-size=640',BACKGROUND_WORKERS_ENABLED:'false'}
 return {services:{postgres:{cpus:1,mem_limit:1073741824,command:['postgres','-c','shared_buffers=256MB','-c','max_connections=80']},redis:{cpus:.25,mem_limit:268435456,command:['redis-server','--maxmemory','128mb','--maxmemory-policy','noeviction']},backend:{cpus:1.75,mem_limit:1073741824,environment:env},worker:{cpus:.75,mem_limit:805306368,environment:{...env,NODE_OPTIONS:'--max-old-space-size=192',PRISMA_CONNECTION_POOL_SIZE:'4',BACKGROUND_WORKERS_ENABLED:'true'}},frontend:{cpus:.25,mem_limit:134217728,ports:[{host_ip:'127.0.0.1'}]}}}
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
