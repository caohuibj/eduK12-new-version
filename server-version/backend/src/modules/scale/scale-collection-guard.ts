import type { Prisma } from '@prisma/client'
import { assertScaleLibraryCollectionAllowed } from '../scale-library-governance/collection-guard'
/** IDs come only from the authorized stored attempt/source, never request payload. */
export async function assertTrainingScaleCollectionAllowed(tx:Prisma.TransactionClient,scaleIds:string[]){
  const ids=[...new Set(scaleIds)].sort()
  if(!ids.length)return
  // The shared guard locks Scale rows and resolves release IDs from those locked
  // rows, so an explicit legacy conversion cannot race a stale pre-lock read.
  await assertScaleLibraryCollectionAllowed(tx,[],ids)
}
