import {describe,it,expect,vi,beforeEach} from 'vitest'
const mocks=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn(),flow:vi.fn(),bind:vi.fn(),claim:vi.fn(),person:vi.fn(),attempt:vi.fn(),consent:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/survey/flow.assignment',()=>({allocateResearchFlowOnAdmission:mocks.flow}))
vi.mock('../../modules/survey/content-binding.service',()=>({bindSurveyAttemptContent:mocks.bind}))
import {createLinkedResearchIdentity} from '../../modules/survey/identity.service'
const input={projectId:'project',waveId:'wave',entryToken:'a'.repeat(43),consentVersion:1,consent:true}
const tx={$queryRaw:mocks.query,surveyWave:{updateMany:mocks.claim},surveyParticipant:{create:mocks.person},surveyWaveAttempt:{create:mocks.attempt},surveyConsent:{create:mocks.consent}}
beforeEach(()=>{
 vi.clearAllMocks();mocks.transaction.mockImplementation(async fn=>fn(tx));mocks.claim.mockResolvedValue({count:1});mocks.bind.mockResolvedValue(undefined)
 mocks.query.mockResolvedValueOnce([{id:'project',collectionMode:'LINKED_WAVES'}]).mockResolvedValueOnce([{waveId:'wave',ordinal:1,allowNewParticipants:true,consentVersion:1,startsCount:0,quotaStarts:null,publicationId:'pub',groupIpPolicy:null,closesAt:null}])
})
describe('first linked enrollment is a real START binding boundary',()=>{
 it('binds its newly created attempt in the same transaction after flow assignment',async()=>{
  const result=await createLinkedResearchIdentity(input)
  expect(mocks.bind).toHaveBeenCalledWith(tx,{projectId:'project',waveId:'wave',attemptId:result.attemptId,publicationId:'pub',newAttempt:true})
  expect(mocks.attempt.mock.calls[0][0].data.id).toBe(result.attemptId)
  expect(mocks.flow.mock.invocationCallOrder[0]).toBeLessThan(mocks.bind.mock.invocationCallOrder[0])
  expect(mocks.consent.mock.invocationCallOrder[0]).toBeLessThan(mocks.bind.mock.invocationCallOrder[0])
  expect(mocks.transaction).toHaveBeenCalledTimes(1)
 })
 it('propagates binding failure out of the transaction and does not return an unbound identity',async()=>{
  const failure=new Error('REVOKED measurement');mocks.bind.mockRejectedValue(failure)
  await expect(createLinkedResearchIdentity(input)).rejects.toBe(failure)
  expect(mocks.claim).toHaveBeenCalledTimes(1);expect(mocks.person).toHaveBeenCalledTimes(1)
  expect(mocks.bind.mock.calls[0][1].newAttempt).toBe(true)
 })
 it('does not allocate or bind before consent is accepted',async()=>{
  await expect(createLinkedResearchIdentity({...input,consent:false})).rejects.toMatchObject({statusCode:403})
  expect(mocks.transaction).not.toHaveBeenCalled();expect(mocks.bind).not.toHaveBeenCalled()
 })
})
