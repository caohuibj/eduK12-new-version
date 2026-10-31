import {describe,it,expect,afterAll} from 'vitest'
import {randomUUID} from 'node:crypto'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {createCanonicalUnitResultEnvelope,type CanonicalUnitResultEnvelopeV1} from '../../modules/assessment-runtime/unit-result'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {buildReportingFixture} from '../integration/reporting-fixture'
import {listAuthoritativeRunLeafSources} from '../../modules/reporting/resultSource'
import {readSchoolPlanCompletedHeaders} from '../../modules/campus/group-longitudinal-plan.service'
import {saveTaskGroupLongitudinalArtifact,readTaskGroupLongitudinalArtifact,listTaskGroupLongitudinalArtifacts,listTaskGroupArtifacts} from '../../modules/reporting/task-artifact'
const url=integrationDatabaseUrl('SCHOOL_PLAN_GROUP_DATABASE_URL'),suite=url?describe:describe.skip
suite('School compound snapshot / metadata PG contract (not authentication or end-to-end)',()=>{
 afterAll(()=>prisma.$disconnect())
 it('keeps School plan history isolated and accepts only the current latest completed bound parent',async()=>{
  requireIsolatedReleaseDatabase(url!)
  const f=await buildReportingFixture(prisma,1),member=f.members[0]
  const episode=await prisma.assessmentEpisode.create({data:{subjectUserId:member.userId,initiatedByUserId:f.ownerId,initiationMode:'STUDENT_SELF'}})
  const assignment=await prisma.relationalAssessmentAssignment.create({data:{id:randomUUID(),episodeId:episode.id,subjectUserId:member.userId,subjectRole:'STUDENT',respondentUserId:member.userId,respondentRole:'STUDENT',createdByUserId:f.ownerId,relationshipKind:'SELF',perspective:'SELF_REPORT',relationshipSnapshotJson:{synthetic:true},relationshipSnapshotHash:'a'.repeat(64),resourceKind:'BUNDLE',resourceKey:'synthetic-quota-metadata',resourceVersion:'1',analysisMode:'COHORT_AGGREGATE',minimumRespondents:10,visibilityPolicyKey:'SYNTHETIC_SCHOOL_GROUP'}})
  await prisma.$executeRaw`UPDATE assessment_run_executions SET relational_assignment_id=${assignment.id} WHERE id=${member.executionId}`
  await prisma.compositeAssessmentAttempt.update({where:{id:member.attemptId},data:{assignmentRef:assignment.id}})
  const selected=[{wave:{id:f.runId,ordinal:1,name:'synthetic',tracking:null},trackId:f.trackId}]
  const before=await readSchoolPlanCompletedHeaders(f.organizationId,selected)
  expect(before).toHaveLength(1);expect(before[0]).toMatchObject({attemptId:member.attemptId,epoch:1,latest:true});expect(before[0].completedAt).toBeInstanceOf(Date)
  expect(await readSchoolPlanCompletedHeaders(randomUUID(),selected)).toEqual([])
  const newParent={compositeAssessmentId:f.compositeId,userId:member.userId,subjectUserId:member.userId,respondentUserId:member.userId,assignmentRef:assignment.id,participantKey:'metadata-'+randomUUID(),deliveryMode:'FINAL_ONLY' as const,runtimeGeneration:'UNIFIED_V1' as const}
  const pending=await prisma.compositeAssessmentAttempt.create({data:newParent})
  expect((await readSchoolPlanCompletedHeaders(f.organizationId,selected))[0].attemptId).toBe(member.attemptId)
  await prisma.compositeAssessmentAttempt.update({where:{id:pending.id},data:{status:'COMPLETED',completedAt:new Date(before[0].completedAt.getTime()+1000)}})
  await expect(readSchoolPlanCompletedHeaders(f.organizationId,selected)).rejects.toMatchObject({statusCode:409})
  const source={product:'SCHOOL' as const,containerId:f.organizationId,taskId:f.runId},planId=randomUUID()
  // The opaque aggregate is intentionally static; the shared numerical engine
  // and existing School disclosure are not re-executed by this storage check.
  const saved=await prisma.$transaction(tx=>saveTaskGroupLongitudinalArtifact(tx,{source,selector:{planId,sourceKey:'synthetic-leaf'},sourceBindings:{waves:[{artifactId:randomUUID()}]},generatedBy:f.ownerId,projection:{schemaVersion:1,kind:'GROUP_LONGITUDINAL',planId,sourceKey:'synthetic-leaf',title:'synthetic storage only',generatedCutoff:'2026-09-01T00:00:00Z',populationMode:'INDEPENDENT_WAVES',metrics:[],limitations:[]}}))
  const read=await prisma.$transaction(tx=>readTaskGroupLongitudinalArtifact(tx,source,planId,saved.artifactId));expect(read?.projection).toEqual(saved.projection)
  expect(await prisma.$transaction(tx=>readTaskGroupLongitudinalArtifact(tx,{...source,product:'TRAINING'},planId,saved.artifactId))).toBeNull()
  expect(await prisma.$transaction(tx=>readTaskGroupLongitudinalArtifact(tx,source,randomUUID(),saved.artifactId))).toBeNull()
  expect((await prisma.$transaction(tx=>listTaskGroupLongitudinalArtifacts(tx,source,planId))).map(r=>r.artifactId)).toContain(saved.artifactId)
  expect(await prisma.$transaction(tx=>listTaskGroupArtifacts(tx,source))).toEqual([])
 })
 it('limits planned discovery to the selected slot while the stored Track contains another same-named metric',async()=>{
  requireIsolatedReleaseDatabase(url!)
  const f=await buildReportingFixture(prisma,1)
  const row=await prisma.assessmentUnitSnapshot.findFirstOrThrow({where:{compositeAttemptId:f.members[0].attemptId}})
  const {id:_id,...data}=row
  const original=decryptUnifiedRuntimePayload<CanonicalUnitResultEnvelopeV1>(row.canonicalResultEncrypted!),sourceAttemptId=randomUUID()
  const sibling=createCanonicalUnitResultEnvelope({core:original.core,completedAt:original.completedAt,persistenceProvenance:{...original.persistenceProvenance,sourceAttemptId}})
  await prisma.assessmentUnitSnapshot.create({data:{...data,slotKey:'scale:untracked-other',sourceAttemptId,canonicalResultEncrypted:encryptUnifiedRuntimePayload(sibling)}})
  const query=await listAuthoritativeRunLeafSources({...f,slotKey:'scale:reporting-query-budget'})
  expect(query).toHaveLength(1);expect(query[0].leaf.slotKey).toBe('scale:reporting-query-budget')
 })

})
