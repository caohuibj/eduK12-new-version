import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({actor:vi.fn(),read:vi.fn(),entries:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn({})}}))
vi.mock('../../modules/scale-library-governance/authority',()=>({libraryActor:mocks.actor}))
vi.mock('../../modules/scale/library/standard-catalog-reader',()=>({readStandardScaleLibraryForActor:mocks.read}))
vi.mock('../../modules/scale-library-governance/service',()=>({listEntries:mocks.entries}))
import {readUnifiedCatalog} from '../../modules/scale-library-governance/unified-catalog'
import {buildUnifiedScaleLibraryReadModel} from '../../modules/scale/library/catalog-only-read-model'
import {listScaleInstrumentSources} from '../../modules/scale/onboarding/instrument-registry'
const model=buildUnifiedScaleLibraryReadModel({viewerRole:'ADMIN',locale:'zh-CN',territory:'CN'})
beforeEach(()=>{vi.resetAllMocks();mocks.actor.mockResolvedValue({systemAdmin:true,role:'ADMIN'});mocks.read.mockResolvedValue(model);mocks.entries.mockResolvedValue({list:[],hasMore:false})})
describe('shared Training catalog discovery before pagination',()=>{
 it('finds a registered authored version beyond page one by multiple facets and preserves use-grant checks',async()=>{
  const result=await readUnifiedCatalog('system','TRAINING',{page:1,pageSize:25,keyword:'学生 数学',tags:['value_cost','language:zh-CN']})
  expect(result.list).toHaveLength(1)
  expect(result.list[0].exactVersion).toMatchObject({instrumentKey:'value_cost_mathematics_zh_cn',instrumentVersion:'1.0.0'})
  expect(result.list[0].authorization).toMatchObject({mechanism:'DEPLOYMENT_AND_USE_GRANT',useGrantStatus:'NOT_EVALUATED',requiresRuntimeCheck:true})
  expect(mocks.entries).toHaveBeenCalledWith('system',undefined,{offset:0,limit:24,keyword:'学生 数学',tags:['value_cost','language:zh-CN']},'TRAINING')
  expect(result.hasMore).toBe(false)
 })
 it('passes private-source keywords to the existing visibility-scoped query before its LIMIT',async()=>{
  await readUnifiedCatalog('actor','TRAINING',{page:2,pageSize:25,keyword:'private synthetic',origin:'AUTHORED'})
  expect(mocks.entries).toHaveBeenCalledWith('actor',undefined,{offset:25,limit:25,keyword:'private synthetic'},'TRAINING')
  expect(mocks.read).toHaveBeenCalledTimes(1)
 })
 it('keeps tagged authored versions in the existing permission-scoped page',async()=>{
  mocks.entries.mockResolvedValue({list:[{id:'own-entry',releaseId:'exact-release',metadata:{title:'自编量表'},status:'ACTIVE',supportedEntrypoints:['TRAINING'],compatibilityReasons:{},classificationTags:[{id:'population:teacher',label:'教师',facet:'population'}]}],hasMore:false})
  const result=await readUnifiedCatalog('system','TRAINING',{page:2,pageSize:25,origin:'AUTHORED',tags:['population:teacher']})
  expect(mocks.entries).toHaveBeenCalledWith('system',undefined,{offset:25,limit:25,tags:['population:teacher']},'TRAINING')
  expect(result.list[0]).toMatchObject({origin:'AUTHORED',exactVersion:{entryId:'own-entry',releaseId:'exact-release'},classificationTags:[{id:'population:teacher',label:'教师',facet:'population'}],authorization:{mechanism:'LIBRARY_USE_GRANT',requiresRuntimeCheck:true,useGrantStatus:'NOT_EVALUATED'}})
 })
 it('keeps registered origin independent of authorship and does not broaden an unknown tag',async()=>{
  const expected=listScaleInstrumentSources().filter(source=>source.catalog.construct.constructOverlapTags.includes('student_self_report'))
   .map(source=>`${source.identity.instrumentKey}:${source.identity.instrumentVersion}`).sort()
  expect(expected.length).toBeGreaterThan(25)
  const identities:string[]=[]
  for(let page=1;page<=Math.ceil(expected.length/25)+1;page++){
   const result=await readUnifiedCatalog('system','TRAINING',{page,pageSize:25,origin:'STANDARD_REGISTRY',tags:['student_self_report']})
   expect(result.list).toHaveLength(Math.max(0,Math.min(25,expected.length-(page-1)*25)))
   expect(result.hasMore).toBe(page*25<expected.length)
   for(const row of result.list){
    expect(row.origin).toBe('STANDARD_REGISTRY')
    if(row.exactVersion.origin==='STANDARD_REGISTRY')identities.push(`${row.exactVersion.instrumentKey}:${row.exactVersion.instrumentVersion}`)
   }
  }
  expect(identities.slice().sort()).toEqual(expected)
  expect(new Set(identities).size).toBe(expected.length)
  expect(mocks.entries).not.toHaveBeenCalled()
  expect((await readUnifiedCatalog('system','TRAINING',{page:1,pageSize:25,tags:['PUBLIC']})).list).toEqual([])
 })
 it('checks the actor before reading source metadata or private entries',async()=>{
  mocks.actor.mockRejectedValue(new Error('denied'))
  await expect(readUnifiedCatalog('other','TRAINING',{page:1,pageSize:25,keyword:'学生'})).rejects.toThrow('denied')
  expect(mocks.read).not.toHaveBeenCalled();expect(mocks.entries).not.toHaveBeenCalled()
 })
})
