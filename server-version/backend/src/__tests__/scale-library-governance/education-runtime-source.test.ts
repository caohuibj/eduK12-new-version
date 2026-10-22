import {describe,it,expect} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {educationLibraryRuntimeContext} from '../../modules/scale-library-governance/education-runtime-context'
import {assertEducationLibraryWrapperIdentity,readEducationLibraryFrozenUnitIdentity} from '../../modules/scale-library-governance/education-runtime-source'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const scope={product:'SCHOOL' as const,organizationId:id(1),actorId:id(2)}
const ref={entryId:id(3),releaseId:id(4),contentHash:'a'.repeat(64)}
const context=educationLibraryRuntimeContext(scope,ref,'READ')
const wrapper={id:id(5),code:'library:'+ref.entryId,creatorId:id(6),libraryEntryId:ref.entryId,measurementReleaseId:ref.releaseId}
const unit={itemId:id(7),family:'SCALE',source:{kind:'SCALE',id:wrapper.id,ownerId:wrapper.creatorId,libraryEntryId:ref.entryId},
  measurement:{releaseId:ref.releaseId,contentHash:ref.contentHash,measurementHash:'b'.repeat(64)},
  report:{releaseId:id(9),contentHash:'c'.repeat(64)}}
const snapshot={schemaVersion:1,compositeId:id(8),units:[unit]}
const input={context,wrapper,compositeId:id(8),itemId:id(7),snapshot,snapshotHash:canonicalHash(snapshot)}

describe('education library identity plumbing is not an authorization grant',()=>{
  it('keeps authenticated scope separate from the exact content reference',()=>{
    expect(context).toEqual({...scope,...ref,operation:'READ'})
    expect(()=>educationLibraryRuntimeContext(scope,{...ref,product:'TEACHER'} as typeof ref,'READ')).toThrow()
    expect(()=>educationLibraryRuntimeContext(scope,{...ref,actorId:id(10)} as typeof ref,'READ')).toThrow()
    expect(()=>educationLibraryRuntimeContext(scope,{...ref,contentHash:'latest'},'READ')).toThrow()
  })
  it('does not turn mutation intent into permission or infer a population',()=>{
    const mutation=educationLibraryRuntimeContext({...scope,product:'TEACHER'},ref,'MUTATION')
    expect(mutation).toEqual({...scope,product:'TEACHER',...ref,operation:'MUTATION'})
    expect(mutation).not.toHaveProperty('canPublish')
    expect(mutation).not.toHaveProperty('subjectRoles')
    expect(mutation).not.toHaveProperty('grantId')
  })
  it('requires the actual immutable library wrapper, not an author-owned alias',()=>{
    expect(()=>assertEducationLibraryWrapperIdentity(context,wrapper)).not.toThrow()
    for(const changed of [{libraryEntryId:id(10)},{code:'private:'+ref.entryId},{measurementReleaseId:id(10)},{creatorId:''}])
      expect(()=>assertEducationLibraryWrapperIdentity(context,{...wrapper,...changed})).toThrow()
  })
  it('reads the exact persisted unit without discarding its selected report identity',()=>{
    expect(readEducationLibraryFrozenUnitIdentity(input)).toEqual(unit)
  })
  it('rejects a stale digest, wrong Composite, absent item and duplicate unit',()=>{
    expect(()=>readEducationLibraryFrozenUnitIdentity({...input,snapshotHash:'d'.repeat(64)})).toThrow()
    expect(()=>readEducationLibraryFrozenUnitIdentity({...input,compositeId:id(10)})).toThrow()
    expect(()=>readEducationLibraryFrozenUnitIdentity({...input,itemId:id(10)})).toThrow()
    const duplicate={...snapshot,units:[unit,unit]}
    expect(()=>readEducationLibraryFrozenUnitIdentity({...input,snapshot:duplicate,snapshotHash:canonicalHash(duplicate)})).toThrow()
  })
  it('rejects cross-entry, cross-release, cross-wrapper and author-provenance substitution',()=>{
    for(const changed of [
      {...unit,source:{...unit.source,libraryEntryId:id(10)}},
      {...unit,source:{...unit.source,id:id(10)}},
      {...unit,source:{...unit.source,ownerId:id(10)}},
      {...unit,measurement:{...unit.measurement,releaseId:id(10)}},
      {...unit,measurement:{...unit.measurement,contentHash:'d'.repeat(64)}},
    ]){
      const altered={...snapshot,units:[changed]}
      expect(()=>readEducationLibraryFrozenUnitIdentity({...input,snapshot:altered,snapshotHash:canonicalHash(altered)})).toThrow()
    }
  })
})
