const path=require('node:path'),{createRequire}=require('node:module'),fs=require('node:fs')
const root=process.env.DAILY_PROBE_SOURCE,requireBackend=createRequire(path.join(root,'server-version/backend/package.json'))
requireBackend('tsx/cjs/api').register()
const {PrismaClient}=requireBackend('@prisma/client'),{blank,query}=require('./daily-probe-common.cjs')
const url=new URL(process.env.DATABASE_URL)
if(process.env.NODE_ENV!=='test'||url.hostname!=='127.0.0.1'||url.port!=='55434'||!/^\/eduk12_admin_permissions_ci355_probe_/.test(url.pathname))throw Error('Dedicated proxy/test database required')
const client=new PrismaClient({datasources:{db:{url:url.toString()}},log:[{level:'query',emit:'event'},{level:'error',emit:'stdout'}]})
globalThis.prisma=client
let phase=null,sampler=null
client.$on('query',event=>{if(phase)query(phase.sql,event)})
process.on('message',message=>{
 if(message.kind==='begin'){
  if(phase)throw Error('Overlapping probe phase')
  phase={sql:blank(),started:process.hrtime.bigint(),cpu:process.cpuUsage(),peakRss:process.memoryUsage().rss}
  sampler=setInterval(()=>{if(phase)phase.peakRss=Math.max(phase.peakRss,process.memoryUsage().rss)},5)
  process.send({id:message.id,ok:true})
 }else if(message.kind==='end'){
  const current=phase;if(!current)throw Error('Missing probe phase')
  clearInterval(sampler);const cpu=process.cpuUsage(current.cpu),memory=process.memoryUsage()
  phase=null
  process.send({id:message.id,result:{sql:current.sql,serverWallMs:Number(process.hrtime.bigint()-current.started)/1e6,cpuUserUs:cpu.user,cpuSystemUs:cpu.system,peakRssBytes:Math.max(current.peakRss,memory.rss),heapUsedBytes:memory.heapUsed,processLifetimeMaxRssKiB:process.resourceUsage().maxRSS}})
 }
})
require(path.join(root,'server-version/backend/src/index.ts'))
