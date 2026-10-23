import {randomUUID} from 'node:crypto'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {privateScaleResourceEntry} from '../../modules/education-tools/private-tool.runtime-policy'
import type {PrivateScaleRuntimeOrigin} from '../../modules/education-tools/private-tool.runtime-origin'
import {relationalEntryToRunPolicy} from '../../modules/assessment-run/resourceAuthority'
const m=vi.hoisted(()=>({source:vi.fn()}))
vi.mock('../../modules/assessment-run/educationScaleExecutionSource',()=>({readEducationScaleExecutionSource:m.source}))
import {freezeRunExecutionScientificProvenanceInTransaction} from '../../modules/assessment-run/scientificProvenance'
const definition=compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic',required:true,reverse:false,dimensionKeys:['total']}]})
const origin:PrivateScaleRuntimeOrigin={schemaVersion:1,adapterVersion:'1.0.0',kind:'AUTHOR_PRIVATE',entry:'SCHOOL',organizationId:randomUUID(),ownerUserId:randomUUID(),toolId:randomUUID(),versionId:randomUUID(),contentHash:'a'.repeat(64),definitionHash:'b'.repeat(64),releaseId:randomUUID(),releaseHash:'c'.repeat(64),variantKey:'STUDENT:SELF'}
const entry=privateScaleResourceEntry(origin,'Synthetic',definition,randomUUID()),policy=relationalEntryToRunPolicy(entry)
const row={organizationId:origin.organizationId,school:true,teacher:false,resourceFamily:'SCALE',resourceKey:policy.key,resourceVersion:policy.version,resourcePolicyHash:canonicalHash(policy),frozenResourcePolicy:policy,scientificMaturity:null,scientificProvenance:null,scientificProvenanceHash:null,scientificFrozenAt:null}
function fixture(overrides:Record<string,unknown>={}){
 const current={...row,...overrides}
 const db={$queryRaw:vi.fn().mockResolvedValueOnce([current]).mockResolvedValueOnce([{now:new Date('2026-10-22T00:00:00Z')}]).mockResolvedValueOnce([{scientificMaturity:'PILOT'}])}
 const registry={resolveExact:vi.fn().mockResolvedValue(policy)}
 return {db,registry}
}
beforeEach(()=>{vi.clearAllMocks();m.source.mockResolvedValue({sourceKind:'AUTHOR_PRIVATE',resourceEntry:entry})})
describe('Private execution scientific baseline bypasses no generic security guard',()=>{
 it('uses exact actual task/source and frozen policy to preserve PILOT baseline without author or generic permission',async()=>{
  const f=fixture()
  expect(await freezeRunExecutionScientificProvenanceInTransaction(f.db as any,'execution',f.registry as any)).toMatchObject({scientificMaturity:'PILOT'})
  expect(f.registry.resolveExact).not.toHaveBeenCalled()
  expect(m.source).toHaveBeenCalledExactlyOnceWith(f.db,{product:'SCHOOL',organizationId:origin.organizationId,resourceKey:policy.key,resourceVersion:'1.0.0',purpose:'EXISTING_EXECUTION'})
 })
 it('rejects ambiguous workflow and wrong family before resolving a private resource',async()=>{
  for(const override of [{teacher:true},{school:false},{resourceFamily:'BUNDLE'}]){
   const f=fixture(override)
   await expect(freezeRunExecutionScientificProvenanceInTransaction(f.db as any,'execution',f.registry as any)).rejects.toMatchObject({code:'RUN_PRIVATE_SOURCE_CONTEXT_INVALID'})
   expect(f.db.$queryRaw).toHaveBeenCalledTimes(1)
  }
  expect(m.source).not.toHaveBeenCalled()
 })
 it('rejects changed policy/hash without writing provenance or falling back to generic resolution',async()=>{
  const changed={...policy,scientificMaturity:'RESEARCH_GRADE'}
  for(const override of [{resourcePolicyHash:'f'.repeat(64)},{frozenResourcePolicy:changed,resourcePolicyHash:canonicalHash(changed)}]){
   const f=fixture(override)
   await expect(freezeRunExecutionScientificProvenanceInTransaction(f.db as any,'execution',f.registry as any)).rejects.toMatchObject({code:'RUN_PRIVATE_SOURCE_POLICY_MISMATCH'})
   expect(f.db.$queryRaw).toHaveBeenCalledTimes(1);expect(f.registry.resolveExact).not.toHaveBeenCalled()
  }
 })
 it('preserves nonprivate registry resolution and already-frozen provenance semantics',async()=>{
  const f=fixture({resourceKey:'legacy:scale'})
  await freezeRunExecutionScientificProvenanceInTransaction(f.db as any,'execution',f.registry as any)
  expect(f.registry.resolveExact).toHaveBeenCalledWith({family:'SCALE',key:'legacy:scale',version:'1.0.0'})
  const frozen=fixture({scientificMaturity:'PILOT',scientificProvenance:{schemaVersion:1},scientificProvenanceHash:'fixed',scientificFrozenAt:new Date()})
  expect(await freezeRunExecutionScientificProvenanceInTransaction(frozen.db as any,'execution',frozen.registry as any)).toMatchObject({scientificProvenanceHash:'fixed'})
  expect(frozen.db.$queryRaw).toHaveBeenCalledTimes(1);expect(m.source).not.toHaveBeenCalled()
 })
})
