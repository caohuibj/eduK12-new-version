import { canonicalHash } from '../assessment-runtime/canonical'
import { ContentReleaseError } from '../measurement-content/release'

/** Exact STANDARD items skip the parent Training guard because the content
 * binding revalidates them (current use, stops, entry policy). Fail closed if
 * any such item lacks its matching verified binding unit. Pure, no SQL. */
export const assertStandardItemsVerifiedByContentBinding=(items:any[],units:ReadonlyArray<{itemId:string;source:{id?:string;standardCombination?:unknown}}>|undefined)=>{
  for(const item of items){
    if(item.type!=='SCALE'||item.standardCombinationSource==null)continue
    const unit=units?.find(candidate=>candidate.itemId===item.id)
    if(!unit)throw new ContentReleaseError('CONTENT_TRAINING_STANDARD_BINDING_REQUIRED')
    if(!unit.source.standardCombination||item.scaleId!==unit.source.id||canonicalHash(unit.source.standardCombination)!==canonicalHash(item.standardCombinationSource))
      throw new ContentReleaseError('CONTENT_TRAINING_STANDARD_FROZEN_IDENTITY_CHANGED')
  }
}
