import {assertSurveyDraft,type ScaleDraft} from './builder.definition'
import type {ScaleDefinitionV2,ScaleItemDefinition} from '../scale/scale-definition'
import type {SourceAnswerMapping} from './catalog.sources'

/** A frozen consumption protocol, deliberately NOT accepted by the native editor. */
export type CatalogScalePresentation={
  schemaVersion:1;runtime:'CANONICAL_SCALE_V1';presentationMode:'ONE_BY_ONE'|'ALL_AT_ONCE';
  respondentType:string;randomizeItems:false;
  responseOptions:Array<{optionKey:string;label:string;score:number}>;
  items:Array<{itemKey:string;prompt:string;required:boolean;reverse:boolean;dimensionKeys:string[];
    purpose?:ScaleItemDefinition['purpose'];attentionTarget?:string;
    responseOptions:Array<{optionKey:string;label:string;score:number}>;
    images?:ScaleItemDefinition['images'];video?:ScaleItemDefinition['video'];randomizeOptions:false}>;
}
export const isCatalogScalePresentation=(value:unknown):value is CatalogScalePresentation=>
  !!value&&typeof value==='object'&&(value as CatalogScalePresentation).runtime==='CANONICAL_SCALE_V1'
export const readSurveyScalePresentation=(value:unknown):ScaleDraft|CatalogScalePresentation=>
  isCatalogScalePresentation(value)?value:assertSurveyDraft('SCALE',value,true) as ScaleDraft
export const scalePresentationOptions=(definition:ScaleDraft|CatalogScalePresentation,item:(ScaleDraft|CatalogScalePresentation)['items'][number])=>
  'responseOptions' in item?item.responseOptions:definition.responseOptions

export function canonicalScalePresentation(definition:ScaleDefinitionV2,presentationMode:'ONE_BY_ONE'|'ALL_AT_ONCE'){
  const mapping:SourceAnswerMapping={type:'SCALE_TYPED_V1',items:{},options:{}}
  const sets=new Map(definition.responseSets.map((set,i)=>[set.key,set.options.map((option,j)=>{
    const optionKey=i===0?`o_${j}`:`o_${i}_${j}`;mapping.options[optionKey]=option.value
    return {optionKey,label:option.label,score:option.score}
  })]))
  const display:CatalogScalePresentation={schemaVersion:1,runtime:'CANONICAL_SCALE_V1',presentationMode,
    respondentType:definition.respondentType,randomizeItems:false,responseOptions:[...sets.values()].flat(),
    items:[...definition.items].sort((a,b)=>a.sortOrder-b.sortOrder).map((item,i)=>{
      const itemKey='i_'+i;mapping.items[itemKey]=item.itemCode
      const options=sets.get(item.responseSetKey)!
      return {itemKey,prompt:item.content,required:item.required,
        reverse:definition.scoring.itemRules.some(rule=>rule.itemCode===item.itemCode&&rule.transform.type==='reverse'),
        dimensionKeys:definition.scoring.scores.filter(score=>score.source.type==='items'&&score.source.items.some(ref=>ref.itemCode===item.itemCode)).map(score=>score.key),
        ...(item.purpose?{purpose:item.purpose}:{}),
        ...(item.attentionTarget!==undefined?{attentionTarget:options.find(option=>mapping.options[option.optionKey]===item.attentionTarget)?.optionKey}:{}),
        responseOptions:options,...(item.images?{images:item.images}:{}),...(item.video?{video:item.video}:{}),randomizeOptions:false}
    })}
  return {display,mapping}
}
