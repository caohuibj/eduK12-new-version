import {describe,it,expect,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {ids,trainingSourceHarness} from '../measurement-content/training-standard-source.fixture'
import {sealSelectedConfigurationBinding} from '../../modules/assessment-authorization/selected-configuration'
import {standardConfigurationIdentity} from '../../modules/assessment-authorization/standard-configuration-binding'
import {readEducationStandardUseBinding} from '../../modules/assessment-authorization/education-standard-use'
import {educationPublicSourceKey} from '../../modules/education-tools/public-source.identity'
const fixture=()=>{
 const f=trainingSourceHarness(),scope={product:'SCHOOL' as const,organizationId:ids.course},configuration=standardConfigurationIdentity({row:f.h.row,
  measurement:{releaseId:f.h.release.id,contentHash:f.h.release.content_hash}})
 const selectedBinding=sealSelectedConfigurationBinding({product:scope.product,configuration,authorization:{kind:'EDUCATION_SOURCE_USE',id:ids.leaf,
  revision:1,issuerId:ids.issuer,recipientId:ids.owner,organizationId:scope.organizationId,
  authority:[{kind:'ENTRY_ADMIN',id:ids.auth,revision:1},{kind:'CONTENT_DELEGATION',id:ids.root,revision:1}]}})
 const expected={id:ids.leaf,issuerId:ids.issuer,recipientId:ids.owner,scope,resourceKey:educationPublicSourceKey({kind:'STANDARD_SCALE',id:ids.combo,hash:f.h.row.combination_hash})}
 return {selectedBinding,metadata:{schemaVersion:1 as const,selectedBinding,requestIntentHash:'a'.repeat(64),selfGrant:false},expected}
}
describe('education exact use historical identity, separate from current authority',()=>{
 it('reads the original closed identity without accessing a live grant or latest source',()=>{
  const f=fixture();expect(readEducationStandardUseBinding(f.metadata,f.expected)).toEqual(f.selectedBinding)
 })
 it('refuses another school, entry, recipient, issuer, revision or source key',()=>{
  const f=fixture()
  for(const expected of [{...f.expected,scope:{...f.expected.scope,organizationId:ids.composite}},
   {...f.expected,scope:{...f.expected.scope,product:'TEACHER' as const}},{...f.expected,recipientId:ids.system},
   {...f.expected,issuerId:ids.system},{...f.expected,id:ids.material},{...f.expected,resourceKey:f.expected.resourceKey.replace(ids.combo,ids.item)}])
   expect(()=>readEducationStandardUseBinding(f.metadata,expected)).toThrow()
 })
 it('rejects missing or corrupted evidence and a false selfGrant claim rather than downgrading to legacy',()=>{
  const f=fixture()
  for(const metadata of [null,{}, {...f.metadata,selfGrant:true},{...f.metadata,selectedBinding:null},
   {...f.metadata,selectedBinding:{...f.selectedBinding,bindingHash:'f'.repeat(64)}}])
   expect(()=>readEducationStandardUseBinding(metadata,f.expected)).toThrow()
 })
})
