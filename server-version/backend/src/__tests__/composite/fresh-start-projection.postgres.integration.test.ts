import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {startUserAttempt,projectFreshStartedAttempt,loadComposite} from '../../modules/composite/composite.service'
import {getWholeQuestionnaireDefinition} from '../../modules/composite/whole-questionnaire.service'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip

suite('fresh untimed whole START projection / PostgreSQL',()=>{
 let compositeId:string,courseId:string
 const students:string[]=[]
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  vi.stubEnv('ASSESSMENT_REPORT_ASYNC_ENABLED','true')
  vi.stubEnv('ASSESSMENT_WHOLE_SUBMIT_ENABLED','true')
  const suffix=randomUUID()
  const owner=await db.user.create({data:{username:'fresh-owner-'+suffix,passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})
  const course=await db.course.create({data:{title:'Fresh projection fixture',courseCode:suffix,creatorId:owner.id,status:'PUBLISHED',courseType:'TRAINING_COURSE'}})
  courseId=course.id
  const composite=await db.compositeAssessment.create({data:{code:suffix,name:'Nine-scale fixture',createdBy:owner.id,
   productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',status:'DRAFT',maxAttempts:3,questionnaireCourses:{create:{courseId}}}})
  compositeId=composite.id
  for(let i=0;i<9;i++){
   const definition=compileResearchScale('Synthetic scale '+i,{schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',
    responseOptions:[{optionKey:'yes',label:'Yes',score:1},{optionKey:'no',label:'No',score:0}],
    dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
    items:[{itemKey:'one',prompt:'One',required:true,reverse:false,dimensionKeys:['total']}]})
   const scale=await db.scale.create({data:{code:suffix+'-'+i,name:'Synthetic scale '+i,creatorId:owner.id,status:'PUBLISHED',
    instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'1',definition,definitionHash:hashScaleDefinition(definition)}})
   await db.compositeAssessmentItem.create({data:{compositeAssessmentId:compositeId,type:'SCALE',position:i,required:true,scaleId:scale.id}})
  }
  await db.compositeAssessment.update({where:{id:compositeId},data:{status:'PUBLISHED',publishedAt:new Date()}})
  for(let i=0;i<2;i++){
   const student=await db.user.create({data:{username:suffix+'-student-'+i,passwordHash:'synthetic',role:'STUDENT',accountDomain:'TRAINING'}})
   students.push(student.id)
   await db.courseStudent.create({data:{courseId,studentId:student.id,status:'ACTIVE'}})
  }
 },60000)
 afterAll(async()=>{vi.unstubAllEnvs();await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()})
 it('projects from fresh rows without post-gate reads, and Definition freezes all nine admissions',async()=>{
  const result=await startUserAttempt(students[0],compositeId)
  expect(result.attempt.executionMode).toBe('WHOLE_LOCAL')
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:result.attempt.id}})
  const composite=await loadComposite(compositeId,true)
  const children=await db.assessment.findMany({where:{compositeAttemptId:parent.id},include:{scale:true}})
  expect(children).toHaveLength(9)
  expect(children.every(child=>child.frozenAdmissionSnapshotHash===null)).toBe(true)
  const raw=vi.spyOn(db,'$queryRaw'),snapshots=vi.spyOn(db.assessmentUnitSnapshot,'findMany'),child=vi.spyOn(db.assessment,'findUnique')
  try{
   const projected=await projectFreshStartedAttempt(parent,composite,children,{userId:students[0]},null)
   expect(projected?.attempt.id).toBe(parent.id)
   expect(raw).not.toHaveBeenCalled();expect(snapshots).not.toHaveBeenCalled();expect(child).not.toHaveBeenCalled()
   expect(await projectFreshStartedAttempt(parent,{...composite,trainingTimingPolicy:{}},children,{userId:students[0]},null)).toBeNull()
   expect(await projectFreshStartedAttempt(parent,composite,children,{userId:'wrong-user'},null)).toBeNull()
  }finally{raw.mockRestore();snapshots.mockRestore();child.mockRestore()}
  const definition=await getWholeQuestionnaireDefinition(parent.id,{userId:students[0]})
  expect(definition.units).toHaveLength(9)
  expect(await db.assessment.count({where:{compositeAttemptId:parent.id,frozenAdmissionSnapshotHash:{not:null}}})).toBe(9)
  await db.courseStudent.update({where:{courseId_studentId:{courseId,studentId:students[0]}},data:{status:'PENDING'}})
  await expect(startUserAttempt(students[0],compositeId)).rejects.toMatchObject({statusCode:403})
 },60000)
 it('reuses the freshly-created authoritative parent for inline Whole Definition',async()=>{
  const parentRead=vi.spyOn(db.compositeAssessmentAttempt,'findUnique')
  try{
   const result=await startUserAttempt(students[1],compositeId,{wantsWholeDelivery:true})
   expect((result as any).wholeDefinition?.units).toHaveLength(9)
   expect(parentRead).not.toHaveBeenCalled()
   const previous=await db.assessment.findFirstOrThrow({where:{compositeAttempt:{userId:students[0],compositeAssessmentId:compositeId}}})
   const current=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:result.attempt.id,scaleId:previous.scaleId}})
   expect(current.runtimeSnapshotEncrypted).not.toBe(previous.runtimeSnapshotEncrypted)
  }finally{parentRead.mockRestore()}
 },60000)
})
