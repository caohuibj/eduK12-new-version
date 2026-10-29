import type {ScaleDefinitionV2} from '../scale/scale-definition'
import type {FormDraft} from '../assessment-core/form/definition'
import type {AssessmentAssetIdentityV1} from '../assessment-media/assessment-asset'
import {materialLimits} from '../assessment-media/material'
import {privateToolFail,type PrivateToolKind} from './private-tool.contracts'

export const privateToolImageMaxBytes=2*1024*1024
export const privateToolImageMimeTypes=['image/png','image/jpeg','image/webp']
export const privateToolMaterialMimeTypes=Object.keys(materialLimits)
export {materialLimits}
/** Private tool-bound images, videos and PDF materials only. Retain reports separately from stimuli;
 * these authoring refs are not a participant media allowlist. */
export function privateToolImageReferences(kind:PrivateToolKind,definition:unknown){
 // A composition owns references, not a second copy of its leaves' media.
 // Leaf media identities are checked by the compiler at the freeze boundary.
 if(kind==='COMPOSITION')return {stimuli:[],reports:[],all:[]}
 let stimuli:AssessmentAssetIdentityV1[],reports:AssessmentAssetIdentityV1[]=[]
 if(kind==='SCALE'){
  const scale=definition as ScaleDefinitionV2
  if(scale.items.some(item=>item.video!==undefined))privateToolFail('PRIVATE_TOOL_VIDEO_NOT_READY',409)
  stimuli=scale.items.flatMap(item=>[...(item.images??[]).map(image=>image.asset),...(item.materials??[]).map(material=>material.asset)])
  reports=(scale.report.rawScoreFeedback?.rules??[]).flatMap(rule=>[
   ...rule.ranges.flatMap(range=>[...(range.images??[]),...(range.materials??[])]),...(rule.fallback?.images??[]),...(rule.fallback?.materials??[]),
  ]).map(image=>image.asset)
 }else stimuli=(definition as FormDraft).pages.flatMap(page=>page.questions.flatMap(q=>[...(q.image?[q.image.asset]:[]),...(q.materials??[]).map(material=>material.asset)]))
 const all=[...stimuli,...reports],seen=new Map<string,AssessmentAssetIdentityV1>()
 for(const ref of all){
  const prior=seen.get(ref.assetId)
  if(prior&&(prior.contentHash!==ref.contentHash||prior.mimeType!==ref.mimeType))privateToolFail('PRIVATE_TOOL_MEDIA_IDENTITY_CONFLICT',400)
  seen.set(ref.assetId,ref)
 }
 if(seen.size>30)privateToolFail('PRIVATE_TOOL_MEDIA_LIMIT',400)
 return {stimuli,reports,all:[...seen.values()]}
}

/** Saving an unfinished draft is allowed, but technical validation/freezing must
 * not bypass the shared author's explicit material rights declaration. */
export function privateToolMaterialRightsIssues(kind:PrivateToolKind,definition:unknown){
 const issues:Array<{path:string;message:string;severity:'error'}>=[]
 if(kind!=='SCALE')return issues // The shared Form validator already checks this.
 const scale=definition as ScaleDefinitionV2
 const check=(items:import('../assessment-media/material').AssessmentMaterial[]|undefined,path:string)=>{
  items?.forEach((item,index)=>{if(item.rightsStatus==='unknown'||!item.rightsNote.trim())issues.push({path:`${path}.${index}`,message:'请确认素材使用依据并填写原创或授权说明',severity:'error'})})
 }
 scale.items.forEach((item,index)=>check(item.materials,`items.${index}.materials`))
 scale.report.rawScoreFeedback?.rules.forEach((rule,index)=>{
  rule.ranges.forEach((range,rangeIndex)=>check(range.materials,`report.rawScoreFeedback.rules.${index}.ranges.${rangeIndex}.materials`))
  check(rule.fallback?.materials,`report.rawScoreFeedback.rules.${index}.fallback.materials`)
 })
 return issues
}
