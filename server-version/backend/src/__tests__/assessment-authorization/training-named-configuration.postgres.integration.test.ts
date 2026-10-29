import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_TRAINING_NAMED==='1'?describe:describe.skip
suite('Training business configuration names and expected draft selection',()=>{
 let db:any,manager:any,teacher:any,other:any,full:any,empty:any,service:any,products:any,actor:any,first:any,second:any,fullInput:any,fullChoice:any,emptyChoice:any,published:any,waiting:any,coursePublished:any
 const observations:any[]=[],sources:any[]=[]
 const issue=(row:any,userId:string,name:string,expectedUseVersion?:number)=>({requestId:randomUUID(),userId,combinationHash:row.combination_hash,configurationName:name,...(expectedUseVersion===undefined?{}:{expectedUseVersion})})
 async function draft(type:'GENERAL'|'COURSE',choice:any,name:string,courseId?:string){
  let row=await products.create(actor,{requestId:randomUUID(),name,questionnaireType:type,publicEnabled:type==='GENERAL',
   ...(type==='GENERAL'?{expiresAt:new Date(Date.now()+3600000).toISOString()}:{}),...(courseId?{courseIds:[courseId]}:{})})
  row=await products.addItem(actor,row.id,{revision:row.revision,item:{type:'FORM',formType:'single_choice',formLabel:'年级',contextKey:'gradeLevel',required:true,formOptions:[{value:'7',label:'七年级'}]}})
  row=await products.addItem(actor,row.id,{revision:row.revision,item:{type:'SCALE',scaleId:choice.scaleId,required:true,standardCombination:{...choice.combination,selectedBinding:choice.selectedBinding}}})
  return row
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit Training named clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_training_named_configuration_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated Training named clone required')
  db=(await import('../../config/database')).prisma
  const resume=process.env.PRECISE_TRAINING_NAMED_RESUME==='1'
  if(await db.user.count()!==4||await db.materialGrant.count()!==(resume?3:2)||await db.materialGrant.count({where:{version:2,revokedAt:{not:null}}})!==(resume?1:2)||await db.compositeAssessment.count()!==3)throw Error('Inspect retained original outcomes before retry')
  const role=await db.adminEntryGrant.findFirstOrThrow({where:{entry:'TRAINING',revokedAt:null}});manager=await db.user.findUniqueOrThrow({where:{id:role.userId}})
  const rows=await db.$queryRaw`SELECT id,combination_hash,snapshot,measurement_release,state FROM survey_standard_releases ORDER BY id`;sources.push(...rows)
  full=rows.find((row:any)=>row.snapshot.parts.REPORT.payload!==null);empty=rows.find((row:any)=>row.snapshot.parts.REPORT.payload===null)
  if(!full||!empty||rows.length!==2)throw Error('Two known existing C/P-compatible report sources required')
  expect(full.snapshot.parts.CONTENT.hash).toBe(empty.snapshot.parts.CONTENT.hash);expect(full.snapshot.parts.PARAMETERS.hash).toBe(empty.snapshot.parts.PARAMETERS.hash)
  if(resume){
   const recorded=await db.assessmentManagementEvent.findFirstOrThrow({where:{action:'STANDARD_COMBINATION_USE_GRANTED',resourceId:full.id,metadata:{path:['configurationName'],equals:'基础教学报告'}}})
   first=await db.materialGrant.findUniqueOrThrow({where:{id:recorded.metadata.grantId}});expect(first.version).toBe(3);expect(first.revokedAt).toBeNull()
   teacher=await db.user.findUniqueOrThrow({where:{id:first.teacherId}})
   fullInput={requestId:recorded.id,userId:teacher.id,combinationHash:full.combination_hash,configurationName:'基础教学报告',expectedUseVersion:2}
  }else{
   const original=await db.materialGrant.findFirstOrThrow({where:{resourceType:'STANDARD_COMBINATION'}})
   teacher=await db.user.findUniqueOrThrow({where:{id:original.teacherId}})
  }
  other=await db.user.findFirstOrThrow({where:{role:'TEACHER',id:{not:teacher.id}}})
  expect(await db.materialGrant.count({where:{teacherId:teacher.id,resourceId:empty.id}})).toBe(0)
  service=await import('../../modules/measurement-content/standard-combination-use');products=await import('../../modules/questionnaire-product/service');actor={userId:teacher.id,role:'TEACHER'}
 },30000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_TRAINING_NAMED_EVIDENCE??'/tmp/training-named.json',JSON.stringify({productionAccessed:false,
   scope:'Real named issue/revision, bounded source catalog, GENERAL and COURSE add/publish and original expected-selection rejection; no participant replay',observations},null,2)+'\n')
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('normally names two different R for two receivers and records the complete original request without changing C/P',async()=>{
  fullInput=issue(full,teacher.id,'基础教学报告',2)
  first=await service.grantTrainingStandardCombinationUse(manager.id,full.id,fullInput)
  expect(first.version).toBe(3)
  second=await service.grantTrainingStandardCombinationUse(manager.id,empty.id,issue(empty,other.id,'无反馈科研配置'))
  const a=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:fullInput.requestId}})
  expect(a.metadata).toMatchObject({configurationName:fullInput.configurationName,selfGrant:false,requestIntent:{actorId:manager.id,combinationId:full.id,userId:teacher.id,expectedUseVersion:2,configurationName:fullInput.configurationName}})
  const mine=await service.listTrainingStandardCombinationChoices(teacher.id),theirs=await service.listTrainingStandardCombinationChoices(other.id)
  expect(mine).toHaveLength(1);expect(theirs).toHaveLength(1);fullChoice=mine[0]
  expect(fullChoice).toMatchObject({authorizationMode:'PRECISE',configurationName:fullInput.configurationName,available:true,selectedBinding:{authorizationId:first.id,authorizationRevision:3}})
  expect(theirs[0]).toMatchObject({authorizationMode:'PRECISE',configurationName:'无反馈科研配置',available:true})
  expect(await service.grantTrainingStandardCombinationUse(manager.id,full.id,fullInput)).toMatchObject({id:first.id,replayed:true})
  await expect(service.grantTrainingStandardCombinationUse(manager.id,full.id,{...fullInput,configurationName:'changed intent'})).rejects.toThrow('请求编号已用于其他授权')
  await expect(service.grantTrainingStandardCombinationUse(manager.id,full.id,issue(full,teacher.id,'不能原位改名',3))).rejects.toMatchObject({statusCode:409})
  observations.push({fullUseId:first.id,fullUseRevision:3,emptyOtherUseId:second.id,twoRecipients:true,fullName:fullInput.configurationName})
 })
 it('blocks both same-name R options, then uses an explicit revoke/reissue to make both business choices unambiguous',async()=>{
  const duplicate=await service.grantTrainingStandardCombinationUse(manager.id,empty.id,issue(empty,teacher.id,fullInput.configurationName))
  const ambiguous=await service.listTrainingStandardCombinationChoices(teacher.id)
  expect(ambiguous).toHaveLength(2);expect(ambiguous.every((row:any)=>row.available===false&&row.unavailableReason.includes('同名'))).toBe(true)
  await service.revokeTrainingStandardCombinationUse(manager.id,duplicate.id,{expectedVersion:1,reason:'Explicit business-name revision'})
  await service.grantTrainingStandardCombinationUse(manager.id,empty.id,issue(empty,teacher.id,'不反馈的独立用途',2))
  const current=await service.listTrainingStandardCombinationChoices(teacher.id)
  expect(current).toHaveLength(2);expect(current.every((row:any)=>row.available)).toBe(true)
  fullChoice=current.find((row:any)=>row.combination.releaseId===full.id);emptyChoice=current.find((row:any)=>row.combination.releaseId===empty.id)
  expect(emptyChoice.selectedBinding.authorizationRevision).toBe(3)
  observations.push({sameNameBothUnavailable:true,explicitNameRevision:3,distinctNames:current.map((row:any)=>row.configurationName)})
 })
 it('adds and publishes actual GENERAL and COURSE sources with fixed business labels and rejects arbitrary selection hashes',async()=>{
  if(!fullChoice||!emptyChoice)throw Error('Prior choices failed; dependent drafts forbidden')
  const blank=await products.create(actor,{requestId:randomUUID(),name:'Reject forged selected configuration',questionnaireType:'GENERAL',publicEnabled:false})
  await expect(products.addItem(actor,blank.id,{revision:blank.revision,item:{type:'SCALE',scaleId:fullChoice.scaleId,standardCombination:{...fullChoice.combination,
   selectedBinding:{...fullChoice.selectedBinding,bindingHash:'f'.repeat(64)}}}})).rejects.toMatchObject({code:'CONTENT_TRAINING_STANDARD_SELECTED_BINDING_MISMATCH'})
  expect(await db.compositeAssessmentItem.count({where:{compositeAssessmentId:blank.id}})).toBe(0)
  const general=await draft('GENERAL',fullChoice,'Named GENERAL actual source')
  waiting=await draft('GENERAL',fullChoice,'Named waiting source, never silently rebound')
  await products.publish(actor,general.id,{revision:general.revision})
  published=await db.compositeAssessment.findUniqueOrThrow({where:{id:general.id},include:{items:true}})
  const bound=published.items.find((row:any)=>row.type==='SCALE').standardCombinationSource.reference
  expect(bound).toMatchObject({configurationName:'基础教学报告',selectedBinding:fullChoice.selectedBinding})
  const course=await db.course.create({data:{title:'Synthetic named Training course',courseCode:'NAMED-'+randomUUID(),creatorId:teacher.id,courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
  const courseDraft=await draft('COURSE',emptyChoice,'Named COURSE actual source',course.id)
  await products.publish(actor,courseDraft.id,{revision:courseDraft.revision})
  coursePublished=await db.compositeAssessment.findUniqueOrThrow({where:{id:courseDraft.id},include:{items:true}})
  expect(coursePublished.items.find((row:any)=>row.type==='SCALE').standardCombinationSource.reference).toMatchObject({configurationName:'不反馈的独立用途',selectedBinding:emptyChoice.selectedBinding})
  const detail=await products.detail(actor,general.id)
  expect(detail.items.find((row:any)=>row.type==='SCALE').standardCombinationSummary).toMatchObject({authorizationMode:'PRECISE',configurationName:'基础教学报告'})
  observations.push({generalId:general.id,courseId:courseDraft.id,waitingId:waiting.id,generalAndCoursePublished:true,forgedSelectionNoItem:true})
 },30000)
 it('requires the original selected revision after a named reissue and leaves old drafts, frozen labels and old request results intact',async()=>{
  if(!published||!waiting||!coursePublished)throw Error('Prior publications failed; dependent reissue forbidden')
  await service.revokeTrainingStandardCombinationUse(manager.id,first.id,{expectedVersion:3,reason:'New explicit named revision'})
  await service.grantTrainingStandardCombinationUse(manager.id,full.id,issue(full,teacher.id,'后续基础报告用途',4))
  await expect(products.publish(actor,waiting.id,{revision:waiting.revision})).rejects.toMatchObject({statusCode:403})
  const blank=await products.create(actor,{requestId:randomUUID(),name:'Reject stale catalog selection',questionnaireType:'GENERAL',publicEnabled:false})
  await expect(products.addItem(actor,blank.id,{revision:blank.revision,item:{type:'SCALE',scaleId:fullChoice.scaleId,
   standardCombination:{...fullChoice.combination,selectedBinding:fullChoice.selectedBinding}}})).rejects.toMatchObject({statusCode:403})
  expect(await db.compositeAssessment.findUniqueOrThrow({where:{id:published.id},include:{items:true}})).toEqual(published)
  expect(await db.compositeAssessment.findUniqueOrThrow({where:{id:coursePublished.id},include:{items:true}})).toEqual(coursePublished)
  const history=await (await import('../../modules/measurement-content/standard-combination-management')).trainingStandardManagementRequest(manager.id,full.id,fullInput.requestId)
  expect(history.operation).toMatchObject({legacy:false,grant:{id:first.id,version:3,currentVersion:5,revoked:true},request:{requestId:fullInput.requestId,configurationName:'基础教学报告',expectedUseVersion:2}})
  expect(await db.$queryRaw`SELECT id,combination_hash,snapshot,measurement_release,state FROM survey_standard_releases ORDER BY id`).toEqual(sources)
  observations.push({oldSelectionRejected:true,oldDraftAndPublishedLabelsUnchanged:true,historicalRequestRevision:3,currentUseRevision:5})
 },30000)
})
