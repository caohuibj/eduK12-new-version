/** PR-6 business decision: an emergency stop blocks NEW collection, while an
 * attempt that already started may load its frozen definition and finish. */
import {randomUUID} from 'node:crypto'
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createReportOutboxFixture} from './report-outbox-fixture'
import * as composite from '../../modules/composite/composite.service'
import * as whole from '../../modules/composite/whole-questionnaire.service'
import {stopCollection} from '../../modules/scale-library-governance/service'
import {assertTrainingScaleCollectionAllowed} from '../../modules/scale/scale-collection-guard'
const url=integrationDatabaseUrl('TRAINING_PARTICIPATION_TEST_DATABASE_URL')
const suite=url?describe:describe.skip
suite('emergency stop vs started attempts (real isolated PostgreSQL)',()=>{
 beforeAll(()=>{requireIsolatedReleaseDatabase(url!);process.env.DATA_ENCRYPTION_KEY='45'.repeat(32);process.env.DATA_PSEUDONYM_KEY='56'.repeat(32)})
 afterEach(()=>vi.unstubAllEnvs())
 it('blocks new collection after stop, but the started attempt loads its definition and whole FINAL once',async()=>{
  for(const key of ['ASSESSMENT_REPORT_ASYNC_ENABLED','ASSESSMENT_WHOLE_SUBMIT_ENABLED'])vi.stubEnv(key,'true')
  vi.stubEnv('ASSESSMENT_REPORT_ASYNC_COURSE_IDS','')
  const f=await createReportOutboxFixture(prisma,2)
  const admin=await prisma.user.create({data:{username:'stop-admin-'+randomUUID().slice(0,8),passwordHash:'synthetic-unused',role:'ADMIN',platformRole:'SYSTEM_ADMIN'} as any})
  const principal={userId:f.participant.id}
  // Stop arrives after the attempt started (fixture == materialized START).
  await prisma.$transaction(tx=>stopCollection(tx as any,admin.id,'TRAINING_SCALE',f.scaleIds[0],'Synthetic PR-6 stop'))
  // New collection is still refused by the START guard.
  await expect(prisma.$transaction(tx=>assertTrainingScaleCollectionAllowed(tx,f.scaleIds,{sourceOwnerId:f.owner.id}))).rejects.toThrow('紧急停用')
  const other=await prisma.user.create({data:{username:'stop-late-'+randomUUID().slice(0,8),passwordHash:'synthetic-unused',role:'STUDENT'}})
  await expect(composite.startUserAttempt(other.id,f.composite.id)).rejects.toThrow()
  expect(await prisma.compositeAssessmentAttempt.count({where:{userId:other.id}})).toBe(0)
  // The started attempt finishes against frozen content.
  const definition=await whole.getWholeQuestionnaireDefinition(f.parent.id,principal as any)
  expect(definition.units).toHaveLength(2)
  const input={submissionId:randomUUID(),attemptEpoch:1,slotSetHash:definition.slotSetHash!,contextSnapshotHash:definition.contextSnapshotHash,units:definition.units.map(unit=>({itemId:unit.itemId,definitionHash:unit.definitionHash,answers:f.inputs.find(x=>x.assessmentId===unit.scaleAssessmentId)!.answers}))}
  const first=await whole.submitWholeQuestionnaire(f.parent.id,input,principal as any)
  expect(first).toMatchObject({status:'ACCEPTED'})
  // Replay returns the same acceptance and does not enqueue/deduct twice.
  const replay=await whole.submitWholeQuestionnaire(f.parent.id,input,principal as any)
  expect(replay).toMatchObject({status:'ACCEPTED'})
  expect(await prisma.compositeReportJob.count({where:{attemptId:f.parent.id}})).toBe(1)
  expect((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:f.parent.id}})).id).toBe(f.parent.id)
 },30000)
})
