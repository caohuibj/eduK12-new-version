/** Explicit read-verified continuation of the retained GENERAL fixture. New
 * approval uses an existing registered no-report axis, never fabricated content. */
import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_ADMISSION==='1'?describe:describe.skip
suite('standard combination education scope through real approval and migration',()=>{
 let db:any,server:Server|undefined,base='',sign:any,system:any,teacher:any,original:any,selected:any
 const key='academic_self_concept_biology_zh_cn',version='1.0.0',events:any[]=[]
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
 async function request(actor:any,path:string,body?:unknown,status=200){
  const jwt=sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,...proof})
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:'ptool_session='+jwt+'; ptool_csrf=education-admission-csrf',
   'X-CSRF-Token':'education-admission-csrf',Origin:'http://localhost:5173','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const payload=await response.json() as any;events.push({path,status:response.status})
  expect(response.status,payload.message??path).toBe(status);return payload.data
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_GENERAL_TEST_DATABASE_URL
  if(!url)throw Error('Explicit retained fixture URL required')
  requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_general_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated retained fixture required')
  db=(await import('../../config/database')).prisma
  const users=await db.user.findMany();if(users.length!==4)throw Error('Readback requires exactly the four retained synthetic fixture actors')
  const actor=(name:string)=>{const found=users.filter((u:any)=>u.username.startsWith('precise-general-'+name+'-'));if(found.length!==1)throw Error('Unique retained actor required');return found[0]}
  system=actor('system');teacher=actor('teacher')
  const rows=await db.$queryRaw`SELECT id,combination_hash,snapshot FROM survey_standard_releases WHERE tool_key=${key}`
  if(rows.length!==1||system.platformRole!=='SYSTEM_ADMIN'||teacher.role!=='TEACHER')throw Error('Inspect previous approval outcome before continuing')
  original=rows[0]
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json())
  app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/platform',(await import('../../modules/survey/originGuard')).platformSurveyOriginGuard)
  app.use('/api/platform/survey-standard',(await import('../../modules/survey/standard-triplet.routes')).surveyStandardTripletRouter)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },30000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_ADMISSION_EVIDENCE??'/tmp/standard-education-admission.json',JSON.stringify({productionAccessed:false,
   existingCombinationId:original?.id,approved:selected,events,scope:'entry approval only; no education use grant or browser qualification'},null,2)+'\n')
  if(server)await new Promise<void>(r=>server!.close(()=>r()))
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('does not extend old scope through approval retry or allow generic native publication in education',async()=>{
  const available=await request(system,`/api/platform/survey-standard/candidate/${key}/${version}`)
  await request(system,'/api/platform/survey-standard/approve',{...available.selection,requestId:original.id,expectedCombinationHash:original.combination_hash,
   reason:'Unapproved scope extension',allowedProducts:['TRAINING','SCHOOL']},409)
  const {planStandardScalePublication}=await import('../../modules/scale/onboarding/publish')
  await expect(planStandardScalePublication(db,{instrumentKey:key,instrumentVersion:version,actorUserId:system.id,visibility:'HIDDEN',allowedProducts:['SCHOOL' as any]})).rejects.toThrow()
  expect(await db.$queryRaw`SELECT product FROM survey_tool_policies WHERE resource_key=${'standard-release:'+original.id} ORDER BY product`).toEqual([{product:'TRAINING'}])
 })
 it('limits the database education policy domain to exact standard-release identities',async()=>{
  await expect(db.$executeRaw`INSERT INTO survey_tool_policies(product,resource_key,fingerprint,decision,paused,reason,reviewed_by)
   VALUES('SCHOOL','release:not-a-standard-combination',${'a'.repeat(64)},'APPROVED',false,'Rejected isolated scope',${system.id})`).rejects.toThrow('tool_policy_product')
 })
 it('approves the existing no-report standard combination for four explicit entries without granting anyone use',async()=>{
  const candidate=await request(system,`/api/platform/survey-standard/candidate/${key}/${version}`)
  const report=candidate.available.find((p:any)=>p.axis==='REPORT'&&p.payload===null);expect(report).toBeTruthy()
  const selection={...candidate.selection,REPORT:report.hash},preview=await request(system,'/api/platform/survey-standard/preview',selection)
  const input={...selection,requestId:randomUUID(),expectedCombinationHash:preview.combinationHash,allowedProducts:['TRAINING','SURVEY','SCHOOL','TEACHER'],reason:'Isolated source-scoped four-entry approval'}
  await request(teacher,'/api/platform/survey-standard/approve',input,403)
  const before=await db.contentCapabilityGrant.count()
  selected=await request(system,'/api/platform/survey-standard/approve',input)
  expect(selected.state,selected.blockers.join(';')).toBe('ONLINE')
  expect(await db.$queryRaw`SELECT product FROM survey_tool_policies WHERE resource_key=${'standard-release:'+selected.id} AND fingerprint=${selected.combinationHash} ORDER BY product`)
   .toEqual(['SCHOOL','SURVEY','TEACHER','TRAINING'].map(product=>({product})))
  expect(await db.$queryRaw`SELECT id FROM survey_standard_trials WHERE release_id=${selected.id}`).toHaveLength(3)
  expect(await db.contentCapabilityGrant.count()).toBe(before)
  expect(await request(system,'/api/platform/survey-standard/approve',input)).toMatchObject({id:selected.id,combinationHash:selected.combinationHash,state:'ONLINE'})
  await request(system,'/api/platform/survey-standard/approve',{...input,requestId:randomUUID(),allowedProducts:['SCHOOL']},409)
 },60000)
})
