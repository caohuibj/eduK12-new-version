import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({transaction:vi.fn(),prepare:vi.fn(),validate:vi.fn(),publish:vi.fn(),actor:vi.fn(),recheck:vi.fn(),authority:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/measurement-content/admin-authority.service',()=>({lockCurrentContentSystemActor:mocks.actor,recheckContentSystemActorAfterWait:mocks.recheck}))
vi.mock('../../modules/measurement-content/content-authority.repository',()=>({assertContentAuthority:mocks.authority}))
vi.mock('../../modules/situational/static-measurement-release',async original=>({...await original<any>(),ensureStaticSjtRegistryMapping:mocks.prepare,validateStaticSjtRegistryMapping:mocks.validate,publishStaticSjtMeasurement:mocks.publish}))
import {prepareAdminStaticSjtMapping,publishAdminStaticSjtMeasurement} from '../../modules/situational/static-measurement-admin.service'
const mappingId='11111111-1111-4111-8111-111111111111',grantId='22222222-2222-4222-8222-222222222222'
const identity={instrumentKey:'sjt-assertiveness-golden',instrumentVersion:'1.0.0'},proof={tokenVersion:1,adminSessionId:'session',adminVerifiedAt:123}
const input={mappingId,grantId,deployment:{locale:'zh-CN',territory:'CN'}}
const tx={},users=[{id:'actor'}]
beforeEach(()=>{
 vi.clearAllMocks();mocks.transaction.mockImplementation(async fn=>fn(tx));mocks.actor.mockResolvedValue({users});mocks.recheck.mockResolvedValue(undefined);mocks.authority.mockResolvedValue({grantId,version:1})
 mocks.prepare.mockResolvedValue({id:mappingId,content_digest:'a'.repeat(64),measurement_release_id:null})
 mocks.publish.mockResolvedValue({mapping:{id:mappingId},release:{releaseId:'release',contentHash:'a'.repeat(64),status:'PUBLISHED'}})
})
describe('static SJT strongly authenticated explicit publication',()=>{
 it('prepares a source mapping with current system proof but creates no implicit capability/release',async()=>{
  expect(await prepareAdminStaticSjtMapping('actor',proof,identity)).toEqual({mappingId,...identity,contentDigest:'a'.repeat(64),measurementReleaseId:null})
  expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.actor.mock.invocationCallOrder[0])
  expect(mocks.actor).toHaveBeenCalledWith(tx,'actor',proof);expect(mocks.publish).not.toHaveBeenCalled();expect(mocks.authority).not.toHaveBeenCalled()
 })
 it('requires exact independent publication capability after source locks and rechecks after waits',async()=>{
  await publishAdminStaticSjtMeasurement('actor',proof,input)
  expect(mocks.validate).toHaveBeenCalledWith(tx,mappingId,'PUBLISH')
  expect(mocks.validate.mock.invocationCallOrder[0]).toBeLessThan(mocks.actor.mock.invocationCallOrder[0])
  expect(mocks.actor.mock.invocationCallOrder[0]).toBeLessThan(mocks.authority.mock.invocationCallOrder[0])
  expect(mocks.authority).toHaveBeenCalledTimes(2)
  expect(mocks.authority).toHaveBeenCalledWith(tx,{actorId:'actor',grantId,capability:'measurement.publish',scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:'situational-registry',resourceKind:'measurement',resourceKeys:[mappingId]}})
  expect(mocks.publish.mock.invocationCallOrder[0]).toBeLessThan(mocks.authority.mock.invocationCallOrder[1])
  expect(mocks.recheck).toHaveBeenCalledWith(tx,proof,users)
 })
 it('rejects actor injection, missing grant and invalid mapping before transaction',async()=>{
  for(const body of [{...input,actorId:'other'},{...input,grantId:undefined},{...input,mappingId:'wildcard'}])await expect(publishAdminStaticSjtMeasurement('actor',proof,body)).rejects.toThrow()
  expect(mocks.transaction).not.toHaveBeenCalled()
 })
 it('does not publish on missing current system or capability and rolls back on post-wait expiry',async()=>{
  mocks.actor.mockRejectedValueOnce(new Error('SYSTEM_DENIED'));await expect(publishAdminStaticSjtMeasurement('actor',proof,input)).rejects.toThrow('SYSTEM_DENIED');expect(mocks.publish).not.toHaveBeenCalled()
  mocks.authority.mockRejectedValueOnce(new Error('GRANT_DENIED'));await expect(publishAdminStaticSjtMeasurement('actor',proof,input)).rejects.toThrow('GRANT_DENIED');expect(mocks.publish).not.toHaveBeenCalled()
  mocks.recheck.mockRejectedValueOnce(new Error('EXPIRED'));await expect(publishAdminStaticSjtMeasurement('actor',proof,input)).rejects.toThrow('EXPIRED')
 })
})
