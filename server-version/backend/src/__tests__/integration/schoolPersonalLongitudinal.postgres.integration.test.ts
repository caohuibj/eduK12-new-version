import {randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupPrivateScaleExecutionFixture} from './educationPrivateScaleExecutionFixture'
import {completeEducationLibraryScaleExecution} from './educationLibraryReportFixture'
import {schoolTrackingOptions,createNextSchoolTrackingActivity} from '../../modules/campus/personal-tracking'
import {readSchoolPersonalChanges,readTeacherPersonalChanges} from '../../modules/reporting/teacher-personal-changes.service'
import {readCampusStudentFeedback} from '../../modules/campus/student-feedback'
import {readCampusActivity,changeCampusActivityStatus} from '../../modules/campus/activity.service'
import {previewAssessmentRun,publishAssessmentRun} from '../../modules/assessment-run/publish'
import type {AuthenticatedPrincipal} from '../../types'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
const file='/tmp/school-personal-longitudinal-state.json'
type State={organizationId:string;courseId:string;runId:string;executionId:string;studentId:string;actor:AuthenticatedPrincipal;requestId:string;next?:{courseId:string;runId:string;ordinal:number};t2ExecutionId?:string}
let db:PrismaClient
suite('School explicitly configured new SELF longitudinal source',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('publishes native T1/T2, saves real answers, reads both reports and rejects wrong or currently denied identity',async()=>{
  let state:State
  if(process.env.SCHOOL_PERSONAL_CONTINUE==='true')state=JSON.parse(readFileSync(file,'utf8'))
  else{
   const f=await setupPrivateScaleExecutionFixture(db,'SCHOOL','SELF',1,async(_c,_id,d)=>{d.report.audienceContract!.longitudinalMetricKeys=['total']},true)
   state={organizationId:f.organizationId,courseId:f.workflow.id,runId:f.runId,executionId:f.executionId,studentId:f.participantUserId,actor:f.manager,requestId:randomUUID()};writeFileSync(file,JSON.stringify(state))
  }
  const [first]=await db.$queryRaw<Array<{status:string}>>`SELECT status FROM assessment_run_executions WHERE id=${state.executionId}`
  if(first.status!=='COMPLETED')await completeEducationLibraryScaleExecution({db,actorUserId:state.studentId,executionId:state.executionId,answers:[{itemCode:'q',responseValue:'a'}]})
  expect((await readCampusStudentFeedback(state.studentId,state.executionId)).state).toBe('READY')
  expect((await readSchoolPersonalChanges({actorUserId:state.studentId,executionId:state.executionId})).status).toBe('WAITING')
  const scope={actor:state.actor,organizationId:state.organizationId,courseId:state.courseId,runId:state.runId}
  state.next??=await createNextSchoolTrackingActivity({...scope,requestId:state.requestId});writeFileSync(file,JSON.stringify(state))
  expect(await createNextSchoolTrackingActivity({...scope,requestId:state.requestId})).toEqual(state.next)
  const nextScope={...scope,courseId:state.next.courseId,runId:state.next.runId}
  const [run]=await db.$queryRaw<Array<{version:number;status:string}>>`SELECT version,status FROM assessment_runs WHERE id=${state.next.runId}`
  if(run.status==='DRAFT'){
   const activity=await readCampusActivity(nextScope)
   if(activity.status==='DRAFT'){const submitted=await changeCampusActivityStatus({...nextScope,action:'SUBMIT',expectedVersion:activity.version});await changeCampusActivityStatus({...nextScope,action:'OPEN',expectedVersion:submitted.version})}
   await previewAssessmentRun({organizationId:state.organizationId,runId:state.next.runId,actorUserId:state.actor.userId,expectedVersion:run.version})
   await publishAssessmentRun({organizationId:state.organizationId,runId:state.next.runId,actorUserId:state.actor.userId,expectedVersion:run.version})
  }
  const [execution]=await db.$queryRaw<Array<{id:string;status:string}>>`SELECT e.id,e.status FROM assessment_run_executions e JOIN assessment_run_actor_snapshots actor ON actor.id=e.respondent_actor_snapshot_id WHERE e.run_id=${state.next.runId} AND actor.user_id=${state.studentId}`
  state.t2ExecutionId=execution.id;writeFileSync(file,JSON.stringify(state))
  if(execution.status!=='COMPLETED')await completeEducationLibraryScaleExecution({db,actorUserId:state.studentId,executionId:execution.id,answers:[{itemCode:'q',responseValue:'b'}]})
  expect((await readCampusStudentFeedback(state.studentId,execution.id)).state).toBe('READY')
  const changes=await readSchoolPersonalChanges({actorUserId:state.studentId,executionId:execution.id})
  expect(changes.status).toBe('AVAILABLE');if(changes.status!=='AVAILABLE')throw new Error('Expected two real School results')
  expect(changes.metrics[0].points.map(p=>p.value)).toEqual([1,2]);expect(changes.metrics[0].points.every(p=>p.observedAt)).toBe(true)
  expect((await schoolTrackingOptions(nextScope)).ordinal).toBe(2)
  await expect(readSchoolPersonalChanges({actorUserId:state.actor.userId,executionId:execution.id})).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
  const denied=await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:state.organizationId,userId:state.studentId,permission:'REPORT_READ',reason:'Synthetic denial',deniedByUserId:state.actor.userId}})
  await expect(readSchoolPersonalChanges({actorUserId:state.studentId,executionId:execution.id})).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
  await db.organizationAccessDeny.update({where:{id:denied.id},data:{liftedAt:new Date(),liftedByUserId:state.actor.userId}})
  expect(await readSchoolPersonalChanges({actorUserId:state.studentId,executionId:execution.id})).toEqual(changes)
 },120000)
 it('reads retained current SELF waves after source batching and rejects the Teacher entry for a student',async()=>{
  const state:State=JSON.parse(readFileSync(file,'utf8'))
  expect(state.t2ExecutionId).toBeDefined()
  const proof={actorUserId:state.studentId,executionId:state.t2ExecutionId!},report=await readSchoolPersonalChanges(proof)
  expect(report.status).toBe('AVAILABLE');if(report.status==='AVAILABLE')expect(report.metrics[0].points.map(p=>p.value)).toEqual([1,2])
  await expect(readTeacherPersonalChanges(proof)).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
 })

})
