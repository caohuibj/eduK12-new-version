/** Finish qualification of the retained Teacher result without replaying
 * START/FINAL. The original source declares student-only report disclosure. */
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_SELECTED_LIFECYCLE_READBACK==='1'?describe:describe.skip
suite('retained Teacher exact-use completion and original report audience',()=>{
 let db:any
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Retained local lifecycle fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_lifecycle_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated known fixture required')
  db=(await import('../../config/database')).prisma
  expect(await db.compositeAssessmentAttempt.count()).toBe(2)
 },30000)
 afterAll(async()=>{if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 it('retains the actual completed attempt, refuses report audience expansion and reads the original binding after use withdrawal',async()=>{
  const versions=await db.educationPrivateToolVersion.findMany({where:{entry:'TEACHER',title:{startsWith:'Synthetic exact TEACHER '}},orderBy:{title:'asc'}})
  expect(versions).toHaveLength(2)
  const selected=versions[0].definition.blocks[0].source.selectedBinding
  const {educationCompositionKey}=await import('../../modules/education-tools/private-tool.composition-contracts')
  const origin={schemaVersion:1 as const,adapterVersion:'1.0.0' as const,mode:'COMPOSITION' as const,entry:'TEACHER' as const,
   organizationId:versions[0].organizationId,ownerUserId:versions[0].ownerUserId,toolId:versions[0].toolId,versionId:versions[0].id,
   contentHash:versions[0].contentHash,variantKey:'TEACHER:SELF' as const}
  const key=educationCompositionKey(origin)
  const [execution]=await db.$queryRaw`SELECT e.id,e.status,e.runtime_binding_ref AS attempt FROM assessment_run_executions e JOIN assessment_run_tracks t ON t.id=e.track_id WHERE t.resource_key=${key}`
  expect(execution.status).toBe('COMPLETED')
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:execution.attempt}})
  expect(parent.status).toBe('COMPLETED');expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:parent.id}})).toBe(2)
  expect((await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:selected.authorizationId}})).revokedAt).not.toBeNull()
  const {readCompositionExecutionSource}=await import('../../modules/assessment-run/educationCompositionExecution')
  const checked=await db.$transaction((tx:any)=>readCompositionExecutionSource(tx,{executionId:execution.id,actorUserId:parent.userId}))
  expect([...checked.identity.selectedBindings.values()]).toEqual([[selected]])
  const feedback=await (await import('../../modules/reporting/education-ordinary-feedback.service')).readTeacherOrdinaryFeedback({executionId:execution.id,actorUserId:parent.userId})
  expect(feedback.state).toBe('COMPLETION_ONLY');expect(feedback.units).toHaveLength(1);expect(feedback.units[0].state).toBe('WITHHELD')
  expect(feedback.units[0]).not.toHaveProperty('declaredReport')
  const historical=await (await import('../../modules/education-tools/private-tool.service')).readPrivateToolVersion({entry:'TEACHER',organizationId:origin.organizationId,
   principal:{userId:origin.ownerUserId,accountDomain:'SCHOOL'}},origin.toolId,origin.versionId)
  expect((historical.definition as any).blocks[0].source.selectedBinding).toEqual(selected)
  const pendingKey=key.replace(versions[0].id,versions[1].id),waiting=await db.compositeAssessment.findUniqueOrThrow({where:{creationKey:pendingKey}})
  expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:waiting.id}})).toBe(0)
 },30000)
})
