import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {independentReviewer} from './independent-reviewer'
import {publishRegisteredScaleFixture} from './registered-resource-fixture'
import {createCustomScaleDefinition,hashScaleDefinition} from '../../modules/scale/scale-definition'
import {registerDescriptiveResource,transitionDescriptiveResource} from '../../modules/assessment-run/registeredResources'
import {changeTeacherScaleLicense} from '../../modules/huiteacher/scaleLicense.service'
import {listOwnTeacherScaleTasks} from '../../modules/huiteacher/scaleRuntime.routes'
import {createHuiteacherTarget,createHuiteacherEvent,createHuiteacherEventRunDraft,transitionHuiteacherEvent,readHuiteacherEventRun} from '../../modules/huiteacher/evaluation.service'
import {addTeacherRunTrack,publishTeacherRun,teacherTrackingOptions,createNextTeacherTrackingEvent} from '../../modules/huiteacher/run.service'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import {decryptFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {finalizeCompositeAttemptIfReady} from '../../modules/composite/composite.service'
import {readTeacherPersonalScaleReport} from '../../modules/huiteacher/scalePersonalReport.service'
import {teacherPilotContentIssues} from '../../modules/huiteacher/teacherPilotContent'
import {readTeacherPersonalChanges} from '../../modules/reporting/teacher-personal-changes.service'

const URL=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL',
  'PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=URL?describe:describe.skip
let db:PrismaClient
const previousEncryptionKey=process.env.DATA_ENCRYPTION_KEY
const edu=async()=>{
  const userId=randomUUID()
  return db.user.create({data:{
    id:userId,username:'huiteacher-adult-'+userId.replace(/-/g,''),
    accountDomain:'SCHOOL',passwordHash:'synthetic-test-only',
    role:'TEACHER',teacherApproved:true,
  }})
}
const teacherSchool=async(userId:string)=>{
  const organization=await db.organization.create({data:{
    id:randomUUID(),name:'licensed-teacher-'+randomUUID(),
    createdByUserId:userId,productDomain:'SCHOOL',
  }})
  const membership=await db.organizationMembership.create({data:{
    id:randomUUID(),organizationId:organization.id,userId,
    orgRole:'ORG_ADMIN',
  }})
  await db.organizationPersonaGrant.create({data:{
    id:randomUUID(),organizationId:organization.id,
    membershipId:membership.id,persona:'TEACHER',grantedByUserId:userId,
  }})
  await db.educationProductEntitlement.create({data:{
    organizationId:organization.id,product:'HUITEACHER',status:'ACTIVE',
    grantedByUserId:userId,
  }})
  await db.educationProductRoleGrant.create({data:{
    id:randomUUID(),organizationId:organization.id,
    membershipId:membership.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',
    grantedByUserId:userId,
  }})
  return organization
}


suite('Teacher personal longitudinal native Run',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(URL!);process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32);db=new PrismaClient({datasources:{db:{url:URL!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect();if(previousEncryptionKey===undefined)delete process.env.DATA_ENCRYPTION_KEY})
 ;(process.env.TEACHER_TRACKING_CONTINUATION_ONLY==='true'?it.skip:it)('publishes frozen T1, creates native T2, saves actual answers, reads both reports and rejects wrong/currently revoked identity',async()=>{
    const admin=await db.user.create({data:{
      username:'scale-release-'+randomUUID(),passwordHash:'synthetic',
      accountDomain:'TRAINING',role:'ADMIN',platformRole:'SYSTEM_ADMIN',
    }})
    const actor={userId:admin.id,platformRole:'SYSTEM_ADMIN'}
    const entryAdmin=await db.user.create({data:{username:'teacher-entry-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',platformRole:'STANDARD',role:'TEACHER',teacherApproved:true}})
    await db.adminEntryGrant.create({data:{id:randomUUID(),userId:entryAdmin.id,entry:'HUITEACHER',grantedBy:admin.id}})
    const definition=createCustomScaleDefinition()
    definition.respondentType='teacher_self_report'
    definition.source.title='原创合成教师工作体验'
    definition.items=['Q1','Q2','Q3'].map((itemCode,sortOrder)=>({
      itemCode,sortOrder,content:'本轮教师工作体验 '+(sortOrder+1),
      type:'single',required:true,responseSetKey:'default',randomizeOptions:false,
    }))
    definition.scoring.itemRules=definition.items.map(item=>({
      itemCode:item.itemCode,transform:{type:'identity' as const},
    }))
    definition.scoring.scores=[{
      key:'support',type:'total',label:'自我支持体验',
      direction:'descriptive',canonical:true,displayPrecision:1,
      source:{type:'items',aggregation:'sum',
        items:definition.items.map(item=>({itemCode:item.itemCode,weight:1}))},
    }]
    definition.report.primaryScoreKeys=['support']
    definition.report.scoreOrder=['support']
    expect(teacherPilotContentIssues(definition))
      .toContain('TEACHER_ADULT_REPORT_QC_REQUIRED')
    definition.report.audienceContract={
      schemaVersion:1,respondent:'ADULT_SELF',audience:'teacher',
      locale:'zh-CN',
      qcReview:{reviewer:'synthetic-test-independent-editor',
        reviewedAt:'2026-10-12T00:00:00.000Z',
        basis:'Isolated fixture: a reader-facing pilot explanation and privacy check'},
    }
    definition.report.interpretations=[{
      scoreKey:'support',headline:'你对支持资源的体验',
      source:{type:'score_only'},
      summary:'这三道题反映你最近一次填写问卷时对工作支持的主观感受。它们不能代表你所有的工作经历，也不能判断你是否是一位优秀教师。你可以回想某一次与同事协作或者寻求学校帮助的经历：当时真正帮助到你的是什么？哪些支持还不够具体？如果近期工作负担明显增加，可以把需要的时间、资源或者协作方式写下来，与信任的同事或学校沟通。再次测量前，也可以观察自己的工作环境是否发生了变化。',
      bands:[],
      guidance:[
        {category:'reflection',text:'回想最近一次获得实际支持的情境，记录哪种帮助起到了作用。'},
        {category:'strategy',text:'选出一个现实可行的需求，尝试与团队约定下一步行动。'},
      ],
    }]
    expect(teacherPilotContentIssues(definition)).toEqual([])
    const definitionHash=hashScaleDefinition(definition)
    const scale=await db.scale.create({data:{
      code:'teacher_self_'+randomUUID().replace(/-/g,''),
      name:'教师工作体验（合成测试）',status:'PUBLISHED',
      creatorId:admin.id,instrumentClass:'CUSTOM_DESCRIPTIVE',
      definition,definitionHash,
    }})
    const measurement = await publishRegisteredScaleFixture(db, scale.id)
    const resource=await registerDescriptiveResource(
      actor,scale.id,'TEACHER_INDIVIDUAL')
    expect(resource.resource_key).toBe('teacher-scale:'+scale.id+':INDIVIDUAL')
    expect(resource.entry.applicability).toMatchObject({
      subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],
      analysisMode:'INDIVIDUAL_ONLY',relationshipKinds:['SELF'],
    })
    expect(resource.entry.resultDisclosure.audiences.ORGANIZATION.mode).toBe('NONE')
    expect(resource.entry.resultDisclosure.audiences.RESPONDENT.mode).toBe('INDIVIDUAL_SUMMARY')
    await expect(transitionDescriptiveResource(
      actor,resource.id,'review')).rejects.toMatchObject({
      code:'RESOURCE_INDEPENDENT_REVIEW_REQUIRED',
    })
    const reviewer=await independentReviewer(actor)
    await transitionDescriptiveResource(reviewer,resource.id,'review')
    await transitionDescriptiveResource(actor,resource.id,'publish')
    const frozen = await db.compositeAssessment.findUniqueOrThrow({ where: { id: resource.composite_id } })
    expect(frozen.trainingContentSnapshot).toMatchObject({ units: [{
      measurement: { releaseId: measurement.releaseId },
      referencePolicy: { choices: [] },
    }] })


const manager=await edu(),teacher=await edu(),school=await teacherSchool(manager.id)
const membership=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:school.id,userId:teacher.id,orgRole:'MEMBER'}})
await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:school.id,membershipId:membership.id,persona:'TEACHER',grantedByUserId:manager.id}})
await changeTeacherScaleLicense({organizationId:school.id,resourceId:resource.id,actorUserId:entryAdmin.id,action:'GRANT'})
const target=await createHuiteacherTarget({organizationId:school.id,actorUserId:manager.id,kind:'ORGANIZATION',name:'Synthetic longitudinal Teachers'})
const event=await createHuiteacherEvent({organizationId:school.id,actorUserId:manager.id,targetId:target.id,kind:'ASSESSMENT',title:'Synthetic Teacher Longitudinal'})
const scope={organizationId:school.id,actorUserId:manager.id,eventId:event.id}
const draft=await createHuiteacherEventRunDraft({...scope,name:'Teacher longitudinal T1'})
await addTeacherRunTrack({...scope,resource:{family:'SCALE',key:resource.resource_key,version:resource.resource_version},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},requestedPolicy:{subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'INDIVIDUAL_ONLY',minimumRespondents:null,visibilityPolicyKey:'HUITEACHER_ADULT_SELF_PILOT_V1'}})
const options=await teacherTrackingOptions(scope)
expect(options.choices).toHaveLength(1)
await transitionHuiteacherEvent({...scope,action:'OPEN',expectedVersion:1})
await publishTeacherRun({...scope,expectedVersion:(await readHuiteacherEventRun(scope)).version,tracking:{mode:'LONGITUDINAL',metrics:options.choices.map(({trackId,itemId,scoreKey})=>({trackId,itemId,scoreKey}))}})
const complete=async(eventId:string,value:number)=>{
 const task=(await listOwnTeacherScaleTasks(teacher.id)).list.find(t=>t.eventId===eventId)!
 expect(task).toBeTruthy()
 const started=await startAssessmentRunExecution({executionId:task.executionId,actorUserId:teacher.id})
 if(started.state!=='STARTED')throw new Error('Expected actual Teacher START')
 const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:started.runtimeBindingRef}})
 const runtime=decryptFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted!)
 await submitScaleAssessmentFinal({assessmentId:child.id,submissionId:randomUUID(),attemptEpoch:child.attemptEpoch,definitionHash:runtime.legacyDefinitionHash,userId:teacher.id,compositeAttemptId:started.runtimeBindingRef,answers:[1,2,3].map(i=>({itemCode:'Q'+i,responseValue:'option_'+value}))})
 await finalizeCompositeAttemptIfReady(started.runtimeBindingRef)
 const single=await readTeacherPersonalScaleReport({actorUserId:teacher.id,executionId:task.executionId})
 expect(single.state).toBe('READY')
 if(single.state==='READY')expect(single.metrics[0].value).toBe(value*3)
 return task
}
const t1=await complete(event.id,1)
expect((await readTeacherPersonalChanges({actorUserId:teacher.id,executionId:t1.executionId})).status).toBe('WAITING')
const requestId=randomUUID(),next=await createNextTeacherTrackingEvent({...scope,requestId})
expect(await createNextTeacherTrackingEvent({...scope,requestId})).toEqual(next)
expect(next.ordinal).toBe(2)
const nextScope={...scope,eventId:next.eventId}
expect((await teacherTrackingOptions(nextScope)).baselineId).toBe(draft.runId)
await transitionHuiteacherEvent({...nextScope,action:'OPEN',expectedVersion:1})
await publishTeacherRun({...nextScope,expectedVersion:(await readHuiteacherEventRun(nextScope)).version})
const t2=await complete(next.eventId,3)
const changes=await readTeacherPersonalChanges({actorUserId:teacher.id,executionId:t2.executionId})
expect(changes.status).toBe('AVAILABLE')
if(changes.status!=='AVAILABLE')throw new Error(JSON.stringify(changes))
expect(changes.metrics[0].points.map(p=>p.value)).toEqual([3,9])
expect(changes.metrics[0].adjacent[0].delta).toBe(6)
expect(changes.metrics[0].points.every(p=>p.observedAt)).toBe(true)
expect(JSON.stringify(changes)).not.toMatch(/scopedSubjectId|assignmentId|subjectUserId/)
await expect(readTeacherPersonalChanges({actorUserId:manager.id,executionId:t2.executionId})).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
await db.organizationMembership.update({where:{id:membership.id},data:{validUntil:new Date(Date.now()-1000)}})
await expect(readTeacherPersonalChanges({actorUserId:teacher.id,executionId:t2.executionId})).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
await db.organizationMembership.update({where:{id:membership.id},data:{validUntil:null}})
expect(await readTeacherPersonalChanges({actorUserId:teacher.id,executionId:t2.executionId})).toEqual(changes)
await changeTeacherScaleLicense({organizationId:school.id,resourceId:resource.id,actorUserId:entryAdmin.id,action:'REVOKE'})
expect(await readTeacherPersonalChanges({actorUserId:teacher.id,executionId:t2.executionId})).toEqual(changes)
await changeTeacherScaleLicense({organizationId:school.id,resourceId:resource.id,actorUserId:entryAdmin.id,action:'GRANT'})
const marker={organizationId:school.id,managerId:manager.id,teacherId:teacher.id,eventId:event.id,nextEventId:next.eventId,executionId:t2.executionId,report:changes}
await import('node:fs/promises').then(fs=>fs.writeFile('/tmp/teacher-longitudinal-fixture.json',JSON.stringify(marker)))

 },120000)
 ;(process.env.TEACHER_TRACKING_CONTINUATION_ONLY==='true'?it:it.skip)('retains completed T1/T2 and verifies current report denial after the original native journey',async()=>{
  const [fixture]=await db.$queryRaw<Array<{organizationId:string;managerId:string;teacherId:string;eventId:string;nextEventId:string;executionId:string;resourceId:string;entryAdminId:string}>>`
   SELECT run.organization_id AS "organizationId",run.created_by_user_id AS "managerId",respondent.user_id AS "teacherId",
    first_link.event_id AS "eventId",event.id AS "nextEventId",e.id AS "executionId",resource.id AS "resourceId",license.granted_by_user_id AS "entryAdminId"
   FROM assessment_runs run JOIN huiteacher_evaluation_run_links link ON link.run_id=run.id AND link.organization_id=run.organization_id
   JOIN huiteacher_evaluation_events event ON event.id=link.event_id AND event.organization_id=link.organization_id
   JOIN huiteacher_evaluation_run_links first_link ON first_link.run_id=run.personal_tracking_baseline_id AND first_link.organization_id=run.organization_id
   JOIN assessment_run_executions e ON e.run_id=run.id AND e.organization_id=run.organization_id AND e.status='COMPLETED'
   JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id
   JOIN assessment_run_tracks track ON track.id=e.track_id
   JOIN registered_assessment_resources resource ON resource.resource_key=track.resource_key AND resource.resource_version=track.resource_version
   JOIN education_teacher_scale_licenses license ON license.resource_id=resource.id AND license.organization_id=run.organization_id
   WHERE event.title='Synthetic Teacher Longitudinal · T2' ORDER BY run.created_at DESC LIMIT 1`
  expect(fixture).toBeTruthy()
  const proof={actorUserId:fixture.teacherId,executionId:fixture.executionId}
  const changes=await readTeacherPersonalChanges(proof)
  expect(changes.status).toBe('AVAILABLE')
  if(changes.status==='AVAILABLE')expect(changes.metrics[0].points.map(p=>p.value)).toEqual([3,9])
  // Current REPORT_READ denial also applies to an existing encrypted cache.
  const deny=await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:fixture.organizationId,userId:fixture.teacherId,permission:'REPORT_READ',reason:'Synthetic current report denial',deniedByUserId:fixture.managerId}})
  await expect(readTeacherPersonalChanges(proof)).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
  await db.organizationAccessDeny.update({where:{id:deny.id},data:{liftedAt:new Date(),liftedByUserId:fixture.managerId}})
  expect(await readTeacherPersonalChanges(proof)).toEqual(changes)
  await changeTeacherScaleLicense({organizationId:fixture.organizationId,resourceId:fixture.resourceId,actorUserId:fixture.entryAdminId,action:'GRANT'})
  await import('node:fs/promises').then(fs=>fs.writeFile('/tmp/teacher-longitudinal-fixture.json',JSON.stringify({...fixture,report:changes})))
 },30000)

 ;(process.env.TEACHER_TRACKING_INVARIANTS_ONLY==='true'?it:it.skip)('keeps published Teacher tracking and encrypted snapshots immutable',async()=>{
  const fixture=JSON.parse(await import('node:fs/promises').then(fs=>fs.readFile('/tmp/teacher-longitudinal-fixture.json','utf8')))
  const [execution]=await db.$queryRaw<Array<{runId:string;count:number}>>`SELECT run_id AS "runId",(SELECT count(*)::int FROM jsonb_object_keys(personal_changes_snapshots)) AS count FROM assessment_run_executions WHERE id=${fixture.executionId}`
  expect(execution.count).toBeGreaterThan(0)
  await expect(db.$executeRaw`UPDATE assessment_runs SET personal_tracking_ordinal=99 WHERE id=${execution.runId}`).rejects.toThrow('Published education tracking is immutable')
  await expect(db.$executeRaw`UPDATE assessment_run_executions SET personal_changes_snapshots='{}'::jsonb WHERE id=${fixture.executionId}`).rejects.toThrow('Personal changes snapshots are append-only')
 },30000)

})
