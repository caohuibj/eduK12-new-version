/** Saved-source compatibility only, including after native Bundle consumers
 * change. Never repeat START/FINAL. The source has student-only disclosure. */
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {writeFile} from 'node:fs/promises'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_SELECTED_LIFECYCLE_READBACK==='1'?describe:describe.skip
suite('retained education exact-use completion and original report audience',()=>{
 let db:any
 const phases:Array<{phase:string;milliseconds:number}>=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Retained local lifecycle fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_lifecycle_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated known fixture required')
  db=(await import('../../config/database')).prisma
  expect(await db.compositeAssessmentAttempt.count()).toBe(2)
  const start=performance.now()
  await Promise.all([import('../../modules/education-tools/private-tool.composition-contracts'),import('../../modules/assessment-run/educationCompositionExecution'),
   import('../../modules/reporting/education-ordinary-feedback.service'),import('../../modules/education-tools/private-tool.service')])
  phases.push({phase:'saved-reader-module-initialization',milliseconds:performance.now()-start})
 },60000)
 afterAll(async()=>{
  if(process.env.PRECISE_MAIN_READBACK_PHASES)await writeFile(process.env.PRECISE_MAIN_READBACK_PHASES,JSON.stringify({phases},null,2)+'\n')
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it.each(['SCHOOL','TEACHER'] as const)('%s retains the completed source and report audience after use withdrawal',async product=>{
  const start=performance.now()
  const versions=await db.educationPrivateToolVersion.findMany({where:{entry:product,title:{startsWith:'Synthetic exact '+product+' '}},orderBy:{title:'asc'}})
  expect(versions).toHaveLength(2)
  const selected=versions[0].definition.blocks[0].source.selectedBinding
  const {educationCompositionKey}=await import('../../modules/education-tools/private-tool.composition-contracts')
  const origin={schemaVersion:1 as const,adapterVersion:'1.0.0' as const,mode:'COMPOSITION' as const,entry:product,
   organizationId:versions[0].organizationId,ownerUserId:versions[0].ownerUserId,toolId:versions[0].toolId,versionId:versions[0].id,
   contentHash:versions[0].contentHash,variantKey:product==='SCHOOL'?'STUDENT:SELF' as const:'TEACHER:SELF' as const}
  const key=educationCompositionKey(origin)
  const [execution]=await db.$queryRaw`SELECT e.id,e.status,e.runtime_binding_ref AS attempt FROM assessment_run_executions e JOIN assessment_run_tracks t ON t.id=e.track_id WHERE t.resource_key=${key}`
  expect(execution.status).toBe('COMPLETED')
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:execution.attempt}})
  expect(parent.status).toBe('COMPLETED');expect(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:parent.id}})).toBe(2)
  expect((await db.contentCapabilityGrant.findUniqueOrThrow({where:{id:selected.authorizationId}})).revokedAt).not.toBeNull()
  const {readCompositionExecutionSource}=await import('../../modules/assessment-run/educationCompositionExecution')
  const checked=await db.$transaction((tx:any)=>readCompositionExecutionSource(tx,{executionId:execution.id,actorUserId:parent.userId}))
  expect([...checked.identity.selectedBindings.values()]).toEqual([[selected]])
  const readers=await import('../../modules/reporting/education-ordinary-feedback.service')
  const feedback=await (product==='SCHOOL'?readers.readSchoolOrdinaryFeedback:readers.readTeacherOrdinaryFeedback)({executionId:execution.id,actorUserId:parent.userId})
  expect(feedback.state).toBe(product==='SCHOOL'?'READY':'COMPLETION_ONLY');expect(feedback.units).toHaveLength(1);expect(feedback.units[0].state).toBe(product==='SCHOOL'?'READY':'WITHHELD')
  if(product==='TEACHER')expect(feedback.units[0]).not.toHaveProperty('declaredReport')
  const historical=await (await import('../../modules/education-tools/private-tool.service')).readPrivateToolVersion({entry:product,organizationId:origin.organizationId,
   principal:{userId:origin.ownerUserId,accountDomain:'SCHOOL'}},origin.toolId,origin.versionId)
  expect((historical.definition as any).blocks[0].source.selectedBinding).toEqual(selected)
  const pendingKey=key.replace(versions[0].id,versions[1].id),waiting=await db.compositeAssessment.findUniqueOrThrow({where:{creationKey:pendingKey}})
  expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:waiting.id}})).toBe(0)
  phases.push({phase:product+'-saved-source-and-feedback',milliseconds:performance.now()-start})
 },30000)
})
