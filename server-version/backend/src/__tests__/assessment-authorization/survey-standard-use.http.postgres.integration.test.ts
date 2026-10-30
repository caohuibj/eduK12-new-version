import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_SURVEY_STANDARD_HTTP==='1'?describe:describe.skip
suite('Survey exact standard manager actual HTTP contract',()=>{
 let db:any,server:Server|undefined,base='',manager:any,system:any,sign:any,original:any,other:any,body:any,issued:any
 const password='Synthetic-Survey-HTTP-20261029!',requests:any[]=[]
 const prefix=()=>'/api/platform/survey/researchers/'+original.userId
 async function call(path:string,input?:unknown,status=200,opts:{actor?:any;proof?:boolean;origin?:string}={}){
  const actor=opts.actor??manager,token=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,
   ...(opts.proof===false?{}:{adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})})
  const res=await fetch(base+path,{method:input===undefined?'GET':'POST',headers:{Origin:opts.origin??'http://localhost:5173','Content-Type':'application/json',
   Cookie:'ptool_session='+token+'; ptool_csrf=survey-exact-http','X-CSRF-Token':'survey-exact-http'},...(input===undefined?{}:{body:JSON.stringify(input)})})
  const value=await res.json() as any;requests.push({path,status:res.status});expect(res.status,value.message??path).toBe(status)
  return {data:value.data,cache:res.headers.get('cache-control')}
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit retained Survey fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_survey_standard_use_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated Survey fixture required')
  db=(await import('../../config/database')).prisma
  const [counts]=await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`
  if(await db.user.count()!==11||counts.n!==4||await db.surveyPublication.count()!==3)throw Error('Inspect retained revision outcomes before HTTP continuation')
  manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-survey-manager-'}}})
  const resume=process.env.PRECISE_SURVEY_STANDARD_HTTP_RESUME==='1'
  const passwords=await import('../../utils/password')
  if(resume)expect(await passwords.comparePassword(password,manager.passwordHash)).toBe(true)
  else expect(manager.passwordHash).toBe('!synthetic-no-login')
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  if(!resume)manager=await db.user.update({where:{id:manager.id},data:{passwordHash:await passwords.hashPassword(password)}})
  ;[original]=await db.$queryRaw`SELECT id,user_id AS "userId",snapshot FROM survey_tool_grants WHERE snapshot#>>'{provenance,configurationName}'='固定完整报告'`
  other=await db.user.findFirstOrThrow({where:{accountDomain:'SURVEY',id:{not:original.userId}}})
  body={currentPassword:password,source:original.snapshot.ref,exact:{requestId:randomUUID(),configurationName:'HTTP 固定报告配置'}}
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/platform/survey',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard,(await import('../../modules/survey/platform.routes')).surveyPlatformRouter)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_SURVEY_STANDARD_HTTP_EVIDENCE??'/tmp/survey-standard-http.json',JSON.stringify({productionAccessed:false,
   scope:'Actual Cookie/CSRF/origin/current-password/recent-proof router; JWT proof is fixture, not real MFA ceremony; no participant replay',requests,issuedId:issued?.id},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('lists only precise entry-approved choices as available and returns authenticated issuer plus small report identity',async()=>{
  const {data}=await call('/api/platform/survey/source-catalog?kind=SCALE&page=1')
  expect(data.actorId).toBe(manager.id)
  const row=data.list.find((r:any)=>r.ref.sourceId===body.source.sourceId)
  expect(row).toMatchObject({available:true,configuration:{instrumentVersion:'1.0.0',report:expect.any(String),axes:{CONTENT:expect.any(String),PARAMETERS:expect.any(String),REPORT:expect.any(String)}}})
  expect(row.configuration.compiledDefinition).toBeUndefined()
  expect(data.list.some((r:any)=>r.available===false&&r.ref.sourceId.startsWith('survey-standard:'))).toBe(true)
  await call('/api/platform/survey/source-catalog?kind=SCALE&page=1',undefined,403,{actor:system})
 })
 it('retains origin, recent verification and real password checks before issuing the exact named configuration',async()=>{
  // Original origin403 already passed before the fixture's wrong401 assertion.
  if(process.env.PRECISE_SURVEY_STANDARD_HTTP_RESUME!=='1')await call(prefix()+'/tool-grants',body,403,{origin:'https://untrusted.invalid'})
  await call(prefix()+'/tool-grants',body,401,{proof:false})
  await call(prefix()+'/tool-grants',{...body,currentPassword:'wrong-synthetic-password'},403)
  issued=(await call(prefix()+'/tool-grants',body)).data
  expect(issued).toMatchObject({id:body.exact.requestId,recipientId:original.userId,configurationName:body.exact.configurationName,
   selectedBinding:{authorizationId:body.exact.requestId,authorizationRevision:1}})
 },30000)
 it('reads full original intent in its receiver scope, returns explicit absence, and rejects idempotency/field substitution',async()=>{
  if(!issued)throw Error('Prior issue failed; dependent read forbidden')
  const read=await call(prefix()+'/tool-grant-requests/'+issued.id)
  expect(read.cache).toBe('no-store');expect(read.data.operation.request).toEqual({...body.exact,userId:original.userId,source:body.source})
  expect((await call('/api/platform/survey/researchers/'+other.id+'/tool-grant-requests/'+issued.id)).data).toEqual({operation:null})
  expect((await call(prefix()+'/tool-grant-requests/'+randomUUID())).data).toEqual({operation:null})
  await call(prefix()+'/tool-grants',{...body,exact:{...body.exact,configurationName:'different'}},409)
  await call(prefix()+'/tool-grants',{...body,exact:{...body.exact,selectedBinding:{injected:true}}},400)
 })
 it('uses the normal revoke endpoint and reads/replays the same request as revoked rather than granting again',async()=>{
  if(!issued)throw Error('Prior issue failed; dependent revoke forbidden')
  await call('/api/platform/survey/tool-grants/'+issued.id+'/revoke',{currentPassword:password})
  expect((await call(prefix()+'/tool-grant-requests/'+issued.id)).data.operation.grant.status).toBe('REVOKED')
  expect((await call(prefix()+'/tool-grants',body)).data).toMatchObject({id:issued.id,status:'REVOKED',replayed:true})
  expect((await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`)[0].n).toBe(5)
 })
})
