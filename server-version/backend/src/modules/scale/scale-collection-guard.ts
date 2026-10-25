import type { Prisma } from '@prisma/client'
import { assertScaleLibraryCollectionAllowed } from '../scale-library-governance/collection-guard'
import type {WholeReceiptExecution} from '../composite/whole-questionnaire.service'
/** IDs come only from the authorized stored attempt/source, never request payload. */
export async function assertTrainingScaleCollectionAllowed(tx:Prisma.TransactionClient,scaleIds:string[],compositeAttemptId?:string|null,compositeItemIds:readonly string[]=[],acceptedReceipt?:WholeReceiptExecution){
  const ids=[...new Set(scaleIds)].sort()
  if(!ids.length)return
  let exact=new Set<string>()
  if(compositeAttemptId){
    const {assertTrainingStandardCollectionAllowed}=await import('../composite/training-standard-collection')
    exact=await assertTrainingStandardCollectionAllowed(tx,compositeAttemptId,ids,compositeItemIds,acceptedReceipt)
  }
  // The shared guard locks Scale rows and resolves release IDs from those locked
  // rows, so an explicit legacy conversion cannot race a stale pre-lock read.
  const legacy=ids.filter(id=>!exact.has(id))
  if(legacy.length)await assertScaleLibraryCollectionAllowed(tx,[],legacy)
}
