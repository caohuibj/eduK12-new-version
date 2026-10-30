import {describe,it,expect,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {selectedEducationCatalogChoices} from '../../modules/education-tools/selected-source-catalog'
describe('bounded education exact directory authority',()=>{
 const c={entry:'SCHOOL' as const,organizationId:'org',principal:{userId:'recipient',accountDomain:'SCHOOL' as const}}
 it('does not treat an intentionally bounded page of unseen typed grants as a legacy entitlement',async()=>{
  const tx={$queryRaw:vi.fn()} as any
  const result=await selectedEducationCatalogChoices(tx,c,[{key:'key',typedUses:[],legacyUseAvailable:false,typedOverflow:true,catalogReadAt:new Date()}])
  expect(result.overflow).toBe(true);expect(result.choices.get('key')).toEqual([]);expect(tx.$queryRaw).not.toHaveBeenCalled()
 })
 it('detects an oversized authority batch even when its supplied overflow marker is false',async()=>{
  const tx={$queryRaw:vi.fn()} as any
  const typedUses=Array.from({length:129},(_,n)=>({id:'new-'+n,subject_id:'recipient',issuer_id:'manager',resource_keys:['key'],
   version:1,actor_id:'manager',metadata:null,valid_from:'2020-01-01',expires_at:'2090-01-01'}))
  const result=await selectedEducationCatalogChoices(tx,c,[{key:'key',typedUses,legacyUseAvailable:false,typedOverflow:false,catalogReadAt:new Date()}])
  expect(result.overflow).toBe(true);expect(result.choices.get('key')).toEqual([]);expect(tx.$queryRaw).not.toHaveBeenCalled()
 })
})
