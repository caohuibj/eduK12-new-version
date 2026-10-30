import {describe,it,expect,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {ids,trainingSourceHarness} from '../measurement-content/training-standard-source.fixture'
import {sealTrainingStandardUseConfiguration,readTrainingStandardUseConfiguration,selectedConfigurationPointer} from '../../modules/assessment-authorization/standard-configuration-binding'
import {freezeTrainingStandardReference,decodeTrainingStandardItemSource} from '../../modules/composite/training-standard-combination'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const setup=()=>{
 const f=trainingSourceHarness(),source={row:f.h.row,measurement:{releaseId:f.h.release.id,contentHash:f.h.release.content_hash}} as any
 const authority={useGrantId:ids.leaf,useGrantVersion:1,issuerId:ids.issuer,authorityGrantId:ids.root}
 const sealed=sealTrainingStandardUseConfiguration(source,ids.owner,authority,1)
 return {...f,source,authority,sealed}
}
describe('existing exact use revision to shared selectedBinding',()=>{
 it('keeps old missing T1 records explicitly legacy rather than inferring a binding from current content',async()=>{
  const f=setup();expect(await readTrainingStandardUseConfiguration(f.db,f.source,ids.owner,f.authority)).toBeNull()
 })
 it('reads the exact stored revision and returns only a lightweight pointer for the existing draft reference',async()=>{
  const f=setup();f.h.t1Records=[{selected:f.sealed,actor_id:ids.issuer}]
  expect(await readTrainingStandardUseConfiguration(f.db,f.source,ids.owner,f.authority)).toEqual(f.sealed)
  expect(selectedConfigurationPointer(f.sealed)).toEqual({bindingHash:f.sealed.bindingHash,configurationHash:f.sealed.binding.configurationHash,
   authorizationId:ids.leaf,authorizationRevision:1})
  expect(JSON.stringify(selectedConfigurationPointer(f.sealed))).not.toContain('interpretations')
 })
 it('reconstructs the frozen pointer from its original C/P/R and authority, rejecting recomputed outer hashes with a different binding',async()=>{
  const f=setup();f.h.t1Records=[{selected:f.sealed,actor_id:ids.issuer}]
  const saved=await freezeTrainingStandardReference(f.db,ids.owner,ids.composite,f.input)
  expect(decodeTrainingStandardItemSource(saved).reference.selectedBinding).toEqual(selectedConfigurationPointer(f.sealed))
  for(const field of ['bindingHash','configurationHash','authorizationId','authorizationRevision'] as const){
   const changed=structuredClone(saved)
   Object.assign(changed.reference.selectedBinding!,{[field]:field==='authorizationRevision'?2:field==='authorizationId'?ids.system:'f'.repeat(64)})
   changed.referenceHash=canonicalHash(changed.reference)
   expect(()=>decodeTrainingStandardItemSource(changed)).toThrow('SELECTED_BINDING_MISMATCH')
  }
 })
 it('does not silently downgrade malformed T1 or an issuer/recipient/revision mismatch',async()=>{
  const f=setup()
  for(const row of [{selected:null,actor_id:ids.issuer},{selected:f.sealed,actor_id:ids.system},
   {selected:{...f.sealed,bindingHash:'0'.repeat(64)},actor_id:ids.issuer}]){
   f.h.t1Records=[row];await expect(readTrainingStandardUseConfiguration(f.db,f.source,ids.owner,f.authority)).rejects.toThrow()
  }
  f.h.t1Records=[{selected:f.sealed,actor_id:ids.issuer}]
  await expect(readTrainingStandardUseConfiguration(f.db,f.source,ids.system,f.authority)).rejects.toThrow('INVALID_EVIDENCE')
  await expect(readTrainingStandardUseConfiguration(f.db,f.source,ids.owner,{...f.authority,useGrantVersion:2})).rejects.toThrow('INVALID_EVIDENCE')
 })
 it('rejects conflicting records, another measurement pointer and a replacement authority without consulting latest',async()=>{
  const f=setup();f.h.t1Records=[{selected:f.sealed,actor_id:ids.issuer},{selected:f.sealed,actor_id:ids.issuer}]
  await expect(readTrainingStandardUseConfiguration(f.db,f.source,ids.owner,f.authority)).rejects.toThrow('REVISION_CONFLICT')
  f.h.t1Records=[{selected:f.sealed,actor_id:ids.issuer}]
  await expect(readTrainingStandardUseConfiguration(f.db,{...f.source,measurement:{...f.source.measurement,contentHash:'f'.repeat(64)}},ids.owner,f.authority)).rejects.toThrow('SOURCE_MISMATCH')
  await expect(readTrainingStandardUseConfiguration(f.db,f.source,ids.owner,{...f.authority,authorityGrantId:ids.auth})).rejects.toThrow('AUTHORITY_MISMATCH')
 })
})
