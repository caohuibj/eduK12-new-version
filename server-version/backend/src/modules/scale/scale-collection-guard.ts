import {assertLibraryUseGrantCurrent} from '../scale-library-governance/usage'
import {assertToolEntryPolicy} from '../assessment-governance/tool-entry-policy'
import {getScaleInstrumentSource} from './onboarding/instrument-registry'
import {scaleSourcePolicyIdentity} from './onboarding/source-snapshot'
import {ContentReleaseError} from '../measurement-content/release'
import { Prisma } from '@prisma/client'
import { assertScaleLibraryCollectionAllowed } from '../scale-library-governance/collection-guard'
/** New Training parent/standalone admission, not an existing Attempt's writes.
 * IDs come from the server's selected exact source, never request payload. */
export async function assertTrainingScaleCollectionAllowed(tx:Prisma.TransactionClient,scaleIds:string[],sourceOwnerId?:string){
  const ids=[...new Set(scaleIds)].sort()
  if(!ids.length)return
  // The shared guard locks Scale rows and resolves release IDs from those locked
  // rows, so an explicit legacy conversion cannot race a stale pre-lock read.
  await assertScaleLibraryCollectionAllowed(tx,[],ids)
  const standard=await tx.$queryRaw<Array<{code:string;instrument_version:string;instrument_class:string;library_entry_id:string|null;measurement_release_id:string|null;content_hash:string|null}>>(Prisma.sql`SELECT s.code,s.instrument_version,s.instrument_class::text,s.library_entry_id,s.measurement_release_id,r.content_hash FROM scales s LEFT JOIN measurement_content_releases r ON r.id=s.measurement_release_id
    WHERE s.id IN (${Prisma.join(ids)}) AND (s.instrument_class='STANDARD' OR s.library_entry_id IS NOT NULL) ORDER BY s.id FOR SHARE OF s`)
  const checkedEntries=new Set<string>()
  for(const row of standard){
    if(row.library_entry_id){
      if(checkedEntries.has(row.library_entry_id))continue
      if(sourceOwnerId)await assertLibraryUseGrantCurrent(tx,{entryId:row.library_entry_id,userId:sourceOwnerId,product:'TRAINING'})
      else if(row.measurement_release_id&&row.content_hash)await assertToolEntryPolicy(tx,{resourceKey:'release:'+row.measurement_release_id,fingerprint:row.content_hash},'TRAINING')
      else throw new ContentReleaseError('CONTENT_TRAINING_ENTRY_SOURCE_MISSING')
      checkedEntries.add(row.library_entry_id);continue
    }
    const source=getScaleInstrumentSource(row.code,row.instrument_version)
    if(!source)throw new ContentReleaseError('CONTENT_TRAINING_ENTRY_SOURCE_MISSING')
    await assertToolEntryPolicy(tx,scaleSourcePolicyIdentity(source),'TRAINING')
  }
}
