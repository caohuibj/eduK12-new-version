import {randomUUID} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {independentReviewer} from './independent-reviewer'
import {submit,review} from '../../modules/scale-library-governance/service'
import {grantEducationLibraryUseInTransaction} from '../../modules/scale-library-governance/education-distribution'
import {registerEducationLibraryGroupResource} from '../../modules/scale-library-governance/education-group-resources'
import {readEducationLibraryRegisteredSource} from '../../modules/scale-library-governance/education-runtime-resources'
import {transitionDescriptiveResource} from '../../modules/assessment-run/registeredResources'
import {createHuiteacherEvent,createHuiteacherEventRunDraft,readHuiteacherEventRun,transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {addTeacherRunTrack,publishTeacherRun,listTeacherAvailableScales} from '../../modules/huiteacher/run.service'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {decryptFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import {finalizeCompositeAttemptIfReady} from '../../modules/composite/composite.service'
import {readTeacherPersonalScaleReport} from '../../modules/huiteacher/scalePersonalReport.service'
import {readRespondentRunSummary} from '../../modules/reporting/respondentSummary'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),continuation=process.env.TEACHER_SELF_GROUP_CONTINUATION
const suite=url&&continuation?describe:describe.skip
suite('library Scale explicit SELF GROUP / retained Teacher population',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);await db.$connect()})
 afterAll(async()=>{await db.$disconnect()})
 it('reviews a separate GROUP policy on the approved C and consumes its same-FINAL own ceiling',async()=>{
  const retained=JSON.parse(await readFile(continuation!,'utf8'))
  const actor=retained.actor,root=actor.userId,manager=retained.scope.actorUserId,organizationId=retained.scope.organizationId
  const scale=await db.scale.findUniqueOrThrow({where:{id:retained.scaleId}}),reviewer=await independentReviewer(actor)
  // Continue from the exact approved source produced by the retained failed fixture,
  // rather than publishing or approving the same measurement again.
  const [prior]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM scale_library_entries WHERE release_id=${scale.measurementReleaseId!} AND status='ACTIVE' ORDER BY created_at DESC,id DESC LIMIT 1`
  let entryId=prior?.id
  if(!entryId){
   const application=await submit(root,'TRAINING',{requestId:randomUUID(),releaseId:scale.measurementReleaseId,
    metadata:{title:scale.name,author:'Synthetic author',copyright:'Self authored redistribution explicitly permitted',applicability:'Synthetic teachers only',scoringDescription:'Formal support sum',reportDescription:'Approved descriptive teacher summary'},
    educationApplicability:{schemaVersion:1,administrations:[{population:'TEACHER',responseMode:'SELF'}]}})
   entryId=(await review(reviewer.userId,application.id,{expectedVersion:1,decision:'APPROVE',allowedProducts:['TRAINING','SURVEY'],reason:'Synthetic library content approval; not scientific qualification'})).entryId!
  }
  const [priorGrant]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM scale_library_use_grants WHERE entry_id=${entryId} AND product='TEACHER' AND organization_id=${organizationId} AND user_id=${manager} AND status='ACTIVE'`
  const granted=await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,root,entryId,{requestId:priorGrant?.id??randomUUID(),product:'TEACHER',scopeKind:'USER',organizationId,userId:manager}))
  const base=granted.resources[0],baseKey=base.resourceEntry.applicability.resourceKey
  const [original]=await db.$queryRaw<Array<{id:string;entry_hash:string;entry:any}>>`SELECT id,entry_hash,entry FROM registered_assessment_resources WHERE resource_key=${baseKey} AND resource_version='1.0.0'`
  const group=await registerEducationLibraryGroupResource(actor,original.id,{minimumRespondents:10,aggregateAudiences:['ORGANIZATION']})
  const entry=group.entry as any
  expect(entry.applicability.analysisMode).toBe('COHORT_AGGREGATE')
  expect(entry.resultDisclosure.audiences.RESPONDENT).toEqual(original.entry.resultDisclosure.audiences.RESPONDENT)
  expect(entry.resultDisclosure.audiences.RESPONDENT.mode).toBe('INDIVIDUAL_SUMMARY')
  expect(entry.resultDisclosure.audiences.TEACHER.mode).toBe('NONE')
  expect(entry.resultDisclosure.audiences.PROFESSIONAL.mode).toBe('NONE')
  await transitionDescriptiveResource(reviewer,group.id,'review');await transitionDescriptiveResource(actor,group.id,'publish')
  const exact=await db.$transaction(tx=>readEducationLibraryRegisteredSource(tx,{product:'TEACHER',resourceKey:group.resource_key,resourceVersion:group.resource_version,purpose:'NEW_USE'}))
  expect(exact.scaleId).toBe(base.scaleId);expect(exact.compositeId).not.toBe(base.compositeId)
  expect((await db.$queryRaw<Array<{entry_hash:string}>>`SELECT entry_hash FROM registered_assessment_resources WHERE id=${original.id}`)[0].entry_hash).toBe(original.entry_hash)
  await expect(db.$executeRaw`UPDATE registered_assessment_resources SET status='RETIRED' WHERE id=${original.id}`).rejects.toThrow('immutable')
  const oldEvent=await db.huiteacherEvaluationEvent.findUniqueOrThrow({where:{id:retained.scope.eventId}})
  const event=await createHuiteacherEvent({organizationId,actorUserId:manager,targetId:oldEvent.targetId,kind:'ASSESSMENT',title:'Synthetic library GROUP'})
  const scope={organizationId,eventId:event.id,actorUserId:manager},draft=await createHuiteacherEventRunDraft({...scope,name:'Library GROUP'})
  // Existing picker must expose the explicitly published policy version under current library grant.
  const catalog=await listTeacherAvailableScales(scope)
  expect(catalog.list.some(row=>row.key===group.resource_key&&row.version===group.resource_version)).toBe(true)
  await addTeacherRunTrack({...scope,resource:{family:'SCALE',key:group.resource_key,version:group.resource_version},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},requestedPolicy:{subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'COHORT_AGGREGATE',visibilityPolicyKey:entry.applicability.visibilityPolicyKey,minimumRespondents:10}})
  await transitionHuiteacherEvent({...scope,action:'OPEN',expectedVersion:1})
  const run=await readHuiteacherEventRun(scope);expect((await publishTeacherRun({...scope,expectedVersion:run.version})).executionCount).toBe(10)
  const [execution]=await db.$queryRaw<Array<{id:string}>>`SELECT e.id FROM assessment_run_executions e JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id WHERE e.run_id=${draft.runId} AND r.user_id=${retained.users[1]}`
  const started=await startAssessmentRunExecution({executionId:execution.id,actorUserId:retained.users[1]});if(started.state!=='STARTED')throw Error('Library GROUP START failed')
  const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:started.runtimeBindingRef}}),runtime=decryptFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted!)
  await submitScaleAssessmentFinal({assessmentId:child.id,submissionId:randomUUID(),attemptEpoch:child.attemptEpoch,definitionHash:runtime.legacyDefinitionHash,userId:retained.users[1],compositeAttemptId:started.runtimeBindingRef,answers:[{itemCode:'Q1',responseValue:'option_3'}]})
  await finalizeCompositeAttemptIfReady(started.runtimeBindingRef)
  await expect(readRespondentRunSummary(retained.users[1],execution.id)).rejects.toMatchObject({statusCode:404})
  expect(await readTeacherPersonalScaleReport({actorUserId:retained.users[1],executionId:execution.id})).toMatchObject({state:'READY',mode:'INDIVIDUAL_SUMMARY',unitReports:expect.any(Array)})
  await writeFile('/tmp/library-self-group-release/source.json',JSON.stringify({scope,runId:draft.runId,groupId:group.id,scaleId:base.scaleId,actor,users:retained.users,completedExecutionId:execution.id},null,2))
 },60000)
 it('continues only the retained library GROUP FINAL reading without republishing or scoring',async()=>{
  const retained=JSON.parse(await readFile(continuation!,'utf8'))
  const [source]=await db.$queryRaw<Array<{eventId:string;runId:string;executionId:string;groupId:string;scaleId:string}>>`
   SELECT l.event_id AS "eventId",e.run_id AS "runId",e.id AS "executionId",r.id AS "groupId",r.scale_id AS "scaleId"
   FROM assessment_run_executions e JOIN assessment_run_tracks t ON t.id=e.track_id AND t.run_id=e.run_id
   JOIN registered_assessment_resources r ON r.resource_key=t.resource_key AND r.resource_version=t.resource_version
   JOIN huiteacher_evaluation_run_links l ON l.run_id=e.run_id AND l.organization_id=e.organization_id
   JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id
   WHERE e.organization_id=${retained.scope.organizationId} AND e.status='COMPLETED'
     AND r.resource_key LIKE 'library-scale:%:TEACHER:TEACHER:SELF:GROUP' AND respondent.user_id=${retained.users[1]}
   ORDER BY e.id LIMIT 1`
  expect(source).toBeTruthy()
  const report=await readTeacherPersonalScaleReport({actorUserId:retained.users[1],executionId:source.executionId})
  expect(report).toMatchObject({state:'READY',mode:'INDIVIDUAL_SUMMARY',unitReports:expect.any(Array)})
  expect(JSON.stringify(report)).toContain('support')
  await expect(readRespondentRunSummary(retained.users[1],source.executionId)).rejects.toMatchObject({statusCode:404})
  await expect(readTeacherPersonalScaleReport({actorUserId:retained.scope.actorUserId,executionId:source.executionId})).rejects.toThrow()
  await writeFile('/tmp/library-self-group-release/source.json',JSON.stringify({scope:{...retained.scope,eventId:source.eventId},runId:source.runId,groupId:source.groupId,scaleId:source.scaleId,actor:retained.actor,users:retained.users,completedExecutionId:source.executionId},null,2))
 },60000)

})
