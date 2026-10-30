import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_SURVEY_REPLACEMENT_HTTP==='1'?describe:describe.skip
suite('Survey explicit configuration replacement through existing protected router',()=>{
 let db:any,server:Server|undefined,base='',manager:any,sign:any,old:any,oldRow:any,source:any,body:any,issued:any,legacyExact:any
 const password='Synthetic-Survey-HTTP-20261029!',requests:any[]=[]
 const prefix=()=>'/api/platform/survey/researchers/'+old.userId
 async function call(path:string,input?:unknown,status=200){
  const token=sign({userId:manager.id,username:manager.username,role:manager.role,accountDomain:'TRAINING',tokenVersion:manager.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const response=await fetch(base+path,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',
   Cookie:'ptool_session='+token+'; ptool_csrf=survey-replacement-http','X-CSRF-Token':'survey-replacement-http'},...(input===undefined?{}:{body:JSON.stringify(input)})})
  const value=await response.json() as any;requests.push({path,status:response.status});expect(response.status,value.message??path).toBe(status);return {data:value.data,cache:response.headers.get('cache-control')}
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit retained Survey replacement fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).hostname!=='127.0.0.1'||new URL(url).port!=='55439'||new URL(url).pathname!=='/precise_survey_replacement_test_20261029')throw Error('Dedicated local Survey replacement fixture required')
  db=(await import('../../config/database')).prisma
  const [count]=await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`
  if(await db.user.count()!==11||count.n!==8||await db.surveyPublication.count()!==5)throw Error('Inspect retained outcomes before HTTP retry')
  manager=await db.user.findFirstOrThrow({where:{username:{startsWith:'synthetic-survey-manager-'}}})
  expect(await (await import('../../utils/password')).comparePassword(password,manager.passwordHash)).toBe(true)
  const rows=await db.$queryRaw`SELECT id,user_id AS "userId",snapshot FROM survey_tool_grants WHERE status='ACTIVE' AND snapshot#>>'{provenance,configurationName}'='显式替换教学报告'`
  expect(rows).toHaveLength(1);old=rows[0];oldRow=(await db.$queryRaw`SELECT * FROM survey_tool_grants WHERE id=${old.id}`)[0]
  ;[source]=await db.$queryRaw`SELECT id,combination_hash FROM survey_standard_releases WHERE snapshot#>'{parts,REPORT,payload}'='null'::jsonb AND state='ONLINE'`
  ;[legacyExact]=await db.$queryRaw`SELECT id,snapshot FROM survey_tool_grants WHERE snapshot#>>'{provenance,configurationName}'='固定完整报告'`
  body={currentPassword:password,source:{kind:'SCALE',sourceId:'survey-standard:'+source.id,sourceVersion:source.combination_hash},
   exact:{requestId:randomUUID(),configurationName:'HTTP 明确替换配置',replaces:{grantId:old.id,expectedVersion:1,reason:'HTTP 管理员明确切换为无反馈版本'}}}
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/platform/survey',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard,(await import('../../modules/survey/platform.routes')).surveyPlatformRouter)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_SURVEY_REPLACEMENT_HTTP_EVIDENCE??'/tmp/survey-standard-replacement-http.json',JSON.stringify({productionAccessed:false,
   scope:'Existing Cookie/CSRF/origin/current-password/proof router; synthetic JWT proof, no real MFA or participant/browser replay',requests,issuedId:issued?.id},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('requires the existing password guard then atomically replaces and reads the full original intent including older non-replacement requests',async()=>{
  await call(prefix()+'/tool-grants',{...body,currentPassword:'intentionally-wrong-synthetic-password'},403)
  issued=(await call(prefix()+'/tool-grants',body)).data
  expect(issued).toMatchObject({id:body.exact.requestId,issuerId:manager.id,supersedes:{selectedBinding:old.snapshot.provenance.selectedBinding?{
   authorizationId:old.id,authorizationRevision:1,bindingHash:old.snapshot.provenance.selectedBinding.bindingHash,configurationHash:old.snapshot.provenance.selectedBinding.binding.configurationHash}:null,reason:body.exact.replaces.reason}})
  const operation=await call(prefix()+'/tool-grant-requests/'+body.exact.requestId)
  expect(operation.cache).toBe('no-store');expect(operation.data.operation.request).toEqual({...body.exact,userId:old.userId,source:body.source})
  const [prior]=await db.$queryRaw`SELECT * FROM survey_tool_grants WHERE id=${old.id}`;expect(prior.status).toBe('REVOKED');expect({...prior,status:oldRow.status,revoked_at:oldRow.revoked_at}).toEqual(oldRow)
  const history=(await call(prefix()+'/tool-grant-requests/'+legacyExact.id)).data
  expect(history.operation.request).toMatchObject({requestId:legacyExact.id,configurationName:'固定完整报告'});expect(history.operation.request.replaces).toBeUndefined()
 })
 it('does not change full intent during replay and rejects stale, invalid-revision or injected replacement before adding grants',async()=>{
  if(!issued)throw Error('Prior HTTP replacement failed; read outcome before retry')
  expect((await call(prefix()+'/tool-grants',body)).data).toMatchObject({id:issued.id,replayed:true})
  await call(prefix()+'/tool-grants',{...body,exact:{...body.exact,replaces:{...body.exact.replaces,reason:'Different original intent'}}},409)
  await call(prefix()+'/tool-grants',{...body,exact:{...body.exact,requestId:randomUUID()}},409)
  await call(prefix()+'/tool-grants',{...body,exact:{...body.exact,requestId:randomUUID(),replaces:{...body.exact.replaces,expectedVersion:2}}},400)
  await call(prefix()+'/tool-grants',{...body,exact:{...body.exact,requestId:randomUUID(),replaces:{...body.exact.replaces,selectedBinding:{injected:true}}}},400)
  expect((await db.$queryRaw`SELECT count(*)::int AS n FROM survey_tool_grants`)[0].n).toBe(9);expect(await db.surveyPublication.count()).toBe(5)
 })
})
