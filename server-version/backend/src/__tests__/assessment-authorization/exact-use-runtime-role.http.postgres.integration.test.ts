import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EXACT_RUNTIME_ROLE==='1'?describe:describe.skip
suite('Exact use and frozen report under the actual restricted application role',()=>{
 let db:any,server:Server|undefined,base='',sign:any,manager:any,teacher:any,use:any,release:any,task:any,attempt:any,body:any,tasks:any,sources:any,report:any,ready=false
 const requests:any[]=[],observations:any[]=[]
 async function call(who:any,method:string,path:string,input?:unknown){
  const token=sign({userId:who.id,username:who.username,role:who.role,accountDomain:'TRAINING',tokenVersion:who.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',
   Cookie:'ptool_session='+token+'; ptool_csrf=runtime-exact','X-CSRF-Token':'runtime-exact'},...(input===undefined?{}:{body:JSON.stringify(input)})})
  const result=await response.json() as any;requests.push({method,path,status:response.status});expect(response.status,result.message??path).toBe(200);return result.data
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL;if(!url)throw Error('Explicit named restricted-runtime clone required');requireIsolatedReleaseDatabase(url)
  const parsed=new URL(url)
  if(process.env.NODE_ENV!=='test'||parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!=='/precise_runtime_role_test_20261029'||parsed.username!=='precise_task1_runtime')throw Error('Actual restricted local runtime principal required')
  db=(await import('../../config/database')).prisma
  const [identity]=await db.$queryRaw`SELECT current_user,session_user`
  expect(identity).toEqual({current_user:'precise_task1_runtime',session_user:'precise_task1_runtime'})
  if(await db.user.count()!==6||await db.materialGrant.count()!==4||await db.compositeAssessment.count()!==13)throw Error('Read retained outcome before retry; no reset')
  task=await db.compositeAssessment.findFirstOrThrow({where:{name:'Synthetic exact COURSE participant journey'}})
  attempt=await db.compositeAssessmentAttempt.findFirstOrThrow({where:{compositeAssessmentId:task.id,status:'COMPLETED'}})
  const item=await db.compositeAssessmentItem.findFirstOrThrow({where:{compositeAssessmentId:task.id,type:'SCALE'}})
  use=await db.materialGrant.findUniqueOrThrow({where:{id:item.standardCombinationSource.reference.selectedBinding.authorizationId}})
  expect(use).toMatchObject({version:8,revokedAt:expect.any(Date)})
  expect(item.standardCombinationSource.reference.selectedBinding.authorizationRevision).toBe(7)
  ;[release]=await db.$queryRaw`SELECT * FROM survey_standard_releases WHERE id=${use.resourceId}`
  manager=await db.user.findUniqueOrThrow({where:{id:use.grantedBy}});teacher=await db.user.findUniqueOrThrow({where:{id:task.createdBy}})
  tasks=await db.compositeAssessment.findMany({orderBy:{id:'asc'},include:{items:true}});sources=await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`
  body={requestId:randomUUID(),userId:teacher.id,combinationHash:release.combination_hash,configurationName:'合成受限角色后续使用配置',expectedUseId:use.id,expectedUseVersion:8}
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default)
  app.use('/api/composite-assessments',(await import('../../modules/composite/composite.routes')).default);app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_RUNTIME_EVIDENCE??'/tmp/exact-use-runtime-role.json',JSON.stringify({productionAccessed:false,ownerIdentityUsedForApplication:false,requests,observations},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('reads original T1/report evidence while the actual runtime cannot alter the migration ledger',async()=>{
  const before=await db.$queryRaw`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name`
  expect(before).toHaveLength(255)
  await expect(db.$executeRaw`UPDATE _prisma_migrations SET checksum=checksum WHERE migration_name=${before[0].migration_name}`).rejects.toMatchObject({meta:{code:'42501'}})
  expect(await db.$queryRaw`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name`).toEqual(before)
  report=await call(teacher,'GET','/composite-assessments/'+task.id+'/attempts/'+attempt.id+'/report');expect(report.contentReports).toHaveLength(1)
  ready=true;observations.push({actualRuntimeRole:'precise_task1_runtime',sameCurrentAndSessionIdentity:true,migrationLedgerRows:255,migrationWriteDenied42501:true,
   historicalSelectedRevision:7,physicalRevokedRevision:8,historicalFullReportReadable:true})
 },20000)
 it('issues the next exact revision atomically through ordinary protected HTTP and retains the old published report',async()=>{
  if(!ready)throw Error('Restricted-role read/denial incomplete; dependent issue forbidden')
  const path='/questionnaire-products/standard-combinations/'+release.id+'/use-grants'
  const issued=await call(manager,'POST',path,body)
  expect(issued).toMatchObject({id:use.id,version:9,currentVersion:9,revoked:false})
  expect(await call(manager,'POST',path,body)).toMatchObject({id:use.id,version:9,replayed:true})
  const own=await call(manager,'GET','/questionnaire-products/standard-combinations/'+release.id+'/use-requests/'+body.requestId)
  expect(own.operation.request).toMatchObject(body);expect(own.operation.grant).toMatchObject({id:use.id,version:9,currentVersion:9})
  expect(await db.assessmentManagementEvent.count({where:{id:body.requestId,action:'STANDARD_COMBINATION_USE_GRANTED'}})).toBe(1)
  expect(await call(teacher,'GET','/composite-assessments/'+task.id+'/attempts/'+attempt.id+'/report')).toEqual(report)
  expect(await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}})).toEqual(attempt)
  expect(await db.compositeAssessment.findMany({orderBy:{id:'asc'},include:{items:true}})).toEqual(tasks)
  expect(await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`).toEqual(sources)
  expect(await db.materialGrant.count()).toBe(4);expect(await db.user.count()).toBe(6)
  observations.push({newExactUseRevision:9,oneImmutableRequestReceipt:true,replayedOriginalRequest:true,allThirteenTasksAndOldAttemptUnchanged:true,oldFullReportStillSame:true})
 },20000)
})
