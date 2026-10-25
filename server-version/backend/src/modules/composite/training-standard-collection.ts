import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {ContentReleaseError} from '../measurement-content/release'
import {trainingBoundContent} from './training-reference-binding'
import {verifyStoredTrainingStandardItem} from './training-standard-combination'
import {readTrainingStandardContentIdentity} from './training-standard-content'
import {readCurrentStandardCombination} from '../measurement-content/standard-combination-source'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'
import type {WholeReceiptExecution} from './whole-questionnaire.service'

/** Invoked after normal participant/receipt checks, inside the protected write.
 * The saved source use is current; courses remain owned business containers.
 * Saved FINAL replay and historical report reads do not call this guard. */
export async function assertTrainingStandardCollectionAllowed(tx:Prisma.TransactionClient,parentId:string,scaleIds:readonly string[],itemIds:readonly string[]=[],acceptedReceipt?:WholeReceiptExecution){
 const [header]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT a.id FROM composite_assessment_attempts a WHERE a.id=${parentId}
  AND (EXISTS(SELECT 1 FROM composite_assessment_items i WHERE i.composite_assessment_id=a.composite_assessment_id
   AND i.standard_combination_source IS NOT NULL AND i.scale_id=ANY(${[...scaleIds]}::text[])
   ${itemIds.length?Prisma.sql`AND i.id=ANY(${[...itemIds]}::text[])`:Prisma.empty})
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(a.training_content_binding->'units','[]'::jsonb)) u
    WHERE u#>'{source,standardCombination}' IS NOT NULL AND u#>>'{source,id}'=ANY(${[...scaleIds]}::text[])
    ${itemIds.length?Prisma.sql`AND u->>'itemId'=ANY(${[...itemIds]}::text[])`:Prisma.empty})) FOR SHARE OF a`)
 if(!header)return new Set<string>()
 const parent=await tx.compositeAssessmentAttempt.findUnique({where:{id:parentId},include:{scaleAssessments:{select:{compositeItemId:true,attemptEpoch:true,scaleId:true}},
  compositeAssessment:{include:{questionnaireCourses:true,items:{include:{scale:true}}}}}})
 if(!parent)throw new ContentReleaseError('CONTENT_TRAINING_STANDARD_PARENT_MISSING')
 const content=trainingBoundContent(parent)
 if(!content)throw new ContentReleaseError('CONTENT_TRAINING_STANDARD_BINDING_REQUIRED')
 const selectedIds=itemIds.length?itemIds:parent.scaleAssessments.filter(a=>a.attemptEpoch===parent.attemptEpoch&&scaleIds.includes(a.scaleId)).map(a=>a.compositeItemId)
 const selectedItems=parent.compositeAssessment.items.filter(item=>selectedIds.includes(item.id)&&scaleIds.includes(item.scaleId!))
 const standardIds=new Set([...selectedItems.filter(item=>item.standardCombinationSource!=null).map(item=>item.id),
  ...content.units.filter(unit=>selectedIds.includes(unit.itemId)&&scaleIds.includes(unit.source.id)&&unit.source.standardCombination).map(unit=>unit.itemId)])
 if(!standardIds.size)throw new ContentReleaseError('CONTENT_TRAINING_STANDARD_CHILD_IDENTITY_REQUIRED')
 if(acceptedReceipt){
  // This is an existing durable FINAL, not a new use. The internal worker's
  // receipt must still own a CURRENT matching DB lease; no client skip flag.
  const {enqueueCompositeReportForUnit}=await import('../assessment-runtime/report-outbox.service')
  await enqueueCompositeReportForUnit(tx,{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,wholeReceipt:acceptedReceipt})
 }
 const exactScaleIds=new Set<string>()
 for(const id of standardIds){
  const item=selectedItems.find(item=>item.id===id),unit=content.units.find(unit=>unit.itemId===id)
  if(!item?.standardCombinationSource||!unit?.source.standardCombination||item.type!=='SCALE'||item.scaleId!==unit.source.id
   ||canonicalHash(item.standardCombinationSource)!==canonicalHash(unit.source.standardCombination))
   throw new ContentReleaseError('CONTENT_TRAINING_STANDARD_FROZEN_IDENTITY_CHANGED')
  if(acceptedReceipt){
   const source=await readTrainingStandardContentIdentity(tx,unit,{compositeId:parent.compositeAssessmentId,ownerId:parent.compositeAssessment.createdBy!})
   await readCurrentStandardCombination(tx,{releaseId:source.row.id,combinationHash:source.row.combination_hash},'COLLECTION')
   await assertScaleLibraryCollectionAllowed(tx,[source.measurement.releaseId])
   const stops=await tx.$queryRaw<Array<{target_id:string}>>(Prisma.sql`SELECT target_id FROM scale_library_emergency_stops WHERE target_kind='TRAINING_SCALE' AND target_id=${item.scaleId}`)
   if(stops.length)throw new ContentReleaseError('CONTENT_TRAINING_STANDARD_SCALE_EMERGENCY_STOPPED')
  }else{
   const current=await verifyStoredTrainingStandardItem(tx,parent.compositeAssessment,item,'COLLECTION')
   if(canonicalHash(current.reference.measurement)!==canonicalHash(unit.measurement))throw new ContentReleaseError('CONTENT_TRAINING_STANDARD_FROZEN_IDENTITY_CHANGED')
  }
  exactScaleIds.add(item.scaleId!)
 }
 // A legacy item sharing the physical Scale still keeps its original guard.
 for(const item of selectedItems)if(!standardIds.has(item.id))exactScaleIds.delete(item.scaleId!)
 return exactScaleIds
}
