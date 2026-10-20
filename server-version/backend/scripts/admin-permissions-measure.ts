// Small development measurement, not a throughput or production SLA benchmark.
import {createServer} from 'node:http'
import {readFileSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {performance} from 'node:perf_hooks'
import express from 'express'
import {prisma} from '../src/config/database'
import {loadCurrentPrincipal} from '../src/modules/organization/principal'
import {adminPermissionsRouter} from '../src/modules/admin-permissions/routes'
import {generateToken} from '../src/utils/jwt'
import {closeQueues} from '../src/config/queue'

void(async()=>{
  if(process.env.ADMIN_PERMISSIONS_ISOLATED_TEST!=='1'||process.env.PERF_SQL_EVENT_COUNT!=='1'||process.env.PERF_ISOLATED_TEST_MODE!=='1'
    ||!new URL(process.env.DATABASE_URL!).pathname.startsWith('/eduk12_admin_permissions_'))throw new Error('Isolated count-only measurement required')
  const fixture=JSON.parse(readFileSync('/workspace/admin-permissions-private/browser-fixture.json','utf8'))
  const principal=(await loadCurrentPrincipal(fixture.system.id))!,app=express()
  app.use('/api/admin/permissions',adminPermissionsRouter)
  const server=createServer(app);await new Promise<void>(done=>server.listen(0,'127.0.0.1',done))
  const base='http://127.0.0.1:'+(server.address() as {port:number}).port
  const token=generateToken({userId:principal.userId,username:principal.username,role:principal.role,accountDomain:principal.accountDomain,tokenVersion:principal.tokenVersion,
    adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:'synthetic-measurement'})
  let queries=0;(prisma as any).$on('query',()=>queries++)
  const cpu=process.cpuUsage(),rssBefore=process.memoryUsage().rss
  const summarize=(values:number[])=>{const s=[...values].sort((a,b)=>a-b);return {samples:s.length,p50Ms:s[Math.floor(s.length*.5)],p95Ms:s[Math.min(s.length-1,Math.ceil(s.length*.95)-1)]}}
  try{
    await loadCurrentPrincipal(principal.userId);queries=0
    const times:number[]=[]
    for(let n=0;n<30;n++){const t=performance.now();await loadCurrentPrincipal(principal.userId);times.push(performance.now()-t)}
    const principalQueries=queries
    async function list(keyword:string){const timings:number[]=[];let rows=0;queries=0
      for(let n=0;n<10;n++){
        const t=performance.now(),response=await fetch(base+'/api/admin/permissions/accounts?keyword='+encodeURIComponent(keyword),{headers:{Origin:'http://localhost:5174',Cookie:'ptool_session='+token}})
        const body=await response.json() as any;if(response.status!==200)throw new Error('Measurement request failed')
        rows=body.data.accounts.length;timings.push(performance.now()-t)
      }return {...summarize(timings),rows,queriesPerRequest:queries/10}
    }
    const fullPage=await list(''),smallerPage=await list(fixture.system.username.split('-system')[0])
    const used=process.cpuUsage(cpu),inputPaths=['src/modules/organization/principal.ts','src/middleware/auth.ts','src/modules/admin-permissions/routes.ts','src/modules/admin-permissions/proof.ts','scripts/runtime-table-policy.json','package-lock.json']
    const inputBlobs=Object.fromEntries(inputPaths.map(p=>[p,execFileSync('git',['hash-object',p],{encoding:'utf8'}).trim()]))
    const report={result:'PASS',scope:'development single-process loopback; no concurrent load; no production SLA',principal:{...summarize(times),queriesPerRequest:principalQueries/30},fullPage,smallerPage,
      cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,rssBeforeBytes:rssBefore,rssAfterBytes:process.memoryUsage().rss,inputBlobs}
    if(report.principal.queriesPerRequest!==1||fullPage.queriesPerRequest!==3||smallerPage.queriesPerRequest!==3)throw new Error('Unexpected query growth')
    writeFileSync('/workspace/admin-permissions-private/measurement-report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report))
  }finally{await new Promise<void>(done=>server.close(()=>done()))}
})().catch(()=>{console.error('Isolated measurement failed');process.exitCode=1}).finally(async()=>{await closeQueues(true);await prisma.$disconnect()})
