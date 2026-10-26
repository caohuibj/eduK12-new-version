import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'

const suite=process.env.PR356_CHILD_PARENT_SHAPE_ISOLATED==='1'?describe:describe.skip
suite('PR356 real scalar parent rows in eager Scale child consumers',()=>{
 let db:any,service:typeof import('../../modules/composite/composite.service'),student:string,schoolStudent:string,normal:any,education:any,prefix:string
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!)
  if(process.env.NODE_ENV!=='test'||!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='55439'||!/^\/pr356_child_test_[a-f0-9]{10}$/.test(url.pathname))throw new Error('Dedicated synthetic child-shape DB required')
  db=(await import('../../config/database')).prisma;service=await import('../../modules/composite/composite.service');prefix=url.pathname.slice(1)
  const actors=['teacher','student','school-teacher','school-student'].map(name=>prefix+'-'+name)
  if(await db.user.count()===0)await db.user.createMany({data:actors.map((id,i)=>({id,username:id,passwordHash:'SYNTHETIC NONLOGIN',role:i%2===0?'TEACHER':'STUDENT',teacherApproved:i%2===0,accountDomain:i<2?'TRAINING':'SCHOOL'}))})
   const {compileResearchScale}=await import('../../modules/survey/builder.compiler'),{hashScaleDefinition}=await import('../../modules/scale/scale-definition')
   const definition=compileResearchScale('Synthetic existing descriptive source',{schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'low',label:'Low',score:0},{optionKey:'high',label:'High',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'item',prompt:'Synthetic item',required:true,reverse:false,dimensionKeys:['total']}]})
   for(const [kind,owner]of [['QUESTIONNAIRE',actors[0]],['ORGANIZATION_RESOURCE',actors[2]]]as const){
    if(await db.compositeAssessment.findUnique({where:{code:prefix+'-'+kind}}))continue
    const course=kind==='QUESTIONNAIRE'?await db.course.create({data:{title:'Synthetic direct child consumer',courseCode:prefix+'-'+kind,creatorId:owner,status:'PUBLISHED',courseType:'TRAINING_COURSE',students:{create:{studentId:actors[1],status:'ACTIVE'}}}}):null
    // Existing legacy descriptive publication fixture; this is not a new
    // STANDARD approval, education resource distribution or ONLINE claim.
    const scale=await db.scale.create({data:{code:prefix+'-'+kind,name:'Synthetic existing source',creatorId:owner,status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'1',definition,definitionHash:hashScaleDefinition(definition)}})
    await db.compositeAssessment.create({data:{code:prefix+'-'+kind,name:'Synthetic existing delivery',createdBy:owner,productKind:kind,status:'DRAFT',maxAttempts:2,
     ...(kind==='QUESTIONNAIRE'?{questionnaireType:'COURSE',questionnaireCourses:{create:{courseId:course!.id}}}:{}),items:{create:{type:'SCALE',position:0,required:true,scaleId:scale.id}}}})
    await db.compositeAssessment.update({where:{code:prefix+'-'+kind},data:{status:'PUBLISHED',publishedAt:new Date('2026-10-01T00:00:00Z')}})
   }
  expect(await db.user.count()).toBe(4);expect(await db.scale.count()).toBe(2)
  // A red run may reuse the retained fixture only while both admission
  // transactions rolled back. Never delete/reset a successful attempt.
  expect(await db.assessment.count()).toBe(0);expect(await db.compositeAssessmentAttempt.count()).toBe(0)
  student=actors[1];schoolStudent=actors[3]
  normal=await db.compositeAssessment.findUniqueOrThrow({where:{code:prefix+'-QUESTIONNAIRE'},include:{items:true}})
  education=await db.compositeAssessment.findUniqueOrThrow({where:{code:prefix+'-ORGANIZATION_RESOURCE'},include:{items:true}})
 },120000)
 afterAll(async()=>{if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 async function assertStoredChild(parentId:string,item:any,who:string){
  const scalar=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:parentId}});expect(scalar).not.toHaveProperty('compositeAssessment')
  const children=await db.assessment.findMany({where:{compositeAttemptId:parentId}});expect(children).toHaveLength(1)
  const child=children[0];expect(child).toMatchObject({compositeItemId:item.id,scaleId:item.scaleId,userId:who,attemptEpoch:scalar.attemptEpoch,status:'IN_PROGRESS',runtimeGeneration:'UNIFIED_V1'})
  const runtime=await(await import('../../modules/assessment-runtime/runtime-snapshot')).loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted,db)
  expect(runtime.compiledRuntime.compiledRuntimeHash).toBe(child.compiledRuntimeHash)
  const slots=await(await import('../../modules/assessment-runtime/slot-set')).loadFrozenActiveSlotSet(scalar.frozenActiveSlotSetEncrypted,db)
  expect(slots.slots).toHaveLength(1);expect(slots.slots[0].sourceBinding.compositeItemId).toBe(item.id)
 }
 it('creates the ordinary course Scale child from the actual Prisma scalar-only parent insert',async()=>{
  const started=await service.startUserAttempt(student,normal.id)
  await assertStoredChild(started.attempt.id,normal.items[0],student)
 },60000)
 it('creates the education Scale child through the actual internal relational consumer without a parent relation include',async()=>{
  const episode=await db.assessmentEpisode.create({data:{subjectUserId:schoolStudent,initiatedByUserId:schoolStudent,initiationMode:'STUDENT_SELF'}})
  const parent=await db.$transaction((tx:any)=>service.startRelationalCompositeAttemptInTransaction(tx,{compositeAssessmentId:education.id,respondentUserId:schoolStudent,attemptIdentity:{subjectUserId:schoolStudent,respondentUserId:schoolStudent,respondentType:'SELF',episodeId:episode.id,assignmentRef:randomUUID(),consentId:null}}))
  expect(parent).not.toHaveProperty('compositeAssessment')
  await assertStoredChild(parent.id,education.items[0],schoolStudent)
 },60000)
})
