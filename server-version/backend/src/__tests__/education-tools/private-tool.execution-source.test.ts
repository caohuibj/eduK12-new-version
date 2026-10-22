import {Prisma} from '@prisma/client'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {privateScaleResourceEntry} from '../../modules/education-tools/private-tool.runtime-policy'
import {privateScaleResourceKey,type PrivateScaleRuntimeOrigin} from '../../modules/education-tools/private-tool.runtime-origin'
const m=vi.hoisted(()=>({private:vi.fn(),library:vi.fn(),collection:vi.fn()}))
vi.mock('../../modules/education-tools/private-tool.runtime-resources',()=>({readPrivateScaleRuntimeResource:m.private}))
vi.mock('../../modules/scale-library-governance/education-runtime-resources',()=>({readEducationLibraryRegisteredSource:m.library}))
vi.mock('../../modules/scale-library-governance/collection-guard',()=>({assertScaleLibraryCollectionAllowed:m.collection}))
import {readEducationScaleExecutionSource} from '../../modules/assessment-run/educationScaleExecutionSource'
import {assertEducationLibraryExecutionSource} from '../../modules/assessment-run/educationLibraryExecution'
import {relationalEntryToRunPolicy} from '../../modules/assessment-run/resourceAuthority'
const definition=compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic',required:true,reverse:false,dimensionKeys:['total']}]})
const origin:PrivateScaleRuntimeOrigin={schemaVersion:1,adapterVersion:'1.0.0',kind:'AUTHOR_PRIVATE',entry:'SCHOOL',organizationId:randomUUID(),ownerUserId:randomUUID(),toolId:randomUUID(),versionId:randomUUID(),contentHash:'a'.repeat(64),definitionHash:'b'.repeat(64),releaseId:randomUUID(),releaseHash:'c'.repeat(64),variantKey:'STUDENT:SELF'}
const entry=privateScaleResourceEntry(origin,'Synthetic',definition,'composite')
const fixed={origin,scaleId:'scale',compositeId:'composite',compositeItemId:'item',sourceDefinitionHash:canonicalHash(definition),resourceEntry:entry,identityOnly:true,canPublish:false}
const input={product:'SCHOOL' as const,organizationId:origin.organizationId,resourceKey:privateScaleResourceKey(origin),resourceVersion:'1.0.0',purpose:'EXISTING_EXECUTION' as const}
const db={} as Prisma.TransactionClient
beforeEach(()=>{vi.resetAllMocks();m.private.mockResolvedValue(fixed);m.collection.mockResolvedValue(undefined)})
describe('author-private immutable runtime source is not author permission',()=>{
 it('keeps private provenance, fixed item/full source and task-only collection check',async()=>{
  const result=await readEducationScaleExecutionSource(db,input)
  expect(result).toMatchObject({sourceKind:'AUTHOR_PRIVATE',origin,sourceDefinitionHash:canonicalHash(definition),compositeItemId:'item',identityOnly:true,variantKey:'STUDENT:SELF'})
  expect(result).not.toHaveProperty('approvedSnapshotHash')
  expect(m.private).toHaveBeenCalledWith(db,{key:input.resourceKey,version:'1.0.0',purpose:'EXISTING_EXECUTION'})
  expect(m.collection).toHaveBeenCalledWith(db,[origin.releaseId],['scale'])
  expect(m.library).not.toHaveBeenCalled()
 })
 it('HISTORY does not require current authoring permission or collection permission',async()=>{
  await readEducationScaleExecutionSource(db,{...input,purpose:'HISTORY'})
  expect(m.private).toHaveBeenCalledWith(db,{key:input.resourceKey,version:'1.0.0',purpose:'HISTORY'})
  expect(m.collection).not.toHaveBeenCalled()
 })
 it('rejects another tenant or product before returning private content identity',async()=>{
  for(const wrong of [{...input,organizationId:randomUUID()},{...input,product:'TEACHER' as const}])
   await expect(readEducationScaleExecutionSource(db,wrong)).rejects.toMatchObject({code:'PRIVATE_TOOL_RUNTIME_EXECUTION_SCOPE_MISMATCH'})
  expect(m.collection).not.toHaveBeenCalled()
 })
 it('propagates emergency collection denial, retaining history identity',async()=>{
  m.collection.mockRejectedValue(new Error('SYNTHETIC_STOP_COLLECTION'))
  await expect(readEducationScaleExecutionSource(db,input)).rejects.toThrow('SYNTHETIC_STOP_COLLECTION')
  expect((await readEducationScaleExecutionSource(db,{...input,purpose:'HISTORY'})).sourceKind).toBe('AUTHOR_PRIVATE')
 })
 it('does not send arbitrary legacy references or adapter versions to the private reader',async()=>{
  for(const wrong of [{...input,resourceKey:'teacher-scale:legacy:INDIVIDUAL'},{...input,resourceVersion:'9.0.0'}])
   await expect(readEducationScaleExecutionSource(db,wrong)).rejects.toMatchObject({code:'PRIVATE_TOOL_RUNTIME_RESOURCE_INVALID'})
  expect(m.private).not.toHaveBeenCalled()
 })
 it('keeps public-source purpose and provenance unchanged',async()=>{
  m.library.mockResolvedValue({origin:{entryId:'library'},compositeId:'public'})
  expect((await readEducationScaleExecutionSource(db,{...input,resourceKey:'library-scale:entry:SCHOOL:STUDENT:SELF',purpose:'HISTORY'})).sourceKind).toBe('LIBRARY')
  expect(m.library).toHaveBeenCalledWith(db,{product:'SCHOOL',resourceKey:'library-scale:entry:SCHOOL:STUDENT:SELF',resourceVersion:'1.0.0',purpose:'HISTORY'})
  expect(m.private).not.toHaveBeenCalled();expect(m.collection).not.toHaveBeenCalled()
 })
 it('validates the real compiled private policy against its actual workflow and launch target',async()=>{
  const policy=relationalEntryToRunPolicy(entry)
  const row={organizationId:origin.organizationId,key:policy.key,version:policy.version,policy,policyHash:canonicalHash(policy),school:true,teacher:false,subjectRole:'STUDENT',respondentRole:'STUDENT',relationship:'SELF'}
  const tx={$queryRaw:vi.fn().mockResolvedValue([row])} as unknown as Prisma.TransactionClient
  await assertEducationLibraryExecutionSource(tx,{executionId:'execution',compositeId:'composite'})
  await expect(assertEducationLibraryExecutionSource(tx,{executionId:'execution',compositeId:'other'})).rejects.toThrow('BINDING_MISMATCH')
  const changed={...policy,applicabilityHash:'f'.repeat(64)}
  ;(tx.$queryRaw as any).mockResolvedValue([{...row,policy:changed,policyHash:canonicalHash(changed)}])
  await expect(assertEducationLibraryExecutionSource(tx,{executionId:'execution',compositeId:'composite'})).rejects.toThrow('BINDING_MISMATCH')
 })
})
