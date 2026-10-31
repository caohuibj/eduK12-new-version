import {readReportingArtifactRecord} from '../../modules/reporting/artifact'
import {readReportingCohort} from '../../modules/reporting/cohort'
import {randomUUID} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {independentReviewer} from './independent-reviewer'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {decryptFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import {finalizeCompositeAttemptIfReady} from '../../modules/composite/composite.service'
import {closeTeacherRun} from '../../modules/huiteacher/run.service'
import {transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {descriptiveReportingDefinition} from '../../modules/reporting/content.controller'
import {createPlatformReportingSpec,reviewPlatformReportingSpec,publishPlatformReportingSpec,getPublishedReportingSpec} from '../../modules/reporting/spec'
import {listTeacherNumericGroups,generateTeacherNumericGroup,readTeacherNumericGroup,assertTeacherNumericDisclosure} from '../../modules/huiteacher/numericGroupReport.service'
import {generateOrganizationGroupAnalysis} from '../../modules/reporting/service'
import {setReportingPayloadMaterializationObserverForTests} from '../../modules/reporting/resultSource'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),enabled=process.env.TEACHER_SELF_GROUP_CONTINUATION
const suite=url&&enabled?describe:describe.skip
suite('Teacher fixed Scale leaves / retained real population',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);await db.$connect()})
 afterAll(async()=>{setReportingPayloadMaterializationObserverForTests(null);await db.$disconnect()})
 it.each(['original','library'])('generates and reads sufficient-N %s GROUP without resubmitting its completed participant',async kind=>{
  const f=JSON.parse(await readFile(kind==='original'?enabled!:'/tmp/library-self-group-release/source.json','utf8'))
  const initial=await db.$queryRaw<Array<{id:string;runtimeBindingRef:string}>>`SELECT id,runtime_binding_ref AS "runtimeBindingRef" FROM assessment_run_executions WHERE run_id=${f.runId} AND status='COMPLETED'`
  expect(initial.some(e=>e.id===f.completedExecutionId)).toBe(true)
  const originalParent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:initial.find(e=>e.id===f.completedExecutionId)!.runtimeBindingRef!}})
  const pending=await db.$queryRaw<Array<{id:string;userId:string}>>`SELECT e.id,r.user_id AS "userId" FROM assessment_run_executions e JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id
   WHERE e.organization_id=${f.scope.organizationId} AND e.run_id=${f.runId} AND e.status<>'COMPLETED' ORDER BY e.id`
  for(const row of pending){
   const started=await startAssessmentRunExecution({executionId:row.id,actorUserId:row.userId});if(started.state!=='STARTED')throw Error('retained pending scale START failed')
   const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:started.runtimeBindingRef}}),runtime=decryptFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted!)
   await submitScaleAssessmentFinal({assessmentId:child.id,submissionId:randomUUID(),attemptEpoch:child.attemptEpoch,definitionHash:runtime.legacyDefinitionHash,userId:row.userId,compositeAttemptId:started.runtimeBindingRef,answers:[{itemCode:'Q1',responseValue:'option_3'}]})
   await finalizeCompositeAttemptIfReady(started.runtimeBindingRef)
  }
  const [run]=await db.$queryRaw<Array<{status:string}>>`SELECT status FROM assessment_runs WHERE id=${f.runId}`
  if(run.status!=='CLOSED')await closeTeacherRun(f.scope)
  const event=await db.huiteacherEvaluationEvent.findUniqueOrThrow({where:{id:f.scope.eventId}})
  if(event.status!=='CLOSED')await transitionHuiteacherEvent({...f.scope,action:'CLOSE',expectedVersion:event.version})
  let index=await listTeacherNumericGroups(f.scope,{configure:true})
  const choice=index.sources[0];expect(choice).toBeTruthy();expect(choice.tools).toHaveLength(1)
  const [resource]=await db.$queryRaw<Array<{entry:any;definition_hash:string}>>`SELECT entry,definition_hash FROM registered_assessment_resources WHERE id=${f.groupId}`
  const [oldSpec]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM reporting_analysis_specs WHERE spec_key LIKE ${'teacher-numeric-'+kind+'-%'} AND status='PUBLISHED' ORDER BY created_at DESC,id DESC LIMIT 1`
  const spec=oldSpec??await createPlatformReportingSpec({actor:f.actor,specKey:'teacher-numeric-'+kind+'-'+randomUUID(),version:1,definition:descriptiveReportingDefinition({...resource.entry,definitionHash:resource.definition_hash},'GROUP',10)})
  if(!oldSpec){await reviewPlatformReportingSpec({actor:await independentReviewer(f.actor),specId:spec.id});await publishPlatformReportingSpec({actor:f.actor,specId:spec.id})}
  const input={...f.scope,trackId:choice.trackId,leaf:choice.tools[0].leaf,specId:spec.id,selection:{kind:'ALL' as const}}
  const generated=await generateTeacherNumericGroup(input)
  expect(generated.projection).toMatchObject({completedN:10,countUnit:'PERSON',metrics:[{key:'support',state:'present',validN:10,missingN:0,mean:3,sdSample:0}]})
  let materializations=0;setReportingPayloadMaterializationObserverForTests(()=>{materializations++})
  const reopened=await readTeacherNumericGroup({...f.scope,artifactId:generated.artifactId});setReportingPayloadMaterializationObserverForTests(null)
  expect(reopened).toEqual(generated);expect(materializations).toBe(0)
  const after=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:originalParent.id}})
  expect(after.attemptEpoch).toBe(originalParent.attemptEpoch);expect(after.updatedAt).toEqual(originalParent.updatedAt)
  await expect(readTeacherNumericGroup({...f.scope,actorUserId:f.users[1],artifactId:generated.artifactId})).rejects.toMatchObject({statusCode:404})
  await expect(generateOrganizationGroupAnalysis({principal:{userId:f.scope.actorUserId,platformRole:'STANDARD'},organizationId:f.scope.organizationId,runId:f.runId,trackId:choice.trackId,specId:spec.id,leaf:choice.tools[0].leaf})).rejects.toMatchObject({statusCode:404})
  index=await listTeacherNumericGroups(f.scope);expect(index.versions.some(v=>v.artifactId===generated.artifactId)).toBe(true)
  await writeFile('/tmp/teacher-numeric-group-consumer/'+kind+'-proof.json',JSON.stringify({passed:true,kind,productionAccessed:false,scope:f.scope,artifactId:generated.artifactId,retainedFinal:f.completedExecutionId,newCompletedFinals:pending.length,completedN:10,mean:3,sdSample:0,readPayloadMaterializations:materializations,ordinaryTeacherDenied:true,genericRouteCannotBypassTeacherDisclosure:true},null,2))
 },120000)
 it('matches existing original and library disclosures by immutable C rather than their different parent keys',async()=>{
  const f=JSON.parse(await readFile('/tmp/library-self-group-release/source.json','utf8'))
  const proof=JSON.parse(await readFile('/tmp/teacher-numeric-group-consumer/library-proof.json','utf8'))
  const a=await readReportingArtifactRecord(proof.artifactId)
  if(a.analysisKind!=='GROUP'||a.artifactPayload.schemaVersion!==2)throw Error('retained V2 GROUP artifact required')
  const cohort=await readReportingCohort(a.cohortSnapshotId!)
  const spec=await getPublishedReportingSpec(a.specId)
  if(spec.definition.analysisKind!=='GROUP')throw Error('GROUP spec required')
  const compared=await assertTeacherNumericDisclosure({organizationId:f.scope.organizationId,cohort,leaf:a.artifactPayload.source.leaf,minimumN:10,payload:a.artifactPayload,metricRules:spec.definition.metricRules})
  expect(compared!.comparedArtifacts).toBeGreaterThanOrEqual(2)
  expect(compared!.measurementHash).toMatch(/^[a-f0-9]{64}$/)
  await writeFile('/tmp/teacher-numeric-group-consumer/comparable-C-proof.json',JSON.stringify({passed:true,onlyExistingMetadataRead:true,comparedArtifacts:compared!.comparedArtifacts,measurementHash:compared!.measurementHash,noFinalReplay:true},null,2))
 },30000)

})
