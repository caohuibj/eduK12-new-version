import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
const httpContinuation=process.env.PR356_STATUS_HTTP_CONTINUE==='1'
const suite=process.env.PR356_STATUS_ISOLATED==='1'?describe:describe.skip
suite('bounded STANDARD onboarding SQL and current SYSTEM HTTP gate',()=>{
 let db:any,server:Server,base:string,system:any,issuer:any,token:any,status:any,sources:any[]
 beforeAll(async()=>{
  const u=new URL(process.env.DATABASE_URL!)
  if(process.env.NODE_ENV!=='test'||!['localhost','127.0.0.1'].includes(u.hostname)||u.port!=='55439'||!/^\/pr356_status_test_[a-f0-9]{10}$/.test(u.pathname))throw new Error('Dedicated cloned synthetic status DB required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==5||await db.scale.count()!==(httpContinuation?122:1))throw new Error('Retained synthetic fixture required')
  system=await db.user.findFirstOrThrow({where:{username:{startsWith:'dot356-system-'}}});issuer=await db.user.findFirstOrThrow({where:{username:{startsWith:'dot356-issuer-'}}})
  status=(await import('../../modules/scale/onboarding/status')).listStandardOnboardingStatus
  sources=(await import('../../modules/scale/onboarding/instrument-registry')).listScaleInstrumentSources()
  token=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json())
  app.use('/api/platform',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard)
  app.use('/api/platform/survey-standard',(await import('../../modules/survey/standard-triplet.routes')).surveyStandardTripletRouter)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 async function call(user:any,query='',version=user.tokenVersion,origin='http://localhost:5174'){
  const jwt=token({userId:user.id,username:user.username,role:user.role,accountDomain:user.accountDomain,tokenVersion:version,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const response=await fetch(base+'/api/platform/survey-standard/onboarding-status'+query,{headers:{Cookie:'ptool_session='+jwt,Origin:origin}})
  return {status:response.status,body:await response.json() as any}
 }
 it.skipIf(httpContinuation)('reads only a page with one validated deployment batch; never duplicates installed registered identities',async()=>{
  const queries:any[]=[],proxy=new Proxy(db,{get(target,key){if(key==='$queryRaw')return (...args:any[])=>{queries.push(args[0]);return target.$queryRaw(...args)};return Reflect.get(target,key)}})
  const page=await status(proxy,{limit:7})
  expect(page.list).toHaveLength(7);expect(page.hasMore).toBe(true);expect(page.nextCursor).toBeTruthy()
  expect(queries).toHaveLength(4)
  expect(queries.filter(q=>q.sql?.includes('FROM scale_deployment_policies'))).toHaveLength(1)
  const installed=await db.scale.findFirstOrThrow()
  const exact=await status(db,{query:installed.code,limit:50})
  expect(exact.list.filter((r:any)=>r.instrumentKey===installed.code&&r.instrumentVersion===installed.instrumentVersion)).toHaveLength(1)
  expect(exact.list.find((r:any)=>r.scaleId===installed.id).states.deployed).toBe(true)
  const candidate=sources.find(s=>!s.executable),pending=await status(db,{query:candidate.identity.instrumentKey})
  expect(pending.list).toEqual(expect.arrayContaining([expect.objectContaining({scaleId:null,instrumentKey:candidate.identity.instrumentKey,stage:'仅目录候选'})]))
 })
 it.skipIf(httpContinuation)('paginates 120 synthetic historical identities once with bounded queries and literal wildcard search',async()=>{
  await db.scale.createMany({data:Array.from({length:120},(_,i)=>({code:'zz_pr356_status_'+String(i).padStart(3,'0'),name:'Synthetic status '+i,instrumentClass:'STANDARD',instrumentVersion:'0.5.0',status:'DRAFT',visibility:'HIDDEN',creatorId:system.id}))})
  await db.scale.create({data:{code:'zz_literal_%_v',name:'Synthetic literal',instrumentClass:'STANDARD',instrumentVersion:'0.5.0',status:'DRAFT',creatorId:system.id}})
  let cursor:string|undefined;const seen=new Set<string>()
  do{
   let queries=0
   const proxy=new Proxy(db,{get(target,key){if(key==='$queryRaw')return (...args:any[])=>{queries++;return target.$queryRaw(...args)};return Reflect.get(target,key)}})
   const page=await status(proxy,{limit:7,query:'zz_pr356_status_',...(cursor?{cursor}:{})})
   expect(page.list.length).toBeLessThanOrEqual(7);expect(queries).toBeLessThanOrEqual(4)
   for(const row of page.list){expect(seen.has(row.instrumentKey)).toBe(false);seen.add(row.instrumentKey);expect(row.blockers).toContain('EXECUTABLE_SOURCE_MISSING')}
   cursor=page.nextCursor??undefined
  }while(cursor)
  expect(seen.size).toBe(120)
  const literal=await status(db,{query:'%_'});expect(literal.list.map((r:any)=>r.instrumentKey)).toEqual(['zz_literal_%_v'])
 },30000)
 it('preserves HTTP auth/origin boundaries and rejects unbounded or malformed pagination',async()=>{
  const before=await db.scale.count()
  const response=await call(system,'?limit=3');expect(response.status,response.body.message).toBe(200);expect(response.body.data.list).toHaveLength(3)
  for(const query of ['?limit=51','?limit=0','?cursor=e30'])expect((await call(system,query)).status).toBe(400)
  expect((await call(issuer)).status).toBe(403)
  expect((await call(system,'',99)).status).toBe(401)
  expect((await call(system,'',system.tokenVersion,'http://training.localhost:5173')).status).toBe(403)
  expect(await db.scale.count()).toBe(before)
 })
})
