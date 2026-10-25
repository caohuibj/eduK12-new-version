import type { Prisma } from '@prisma/client'
import type { ResearchFrozenPublication } from './publication.service'
import { assertScaleLibraryCollectionAllowed } from '../scale-library-governance/collection-guard'
import {assertSurveyPublicationNotPaused} from './tool-policy'
/** Collection authority for every Survey family (the exported name predates
 * non-Scale governance). Call under the caller's existing parent locks and hold
 * exact grant/version/policy SHARE locks through the write. No report reader
 * calls this gate; immutable completed FINAL replay has already returned. */
export async function assertSurveyScaleCollectionAllowed(tx:Prisma.TransactionClient,snapshot:ResearchFrozenPublication){
  await assertSurveyPublicationNotPaused(tx,snapshot)
  const scales=snapshot.units.filter(unit=>unit.kind==='SCALE')
  if(!scales.length)return
  const ids=scales.flatMap(unit=>{
    const source=unit.sourceProvenance?.sourceMeasurementRelease as {releaseId?:string}|undefined
    return [unit.measurementRelease?.releaseId,source?.releaseId].filter((id):id is string=>typeof id==='string')
  })
  await assertScaleLibraryCollectionAllowed(tx,ids,[],scales.map(unit=>unit.draftId))
}
