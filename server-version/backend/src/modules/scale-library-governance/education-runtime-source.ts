import {Prisma,type Scale} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {readLibraryScaleMeasurementSource} from './training-source'
import {educationLibraryRuntimeContextSchema,type EducationLibraryRuntimeContext} from './education-runtime-context'
import {EDUCATION_LIBRARY_ADAPTER_NOT_READY,fail} from './contracts'

type WrapperIdentity=Pick<Scale,'id'|'code'|'creatorId'|'libraryEntryId'|'measurementReleaseId'>
/** Pure comparison of exact content identities, not a grant or task check. */
export function assertEducationLibraryWrapperIdentity(context:EducationLibraryRuntimeContext,wrapper:WrapperIdentity){
  const input=educationLibraryRuntimeContextSchema.parse(context)
  if(wrapper.libraryEntryId!==input.entryId||wrapper.code!=='library:'+input.entryId
    ||wrapper.measurementReleaseId!==input.releaseId||!wrapper.id||!wrapper.creatorId)
    fail('EDUCATION_LIBRARY_WRAPPER_IDENTITY_MISMATCH',409)
}

/** Internal source read only. An existing Training-created wrapper is content,
 * NOT School/Teacher use permission. Callers must separately recheck education
 * use authority and their operation boundary in the same transaction.
 * No resource/policy/Composite is created, and no source is republished here.
 */
export async function readEducationLibraryExistingWrapperIdentity(
  tx:Prisma.TransactionClient,context:EducationLibraryRuntimeContext,
){
  const input=educationLibraryRuntimeContextSchema.parse(context)
  const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
    SELECT id FROM scales WHERE library_entry_id=${input.entryId} FOR SHARE`)
  if(rows.length!==1)fail('EDUCATION_LIBRARY_EXISTING_WRAPPER_REQUIRED',409)
  const wrapper=await tx.scale.findUnique({where:{id:rows[0].id}})
  if(!wrapper)fail('EDUCATION_LIBRARY_EXISTING_WRAPPER_REQUIRED',409)
  assertEducationLibraryWrapperIdentity(input,wrapper)
  const source=await readLibraryScaleMeasurementSource(tx,wrapper,'NEW_USE')
  if(source.release.releaseId!==input.releaseId||source.release.contentHash!==input.contentHash)
    fail('EDUCATION_LIBRARY_EXACT_VERSION_MISMATCH',409)
  // Full definition stays internal and intact, including rawScoreFeedback and
  // media. Never serialize this receipt into the resource picker or runner DTO.
  return {wrapper,release:source.release,definition:source.definition,
    identityOnly:true as const,runtimeStatus:EDUCATION_LIBRARY_ADAPTER_NOT_READY,
    canDistribute:false as const,canPublish:false as const}
}

/** Validate one already-persisted unit against an authoritative stored digest
 * and wrapper identity. This does NOT select references/reports, grant media
 * access, or make a partial snapshot eligible for publication/runtime START.
 * The snapshot/digest must be loaded from storage, never supplied by a client.
 */
export function readEducationLibraryFrozenUnitIdentity(input:{
  context:EducationLibraryRuntimeContext;wrapper:WrapperIdentity;
  compositeId:string;itemId:string;snapshot:unknown;snapshotHash:string;
}){
  assertEducationLibraryWrapperIdentity(input.context,input.wrapper)
  if(!/^[a-f0-9]{64}$/.test(input.snapshotHash)||canonicalHash(input.snapshot)!==input.snapshotHash)
    fail('EDUCATION_LIBRARY_FROZEN_SNAPSHOT_HASH_MISMATCH',409)
  const snapshot=trainingContentSnapshotSchema.parse(input.snapshot)
  if(snapshot.compositeId!==input.compositeId)
    fail('EDUCATION_LIBRARY_FROZEN_COMPOSITE_MISMATCH',409)
  const units=snapshot.units.filter(unit=>unit.itemId===input.itemId)
  if(units.length!==1)fail('EDUCATION_LIBRARY_FROZEN_UNIT_REQUIRED',409)
  const unit=units[0]
  if(unit.family!=='SCALE'||unit.source.kind!=='SCALE'
    ||unit.source.id!==input.wrapper.id||unit.source.ownerId!==input.wrapper.creatorId
    ||unit.source.libraryEntryId!==input.context.entryId
    ||unit.measurement.releaseId!==input.context.releaseId
    ||unit.measurement.contentHash!==input.context.contentHash)
    fail('EDUCATION_LIBRARY_FROZEN_UNIT_IDENTITY_MISMATCH',409)
  return unit
}
