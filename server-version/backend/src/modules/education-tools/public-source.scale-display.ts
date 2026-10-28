import type {ScaleDefinitionV2} from '../scale/scale-definition'

/** Same display-only shape as the selected public Scale preview. Explicit
 * allowlists protect the alternate whole-questionnaire serializer as well;
 * scorer, references, report and option scores remain internal. */
export function educationPublicScaleDisplay(definition:ScaleDefinitionV2){
 const fields=['itemCode','content','type','required','sortOrder','responseSetKey','images','materials','video'] as const
 return {items:definition.items.map(item=>Object.fromEntries(fields.filter(field=>Object.prototype.hasOwnProperty.call(item,field))
  .map(field=>[field,(item as Record<string,unknown>)[field]]))),
  responseSets:definition.responseSets.map(set=>({key:set.key,options:set.options.map(option=>({value:option.value,label:option.label}))}))}
}
