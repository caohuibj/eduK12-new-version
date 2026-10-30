import {describe,it,expect,vi} from 'vitest'
import {readEducationPublicUse} from '../../modules/education-tools/public-source.catalog'
import {educationPackageKey} from '../../modules/education-tools/package-reference.contracts'
import {adminContentRootRequestSchema} from '../../modules/measurement-content/admin-authority.service'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash='a'.repeat(64)
const c={entry:'SCHOOL' as const,organizationId:id(1),principal:{userId:id(2),accountDomain:'SCHOOL' as const}}
describe('Main package-key merge with exact native profile authority',()=>{
 it('keeps an independently legal whole-package U in the shared reader without manufacturing a typed profile',async()=>{
  const key=educationPackageKey({provider:'NATIVE_RELEASE',versionId:id(3),contentHash:hash}),now=new Date()
  const row={id:id(4),subject_id:c.principal.userId,issuer_id:id(5),product:c.entry,scope_id:c.organizationId,resource_keys:[key],
   valid_from:new Date('2020-01-01'),expires_at:new Date('2099-01-01'),read_at:now,version:1,revoked_at:null,parent_grant_id:null,ancestry:[id(4)],
   capabilities:['material.use'],delegable_capabilities:[],remaining_delegation_depth:0,selected_configuration_actor:null,selected_configuration_metadata:null}
  const tx={$queryRaw:vi.fn(async()=>[row])}
  const result=await readEducationPublicUse(tx as any,c,[key]);expect(result.get(key)).toMatchObject({grantId:row.id,grantVersion:1});expect(result.get(key)).not.toHaveProperty('selectedBinding');expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  await expect(readEducationPublicUse(tx as any,c,['education-package:NATIVE_RELEASE:*:'+hash])).rejects.toMatchObject({code:'PUBLIC_SOURCE_INPUT_INVALID'})
 })
 it('retains main whole-package root syntax while still refusing an untyped exact profile root',()=>{
  const packageKey=educationPackageKey({provider:'NATIVE_RELEASE',versionId:id(3),contentHash:hash})
  const input={requestId:id(4),expectedVersion:0,reason:'Synthetic merge boundary',grant:{subjectId:id(2),scope:{product:'SCHOOL',scopeKind:'ORGANIZATION',scopeId:id(1),resourceKind:'material',resourceKeys:[packageKey]},capabilities:['material.use'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}}
  expect(adminContentRootRequestSchema.safeParse(input).success).toBe(true)
  expect(adminContentRootRequestSchema.safeParse({...input,grant:{...input.grant,scope:{...input.grant.scope,resourceKeys:['education-source:COGNITIVE_PROFILE:'+id(3)+':'+hash]}}}).success).toBe(false)
 })
})
