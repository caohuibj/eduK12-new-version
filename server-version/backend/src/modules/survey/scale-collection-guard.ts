import type { Prisma } from '@prisma/client'
import type { ResearchFrozenPublication } from './publication.service'
import { assertScaleLibraryCollectionAllowed } from '../scale-library-governance/collection-guard'
import {prefetchToolPolicyAdmission} from '../assessment-governance/tool-entry-policy'
import {assertSurveyPublicationNotPaused,snapshotPolicyIdentity} from './tool-policy'
import type {CatalogSourceSnapshot} from './catalog.sources'
/** New-parent admission only (the exported name predates non-Scale governance).
 * Hold the caller's Project/Wave and exact source locks through START commit.
 * An existing Attempt resumes, checkpoints and finalizes its frozen binding. */
export async function assertSurveyScaleCollectionAllowed(tx:Prisma.TransactionClient,snapshot:ResearchFrozenPublication){
  const identities:Array<Awaited<ReturnType<typeof snapshotPolicyIdentity>>>=[]
  for(const unit of snapshot.units){
    const p=unit.sourceProvenance,ref=p?.source as CatalogSourceSnapshot['ref']|undefined
    if(!p||!ref)continue
    // Library use-grants lock release/entry before tool policy, matching Training.
    if(typeof p.libraryEntryId==='string')continue
    identities.push(await snapshotPolicyIdentity(tx,{ref,provenance:p,definitionDigest:unit.sourceDigest} as CatalogSourceSnapshot))
  }
  await prefetchToolPolicyAdmission(tx,identities,'SURVEY')
  await assertSurveyPublicationNotPaused(tx,snapshot)
  const scales=snapshot.units.filter(unit=>unit.kind==='SCALE')
  if(!scales.length)return
  const ids=scales.flatMap(unit=>{
    const source=unit.sourceProvenance?.sourceMeasurementRelease as {releaseId?:string}|undefined
    return [unit.measurementRelease?.releaseId,source?.releaseId].filter((id):id is string=>typeof id==='string')
  })
  await assertScaleLibraryCollectionAllowed(tx,ids,[],scales.map(unit=>unit.draftId))
}
