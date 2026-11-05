import {Prisma,type Scale} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {hashScaleDefinition} from '../scale/scale-definition'
import {getContentReleaseBatch,type StoredRelease} from '../measurement-content/repository'
import {ContentReleaseError} from '../measurement-content/release'
import {assertLibraryMediaReadyBatch} from './media'
import type {LibrarySnapshot} from './source'
const fail=():never=>{throw new ContentReleaseError('CONTENT_SCALE_LIBRARY_IDENTITY_MISMATCH')}
/** Exact approved entry adapter, NEVER a general exception to PRIVATE scope.
 * Original creator is provenance only. The caller independently authorizes use.
 * FROZEN_IDENTITY is restricted to a previously stored publication/attempt tuple;
 * it grants no new use and does not replace collection's emergency-stop guard. */
export async function readLibraryScaleMeasurementSource(tx:Prisma.TransactionClient,scale:Scale,purpose:'NEW_USE'|'FROZEN_IDENTITY'='NEW_USE'){
 return (await readLibraryScaleMeasurementSources(tx,[scale],purpose)).get(scale.id)!
}
/** Same exact-entry checks for many wrappers, one locked read per table. */
export async function readLibraryScaleMeasurementSources(tx:Prisma.TransactionClient,scales:readonly Scale[],purpose:'NEW_USE'|'FROZEN_IDENTITY'='NEW_USE'){
 const result=new Map<string,{release:StoredRelease;definition:LibrarySnapshot['compiledDefinition'];rights:null}>()
 if(!scales.length)return result
 if(scales.some(scale=>!scale.libraryEntryId))return fail()
 const entryIds=[...new Set(scales.map(scale=>scale.libraryEntryId!))].sort()
 const rows=new Map((await tx.$queryRaw<Array<{id:string;release_id:string;status:string;snapshot:LibrarySnapshot;snapshot_hash:string;author_id:string}>>(Prisma.sql`
  SELECT e.id,e.release_id,e.status,s.snapshot,s.snapshot_hash,s.author_id FROM scale_library_entries e
  JOIN scale_library_submissions s ON s.id=e.submission_id WHERE e.id=ANY(${entryIds}::text[]) ORDER BY e.id FOR SHARE OF e,s`)).map(row=>[row.id,row]))
 for(const scale of scales){
  const row=rows.get(scale.libraryEntryId!)
  if(!row||(purpose==='NEW_USE'&&row.status!=='ACTIVE')||canonicalHash(row.snapshot)!==row.snapshot_hash||scale.code!=='library:'+scale.libraryEntryId||
   scale.creatorId!==row.author_id||scale.instrumentClass!=='CUSTOM_DESCRIPTIVE'||scale.status!=='PUBLISHED'||
   scale.measurementReleaseId!==row.release_id||canonicalHash(scale.definition)!==canonicalHash(row.snapshot.compiledDefinition)||
   hashScaleDefinition(row.snapshot.compiledDefinition)!==scale.definitionHash)return fail()
 }
 const releases=await getContentReleaseBatch(tx,[...rows.values()].map(row=>row.release_id),false)
 for(const scale of scales){
  const row=rows.get(scale.libraryEntryId!)!,release=releases.get(row.release_id)
  if(!release||release.layer!=='MEASUREMENT'||release.family!=='SCALE'||release.content.instrumentVersion!==scale.instrumentVersion||(purpose==='NEW_USE'&&release.status!=='PUBLISHED')||!row.snapshot.mediaManifest)return fail()
  result.set(scale.id,{release,definition:row.snapshot.compiledDefinition,rights:null})
 }
 await assertLibraryMediaReadyBatch(tx,entryIds.map(entryId=>({entryId,manifest:rows.get(entryId)!.snapshot.mediaManifest!})))
 return result
}
