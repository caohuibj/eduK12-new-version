import {assertLibraryUseGrantCurrent} from '../scale-library-governance/usage'
import {assertToolEntryPolicy} from '../assessment-governance/tool-entry-policy'
import {getScaleInstrumentSource} from './onboarding/instrument-registry'
import {scaleSourcePolicyIdentity} from './onboarding/source-snapshot'
import {ContentReleaseError} from '../measurement-content/release'
import { Prisma } from '@prisma/client'
import { assertScaleLibraryCollectionAllowed } from '../scale-library-governance/collection-guard'
import type {WholeReceiptExecution} from '../composite/whole-questionnaire.service'
import type {VerifiedTrainingFlowMaterialization} from '../composite/training-flow-scope'
/** Server-selected Training sources: new entry requires current admission;
 * ordinary current-epoch collection keeps shared emergency stops; durable RAW
 * processing additionally requires its exact current receipt lease. Verified
 * exact STANDARD sources retain their separate frozen completion contract.
 * IDs and parent/item bindings never come from a caller's product claim. */
export type TrainingCollectionScope={
  /** Source owner for the library-entry use-grant check on non-exact sources. */
  sourceOwnerId?:string
  /** Frozen parent attempt for standard-combination exact binding. */
  compositeAttemptId?:string|null
  compositeItemIds?:readonly string[]
  /** Request-local verified pending flow unit, consumed under the parent lock. */
  verifiedFlowMaterialization?:VerifiedTrainingFlowMaterialization
  compositeAttemptEpoch?:number
  acceptedReceipt?:WholeReceiptExecution
}
export async function assertTrainingScaleCollectionAllowed(tx:Prisma.TransactionClient,scaleIds:string[],scope:TrainingCollectionScope={}){
  const ids=[...new Set(scaleIds)].sort()
  if(!ids.length)return
  let exactStandardIds=new Set<string>()
  const enteredIds=new Set<string>()
  let bound:Array<{scale_id:string;composite_item_id:string|null;attempt_epoch:number}>=[]
  const rejectReceipt=async():Promise<never>=>{const {ReportProcessingLeaseLostError}=await import('../assessment-runtime/report-outbox.service');throw new ReportProcessingLeaseLostError()}
  if(scope.acceptedReceipt&&(!scope.compositeAttemptId||!Number.isSafeInteger(scope.compositeAttemptEpoch)||scope.compositeAttemptEpoch!<1
    ||!scope.compositeItemIds?.length||new Set(scope.compositeItemIds).size!==scope.compositeItemIds.length))await rejectReceipt()
  if(scope.verifiedFlowMaterialization){
    const {assertVerifiedTrainingFlowScaleMaterialization}=await import('../composite/training-flow-scope')
    enteredIds.add(assertVerifiedTrainingFlowScaleMaterialization(tx,scope.verifiedFlowMaterialization,{...scope,scaleIds:ids}))
  }
  if(scope.compositeAttemptId){
    const {assertTrainingStandardCollectionAllowed}=await import('../composite/training-standard-collection')
    exactStandardIds=await assertTrainingStandardCollectionAllowed(tx,scope.compositeAttemptId,ids,scope.compositeItemIds,scope.acceptedReceipt,scope.verifiedFlowMaterialization)
    // Current-epoch children have already passed product admission. This
    // avoids repeating mutable entry policy, but is not an emergency-stop
    // exemption. Only verified exact STANDARD sources retain that separate
    // frozen completion contract. An unmaterialized flow unit may use only
    // the exact current candidate verified above under this same parent lock;
    // caller parent/item claims and restarted epochs cannot borrow admission.
    bound=await tx.$queryRaw<Array<{scale_id:string;composite_item_id:string|null;attempt_epoch:number}>>(Prisma.sql`SELECT a.scale_id,a.composite_item_id,a.attempt_epoch FROM assessments a
      JOIN composite_assessment_attempts p ON p.id=a.composite_attempt_id
      WHERE a.composite_attempt_id=${scope.compositeAttemptId} AND a.attempt_epoch=p.attempt_epoch
      AND a.scale_id=ANY(${ids}::text[])
      ${scope.compositeItemIds?.length?Prisma.sql`AND a.composite_item_id=ANY(${[...scope.compositeItemIds]}::text[])`:Prisma.empty}
      FOR SHARE OF a`)
    for(const row of bound)enteredIds.add(row.scale_id)
  }
  // The shared guard locks Scale rows and resolves release IDs from those locked
  // rows, so an explicit legacy conversion cannot race a stale pre-lock read.
  const collectionIds=ids.filter(id=>!exactStandardIds.has(id))
  if(scope.acceptedReceipt){
    // Only the exact committed current-epoch child/item set can consume this
    // receipt. A parent/Scale claim or a future lazy child is insufficient.
    const itemIds=scope.compositeItemIds!
    if(bound.length!==itemIds.length||new Set(bound.map(row=>row.composite_item_id)).size!==itemIds.length
      ||bound.some(row=>row.attempt_epoch!==scope.compositeAttemptEpoch||!row.composite_item_id||!itemIds.includes(row.composite_item_id)||!ids.includes(row.scale_id))
      ||ids.some(id=>!bound.some(row=>row.scale_id===id)))await rejectReceipt()
    if(collectionIds.length){
      // This is processing already accepted RAW, not a new collection request.
      // Reuse the existing read-only receipt fence: lock then fresh wall-clock
      // DB verification of submission/hash/time/current lease and parent binding.
      const {enqueueCompositeReportForUnit}=await import('../assessment-runtime/report-outbox.service')
      await enqueueCompositeReportForUnit(tx,{compositeAttemptId:scope.compositeAttemptId!,attemptEpoch:scope.compositeAttemptEpoch!,wholeReceipt:scope.acceptedReceipt})
    }
    return
  }
  if(collectionIds.length)await assertScaleLibraryCollectionAllowed(tx,[],collectionIds)
  const newEntryIds=collectionIds.filter(id=>!enteredIds.has(id))
  if(!newEntryIds.length)return
  const standard=await tx.$queryRaw<Array<{code:string;instrument_version:string;instrument_class:string;library_entry_id:string|null;measurement_release_id:string|null;content_hash:string|null}>>(Prisma.sql`SELECT s.code,s.instrument_version,s.instrument_class::text,s.library_entry_id,s.measurement_release_id,r.content_hash FROM scales s LEFT JOIN measurement_content_releases r ON r.id=s.measurement_release_id
    WHERE s.id IN (${Prisma.join(newEntryIds)}) AND (s.instrument_class='STANDARD' OR s.library_entry_id IS NOT NULL) ORDER BY s.id FOR SHARE OF s`)
  const checkedEntries=new Set<string>()
  for(const row of standard){
    if(row.library_entry_id){
      if(checkedEntries.has(row.library_entry_id))continue
      if(scope.sourceOwnerId)await assertLibraryUseGrantCurrent(tx,{entryId:row.library_entry_id,userId:scope.sourceOwnerId,product:'TRAINING'})
      else if(row.measurement_release_id&&row.content_hash)await assertToolEntryPolicy(tx,{resourceKey:'release:'+row.measurement_release_id,fingerprint:row.content_hash},'TRAINING')
      else throw new ContentReleaseError('CONTENT_TRAINING_ENTRY_SOURCE_MISSING')
      checkedEntries.add(row.library_entry_id);continue
    }
    const source=getScaleInstrumentSource(row.code,row.instrument_version)
    if(!source)throw new ContentReleaseError('CONTENT_TRAINING_ENTRY_SOURCE_MISSING')
    await assertToolEntryPolicy(tx,scaleSourcePolicyIdentity(source),'TRAINING')
  }
}

