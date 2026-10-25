import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({actor:vi.fn(),read:vi.fn(),entries:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn({})}}))
vi.mock('../../modules/scale-library-governance/authority',()=>({libraryActor:mocks.actor}))
vi.mock('../../modules/scale/library/standard-catalog-reader',()=>({readStandardScaleLibraryForActor:mocks.read}))
vi.mock('../../modules/scale-library-governance/service',()=>({listEntries:mocks.entries}))
import {readUnifiedCatalog} from '../../modules/scale-library-governance/unified-catalog'
import {buildUnifiedScaleLibraryReadModel} from '../../modules/scale/library/catalog-only-read-model'
const model=buildUnifiedScaleLibraryReadModel({viewerRole:'ADMIN',locale:'zh-CN',territory:'CN'})
beforeEach(()=>{vi.resetAllMocks();mocks.actor.mockResolvedValue({systemAdmin:true,role:'ADMIN'});mocks.read.mockResolvedValue(model);mocks.entries.mockResolvedValue({list:[],hasMore:false})})
describe('shared Training catalog discovery before pagination',()=>{
 it('finds a registered authored version beyond page one by multiple facets and preserves use-grant checks',async()=>{
  const result=await readUnifiedCatalog('system','TRAINING',{page:1,pageSize:25,keyword:'学生 数学',tags:['value_cost','language:zh-CN']})
  expect(result.list).toHaveLength(1)
  expect(result.list[0].exactVersion).toMatchObject({instrumentKey:'value_cost_mathematics_zh_cn',instrumentVersion:'1.0.0'})
  expect(result.list[0].authorization).toMatchObject({mechanism:'DEPLOYMENT_AND_USE_GRANT',useGrantStatus:'NOT_EVALUATED',requiresRuntimeCheck:true})
  expect(mocks.entries).not.toHaveBeenCalled()
  expect(result.hasMore).toBe(false)
 })
 it('passes private-source keywords to the existing visibility-scoped query before its LIMIT',async()=>{
  await readUnifiedCatalog('actor','TRAINING',{page:2,pageSize:25,keyword:'private synthetic',origin:'AUTHORED'})
  expect(mocks.entries).toHaveBeenCalledWith('actor',undefined,{offset:25,limit:25,keyword:'private synthetic'})
  expect(mocks.read).toHaveBeenCalledTimes(1)
 })
 it('keeps registered origin independent of authorship and does not broaden an unknown tag',async()=>{
  const first=await readUnifiedCatalog('system','TRAINING',{page:1,pageSize:25,origin:'STANDARD_REGISTRY',tags:['student_self_report']})
  const second=await readUnifiedCatalog('system','TRAINING',{page:2,pageSize:25,origin:'STANDARD_REGISTRY',tags:['student_self_report']})
  expect(first.list).toHaveLength(25);expect(second.list).toHaveLength(11)
  expect(first.hasMore).toBe(true);expect(second.hasMore).toBe(false)
  expect(first.list.every(row=>row.origin==='STANDARD_REGISTRY')).toBe(true)
  expect((await readUnifiedCatalog('system','TRAINING',{page:1,pageSize:25,tags:['PUBLIC']})).list).toEqual([])
 })
 it('checks the actor before reading source metadata or private entries',async()=>{
  mocks.actor.mockRejectedValue(new Error('denied'))
  await expect(readUnifiedCatalog('other','TRAINING',{page:1,pageSize:25,keyword:'学生'})).rejects.toThrow('denied')
  expect(mocks.read).not.toHaveBeenCalled();expect(mocks.entries).not.toHaveBeenCalled()
 })
})
