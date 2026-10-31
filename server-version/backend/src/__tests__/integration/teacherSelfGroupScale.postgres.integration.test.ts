import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createCustomScaleDefinition,hashScaleDefinition} from '../../modules/scale/scale-definition'
import {publishRegisteredScaleFixture} from './registered-resource-fixture'
import {independentReviewer} from './independent-reviewer'
import {registerDescriptiveResource,transitionDescriptiveResource} from '../../modules/assessment-run/registeredResources'
import {changeTeacherScaleLicense,listTeacherScaleCatalog} from '../../modules/huiteacher/scaleLicense.service'
import {createHuiteacherTarget,createHuiteacherEvent,createHuiteacherEventRunDraft,readHuiteacherEventRun,transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {addTeacherRunTrack,publishTeacherRun} from '../../modules/huiteacher/run.service'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {decryptFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import {finalizeCompositeAttemptIfReady} from '../../modules/composite/composite.service'
import {readTeacherPersonalScaleReport} from '../../modules/huiteacher/scalePersonalReport.service'
import {readRespondentRunSummary} from '../../modules/reporting/respondentSummary'
import {SELF_GROUP_POLICY_KEY} from '../../modules/assessment-policy/self-group-contract'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('original Teacher Scale explicitly reviewed SELF GROUP version',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);await db.$connect()})
 afterAll(async()=>{await db.$disconnect()})
 it('publishes a separate GROUP resource and preserves same-FINAL own feedback without reopening the public inbox',async()=>{
  const root=await db.user.create({data:{username:'teacher-group-root-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN',role:'ADMIN'}})
  const actor={userId:root.id,platformRole:'SYSTEM_ADMIN'},definition=createCustomScaleDefinition()
  definition.respondentType='teacher_self_report';definition.source.title='Synthetic Teacher GROUP source'
  definition.items=[{itemCode:'Q1',sortOrder:0,content:'本次可获得的工作支持',type:'single',required:true,responseSetKey:'default',randomizeOptions:false}]
  definition.scoring.itemRules=[{itemCode:'Q1',transform:{type:'identity'}}]
  definition.scoring.scores=[{key:'support',type:'total',label:'支持体验',direction:'descriptive',canonical:true,displayPrecision:1,source:{type:'items',aggregation:'sum',items:[{itemCode:'Q1',weight:1}]}}]
  definition.report.primaryScoreKeys=['support'];definition.report.scoreOrder=['support']
  definition.report.audienceContract={schemaVersion:1,respondent:'ADULT_SELF',audience:'teacher',locale:'zh-CN',longitudinalMetricKeys:[],qcReview:{reviewer:'synthetic-independent-editor',reviewedAt:'2026-10-30T00:00:00.000Z',basis:'Isolated software fixture; not actual scientific approval'}}
  definition.report.interpretations=[{scoreKey:'support',headline:'本次支持体验',source:{type:'score_only'},summary:'这道题只记录本次填写时对工作支持的主观体验，不能表示全部工作状态，也不能判断一名教师的教学水平。请结合最近一次具体的协作经历，回想哪些帮助解决了实际问题，哪些支持仍然缺少。可以把需要的资源、时间和沟通方式记录下来，与信任的同事讨论下一步可行行动。本结果不提供诊断、人口常模、绩效评价或因果结论。',bands:[],guidance:[{category:'reflection',text:'回想一次具体的支持经历。'},{category:'support',text:'与信任的同事沟通实际需求。'}]}]
  const scale=await db.scale.create({data:{code:'teacher-group-'+randomUUID(),name:'Synthetic Teacher GROUP source',creatorId:root.id,status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',definition,definitionHash:hashScaleDefinition(definition)}})
  await publishRegisteredScaleFixture(db,scale.id)
  const old=await registerDescriptiveResource(actor,scale.id,'TEACHER_INDIVIDUAL')
  const group=await registerDescriptiveResource(actor,scale.id,'TEACHER_GROUP')
  expect(group.resource_key).toBe(`teacher-scale:${scale.id}:GROUP`)
  expect(group.entry.resultDisclosure?.audiences.RESPONDENT).toEqual(old.entry.resultDisclosure?.audiences.RESPONDENT)
  expect(group.entry.resultDisclosure?.audiences.SUBJECT).toEqual(old.entry.resultDisclosure?.audiences.SUBJECT)
  expect(group.entry.resultDisclosure?.audiences.ORGANIZATION.mode).toBe('AGGREGATE_ONLY')
  expect(old.entry.resultDisclosure?.audiences.ORGANIZATION.mode).toBe('NONE')
  const reviewer=await independentReviewer(actor)
  await transitionDescriptiveResource(reviewer,group.id,'review');await transitionDescriptiveResource(actor,group.id,'publish')
  const users=[]
  for(let i=0;i<10;i++)users.push(await db.user.create({data:{username:'teacher-group-person-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}}))
  const manager=users[0],organization=await db.organization.create({data:{id:randomUUID(),name:'Synthetic Teacher GROUP organization',productDomain:'SCHOOL',createdByUserId:manager.id}})
  await db.educationProductEntitlement.create({data:{organizationId:organization.id,product:'HUITEACHER',grantedByUserId:root.id}})
  for(const user of users){const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:organization.id,userId:user.id,orgRole:'MEMBER'}})
   await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:organization.id,membershipId:member.id,persona:'TEACHER',grantedByUserId:root.id}})
   if(user.id===manager.id)await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:organization.id,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:root.id}})
  }
  const entryAdmin=await db.user.create({data:{username:'teacher-group-entry-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',role:'TEACHER',teacherApproved:true}})
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:entryAdmin.id,entry:'HUITEACHER',grantedBy:root.id}})
  await changeTeacherScaleLicense({organizationId:organization.id,resourceId:group.id,actorUserId:entryAdmin.id,action:'GRANT'})
  expect((await listTeacherScaleCatalog({organizationId:organization.id,actorUserId:manager.id})).list.find(row=>row.id===group.id)).toMatchObject({analysisMode:'COHORT_AGGREGATE',visibilityPolicyKey:SELF_GROUP_POLICY_KEY,minimumRespondents:group.entry.applicability.minimumRespondents,personalReportAvailable:true})
  const target=await createHuiteacherTarget({organizationId:organization.id,actorUserId:manager.id,kind:'ORGANIZATION',name:'Teacher GROUP'})
  const event=await createHuiteacherEvent({organizationId:organization.id,actorUserId:manager.id,targetId:target.id,kind:'ASSESSMENT',title:'Teacher GROUP'})
  const scope={organizationId:organization.id,eventId:event.id,actorUserId:manager.id}
  const draft=await createHuiteacherEventRunDraft({...scope,name:'Teacher GROUP'})
  await addTeacherRunTrack({...scope,resource:{family:'SCALE',key:group.resource_key,version:group.resource_version},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},requestedPolicy:{subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'COHORT_AGGREGATE',visibilityPolicyKey:SELF_GROUP_POLICY_KEY,minimumRespondents:group.entry.applicability.minimumRespondents}})
  await transitionHuiteacherEvent({...scope,action:'OPEN',expectedVersion:1})
  const run=await readHuiteacherEventRun(scope);expect((await publishTeacherRun({...scope,expectedVersion:run.version})).executionCount).toBe(10)
  const [execution]=await db.$queryRaw<Array<{id:string}>>`SELECT e.id FROM assessment_run_executions e JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id AND r.organization_id=e.organization_id AND r.run_id=e.run_id WHERE e.organization_id=${organization.id} AND e.run_id=${draft.runId} AND r.user_id=${users[1].id}`
  const started=await startAssessmentRunExecution({executionId:execution.id,actorUserId:users[1].id});if(started.state!=='STARTED')throw Error('new GROUP START failed')
  const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:started.runtimeBindingRef}}),runtime=decryptFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted!)
  await submitScaleAssessmentFinal({assessmentId:child.id,submissionId:randomUUID(),attemptEpoch:child.attemptEpoch,definitionHash:runtime.legacyDefinitionHash,userId:users[1].id,compositeAttemptId:started.runtimeBindingRef,answers:[{itemCode:'Q1',responseValue:'option_3'}]})
  await finalizeCompositeAttemptIfReady(started.runtimeBindingRef)
  await expect(readRespondentRunSummary(users[1].id,execution.id)).rejects.toMatchObject({statusCode:404})
  const report=await readTeacherPersonalScaleReport({actorUserId:users[1].id,executionId:execution.id})
  expect(report).toMatchObject({state:'READY',metrics:[{key:'support',value:3}]})
  await expect(readTeacherPersonalScaleReport({actorUserId:manager.id,executionId:execution.id})).rejects.toThrow()
  await mkdir('/tmp/teacher-self-group-scale',{recursive:true})
  await writeFile('/tmp/teacher-self-group-scale/source.json',JSON.stringify({scope,runId:draft.runId,groupId:group.id,scaleId:scale.id,oldId:old.id,entryAdminId:entryAdmin.id,actor,users:users.map(user=>user.id),completedExecutionId:execution.id},null,2))
 },60000)
})