/** New entry follows the persisted principal. SCHOOL includes Teacher sessions.
 * Original source access, ownership, deployment and eligibility checks remain. */
export async function assertScaleNewEntryAllowed(tx:Prisma.TransactionClient,scaleIds:string[],principalId:string,scope:TrainingCollectionScope={}){
 if(!scaleIds.length)return
 const principal=await tx.user.findUnique({where:{id:principalId},select:{accountDomain:true}})
 if(!principal)throw new ContentReleaseError('CONTENT_SCALE_ENTRY_PRINCIPAL_MISSING')
 if(principal.accountDomain==='SCHOOL')await assertScaleLibraryCollectionAllowed(tx,[],scaleIds)
 else await assertTrainingScaleCollectionAllowed(tx,scaleIds,scope)
}

/** Legacy Questionnaire admission uses its persisted source owner, including
 * anonymous entry. Participant/session product is never the source authority. */
export async function assertQuestionnaireScaleNewEntryAllowed(tx:Prisma.TransactionClient,questionnaireId:string,scaleIds:string[]){
 if(!scaleIds.length)return
 const source=await tx.questionnaire.findUnique({where:{id:questionnaireId},select:{creatorId:true}})
 if(!source)throw new ContentReleaseError('CONTENT_SCALE_ENTRY_SOURCE_MISSING')
 await assertScaleNewEntryAllowed(tx,scaleIds,source.creatorId,{sourceOwnerId:source.creatorId})
}
