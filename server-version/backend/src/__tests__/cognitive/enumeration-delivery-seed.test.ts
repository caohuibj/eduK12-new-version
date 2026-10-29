import {describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {nativeEnumerationConfigSeed,seedNativeEnumerationConfig} from '../../../prisma/seeds/native-cognitive'
import {getCognitiveTaskResource,assertNativeDeliverySupported} from '../../modules/cognitive/task-resource'
describe('exact enumeration authenticated delivery and immutable seed',()=>{
 it('admits only the complete-recipe tuple to authenticated delivery and keeps unsupported paths closed',()=>{
  const current=getCognitiveTaskResource('enumeration','0.2.0','0.2.0')!,old=getCognitiveTaskResource('enumeration','0.1.0','0.2.0')!
  expect(current.kind).toBe('native');expect(current).toMatchObject({configVersion:'0.3.0'})
  expect(()=>assertNativeDeliverySupported(current,'authenticated')).not.toThrow()
  expect(()=>assertNativeDeliverySupported(old,'authenticated')).toThrow()
  expect(()=>assertNativeDeliverySupported(current,'public')).toThrow()
  expect(()=>assertNativeDeliverySupported(current,'composite' as unknown as Parameters<typeof assertNativeDeliverySupported>[1])).toThrow()
 })
 it('preserves an existing retired recipe configuration and rejects divergent content without update',async()=>{
  const expected=nativeEnumerationConfigSeed(),row={...expected,id:'synthetic-enum-config',status:'RETIRED',publishedAt:new Date('2026-10-26T00:00:00Z'),accessPolicy:{existing:true}}
  const findUnique=vi.fn(async()=>row),create=vi.fn()
  const db={cognitiveTestConfig:{findUnique,create}} as unknown as Parameters<typeof seedNativeEnumerationConfig>[0]
  const found=await seedNativeEnumerationConfig(db)
  expect(found.created).toBe(false);expect(found.config).toBe(row);expect(create).not.toHaveBeenCalled();expect(expected.status).toBe('DRAFT')
  row.config={...expected.config,stimulusRecipe:{...expected.config.stimulusRecipe,formalExposureMs:66 as 50}}
  await expect(seedNativeEnumerationConfig(db)).rejects.toThrow('divergent content');expect(create).not.toHaveBeenCalled()
 })
})
