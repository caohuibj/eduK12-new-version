/** Explicit continuation of the inspected four-user GENERAL fixture. Keeps its
 * completed legacy attempt and both real approved combinations unchanged. */
import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_TRAINING_BINDING==='1'?describe:describe.skip
suite('existing Training authorization audit to selectedBinding and anonymous frozen FINAL',()=>{
 let db:any,server:Server|undefined,base='',sign:any,manager:any,teacher:any,recipient:any,source:any,scale:any,pointer:any,use:any,sealed:any,originalAttempt:any
 const events:any[]=[],proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()},requestId=randomUUID()
 async function request(actor:any,path:string,body?:unknown,status=200,recovery?:string){
  const jwt=actor?sign({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'TRAINING',tokenVersion:actor.tokenVersion,...proof}):null
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(jwt?{Cookie:'ptool_session='+jwt+'; ptool_csrf=selected-binding-csrf'}:{}),
   'X-CSRF-Token':'selected-binding-csrf',...(recovery?{'X-Recovery-Token':recovery}:{}),Origin:'http://localhost:5173','Content-Type':'application/json'},
   ...(body===undefined?{}:{body:JSON.stringify(body)})})
  const payload=await response.json() as any
  events.push({path:path.replace(/\/public\/composite-assessments\/[^/]+\/start$/,'/public/composite-assessments/:token/start'),status:response.status})
  expect(response.status,payload.message??path).toBe(status);return payload.data
 }
 beforeAll(async()=>{
  const selected=process.env.PRECISE_GENERAL_TEST_DATABASE_URL
  if(!selected)throw Error('Explicit retained fixture URL required');requireIsolatedReleaseDatabase(selected)
  if(process.env.NODE_ENV!=='test'||new URL(selected).pathname!=='/precise_general_test_20261029'||new URL(selected).port!=='55439'
   ||process.env.REDIS_URL!=='redis://127.0.0.1:56389/0')throw Error('Dedicated retained local fixture required')
  db=(await import('../../config/database')).prisma
  const users=await db.user.findMany();if(users.length!==4)throw Error('Inspect retained outcome; expected four synthetic actors')
  const actor=(name:string)=>{const found=users.filter((u:any)=>u.username.startsWith('precise-general-'+name+'-'));if(found.length!==1)throw Error('Unique retained actor required');return found[0]}
  manager=actor('manager');teacher=actor('teacher');recipient=actor('outsider')
  if(recipient.role!=='TEACHER'||await db.materialGrant.count({where:{teacherId:recipient.id}}))throw Error('Recipient must have no previous grant; inspect before retry')
  const rows=await db.$queryRaw`SELECT id,combination_hash,snapshot FROM survey_standard_releases WHERE tool_key='academic_self_concept_biology_zh_cn'`
  if(rows.length!==2)throw Error('The retained original and four-entry no-report approval are required')
  const original=rows.find((r:any)=>r.snapshot.parts.REPORT.version!=='none-v1');if(!original)throw Error('Original full report required')
  pointer={releaseId:original.id,combinationHash:original.combination_hash}
  originalAttempt=await db.compositeAssessmentAttempt.findFirstOrThrow({where:{status:'COMPLETED'},include:{compositeAssessment:true}})
  expect(originalAttempt.compositeAssessment.createdBy).toBe(teacher.id)
  scale=await db.scale.findUniqueOrThrow({where:{code:'academic_self_concept_biology_zh_cn'}})
  source=(await import('../../modules/scale/onboarding/instrument-registry')).getScaleInstrumentSource(scale.code,scale.instrumentVersion)!
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json())
  app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default)
  app.use('/api/composite-assessments',(await import('../../modules/composite/composite.routes')).default)
  app.use('/api/public/composite-assessments',(await import('../../modules/composite/composite.public.routes')).default)
  app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },30000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_TRAINING_BINDING_EVIDENCE??'/tmp/training-selected-binding-http.json',JSON.stringify({productionAccessed:false,browserQualification:false,
   combination:pointer,useGrantId:use?.id,bindingHash:sealed?.bindingHash,legacyAttemptId:originalAttempt?.id,events},null,2)+'\n')
  if(server)await new Promise<void>(r=>server!.close(()=>r()))
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('seals actual T1 and binds full idempotency intent including optional concurrency expectations',async()=>{
  const endpoint=`/api/questionnaire-products/standard-combinations/${pointer.releaseId}/use-grants`,input={requestId,userId:recipient.id,combinationHash:pointer.combinationHash}
  use=await request(manager,endpoint,input)
  const audit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:requestId}})
  sealed=audit.metadata.selectedBinding
  expect(sealed.binding.authorization).toMatchObject({id:use.id,revision:1,issuerId:manager.id,recipientId:recipient.id})
  expect(sealed.binding.configuration).toMatchObject({kind:'STANDARD_COMBINATION',combinationId:pointer.releaseId,combinationHash:pointer.combinationHash})
  expect(audit.metadata.requestIntentHash).toMatch(/^[a-f0-9]{64}$/)
  expect(await request(manager,endpoint,input)).toMatchObject({id:use.id,version:1,replayed:true})
  await request(manager,endpoint,{...input,expectedUseVersion:1},403)
  await request(manager,endpoint,{...input,requestId:randomUUID(),selectedBinding:sealed},400)
  expect(await db.materialGrant.count({where:{teacherId:recipient.id,resourceType:'STANDARD_COMBINATION'}})).toBe(1)
 })
 it('copies the T1 pointer at draft, preserves it at publish/START/FINAL, and keeps old legacy reports readable',async()=>{
  const expiresAt=new Date(Date.now()+3600000).toISOString()
  let row=await request(recipient,'/api/questionnaire-products',{requestId:randomUUID(),name:'Typed selectedBinding anonymous',questionnaireType:'GENERAL',publicEnabled:true,expiresAt})
  row=await request(recipient,`/api/questionnaire-products/${row.id}/items`,{revision:row.revision,item:{type:'FORM',formType:'single_choice',formLabel:'年级',contextKey:'gradeLevel',required:true,formOptions:[{value:'7',label:'七年级'}]}})
  row=await request(recipient,`/api/questionnaire-products/${row.id}/items`,{revision:row.revision,item:{type:'SCALE',scaleId:scale.id,required:true,standardCombination:pointer}})
  const saved=await db.compositeAssessmentItem.findFirstOrThrow({where:{compositeAssessmentId:row.id,type:'SCALE'}})
  const expected={bindingHash:sealed.bindingHash,configurationHash:sealed.binding.configurationHash,authorizationId:use.id,authorizationRevision:1}
  expect(saved.standardCombinationSource.reference.selectedBinding).toEqual(expected)
  row=await request(recipient,`/api/questionnaire-products/${row.id}/publish`,{revision:row.revision})
  expect((await db.compositeAssessmentItem.findUniqueOrThrow({where:{id:saved.id}})).standardCombinationSource).toEqual(saved.standardCombinationSource)
  const link=await request(recipient,`/api/composite-assessments/${row.id}/public-tokens`,{expiresAt,maxUses:3})
  const started=await request(null,`/api/public/composite-assessments/${link.token}/start`,{}),path=`/api/public/composite-assessments/attempts/${started.attempt.id}`,recovery=started.recoveryToken
  let state=await request(null,path,undefined,200,recovery),section=state.currentItem
  await request(null,`${path}/form-sections/${section.id}/submit`,{submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:section.definitionHash,
   contextSnapshotHash:state.contextSnapshotHash,answers:section.answers.map((a:any)=>({formItemId:a.formItemId??a.id,value:'7'}))},200,recovery)
  state=await request(null,path,undefined,200,recovery)
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:started.attempt.id}})
  expect(parent.trainingContentBinding.units.find((u:any)=>u.itemId===saved.id).source.standardCombination.reference.selectedBinding).toEqual(expected)
  await request(manager,`/api/questionnaire-products/standard-combination-use-grants/${use.id}/revoke`,{expectedVersion:1,reason:'Typed revision ordinary revoke after admission'})
  await request(null,`/api/public/composite-assessments/${link.token}/start`,{},403)
  await request(null,`${path}/items/${saved.id}/scale/submit?response=receipt`,{submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:state.currentItem.definitionHash,
   contextSnapshotHash:state.contextSnapshotHash,answers:source.executable.definition.items.map((i:any)=>({itemCode:i.itemCode,responseValue:'3'}))},200,recovery)
  expect((await request(null,path,undefined,200,recovery)).status).toBe('COMPLETED')
  const final=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:parent.id}})
  expect(final.trainingContentBinding).toEqual(parent.trainingContentBinding)
  const historical=await request(teacher,`/api/composite-assessments/${originalAttempt.compositeAssessmentId}/attempts/${originalAttempt.id}/report`)
  expect(historical.contentReports).toHaveLength(1)
  expect(originalAttempt.trainingContentBinding.units[0].source.standardCombination.reference.selectedBinding).toBeUndefined()
 },90000)
})
