import type { Prisma } from '@prisma/client'
import type { ResearchFrozenPublication } from './publication.service'
import { assertScaleLibraryCollectionAllowed } from '../scale-library-governance/collection-guard'
/** Frozen publication identity, including licensed upstream source, is authoritative. */
export async function assertSurveyScaleCollectionAllowed(tx:Prisma.TransactionClient,snapshot:ResearchFrozenPublication){
  const scales=snapshot.units.filter(unit=>unit.kind==='SCALE')
  if(!scales.length)return
  const ids=scales.flatMap(unit=>{
    const source=unit.sourceProvenance?.sourceMeasurementRelease as {releaseId?:string}|undefined
    return [unit.measurementRelease?.releaseId,source?.releaseId].filter((id):id is string=>typeof id==='string')
  })
  await assertScaleLibraryCollectionAllowed(tx,ids,[],scales.map(unit=>unit.draftId))
}
