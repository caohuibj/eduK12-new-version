import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_TRAINING_NAMED_HTTP==='1'?describe:describe.skip
suite('Training exact named original intent through authenticated HTTP',()=>{
 let db:any,server:Server|undefined,base='',manager:any,owner:any,other:any,old:any,source:any,empty:any,sign:any,body:any,issued:any,sources:any,oldTaskRows:any
 const requests:any[]=[]
 const prefix=(combinationId:string)=>'/api/questionnaire-products/standard-combinations/'+combinationId
 async function call(actor:any,path:string,input?:unknown,status=200,headers:Record<string,string>={}){
  const token=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:actor.accountDomain,tokenVersion:actor.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const response=await fetch(base+path,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',
   Cookie:'ptool_session='+token+'; ptool_csrf=training-named-http','X-CSRF-Token':'training-named-http',...headers},...(input===undefined?{}:{body:JSON.stringify(input)})})
  const value=await response.json() as any;requests.push({path,status:response.status});expect(response.status,value.message??path).toBe(status);return {data:value.data,headers:response.headers}
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit retained Training named test database required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_training_named_configuration_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated Training named test database required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==4||await db.materialGrant.count()!==4||await db.compositeAssessment.count()!==8||await db.course.count()!==1)throw Error('Read retained outcomes before retry; do not reset')
  const entry=await db.adminEntryGrant.findFirstOrThrow({where:{entry:'TRAINING',revokedAt:null}});manager=await db.user.findUniqueOrThrow({where:{id:entry.userId}})
  expect(await db.assessmentManagementEvent.count({where:{metadata:{path:['configurationName'],equals:'HTTP 基础教学报告'}}})).toBe(0)
  old=await db.materialGrant.findFirstOrThrow({where:{version:2,revokedAt:{not:null}}});other=await db.user.findUniqueOrThrow({where:{id:old.teacherId}})
  sources=await db.$queryRaw`SELECT id,combination_hash,snapshot,measurement_release,state FROM survey_standard_releases ORDER BY id`
  source=sources.find((r:any)=>r.id===old.resourceId);empty=sources.find((r:any)=>r.id!==old.resourceId)
  owner=await db.user.findFirstOrThrow({where:{id:{notIn:[manager.id,other.id]},role:'TEACHER'}})
  oldTaskRows=await db.compositeAssessment.findMany({orderBy:{id:'asc'}})
  body={requestId:randomUUID(),userId:other.id,combinationHash:source.combination_hash,configurationName:'HTTP 基础教学报告',expectedUseVersion:2,expectedUseId:old.id}
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default);app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_TRAINING_NAMED_HTTP_EVIDENCE??'/tmp/training-named-http.json',JSON.stringify({productionAccessed:false,
   scope:'Training existing Cookie/CSRF/origin routes, precise original predecessor and own request receipt. No source rewrite, setup replay, new MFA policy or participant replay.',requests,issuedId:issued?.id},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('rejects a substituted predecessor and unchanged route guard violations before issuing anything',async()=>{
  await call(manager,prefix(source.id)+'/use-grants',{...body,expectedUseId:randomUUID()},409)
  await call(manager,prefix(source.id)+'/use-grants',{...body,selectedBinding:{injected:true}},400)
  await call(owner,prefix(source.id)+'/use-grants',body,403)
  await call(manager,prefix(source.id)+'/use-grants',body,403,{'X-CSRF-Token':'wrong'})
  await call(manager,prefix(source.id)+'/use-requests/'+body.requestId,undefined,403,{Origin:'https://untrusted.invalid'})
  expect(await db.materialGrant.findUniqueOrThrow({where:{id:old.id}})).toEqual(old);expect(await db.assessmentManagementEvent.findUnique({where:{id:body.requestId}})).toBeNull()
 })
 it('issues and replays the exact original recipient, business name and previous use identity through the actual router',async()=>{
  issued=(await call(manager,prefix(source.id)+'/use-grants',body)).data
  expect(issued).toMatchObject({id:old.id,userId:other.id,version:3,currentVersion:3,revoked:false,replayed:false})
  expect((await call(manager,prefix(source.id)+'/use-grants',body)).data).toMatchObject({...issued,replayed:true,changed:false})
  const read=await call(manager,prefix(source.id)+'/use-requests/'+body.requestId)
  expect(read.headers.get('cache-control')).toBe('no-store')
  expect(read.data).toMatchObject({operation:{legacy:false,grant:{id:old.id,version:3,currentVersion:3,revoked:false},request:{...body,actorId:manager.id,combinationId:source.id,grantId:null,expectedGrantVersion:null}}})
  const grants=(await call(manager,prefix(source.id)+'/use-grants?userId='+other.id)).data
  expect(grants.list).toHaveLength(1);expect(grants.list[0]).toMatchObject({id:old.id,version:3,configurationName:body.configurationName})
  await call(manager,prefix(source.id)+'/use-grants',{...body,configurationName:'同编号的另一用途'},403)
 })
 it('reads only the original issuer request and reports older superseded revisions without changing tasks or sources',async()=>{
  if(!issued)throw Error('Prior HTTP write failed; inspect before retry')
  await call(other,prefix(source.id)+'/use-requests/'+body.requestId,undefined,403)
  expect((await call(manager,prefix(empty.id)+'/use-requests/'+body.requestId)).data).toEqual({operation:null})
  expect((await call(manager,prefix(source.id)+'/use-requests/'+randomUUID())).data).toEqual({operation:null})
  const events=await db.assessmentManagementEvent.findMany({where:{actorId:manager.id,resourceId:source.id,action:'STANDARD_COMBINATION_USE_GRANTED'}})
  const historical=events.find((r:any)=>r.metadata.userId===owner.id&&r.metadata.useVersion===3&&r.metadata.configurationName==='基础教学报告')
  expect(historical).toBeTruthy()
  expect((await call(manager,prefix(source.id)+'/use-requests/'+historical.id)).data).toMatchObject({operation:{legacy:false,grant:{version:3,currentVersion:5,revoked:true},request:{configurationName:'基础教学报告'}}})
  expect(await db.$queryRaw`SELECT id,combination_hash,snapshot,measurement_release,state FROM survey_standard_releases ORDER BY id`).toEqual(sources)
  expect(await db.compositeAssessment.findMany({orderBy:{id:'asc'}})).toEqual(oldTaskRows);expect(await db.materialGrant.count()).toBe(4)
 })
 it('exposes the frozen COURSE configuration as fixed and offers no report or reference substitutions for that unit',async()=>{
  const task=await db.compositeAssessment.findFirstOrThrow({where:{name:'Named COURSE actual source'}})
  const row=await call(owner,'/api/questionnaire-products/'+task.id+'/content-reference-choices')
  expect(row.data.units).toHaveLength(1);expect(row.data.units[0]).toMatchObject({fixedConfiguration:{name:'不反馈的独立用途'},choices:[],reports:[]})
 })
})
