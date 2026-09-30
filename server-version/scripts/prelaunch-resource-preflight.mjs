#!/usr/bin/env node
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
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
export function inspectResourceContract(compose, {capacity=false}={}) {
 const services=compose.services || {};const result={capacityCertified:false,services:{}}
 let cpu=0,memory=0,pools=0
 for(const name of ['postgres','redis','backend','worker','frontend']) {
  const service=services[name];if(!service)throw new Error(`Missing ${name}`)
  const cpus=Number(service.cpus);if(!Number.isFinite(cpus)||cpus<=0||cpus>4)throw new Error(`Invalid ${name} CPU`)
  const bytes=size(service.mem_limit);cpu+=cpus;memory+=bytes
  result.services[name]={cpus,memoryMiB:bytes/1048576}
  const ports=service.ports || []
  if(['postgres','redis','worker'].includes(name) && ports.length)throw new Error(`Forbidden ${name} host exposure`)
  if(name==='backend' && ports.length && !capacity)throw new Error('Forbidden API host exposure')
  if(ports.some(port=>port.host_ip!=='127.0.0.1' && port.host_ip!=='::1'))throw new Error('Public host exposure requires an independently reviewed TLS ingress')
  if(['backend','worker'].includes(name)) {
   const env=service.environment || {}
   const origin=new URL(env.CORS_ORIGIN)
   if(origin.protocol!=='https:' || origin.origin!==env.CORS_ORIGIN)throw new Error('Production acceptance requires an exact HTTPS CORS origin')
   if(String(env.COOKIE_SECURE)!=='true')throw new Error('HTTPS requires secure cookies')
   integer(env.TRUST_PROXY_HOPS,'TRUST_PROXY_HOPS',1,10)
   if(String(env.ASSET_MIGRATION_COMPLETE)!=='true')throw new Error('Asset migration must be complete')
   if(name==='backend' && String(env.BACKGROUND_WORKERS_ENABLED)!=='false')throw new Error('API must not consume worker jobs')
   const db=new URL(env.DATABASE_URL)
   const pool=integer(db.searchParams.has('connection_limit') ? db.searchParams.get('connection_limit') : env.PRISMA_CONNECTION_POOL_SIZE,'Prisma pool',1,1000)
   integer(db.searchParams.has('pool_timeout') ? db.searchParams.get('pool_timeout') : env.PRISMA_POOL_TIMEOUT,'Prisma timeout',1,1000)
   const heapMatches=[...String(env.NODE_OPTIONS).matchAll(/--max-old-space-size=(\d+)/g)]
   if(heapMatches.length!==1)throw new Error(`Explicit ${name} heap required`)
   const heap=integer(heapMatches[0][1],'Node heap',1,4096)
   const copies=name==='worker' ? 1+integer(env.EXPORT_CONCURRENCY,'EXPORT_CONCURRENCY',1,4):1
   if(heap*1048576*copies>bytes*.65)throw new Error(`${name} heaps leave insufficient native/subprocess headroom`)
   pools+=pool*copies
   result.services[name]={...result.services[name],heapMiB:heap,heapProcessesBudgeted:copies,prismaPool:pool}
   for(const [key,value] of Object.entries(env)) {
    if(/(?:_LIMIT|_QUEUE|_MAX_CONCURRENT|_MAX_WAIT_MS|_TIMEOUT_MS|_RETRY_AFTER_SECONDS|_CONCURRENCY|_TIMEOUT|_MAX_RECORDS|_MAX_TRIALS|_MAX_FIELDS|_MAX_BYTES|_BYTE_BUDGET|_RETENTION_HOURS)$/.test(key)) {
     integer(value,key,key.endsWith('_QUEUE')?0:1,Number.MAX_SAFE_INTEGER)
     result.services[name][key]=Number(value)
    }
   }
  }
 }
 if(cpu>4.000001 || memory>3584*1048576)throw new Error('4C4G starting envelope exceeded; reserve at least 512MiB for the host')
 const redis=services.redis.command || [];const maxIndex=redis.indexOf('--maxmemory');const policyIndex=redis.indexOf('--maxmemory-policy')
 if(maxIndex<0 || size(redis[maxIndex+1])>size(services.redis.mem_limit)*.65 || redis[policyIndex+1]!=='noeviction')throw new Error('Redis persistence/queue headroom or policy invalid')
 const postgres=services.postgres.command || []
 const setting=name=>postgres.find(value=>String(value).startsWith(`${name}=`))?.split('=')[1]
 if(size(setting('shared_buffers'))>size(services.postgres.mem_limit)*.4)throw new Error('PostgreSQL shared buffers exceed starting envelope')
 if(integer(setting('max_connections'),'PostgreSQL max_connections',1,1000)<pools+10)throw new Error('PostgreSQL connections do not cover parent and child pools')
 result.totalCpu=cpu;result.totalMemoryMiB=memory/1048576;result.hostMemoryReserveMiB=4096-result.totalMemoryMiB;result.maximumConfiguredAppConnections=pools
 return result
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {
  const args=process.argv.slice(2);const fileIndex=args.indexOf('--compose-json')
  const input=fileIndex>=0 ? fs.readFileSync(args[fileIndex+1],'utf8') : execFileSync('docker',['compose',...(args.includes('--capacity')?['--profile','capacity-worker','-f','docker-compose.yml','-f','docker-compose.capacity.yml']:[]),'config','--format','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:2097152})
  console.log(JSON.stringify(inspectResourceContract(JSON.parse(input),{capacity:args.includes('--capacity')}),null,2))
 }catch(error){console.error(error instanceof Error ? error.message : 'Resource contract invalid');process.exitCode=1}
}
