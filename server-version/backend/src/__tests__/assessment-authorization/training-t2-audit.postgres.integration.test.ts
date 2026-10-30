import {createServer,type Server} from 'node:http'
import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_T2_TRAINING==='1'?describe:describe.skip
suite('Training explicit draft binding changes keep original identities',()=>{
 let db:any,server:Server|undefined,base='',sign:any,owner:any,other:any,draft:any,oldItem:any,oldPointer:any,choice:any,nextItem:any,originals:any,grants:any,sources:any,completed=false
 const requests:any[]=[],observations:any[]=[]
 async function request(who:any,method:string,path:string,input:unknown){
  const jwt=sign({userId:who.id,username:who.username,role:who.role,accountDomain:'TRAINING',tokenVersion:who.tokenVersion,
   adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
  const response=await fetch(base+'/api/questionnaire-products/'+path,{method,headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',
   Cookie:'ptool_session='+jwt+'; ptool_csrf=t2-audit','X-CSRF-Token':'t2-audit'},body:JSON.stringify(input)})
  const value=await response.json() as any;requests.push({method,path,status:response.status});return {status:response.status,...value}
 }
 const events=()=>db.assessmentManagementEvent.findMany({where:{resourceId:draft.id,action:'TRAINING_DRAFT_SOURCE_BINDINGS_CHANGED'},orderBy:{createdAt:'asc'}})
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL;if(!url)throw Error('Explicit local T2 clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).hostname!=='127.0.0.1'||new URL(url).port!=='55439'||new URL(url).pathname!=='/precise_training_t2_audit_test_20261029')throw Error('Named local T2 clone required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==4||await db.materialGrant.count()!==4||await db.compositeAssessment.count()!==12||await db.assessmentManagementEvent.count({where:{action:'TRAINING_DRAFT_SOURCE_BINDINGS_CHANGED'}})!==0)throw Error('Read retained outcome; no reset/replay')
  draft=await db.compositeAssessment.findFirstOrThrow({where:{name:'Training replacement waiting original'},include:{items:true}})
  expect(draft).toMatchObject({status:'DRAFT',revision:2});oldItem=draft.items.find((i:any)=>i.standardCombinationSource);oldPointer=oldItem.standardCombinationSource.reference.selectedBinding
  expect(oldPointer.authorizationRevision).toBe(5)
  owner=await db.user.findUniqueOrThrow({where:{id:draft.createdBy}});other=await db.user.findFirstOrThrow({where:{role:'TEACHER',id:{not:owner.id}}})
  const choices=await(await import('../../modules/measurement-content/standard-combination-use')).listTrainingStandardCombinationChoices(owner.id)
  choice=choices.find((c:any)=>c.combination.releaseId!==oldItem.standardCombinationSource.reference.combination.releaseId)
  expect(choice.selectedBinding.authorizationRevision).toBe(7)
  grants=await db.materialGrant.findMany({orderBy:{id:'asc'}});sources=await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`
  originals=await db.compositeAssessment.findMany({where:{id:{not:draft.id}},orderBy:{id:'asc'},include:{items:true}})
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/questionnaire-products',(await import('../../modules/questionnaire-product/routes')).default);app.use((await import('../../middleware/errorHandler')).errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_T2_EVIDENCE??'/tmp/training-t2-audit.json',JSON.stringify({productionAccessed:false,requests,observations},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('records removal of stale revision five and explicit addition of current revision seven; ordinary edits do not manufacture replacements',async()=>{
  const root=draft.id
  expect((await request(other,'POST',root+'/items/'+oldItem.id+'/remove',{revision:2})).status).toBe(403)
  expect(await events()).toHaveLength(0)
  const removed=await request(owner,'POST',root+'/items/'+oldItem.id+'/remove',{revision:2});expect(removed.status).toBe(200)
  let list=await events();expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({actorId:owner.id,metadata:{ownerId:owner.id,fromRevision:2,toRevision:3,added:[],removed:[{slotId:oldItem.id,selectedBinding:oldPointer,
   referenceHash:oldItem.standardCombinationSource.referenceHash}]}})
  const added=await request(owner,'POST',root+'/items',{revision:3,item:{type:'SCALE',scaleId:choice.scaleId,standardCombination:{...choice.combination,selectedBinding:choice.selectedBinding}}})
  expect(added.status,added.message).toBe(200);draft=await db.compositeAssessment.findUniqueOrThrow({where:{id:root},include:{items:true,formSections:true}})
  nextItem=draft.items.find((i:any)=>i.standardCombinationSource);list=await events();expect(list).toHaveLength(2)
  expect(list[1].metadata).toMatchObject({fromRevision:3,toRevision:4,removed:[],added:[{slotId:nextItem.id,selectedBinding:choice.selectedBinding,referenceHash:nextItem.standardCombinationSource.referenceHash}]})
  const edited=await request(owner,'PUT',root,{revision:4,name:draft.name,description:'Only ordinary purpose text changed',courseIds:[],publicEnabled:false,expiresAt:null})
  expect(edited.status,edited.message).toBe(200)
  const units=[...draft.formSections.map((s:any)=>({id:s.id,type:'FORM_SECTION'})),{id:nextItem.id,type:'SCALE'}]
  expect((await request(owner,'POST',root+'/reorder',{revision:5,units})).status).toBe(200)
  expect(await events()).toEqual(list)
  expect((await request(owner,'POST',root+'/items/'+nextItem.id+'/remove',{revision:4})).status).toBe(409)
  expect(await events()).toEqual(list);completed=true
  observations.push({oldOriginalRevision:5,newSelectedRevision:7,crossOwnerDenied:true,staleEditDenied:true,ordinaryEditAndReorderAuditUnchanged:true,originalRemovalAndAddition: list.map((e:any)=>e.metadata)})
 },20000)
 it('commits one source-change event for concurrent deletion and preserves every other task and source grant',async()=>{
  if(!completed)throw Error('Prior stage incomplete; do not mutate dependent fixture')
  const results=await Promise.all([request(owner,'POST',draft.id+'/items/'+nextItem.id+'/remove',{revision:6}),request(owner,'POST',draft.id+'/items/'+nextItem.id+'/remove',{revision:6})])
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect(await events()).toHaveLength(3)
  const added=await request(owner,'POST',draft.id+'/items',{revision:7,item:{type:'SCALE',scaleId:choice.scaleId,standardCombination:{...choice.combination,selectedBinding:choice.selectedBinding}}})
  expect(added.status,added.message).toBe(200);expect(await events()).toHaveLength(4)
  expect(await db.materialGrant.findMany({orderBy:{id:'asc'}})).toEqual(grants)
  expect(await db.$queryRaw`SELECT * FROM survey_standard_releases ORDER BY id`).toEqual(sources)
  expect(await db.compositeAssessment.findMany({where:{id:{not:draft.id}},orderBy:{id:'asc'},include:{items:true}})).toEqual(originals)
  expect((await db.compositeAssessment.findUniqueOrThrow({where:{id:draft.id}})).revision).toBe(8)
  observations.push({concurrentOneSuccessOneConflict:true,events:4,physicalGrantRows:4,otherElevenTasksUnchanged:true,originalT1AndSourcesUnchanged:true})
 },20000)
})
