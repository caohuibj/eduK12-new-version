import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupSchoolCompositionExecution} from './educationPrivateCompositionExecutionFixture'
import {appointCampusCounselorClient,endCampusCounselorClient} from '../../modules/campus/relationships.service'
import {listCampusIndividualLongitudinalSources} from '../../modules/campus/individual-longitudinal-studio'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {getAttemptState} from '../../modules/composite/composite.service'
import {submitCompositeScaleFinal} from '../../modules/scale/scale-final-submit.service'
import {submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {closeAssessmentRun} from '../../modules/assessment-run/lifecycle'
import {readCampusActivity,changeCampusActivityStatus} from '../../modules/campus/activity.service'
import {updatePrivateTool} from '../../modules/education-tools/private-tool.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
suite('School individual source labels after actual CLIENT and completed-source authorization',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('uses the immutable composition title after a draft rename, exposes no metric metadata and rejects the ended professional relationship',async()=>{
  const f=await setupSchoolCompositionExecution(db,{provideParticipantReport:true})
  const member=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:f.managerUserId,validUntil:null}})
  const relationship=await appointCampusCounselorClient({actor:f.schoolAdmin!,organizationId:f.organizationId,counselorMembershipId:member.id,clientMembershipId:f.subjectMembershipId})
  const started=await startAssessmentRunExecution({executionId:f.executionId,actorUserId:f.participantUserId})
  if(started.state!=='STARTED')throw Error('Expected actual composition START')
  const parentId=started.runtimeBindingRef
  for(let index=0;index<3;index++){
   const state=await getAttemptState(parentId,{userId:f.participantUserId},undefined,'current-unit')
   if(state.status==='COMPLETED')break
   const item=state.currentItem,common={submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.contextSnapshotHash}
   if(item.type==='SCALE')await submitCompositeScaleFinal(parentId,item.id,{...common,answers:item.scale.definition.items.map((question:{itemCode:string})=>({itemCode:question.itemCode,responseValue:'a'}))},{userId:f.participantUserId},{receiptOnly:true})
   else if(item.type==='FORM_SECTION')await submitCompositeFormSectionFinal({attemptId:parentId,sectionId:item.formSectionId,userId:f.participantUserId,...common,
    answers:item.answers.map((question:{formItemId:string})=>({formItemId:question.formItemId,value:'Synthetic retained original answer'}))})
   else throw Error('Unexpected fixture unit')
  }
  expect((await getAttemptState(parentId,{userId:f.participantUserId},undefined,'current-unit')).status).toBe('COMPLETED')
  await closeAssessmentRun({organizationId:f.organizationId,runId:f.runId,schoolActivity:{actor:f.manager,courseId:f.workflow.id}})
  const scope={actor:f.manager,organizationId:f.organizationId,courseId:f.workflow.id}
  const activity=await readCampusActivity(scope)
  await changeCampusActivityStatus({...scope,action:'CLOSE',expectedVersion:activity.version})
  // Isolated release-delay fixture only, after the real CLOSE services. This
  // is not proof that 24 hours naturally elapsed; no result/policy is altered.
  await db.$executeRaw`UPDATE assessment_runs SET closed_at=statement_timestamp()-interval '25 hours' WHERE id=${f.runId} AND status='CLOSED'`
  await db.$executeRaw`UPDATE campus_activities SET closed_at=statement_timestamp()-interval '25 hours' WHERE course_id=${f.workflow.id} AND status='CLOSED'`
  const version=await db.educationPrivateToolVersion.findUniqueOrThrow({where:{id:f.fixed.id}})
  const draft=await db.educationPrivateTool.findUniqueOrThrow({where:{id:version.toolId}})
  await updatePrivateTool(f.context,draft.id,{expectedRevision:draft.revision,title:'Later renamed draft title',definition:f.definition})
  const request={actor:f.manager,organizationId:f.organizationId,subjectReference:relationship.studentReference}
  const sources=await listCampusIndividualLongitudinalSources(request)
  expect(sources.sources).toHaveLength(1)
  expect(sources.sources[0]).toMatchObject({runId:f.runId,resource:{family:'BUNDLE',title:version.title,versionLabel:'修订 '+version.sourceRevision}})
  expect(sources.sources[0].resource.title).not.toBe('Later renamed draft title')
  expect(JSON.stringify(sources)).not.toMatch(/metricLabels|Synthetic retained original answer/)
  await expect(listCampusIndividualLongitudinalSources({...request,subjectReference:'林-000000000000'})).rejects.toMatchObject({statusCode:404})
  await endCampusCounselorClient({actor:f.schoolAdmin!,organizationId:f.organizationId,relationshipId:relationship.id,reason:'Synthetic relationship completed'})
  await expect(listCampusIndividualLongitudinalSources(request)).rejects.toMatchObject({statusCode:404})
 },90000)
})
