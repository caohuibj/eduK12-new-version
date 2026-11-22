#!/usr/bin/env node
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {isDeepStrictEqual} from 'node:util'
const size = value => {
 if(typeof value === 'number' && Number.isSafeInteger(value) && value>0)return value
 const match=/^(\d+(?:\.\d+)?)(b|k|kb|m|mb|g|gb)?$/i.exec(String(value))
 if(!match)throw new Error('Invalid memory limit')
 return Number(match[1])*({b:1,k:1024,kb:1024,m:1048576,mb:1048576,g:1073741824,gb:1073741824}[match[2]?.toLowerCase() || 'b'])
}
const integer=(value,name,min=1,max=10000)=>{
 const number=Number(value)
 if(!Number.isSafeInteger(number)||number<min||number>max)throw new Error(`Invalid ${name}`)
 return number
}
// Compose duration strings: '45s', '1m30s', '1500ms', or a bare number of
// seconds. Anything else (or a negative value) is a contract violation.
const durationSeconds=(value,name)=>{
 if(typeof value==='number'&&Number.isFinite(value)&&value>=0)return value
 const text=String(value).trim()
 if(!text)throw new Error(`Invalid ${name}`)
 if(/^\d+(?:\.\d+)?$/.test(text))return Number(text)
 const parts=[...text.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)]
 const consumed=parts.map(part=>part[0]).join('')
 if(!parts.length||consumed!==text.replace(/\s+/g,''))throw new Error(`Invalid ${name}`)
 return parts.reduce((sum,part)=>sum+Number(part[1])*({ms:0.001,s:1,m:60,h:3600}[part[2]]),0)
}
// Compose intentionally renders these six optional caps as empty strings.
// Empty means the backend derives bounded values from the class-size/token
// audience inputs; an explicitly supplied cap still has to be a positive integer.
const optionalAssessmentCaps = new Set([
 'PUBLIC_ASSESSMENT_IP_GET_LIMIT',
 'PUBLIC_ASSESSMENT_IP_FINAL_LIMIT',
 'PUBLIC_ASSESSMENT_TOKEN_GET_LIMIT',
 'PUBLIC_ASSESSMENT_TOKEN_FINAL_LIMIT',
 'PUBLIC_ASSESSMENT_RECOVERY_GET_LIMIT',
 'PUBLIC_ASSESSMENT_RECOVERY_FINAL_LIMIT',
])
export function inspectResourceContract(compose, {capacity=false, existingEnvelope=null}={}) {
 const services=compose.services || {};const result={capacityCertified:false,services:{}}
 let cpu=0,memory=0,pools=0
 const extraBackends=Object.keys(services).filter(name=>/^backend-\d+$/.test(name)).sort()
 const inspectedServices=['postgres','redis','backend',...extraBackends,'worker','frontend']
 for(const name of inspectedServices) {
  const isBackend=name==='backend' || /^backend-\d+$/.test(name)
  const service=services[name];if(!service)throw new Error(`Missing ${name}`)
  const cpus=Number(service.cpus);if(!Number.isFinite(cpus)||cpus<=0||cpus>4)throw new Error(`Invalid ${name} CPU`)
  const bytes=size(service.mem_limit);cpu+=cpus;memory+=bytes
  result.services[name]={cpus,memoryMiB:bytes/1048576}
  const ports=service.ports || []
  if(['postgres','redis','worker'].includes(name) && ports.length)throw new Error(`Forbidden ${name} host exposure`)
  if(isBackend && ports.length && !capacity)throw new Error('Forbidden API host exposure')
  if(ports.some(port=>port.host_ip!=='127.0.0.1' && port.host_ip!=='::1'))throw new Error('Public host exposure requires an independently reviewed TLS ingress')
  if(isBackend || name==='worker') {
   const env=service.environment || {}
   const origin=new URL(env.CORS_ORIGIN)
   if(origin.protocol!=='https:' || origin.origin!==env.CORS_ORIGIN)throw new Error('Production acceptance requires an exact HTTPS CORS origin')
   if(String(env.COOKIE_SECURE)!=='true')throw new Error('HTTPS requires secure cookies')
   integer(env.TRUST_PROXY_HOPS,'TRUST_PROXY_HOPS',1,10)
   if(String(env.ASSET_MIGRATION_COMPLETE)!=='true')throw new Error('Asset migration must be complete')
   if(isBackend && String(env.BACKGROUND_WORKERS_ENABLED)!=='false')throw new Error('API must not consume worker jobs')
   const db=new URL(env.DATABASE_URL)
   const urlPool=db.searchParams.has('connection_limit') ? integer(db.searchParams.get('connection_limit'),'DATABASE_URL connection_limit',1,1000) : null
   const envPool=env.PRISMA_CONNECTION_POOL_SIZE!==undefined && String(env.PRISMA_CONNECTION_POOL_SIZE).trim()!=='' ? integer(env.PRISMA_CONNECTION_POOL_SIZE,'PRISMA_CONNECTION_POOL_SIZE',1,1000) : null
   if(urlPool!==null && envPool!==null && urlPool!==envPool)throw new Error(`${name} DATABASE_URL connection_limit (${urlPool}) disagrees with PRISMA_CONNECTION_POOL_SIZE (${envPool})`)
   const pool=urlPool ?? envPool ?? integer(undefined,'Prisma pool',1,1000)
   const urlTimeout=db.searchParams.has('pool_timeout') ? integer(db.searchParams.get('pool_timeout'),'DATABASE_URL pool_timeout',1,1000) : null
   const envTimeout=env.PRISMA_POOL_TIMEOUT!==undefined && String(env.PRISMA_POOL_TIMEOUT).trim()!=='' ? integer(env.PRISMA_POOL_TIMEOUT,'PRISMA_POOL_TIMEOUT',1,1000) : null
   if(urlTimeout!==null && envTimeout!==null && urlTimeout!==envTimeout)throw new Error(`${name} DATABASE_URL pool_timeout (${urlTimeout}) disagrees with PRISMA_POOL_TIMEOUT (${envTimeout})`)
   if(urlTimeout===null && envTimeout===null)integer(undefined,'Prisma timeout',1,1000)
   if(isBackend && String(env.ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED)==='true') {
    const trickleMax=env.ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT===undefined || String(env.ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT).trim()===''
     ? 1 : Number(env.ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT)
    if(!Number.isSafeInteger(trickleMax) || trickleMax<1 || trickleMax>10)throw new Error(`${name} ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED=true requires ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT in 1..10`)
   }
   const heapMatches=[...String(env.NODE_OPTIONS).matchAll(/--max-old-space-size=(\d+)/g)]
   if(heapMatches.length!==1)throw new Error(`Explicit ${name} heap required`)
   const heap=integer(heapMatches[0][1],'Node heap',1,4096)
   const copies=name==='worker' ? 1+integer(env.EXPORT_CONCURRENCY,'EXPORT_CONCURRENCY',1,4):1
   if(heap*1048576*copies>bytes*.65)throw new Error(`${name} heaps leave insufficient native/subprocess headroom`)
   pools+=pool*copies
   result.services[name]={...result.services[name],heapMiB:heap,heapProcessesBudgeted:copies,prismaPool:pool}
   for(const [key,value] of Object.entries(env)) {
    if(/(?:_LIMIT|_QUEUE|_MAX_CONCURRENT|_MAX_WAIT_MS|_TIMEOUT_MS|_RETRY_AFTER_SECONDS|_CONCURRENCY|_TIMEOUT|_MAX_RECORDS|_MAX_TRIALS|_MAX_FIELDS|_MAX_BYTES|_BYTE_BUDGET|_RETENTION_HOURS)$/.test(key)) {
     if(value==='' && optionalAssessmentCaps.has(key))continue
     integer(value,key,key.endsWith('_QUEUE')?0:1,Number.MAX_SAFE_INTEGER)
     result.services[name][key]=Number(value)
    }
   }
  }
 }
 // FINAL-gate consistency: the three FINAL admission gates share the API
 // process's Prisma pool. A single gate must never admit more concurrent
 // operations than the pool can serve, and the admitted total must stay
 // within a bounded multiple of the pool. The known-safe conservative
 // envelope (7+3+8=18 vs pool 10, 1.8x) passes; the previous Compose
 // fallbacks (50+20+50=120 vs pool 20, 6x) failed. A hard "sum <= pool"
 // rule would reject the known-safe envelope, so the bound is 2x, not 1x.
 // The worker process does not enforce these gates, so only the backend
 // values count.
 const backendService=result.services.backend
 const finalGateLimits=['UNIT_SUBMIT_ADMISSION_LIMIT','AGGREGATE_FINALIZATION_ADMISSION_LIMIT','QUESTIONNAIRE_COMPLETION_ADMISSION_LIMIT'].map(key=>{
  const value=backendService[key]
  if(!Number.isSafeInteger(value)||value<1)throw new Error(`Missing ${key}`)
  return value
 })
 const finalGateConcurrencyTotal=finalGateLimits.reduce((sum,limit)=>sum+limit,0)
 if(finalGateLimits.some(limit=>limit>backendService.prismaPool))throw new Error('FINAL admission limit exceeds Prisma pool')
 if(finalGateConcurrencyTotal>Math.max(2*backendService.prismaPool,existingEnvelope?.finalGates ?? 0))throw new Error('FINAL admission limits exceed twice the Prisma pool')
 result.finalGateConcurrencyTotal=finalGateConcurrencyTotal
 // Worker stop-grace consistency: Compose sends SIGKILL when the grace
 // expires, so the grace must exceed the worker's internal shutdown budget
 // (WORKER_SHUTDOWN_TIMEOUT_SECONDS, runtimeResources.ts) by a 15s margin
 // for the drain/cancel/close sequence to finish. Absent values fall back
 // to the Compose defaults (grace 10s, budget 30s), which fail the rule:
 // an explicit grace is effectively required. The defaults (45s vs 30s)
 // pass with exactly the 15s margin.
 const workerEnv=services.worker.environment || {}
 const workerGraceSeconds=services.worker.stop_grace_period===undefined?10:durationSeconds(services.worker.stop_grace_period,'worker stop_grace_period')
 const workerBudgetSeconds=workerEnv.WORKER_SHUTDOWN_TIMEOUT_SECONDS===undefined||workerEnv.WORKER_SHUTDOWN_TIMEOUT_SECONDS===''?30:integer(workerEnv.WORKER_SHUTDOWN_TIMEOUT_SECONDS,'WORKER_SHUTDOWN_TIMEOUT_SECONDS',5,300)
 result.services.worker={...result.services.worker,stopGracePeriodSeconds:workerGraceSeconds,workerShutdownTimeoutSeconds:workerBudgetSeconds}
 if(workerGraceSeconds<workerBudgetSeconds+15)throw new Error('Worker stop_grace_period must exceed WORKER_SHUTDOWN_TIMEOUT_SECONDS by at least 15s')
 if(cpu>Math.max(4.000001,existingEnvelope?.cpu ?? 0) || memory>Math.max(3584*1048576,existingEnvelope?.memory ?? 0))throw new Error('4C4G starting envelope exceeded; reserve at least 512MiB for the host')
 const redis=services.redis.command || [];const maxIndex=redis.indexOf('--maxmemory');const policyIndex=redis.indexOf('--maxmemory-policy')
 if(maxIndex<0 || size(redis[maxIndex+1])>size(services.redis.mem_limit)*.65 || redis[policyIndex+1]!=='noeviction')throw new Error('Redis persistence/queue headroom or policy invalid')
 const postgres=services.postgres.command || []
 const setting=name=>postgres.find(value=>String(value).startsWith(`${name}=`))?.split('=')[1]
 if(size(setting('shared_buffers'))>size(services.postgres.mem_limit)*.4)throw new Error('PostgreSQL shared buffers exceed starting envelope')
 if(integer(setting('max_connections'),'PostgreSQL max_connections',1,1000)<pools+10)throw new Error('PostgreSQL connections do not cover parent and child pools')
 result.totalCpu=cpu;result.totalMemoryMiB=memory/1048576;result.hostMemoryReserveMiB=4096-result.totalMemoryMiB;result.maximumConfiguredAppConnections=pools
 return result
}
// This path only accepts a release that preserves the complete running Compose
// configuration. Existing limits remain visible and are not capacity-certified.
export function inspectUnchangedProductionRelease(candidate, baseline, {images, revision, producerRun}) {
 const names=['backend','backend-2','worker','report-worker-2','frontend']
 if(!/^[a-f0-9]{40}$/.test(revision || ''))throw new Error('Exact release revision required')
 if(!/^[1-9][0-9]*$/.test(String(producerRun || '')))throw new Error('Release producer run required')
 const current=structuredClone(baseline), next=structuredClone(candidate)
 for(const name of names) {
  const old=current.services?.[name], updated=next.services?.[name]
  if(!old || !updated)throw new Error(`Missing ${name}`)
  const expected=images?.[name==='frontend'?'frontend':'backend']?.runtimeImageId
  if(!/^sha256:[a-f0-9]{64}$/.test(expected || '') || updated.image!==expected)throw new Error(`Unqualified ${name} image`)
  const labels=updated.labels || {}
  if(labels['org.opencontainers.image.revision']!==revision || labels['io.eduk12.release.source']!==revision || labels['io.eduk12.release.producer.run']!==String(producerRun))throw new Error(`Incorrect ${name} release identity`)
  delete old.image;delete updated.image
  for(const key of ['org.opencontainers.image.revision','io.eduk12.release.source','io.eduk12.release.producer.run']) {
   if(old.labels)delete old.labels[key]
   if(updated.labels)delete updated.labels[key]
  }
 }
 if(!isDeepStrictEqual(current,next))throw new Error('Production configuration changed beyond qualified images and release labels')
 const normalized=structuredClone(candidate)
 // The approved baseline and target have the same compiled default of 8.
 for(const name of ['backend','backend-2'])normalized.services[name].environment.AGGREGATE_FINALIZATION_ADMISSION_LIMIT ??= '8'
 const backend=normalized.services.backend.environment
 const finalGates=['UNIT_SUBMIT_ADMISSION_LIMIT','AGGREGATE_FINALIZATION_ADMISSION_LIMIT','QUESTIONNAIRE_COMPLETION_ADMISSION_LIMIT'].reduce((sum,key)=>sum+integer(backend[key],key),0)
 const resourceNames=['postgres','redis','backend',...Object.keys(normalized.services).filter(name=>/^backend-\d+$/.test(name)).sort(),'worker','frontend']
 const envelope={finalGates,cpu:0,memory:0}
 for(const name of resourceNames) {
  const service=normalized.services[name]
  envelope.cpu+=Number(service.cpus)
  envelope.memory+=size(service.mem_limit)
 }
 const worker=normalized.services['report-worker-2']
 if(!Number.isFinite(Number(worker.cpus)) || Number(worker.cpus)<=0 || Number(worker.cpus)>4)throw new Error('Invalid report-worker-2 CPU')
 size(worker.mem_limit)
 if((worker.ports || []).length)throw new Error('Forbidden report-worker-2 host exposure')
 const result=inspectResourceContract(normalized,{capacity:true,existingEnvelope:envelope})
 result.baselinePreserved=true
 result.reportWorker2={cpus:Number(worker.cpus),memoryMiB:size(worker.mem_limit)/1048576}
 result.note='Existing resource limits preserved; capacity is not certified by this check.'
 return result
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {
  const args=process.argv.slice(2);const fileIndex=args.indexOf('--compose-json')
  const input=fileIndex>=0 ? fs.readFileSync(args[fileIndex+1],'utf8') : execFileSync('docker',['compose',...(args.includes('--capacity')?['--profile','capacity-worker','-f','docker-compose.yml','-f','docker-compose.capacity.yml']:[]),'config','--format','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:2097152})
  const baselineIndex=args.indexOf('--baseline-json')
  const proofIndex=args.indexOf('--images-json')
  const revisionIndex=args.indexOf('--release-revision')
  const runIndex=args.indexOf('--release-run')
  const candidate=JSON.parse(input)
  const result=baselineIndex>=0
   ? inspectUnchangedProductionRelease(candidate,JSON.parse(fs.readFileSync(args[baselineIndex+1],'utf8')),{images:JSON.parse(fs.readFileSync(args[proofIndex+1],'utf8')),revision:args[revisionIndex+1],producerRun:args[runIndex+1]})
   : inspectResourceContract(candidate,{capacity:args.includes('--capacity')})
  console.log(JSON.stringify(result,null,2))
 }catch(error){console.error(error instanceof Error ? error.message : 'Resource contract invalid');process.exitCode=1}
}
