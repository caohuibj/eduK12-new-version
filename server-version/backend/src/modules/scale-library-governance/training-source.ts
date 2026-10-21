import {Prisma,type Scale} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {hashScaleDefinition} from '../scale/scale-definition'
import {getContentRelease} from '../measurement-content/repository'
import {ContentReleaseError} from '../measurement-content/release'
import {assertLibraryMediaReady} from './media'
import type {LibrarySnapshot} from './source'
const fail=():never=>{throw new ContentReleaseError('CONTENT_SCALE_LIBRARY_IDENTITY_MISMATCH')}
/** Exact approved entry adapter, NEVER a general exception to PRIVATE scope.
 * Original creator is provenance only. The caller independently authorizes use.
 * FROZEN_IDENTITY is restricted to a previously stored publication/attempt tuple;
 * it grants no new use and does not replace collection's emergency-stop guard. */
export async function readLibraryScaleMeasurementSource(tx:Prisma.TransactionClient,scale:Scale,purpose:'NEW_USE'|'FROZEN_IDENTITY'='NEW_USE'){
 if(!scale.libraryEntryId)return fail()
 const [row]=await tx.$queryRaw<Array<{release_id:string;status:string;snapshot:LibrarySnapshot;snapshot_hash:string;author_id:string}>>(Prisma.sql`
  SELECT e.release_id,e.status,s.snapshot,s.snapshot_hash,s.author_id FROM scale_library_entries e
  JOIN scale_library_submissions s ON s.id=e.submission_id WHERE e.id=${scale.libraryEntryId} FOR SHARE OF e,s`)
 if(!row||(purpose==='NEW_USE'&&row.status!=='ACTIVE')||canonicalHash(row.snapshot)!==row.snapshot_hash||scale.code!=='library:'+scale.libraryEntryId||
  scale.creatorId!==row.author_id||scale.instrumentClass!=='CUSTOM_DESCRIPTIVE'||scale.status!=='PUBLISHED'||
  scale.measurementReleaseId!==row.release_id||canonicalHash(scale.definition)!==canonicalHash(row.snapshot.compiledDefinition)||
  hashScaleDefinition(row.snapshot.compiledDefinition)!==scale.definitionHash)return fail()
 const release=await getContentRelease(tx,row.release_id,true)
 if(!release||release.layer!=='MEASUREMENT'||release.family!=='SCALE'||release.content.instrumentVersion!==scale.instrumentVersion||(purpose==='NEW_USE'&&release.status!=='PUBLISHED')||!row.snapshot.mediaManifest)return fail()
 await assertLibraryMediaReady(tx,scale.libraryEntryId,row.snapshot.mediaManifest)
 return {release,definition:row.snapshot.compiledDefinition,rights:null}
}
