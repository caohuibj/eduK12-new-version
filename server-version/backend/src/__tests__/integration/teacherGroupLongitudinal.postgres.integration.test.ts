import {randomUUID} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createCustomScaleDefinition,hashScaleDefinition} from '../../modules/scale/scale-definition'
import {publishRegisteredScaleFixture} from './registered-resource-fixture'
import {independentReviewer} from './independent-reviewer'
import {registerDescriptiveResource,transitionDescriptiveResource} from '../../modules/assessment-run/registeredResources'
import {changeTeacherScaleLicense,listTeacherScaleCatalog} from '../../modules/huiteacher/scaleLicense.service'
import {createHuiteacherTarget,createHuiteacherEvent,createHuiteacherEventRunDraft,readHuiteacherEventRun,transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {addTeacherRunTrack,publishTeacherRun,teacherTrackingOptions,createNextTeacherTrackingEvent} from '../../modules/huiteacher/run.service'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {decryptFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import {finalizeCompositeAttemptIfReady} from '../../modules/composite/composite.service'
import {readTeacherPersonalScaleReport} from '../../modules/huiteacher/scalePersonalReport.service'
import {readRespondentRunSummary} from '../../modules/reporting/respondentSummary'
import {generateTeacherGroupLongitudinal,readTeacherGroupLongitudinal,teacherGroupLongitudinalCatalog} from '../../modules/huiteacher/groupLongitudinalReport.service'
import {descriptiveReportingDefinition} from '../../modules/reporting/content.controller'
import {createPlatformReportingSpec,reviewPlatformReportingSpec,publishPlatformReportingSpec,getPublishedReportingSpec} from '../../modules/reporting/spec'
import {readTeacherPersonalChanges} from '../../modules/reporting/teacher-personal-changes.service'
import {setReportingPayloadMaterializationObserverForTests,listAuthoritativeRunLeafSources} from '../../modules/reporting/resultSource'
import {generateTeacherNumericGroup} from '../../modules/huiteacher/numericGroupReport.service'
import {SELF_GROUP_POLICY_KEY} from '../../modules/assessment-policy/self-group-contract'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('Teacher numeric group longitudinal native published plan',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);await db.$connect()})
 afterAll(async()=>{await db.$disconnect()})
 ;(process.env.TEACHER_GROUP_LONGITUDINAL_CONTINUE==='true'?it.skip:it)('publishes T1, inherits T2, saves twenty new FINAL once and reads own, single and saved longitudinal projections',async()=>{
  const root=await db.user.create({data:{username:'teacher-group-root-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN',role:'ADMIN'}})
  const actor={userId:root.id,platformRole:'SYSTEM_ADMIN'},definition=createCustomScaleDefinition()
  definition.respondentType='teacher_self_report';definition.source.title='Synthetic Teacher GROUP source'
  definition.items=[{itemCode:'Q1',sortOrder:0,content:'本次可获得的工作支持',type:'single',required:true,responseSetKey:'default',randomizeOptions:false}]
  definition.scoring.itemRules=[{itemCode:'Q1',transform:{type:'identity'}}]
  definition.scoring.scores=[{key:'support',type:'total',label:'支持体验',direction:'descriptive',canonical:true,displayPrecision:1,source:{type:'items',aggregation:'sum',items:[{itemCode:'Q1',weight:1}]}}]
  definition.report.primaryScoreKeys=['support'];definition.report.scoreOrder=['support']
  definition.report.audienceContract={schemaVersion:1,respondent:'ADULT_SELF',audience:'teacher',locale:'zh-CN',longitudinalMetricKeys:['support'],qcReview:{reviewer:'synthetic-independent-editor',reviewedAt:'2026-10-30T00:00:00.000Z',basis:'Isolated software fixture; not actual scientific approval'}}
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
  const options=await teacherTrackingOptions(scope)
  const tracking={mode:'LONGITUDINAL' as const,metrics:options.choices.map(({trackId,itemId,scoreKey})=>({trackId,itemId,scoreKey}))}
  expect(tracking.metrics).toHaveLength(1)
  const checkpointDir=process.env.TEACHER_GROUP_LONGITUDINAL_EVIDENCE_DIR??'/tmp/teacher-group-longitudinal-native'
  await mkdir(checkpointDir,{recursive:true})
  const checkpoint={scope,runId:draft.runId,users:users.map(u=>u.id),completed:[] as string[],next:null as null|{eventId:string;runId:string},specId:null as string|null}
  const persist=()=>writeFile(checkpointDir+'/fixture.json',JSON.stringify(checkpoint,null,2))
  await persist()
  await publishTeacherRun({...scope,expectedVersion:(await readHuiteacherEventRun(scope)).version,tracking})
  const complete=async(eventId:string,runId:string,value:number)=>{
   const rows=await db.$queryRaw<Array<{id:string;userId:string;status:string}>>`SELECT e.id,r.user_id AS "userId",e.status FROM assessment_run_executions e JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id AND r.run_id=e.run_id AND r.organization_id=e.organization_id WHERE e.run_id=${runId} ORDER BY e.id`
   expect(rows).toHaveLength(10)
   for(const row of rows){
    if(row.status==='COMPLETED')continue
    const started=await startAssessmentRunExecution({executionId:row.id,actorUserId:row.userId});if(started.state!=='STARTED')throw Error('new planned GROUP START failed')
    const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:started.runtimeBindingRef}}),runtime=decryptFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted!)
    await submitScaleAssessmentFinal({assessmentId:child.id,submissionId:randomUUID(),attemptEpoch:child.attemptEpoch,definitionHash:runtime.legacyDefinitionHash,userId:row.userId,compositeAttemptId:started.runtimeBindingRef,answers:[{itemCode:'Q1',responseValue:'option_'+value}]})
    await finalizeCompositeAttemptIfReady(started.runtimeBindingRef);checkpoint.completed.push(row.id);await persist()
   }
   const own=rows.find(r=>r.userId===users[1].id)!
   expect(await readTeacherPersonalScaleReport({actorUserId:own.userId,executionId:own.id})).toMatchObject({state:'READY',metrics:[{key:'support',value}]})
   return own
  }
  await complete(event.id,draft.runId,1)
  const next=await createNextTeacherTrackingEvent({...scope,requestId:randomUUID()});checkpoint.next=next;await persist()
  const nextScope={...scope,eventId:next.eventId}
  await transitionHuiteacherEvent({...nextScope,action:'OPEN',expectedVersion:1})
  await publishTeacherRun({...nextScope,expectedVersion:(await readHuiteacherEventRun(nextScope)).version})
  const t2=await complete(next.eventId,next.runId,3)
  expect(await readTeacherPersonalChanges({actorUserId:t2.userId,executionId:t2.id})).toMatchObject({status:'AVAILABLE'})
  const spec=await createPlatformReportingSpec({actor,specKey:'teacher-native-long-'+randomUUID(),version:1,definition:descriptiveReportingDefinition({...group.entry,definitionHash:group.definition_hash},'GROUP',10)})
  await reviewPlatformReportingSpec({actor:reviewer,specId:spec.id});await publishPlatformReportingSpec({actor,specId:spec.id});checkpoint.specId=spec.id;await persist()
  const catalog=await teacherGroupLongitudinalCatalog(scope)
  if(catalog.status!=='CONFIGURED')throw Error('planned GROUP catalog missing')
  const command={...scope,planId:catalog.planId,sourceKey:catalog.tools[0].key,throughWaveId:next.runId,specId:spec.id,selection:{kind:'ALL' as const}}
  const generated=await generateTeacherGroupLongitudinal(command)
  expect(generated.projection.metrics[0].points.map(p=>p.mean)).toEqual([1,3])
  expect(generated.projection.metrics[0].points.map(p=>p.validN)).toEqual([10,10])
  expect(generated.projection.metrics[0].points[1].adjacentDelta).toBe(2)
  let materializations=0;setReportingPayloadMaterializationObserverForTests(()=>{materializations++})
  expect(await readTeacherGroupLongitudinal({...nextScope,artifactId:generated.artifactId})).toEqual(generated)
  expect((await teacherGroupLongitudinalCatalog(nextScope)).artifacts[0].artifactId).toBe(generated.artifactId)
  setReportingPayloadMaterializationObserverForTests(null);expect(materializations).toBe(0)
  await expect(readTeacherGroupLongitudinal({...scope,actorUserId:users[1].id,artifactId:generated.artifactId})).rejects.toMatchObject({statusCode:404})
  await writeFile(checkpointDir+'/proof.json',JSON.stringify({productionAccessed:false,finalsCreated:checkpoint.completed.length,means:[1,3],validN:[10,10],savedReadMaterializations:materializations,artifactId:generated.artifactId,scope},null,2))
 },120000)
 ;(process.env.TEACHER_GROUP_LONGITUDINAL_CONTINUE==='true'?it:it.skip)('continues saved twenty FINAL without resubmission and verifies only the repaired aggregate/read boundary',async()=>{
  const dir=process.env.TEACHER_GROUP_LONGITUDINAL_EVIDENCE_DIR??'/tmp/teacher-group-longitudinal-native'
  const f=JSON.parse(await readFile(dir+'/fixture.json','utf8'))
  expect(f.completed).toHaveLength(20)
  const catalog=await teacherGroupLongitudinalCatalog(f.scope)
  if(catalog.status!=='CONFIGURED')throw Error('planned GROUP catalog missing')
  const generated=catalog.artifacts.length?await readTeacherGroupLongitudinal({...f.scope,artifactId:catalog.artifacts[0].artifactId}):await generateTeacherGroupLongitudinal({...f.scope,planId:catalog.planId,sourceKey:catalog.tools[0].key,throughWaveId:f.next.runId,specId:f.specId,selection:{kind:'ALL'}})
  expect(generated.projection.metrics[0].points.map(p=>p.mean)).toEqual([1,3])
  expect(generated.projection.metrics[0].points.map(p=>p.validN)).toEqual([10,10])
  expect(generated.projection.metrics[0].unit).toBe('points')
  expect(generated.projection.metrics[0].points[1].adjacentDelta).toBe(2)
  let materializations=0;setReportingPayloadMaterializationObserverForTests(()=>{materializations++})
  const nextScope={...f.scope,eventId:f.next.eventId}
  expect(await readTeacherGroupLongitudinal({...nextScope,artifactId:generated.artifactId})).toEqual(generated)
  expect((await teacherGroupLongitudinalCatalog(nextScope)).artifacts[0].artifactId).toBe(generated.artifactId)
  setReportingPayloadMaterializationObserverForTests(null);expect(materializations).toBe(0)
  await expect(readTeacherGroupLongitudinal({...f.scope,actorUserId:f.users[1],artifactId:generated.artifactId})).rejects.toMatchObject({statusCode:404})
  await writeFile(dir+'/proof.json',JSON.stringify({productionAccessed:false,originalFinals:20,finalsCreatedThisContinuation:0,means:[1,3],validN:[10,10],unit:'points',savedReadMaterializations:materializations,artifactId:generated.artifactId,scope:f.scope},null,2))
 },60000)

 ;(process.env.TEACHER_GROUP_LONGITUDINAL_PARTIAL_ONLY==='true'?it:it.skip)('uses a real published plan and wider spec on retained FINALs without inventing an unauthorized metric',async()=>{
  const dir=process.env.TEACHER_GROUP_LONGITUDINAL_EVIDENCE_DIR??'/tmp/teacher-group-longitudinal-native'
  const f=JSON.parse(await readFile(dir+'/fixture.json','utf8'))
  const readFacts=()=>db.$queryRaw<Array<{id:string;epoch:number;completedAt:Date;savedAt:Date;inputHash:string|null;bindingHash:string|null}>>`SELECT p.id,p.attempt_epoch AS epoch,p.completed_at AS "completedAt",p.last_saved_at AS "savedAt",p.aggregate_input_hash AS "inputHash",p.training_content_binding_hash AS "bindingHash" FROM composite_assessment_attempts p JOIN assessment_run_executions e ON e.runtime_binding_kind='COMPOSITE' AND e.runtime_binding_ref=p.id WHERE e.organization_id=${f.scope.organizationId} AND e.id=ANY(${f.completed}::text[]) ORDER BY p.id`
  const before=await readFacts();expect(before).toHaveLength(20)
  const readPlan=()=>db.$queryRaw`SELECT id,personal_tracking AS tracking FROM assessment_runs WHERE organization_id=${f.scope.organizationId} AND id=ANY(${[f.runId,f.next.runId]}::text[]) ORDER BY id`
  const frozenPlan=await readPlan()
  const old=await getPublishedReportingSpec(f.specId)
  if(old.definition.analysisKind!=='GROUP')throw Error('retained GROUP spec required')
  const wider={...old.definition,metricRules:[...old.definition.metricRules,{...old.definition.metricRules[0],metricId:'not-approved-B',sourceMetricKey:'not-approved-B'}]}
  const actor={userId:old.createdByUserId,platformRole:'SYSTEM_ADMIN'}
  const spec=await createPlatformReportingSpec({actor,specKey:'teacher-long-superset-'+randomUUID(),version:1,definition:wider})
  await reviewPlatformReportingSpec({actor:await independentReviewer(actor),specId:spec.id});await publishPlatformReportingSpec({actor,specId:spec.id})
  const [track]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_run_tracks WHERE organization_id=${f.scope.organizationId} AND run_id=${f.runId}`
  const [tool]=await listAuthoritativeRunLeafSources({organizationId:f.scope.organizationId,runId:f.runId,trackId:track.id,groupAudience:'ORGANIZATION'})
  await expect(generateTeacherNumericGroup({...f.scope,trackId:track.id,leaf:tool.leaf,specId:spec.id,selection:{kind:'ALL'}})).rejects.toMatchObject({code:'REPORT_SPEC_SCOPE'})
  const catalog=await teacherGroupLongitudinalCatalog(f.scope)
  if(catalog.status!=='CONFIGURED')throw Error('retained actual plan required')
  const result=await generateTeacherGroupLongitudinal({...f.scope,planId:catalog.planId,sourceKey:catalog.tools[0].key,throughWaveId:f.next.runId,specId:spec.id,selection:{kind:'ALL'}})
  expect(result.projection.metrics).toHaveLength(1)
  expect(result.projection.metrics[0].points.map(p=>p.mean)).toEqual([1,3]);expect(result.projection.metrics[0].points.map(p=>p.validN)).toEqual([10,10])
  expect(JSON.stringify(result)).not.toContain('not-approved-B')
  expect(await readTeacherGroupLongitudinal({...f.scope,eventId:f.next.eventId,artifactId:result.artifactId})).toEqual(result)
  expect(await readFacts()).toEqual(before);expect(await readPlan()).toEqual(frozenPlan)
  await writeFile(dir+'/partial-interface-proof.json',JSON.stringify({productionAccessed:false,originalFinals:20,newOrReplayedFinals:0,actualPublishedPlanUnchanged:true,plannedMetrics:1,reportSpecMetrics:2,visiblePlannedMetrics:1,unapprovedBExposed:false,ordinaryProducerStillStrict:true,means:[1,3],validN:[10,10],artifactId:result.artifactId},null,2))
 },60000)

})
