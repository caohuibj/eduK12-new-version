import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({findUnique:vi.fn(),selected:vi.fn(),decrypt:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{situationalAttempt:{findUnique:mocks.findUnique}}}))
vi.mock('../../modules/composite/training-variant-child-scope',async()=>({
 ...await vi.importActual('../../modules/composite/training-variant-markers'),
 assertTrainingChildSelected:mocks.selected,
}))
vi.mock('../../modules/assessment-runtime/situational-runtime-snapshot',async()=>({...await vi.importActual('../../modules/assessment-runtime/situational-runtime-snapshot'),decryptFrozenSituationalRuntimeSnapshot:mocks.decrypt}))
import { loadEmbeddedSituationalAttemptRuntime } from '../../modules/situational/situational-runtime.service'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { freezeTrainingPersistenceSnapshot } from '../../modules/composite/training-persistence.policy'
const access={compositeAttemptId:'parent',compositeItemId:'item',compositeSlotKey:'situational:item',recoveryTokenHash:'recovery'}
function row(enabled=true){
 const policy={schemaVersion:1,checkpoint:{enabled:true,ttlHours:24},localCognitive:null}
 const snapshot=enabled?freezeTrainingPersistenceSnapshot({policy,policyHash:canonicalHash(policy),attemptId:'parent',attemptEpoch:1,compositeId:'composite',courseId:'course',publicationIdentity:{compositeId:'composite',courseId:'course',publishedAt:'2026-10-19T00:00:00.000Z'},cutoffs:[]}):null
 return {id:'child',userId:null,participantKey:'anon',compositeAttemptId:'parent',compositeItemId:'item',compositeSlotKey:'situational:item',runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',instrumentKey:'sjt',instrumentVersion:'1',definitionHash:'definition',compiledRuntimeHash:'runtime',scorerKey:'scorer',scoringVersion:'1',frozenAt:new Date('2026-10-19T00:00:00.000Z'),runtimeSnapshotEncrypted:'fixture',compositeAttempt:{id:'parent',userId:null,recoveryTokenHash:'recovery',status:'IN_PROGRESS',attemptEpoch:1,compositeAssessmentId:'composite',deliveryCourseId:'course',trainingPersistenceSnapshot:snapshot,trainingPersistenceSnapshotHash:snapshot?canonicalHash(snapshot):null,frozenActiveSlotSetHash:'slots'}}
}
beforeEach(()=>{vi.clearAllMocks();mocks.selected.mockResolvedValue(undefined);mocks.decrypt.mockReturnValue({instrumentKey:'sjt',instrumentVersion:'1',definitionHash:'definition',compiledRuntimeHash:'runtime',scorerKey:'scorer',scoringVersion:'1',frozenAt:'2026-10-19T00:00:00.000Z'})})
describe('embedded SJT checkpoint metadata',()=>{
 it('uses the existing authorized parent relation without another query',async()=>{
  mocks.findUnique.mockResolvedValue(row())
  const result=await loadEmbeddedSituationalAttemptRuntime('child',access)
  expect(result.trainingPersistence?.attemptId).toBe('parent');expect(result.checkpointDefinitionHash).toBe('slots')
  expect(mocks.findUnique).toHaveBeenCalledTimes(1)
  expect(mocks.findUnique.mock.calls[0][0].select.compositeAttempt.select.trainingPersistenceSnapshot).toBe(true)
 })
 it('leaves legacy disabled attempts without metadata',async()=>{
  mocks.findUnique.mockResolvedValue(row(false))
  expect((await loadEmbeddedSituationalAttemptRuntime('child',access)).trainingPersistence).toBeUndefined()
 })
 it('rejects wrong recovery ownership before projecting metadata',async()=>{
  mocks.findUnique.mockResolvedValue(row())
  await expect(loadEmbeddedSituationalAttemptRuntime('child',{...access,recoveryTokenHash:'wrong'})).rejects.toThrow()
  expect(mocks.decrypt).not.toHaveBeenCalled()
 })
 it('rejects altered frozen policy identity',async()=>{
  const r=row();r.compositeAttempt.trainingPersistenceSnapshotHash='wrong';mocks.findUnique.mockResolvedValue(r)
  await expect(loadEmbeddedSituationalAttemptRuntime('child',access)).rejects.toThrow('Training 草稿冻结身份不匹配')
 })
})
