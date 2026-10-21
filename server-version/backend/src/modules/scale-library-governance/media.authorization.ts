import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {assertAssessmentAssetReferencesReady} from '../assessment-media/assessment-asset'
import {assertLibraryUseGrantCurrent} from './usage'
import {loadEntry} from './service'
import {assertLibraryMediaManifest,assertLibraryMediaReady,collectLibraryMediaIdentities} from './media'
import {fail} from './contracts'

export type LibraryBoundMediaUnit={kind:string;definition:unknown;compiledDefinition?:unknown;sourceProvenance?:Record<string,unknown>}
/** A new Survey publication may retain another owner's assets only through the
 * exact still-authorized read-only catalog snapshot. Passing an entry ID alone
 * or borrowing a media ID from a different scale never grants rights. */
export async function authorizedLibraryUnitMedia(tx:Prisma.TransactionClient,userId:string,unit:LibraryBoundMediaUnit){
  const entryId=unit.sourceProvenance?.libraryEntryId
  if(typeof entryId!=='string')return null
  if(unit.kind!=='SCALE'||!unit.compiledDefinition)fail('SCALE_LIBRARY_MEDIA_BOUND_DEFINITION_REQUIRED',403)
  const grant=await assertLibraryUseGrantCurrent(tx,{entryId,userId,product:'SURVEY'})
  const [tool]=await tx.$queryRaw<Array<{snapshot:{displayDefinition:unknown;compiledDefinition:unknown;provenance:Record<string,unknown>};snapshot_digest:string}>>(Prisma.sql`
    SELECT snapshot,snapshot_digest FROM survey_tool_grants WHERE id=${grant.survey_tool_grant_id} AND user_id=${userId} AND status='ACTIVE' FOR SHARE`)
  if(!tool||canonicalHash(tool.snapshot)!==tool.snapshot_digest||tool.snapshot.provenance.libraryEntryId!==entryId||
    canonicalHash(tool.snapshot.displayDefinition)!==canonicalHash(unit.definition)||canonicalHash(tool.snapshot.compiledDefinition)!==canonicalHash(unit.compiledDefinition))
    fail('SCALE_LIBRARY_MEDIA_BOUND_DEFINITION_MISMATCH',403)
  const {entry,submission}=await loadEntry(tx,entryId)
  const manifest=assertLibraryMediaManifest(submission.snapshot.mediaManifest)
  await assertLibraryMediaReady(tx,entryId,manifest)
  const refs=collectLibraryMediaIdentities([
    {value:unit.definition,path:'definition',releaseId:entry.release_id},
    {value:unit.compiledDefinition,path:'compiledDefinition',releaseId:entry.release_id},
  ])
  const identities=refs.map(ref=>{
    const item=manifest.items.find(i=>i.assetId===ref.assetId&&i.contentHash===ref.contentHash&&i.mimeType===ref.mimeType)
    if(!item)fail('SCALE_LIBRARY_MEDIA_NOT_IN_APPROVED_MANIFEST',403)
    return {assetId:ref.assetId,contentHash:ref.contentHash,mimeType:ref.mimeType}
  })
  await assertAssessmentAssetReferencesReady(identities,tx)
  return identities
}
