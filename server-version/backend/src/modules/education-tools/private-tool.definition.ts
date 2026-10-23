import {privateToolImageReferences,privateToolMaterialRightsIssues} from './private-tool.media-definition'
import {canonicalHash} from '../assessment-runtime/canonical'
import {collectAssetReferences} from '../../services/assetStorage'
import {createCustomScaleDefinition,scaleDefinitionSchema,validateScaleDefinition,type ScaleDefinitionV2} from '../scale/scale-definition'
import {formDraftSchema,validateFormDefinition,type FormDraft} from '../assessment-core/form/definition'
import {privateToolFail,type PrivateToolKind} from './private-tool.contracts'

// Drafts may be incomplete, but keep the native authoring shape. Only empty
// item/score/report-key arrays are relaxed; full validators gate preview and freezing.
const draftScaleSchema=scaleDefinitionSchema.extend({
 items:scaleDefinitionSchema.shape.items.min(0),
 report:scaleDefinitionSchema.shape.report.extend({
  primaryScoreKeys:scaleDefinitionSchema.shape.report.shape.primaryScoreKeys.min(0),
  scoreOrder:scaleDefinitionSchema.shape.report.shape.scoreOrder.min(0),
 }),
 scoring:scaleDefinitionSchema.shape.scoring.extend({
  itemRules:scaleDefinitionSchema.shape.scoring.shape.itemRules.min(0),
  scores:scaleDefinitionSchema.shape.scoring.shape.scores.min(0),
 }),
})
export const initialPrivateToolDefinition=(kind:PrivateToolKind)=>kind==='SCALE'?createCustomScaleDefinition():{schemaVersion:2,pages:[]}
export function privateToolDefinition(kind:PrivateToolKind,input:unknown){
 if(Buffer.byteLength(JSON.stringify(input)??'','utf8')>512000)privateToolFail('PRIVATE_TOOL_DEFINITION_TOO_LARGE',400)
 const parsed=(kind==='SCALE'?draftScaleSchema:formDraftSchema).safeParse(input)
 if(!parsed.success)privateToolFail('PRIVATE_TOOL_DEFINITION_INVALID',400,parsed.error.issues)
 // Structure alone is not authorization: service callers must validate these
 // references against the exact scoped registration inside their transaction.
 privateToolImageReferences(kind,parsed.data)
 const parsedRefs=collectAssetReferences(parsed.data)
 const supportedPath=kind==='SCALE'?/^(?:items\.\d+\.(?:images|materials)\.\d+|report\.rawScoreFeedback\.rules\.\d+\.(?:ranges\.\d+|fallback)\.(?:images|materials)\.\d+)\.asset$/:/^pages\.\d+\.questions\.\d+\.(?:image|materials\.\d+)\.asset$/
 if(parsedRefs.some(ref=>!supportedPath.test(ref.field)))privateToolFail('PRIVATE_TOOL_MEDIA_FIELD_NOT_SUPPORTED',400)
 if(collectAssetReferences(input).some(ref=>!parsedRefs.some(p=>p.assetId===ref.assetId&&p.field===ref.field)))
  privateToolFail('PRIVATE_TOOL_MEDIA_FIELD_NOT_SUPPORTED',400)
 return parsed.data
}
export function validatePrivateToolDefinition(kind:PrivateToolKind,definition:unknown){
 const parsed=privateToolDefinition(kind,definition)
 const result=kind==='SCALE'?validateScaleDefinition(parsed,{instrumentClass:'CUSTOM_DESCRIPTIVE'}):validateFormDefinition(parsed,{forPreview:true})
 const issues=[...result.issues,...privateToolMaterialRightsIssues(kind,parsed)]
 const valid=Boolean(result.definition)&&!issues.some(issue=>issue.severity==='error')
 return {valid,issues,definition:result.definition as ScaleDefinitionV2|FormDraft|undefined}
}
export const privateToolContentHash=(kind:PrivateToolKind,title:string,definition:unknown)=>canonicalHash({kind,title,definition})
