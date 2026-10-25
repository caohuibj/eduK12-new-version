import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({assert:vi.fn(),scale:vi.fn(),deployment:vi.fn(),publication:vi.fn(),history:vi.fn(),online:vi.fn(),policy:vi.fn(),write:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{scale:{findUnique:mocks.scale,update:mocks.write},$queryRaw:mocks.history,$executeRaw:mocks.write}}))
vi.mock('../../modules/survey/standard-triplet.service',()=>({assertStandardSystem:mocks.assert}))
vi.mock('../../modules/scale/onboarding/publish',()=>({planStandardScalePublication:mocks.publication}))
vi.mock('../../modules/scale/deployment/repository',()=>({readActiveScaleDeployment:mocks.deployment}))
vi.mock('../../modules/survey/standard-triplet.catalog',()=>({readOnlineStandardSnapshot:mocks.online}))
vi.mock('../../modules/survey/tool-policy',()=>({readToolPolicy:mocks.policy}))
import {AdminPermissionError} from '../../modules/admin-permissions/service'
import {libraryPreflight,libraryPreflightBatch} from '../../modules/survey/library-preflight.service'
const key='value_cost_mathematics_zh_cn',version='1.0.0'
beforeEach(()=>{
 vi.resetAllMocks();mocks.assert.mockResolvedValue(undefined);mocks.scale.mockResolvedValue(null);mocks.history.mockResolvedValue([])
 mocks.publication.mockResolvedValue({blockers:['SCALE_NOT_INSTALLED','DEPLOYMENT_BINDING_MISSING']})
 mocks.policy.mockResolvedValue({decision:'PENDING',version:0,paused:false,reason:''})
})
describe('read-only staged library preflight',()=>{
 it('distinguishes a registered executable source from installed, approved and assignable records',async()=>{
  const result=await libraryPreflight('admin',key,version)
  expect(result.stages.find(stage=>stage.key==='source')?.state).toBe('COMPLETE')
  expect(result.stages.find(stage=>stage.key==='installation')?.state).toBe('PENDING')
  expect(result.stages.find(stage=>stage.key==='approval')?.state).toBe('PENDING')
  expect(result.stages.find(stage=>stage.key==='assignment')?.state).toBe('BLOCKED')
  expect(result.facts).toMatchObject({authorship:'SELF_AUTHORED',scientificTerritory:'CN',scaleId:null})
  expect(result.targetUseGrant).toBe('NOT_EVALUATED');expect(mocks.write).not.toHaveBeenCalled()
 })
 it('retains a scientific scope blocker separately from trusted authorship before an operator publishes',async()=>{
  mocks.scale.mockResolvedValue({id:'synthetic',instrumentVersion:version,status:'DRAFT',visibility:'HIDDEN'})
  mocks.deployment.mockResolvedValue({revision:1,policy:{territory:'ZZ'}})
  mocks.publication.mockResolvedValue({blockers:['SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH']})
  const result=await libraryPreflight('admin',key,version)
  expect(result.facts.authorship).toBe('SELF_AUTHORED')
  expect(result.stages.find(stage=>stage.key==='installation')).toMatchObject({state:'BLOCKED',reasons:['SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH']})
  expect(result.stages.find(stage=>stage.key==='publication')?.reasons).toEqual(['SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH'])
  expect(mocks.write).not.toHaveBeenCalled()
 })
 it('does not mistake an ONLINE record for current assignment authority or target-user permission',async()=>{
  mocks.history.mockResolvedValue([{id:'exact',state:'ONLINE',combination_hash:'hash'}])
  mocks.online.mockResolvedValue({});mocks.policy.mockResolvedValue({decision:'APPROVED',paused:true,reason:'synthetic pause'})
  const result=await libraryPreflight('admin',key,version)
  expect(result.stages.find(stage=>stage.key==='approval')?.state).toBe('COMPLETE')
  expect(result.stages.find(stage=>stage.key==='assignment')).toMatchObject({state:'BLOCKED',reasons:['Survey 新增分配和投放已暂停：synthetic pause']})
  expect(result.targetUseGrant).toBe('NOT_EVALUATED')
 })
 it('checks role first and limits exact batch identities before reading any tool',async()=>{
  mocks.assert.mockRejectedValue(new AdminPermissionError(403,'denied'))
  await expect(libraryPreflight('other',key,version)).rejects.toMatchObject({statusCode:403})
  expect(mocks.scale).not.toHaveBeenCalled()
  mocks.assert.mockResolvedValue(undefined)
  await expect(libraryPreflightBatch('admin',Array.from({length:11},(_,i)=>({instrumentKey:String(i),instrumentVersion:version})))).rejects.toMatchObject({statusCode:400})
  await expect(libraryPreflightBatch('admin',[{instrumentKey:key,instrumentVersion:version},{instrumentKey:key,instrumentVersion:version}])).rejects.toMatchObject({statusCode:400})
  expect(mocks.scale).not.toHaveBeenCalled()
 })
 it('isolates a failed exact item and never automatically applies the successful item',async()=>{
  const batch=await libraryPreflightBatch('admin',[{instrumentKey:'unknown_synthetic_tool',instrumentVersion:version},{instrumentKey:key,instrumentVersion:version}])
  expect(batch.results.map(item=>item.status)).toEqual(['FAILED','CHECKED'])
  expect(batch.writes).toBe(0);expect(mocks.write).not.toHaveBeenCalled()
 })
})
