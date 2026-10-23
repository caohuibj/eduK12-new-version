import {validateFormDefinition,type FormQuestion} from '../assessment-core/form/definition'
import {typedCompositeFormQuestion,validateTypedCompositeSectionDefinition} from '../assessment-runtime/typed-form'
import type {CompositeFormSectionItem} from '../assessment-runtime/form-section-definition'
import {privateToolFail} from './private-tool.contracts'
import type {PrivateFormCompatibilityIssue} from './private-tool.form-runtime-contracts'
// Required refusal is permitted ONLY when the individual question allows it.
// Shared normalizeFormAnswers remains the authority for that per-question flag.
export const privateFormTrainingPolicy={version:3,requiredRefusal:'ALLOW_SUBMIT',hiddenRequired:'EXEMPT'} as const
/** Explicit legacy image adaptation. The immutable authored definition is untouched;
 * the runtime receives the same image identity, alt text, caption and rights. */
export function privateFormRuntimeDefinition(q:FormQuestion):FormQuestion {
 if(!q.image)return q
 const {image,...definition}=q
 return {...definition,materials:[{asset:image.asset,name:image.altText,...(image.caption===undefined?{}:{caption:image.caption}),
  rightsStatus:image.rightsStatus,rightsNote:image.rightsNote},...(q.materials??[])]}
}
export function privateFormRuntimeItem(q:FormQuestion,id:string,position:number,sectionPosition:number):CompositeFormSectionItem {
 return {id,formType:q.type,formLabel:q.prompt,placeholder:null,required:q.required,
  formOptions:q.options.map(option=>({value:option.optionKey,label:option.label})),formDefinition:privateFormRuntimeDefinition(q),
  formPolicy:privateFormTrainingPolicy,contextKey:null,position,formSectionPosition:sectionPosition}
}
/** A section per original page; no flattening, fallback question conversion,
 * silent field loss, score synthesis, or mutation of the immutable source.
 * The legacy image has one explicit lossless runtime-material projection. */
export function compilePrivateFormRuntime(raw:unknown){
 const checked=validateFormDefinition(raw,{forPreview:true})
 if(!checked.definition||checked.issues.some(issue=>issue.severity==='error'))
  privateToolFail('PRIVATE_FORM_DEFINITION_INVALID',409,checked.issues)
 const definition=checked.definition,issues:PrivateFormCompatibilityIssue[]=[]
 let position=0
 const sections=definition.pages.map(page=>{
  if(!page.questions.length)issues.push({pageKey:page.pageKey,itemKey:null,reason:'EMPTY_PAGE_UNSUPPORTED',message:'Training 式区段必须至少包含一个题目，不能静默跳过空页。'})
  const preceding=new Map<string,FormQuestion>()
  const items=page.questions.map((q,index)=>{
   const add=(reason:string,message:string)=>issues.push({pageKey:page.pageKey,itemKey:q.itemKey,reason,message})
   if(q.image&&(q.materials?.length??0)>=10)add('IMAGE_MATERIAL_LIMIT','题目图片加展示素材最多 10 项，不能截断。')
   if(q.image&&q.materials?.some(m=>m.asset.assetId===q.image!.asset.assetId))add('IMAGE_MATERIAL_DUPLICATE','题目图片与展示素材重复，不能静默去重。')
   if(q.displayIf){const ref=preceding.get(q.displayIf.itemKey)
    if(!ref||!['SINGLE','MULTIPLE'].includes(ref.type))add('CONDITION_SCOPE_UNSUPPORTED','条件仅支持同一原始页面内前置单选或多选题；不能跨页或引用其他题型。')}
   const item=privateFormRuntimeItem(q,`private-form-item-${position}`,position++,index)
   try{typedCompositeFormQuestion(item)}catch(error){add('TYPED_ITEM_UNSUPPORTED',error instanceof Error?error.message:'题目不能无损转换。')}
   preceding.set(q.itemKey,q);return item
  })
  if(!issues.some(issue=>issue.pageKey===page.pageKey))try{validateTypedCompositeSectionDefinition(items)}catch(error){issues.push({pageKey:page.pageKey,itemKey:null,reason:'TYPED_SECTION_UNSUPPORTED',message:error instanceof Error?error.message:'区段不能无损转换。'})}
  return {pageKey:page.pageKey,title:page.title,description:page.description??null,items}
 })
 if(issues.length)privateToolFail('PRIVATE_FORM_RUNTIME_UNSUPPORTED',409,issues)
 return {definition,sections}
}
