import type {ScaleDefinitionV2} from '../scale/scale-definition'
import type {FormDraft} from '../assessment-core/form/definition'
import type {AssessmentStaticImageAssetIdentityV1} from '../assessment-media/assessment-image'
import {privateToolFail,type PrivateToolKind} from './private-tool.contracts'

export const privateToolImageMaxBytes=2*1024*1024
export const privateToolImageMimeTypes=['image/png','image/jpeg','image/webp']
/** This batch enables static images only. Retain reports separately from stimuli;
 * these authoring refs are not a participant media allowlist. */
export function privateToolImageReferences(kind:PrivateToolKind,definition:unknown){
 let stimuli:AssessmentStaticImageAssetIdentityV1[],reports:AssessmentStaticImageAssetIdentityV1[]=[]
 if(kind==='SCALE'){
  const scale=definition as ScaleDefinitionV2
  if(scale.items.some(item=>item.video!==undefined))privateToolFail('PRIVATE_TOOL_VIDEO_NOT_READY',409)
  stimuli=scale.items.flatMap(item=>(item.images??[]).map(image=>image.asset))
  reports=(scale.report.rawScoreFeedback?.rules??[]).flatMap(rule=>[
   ...rule.ranges.flatMap(range=>range.images??[]),...(rule.fallback?.images??[]),
  ]).map(image=>image.asset)
 }else stimuli=(definition as FormDraft).pages.flatMap(page=>page.questions.flatMap(q=>q.image?[q.image.asset]:[]))
 const all=[...stimuli,...reports],seen=new Map<string,AssessmentStaticImageAssetIdentityV1>()
 for(const ref of all){
  const prior=seen.get(ref.assetId)
  if(prior&&(prior.contentHash!==ref.contentHash||prior.mimeType!==ref.mimeType))privateToolFail('PRIVATE_TOOL_MEDIA_IDENTITY_CONFLICT',400)
  seen.set(ref.assetId,ref)
 }
 if(seen.size>30)privateToolFail('PRIVATE_TOOL_MEDIA_LIMIT',400)
 return {stimuli,reports,all:[...seen.values()]}
}
