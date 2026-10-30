import type {SelectedReferenceAudit} from '../assessment-authorization/selected-reference-audit'
import {decodeTrainingStandardItemSource} from './training-standard-combination'

/** Only newly typed T2 pins are projected. An absent legacy pin is not rebuilt
 * from today's grant. A provided corrupt pin must not be erased as legacy. */
export function trainingReferenceAudit(composite:{id:string;createdBy:string},item:{id:string;type:string;scaleId:string|null;standardCombinationSource:unknown}):SelectedReferenceAudit[]{
 const raw=item.standardCombinationSource as {reference?:{selectedBinding?:unknown}}|null
 if(item.type!=='SCALE'||raw?.reference?.selectedBinding===undefined)return []
 const source=decodeTrainingStandardItemSource(item.standardCombinationSource,
  {compositeId:composite.id,itemId:item.id,scaleId:item.scaleId!,ownerId:composite.createdBy}),r=source.reference
 if(!r.selectedBinding)throw Error('SELECTED_REFERENCE_REQUIRED')
 return [{slotId:item.id,kind:'STANDARD_COMBINATION',sourceId:r.combination.releaseId,sourceHash:r.combination.combinationHash,
  referenceHash:source.referenceHash,selectedBinding:r.selectedBinding}]
}
