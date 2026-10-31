import {z} from 'zod'
import {canonicalHash} from '../../assessment-runtime/canonical'
import {scaleDefinitionSchema,scaleReportDefinitionSchema,scaleReferencePolicySchema,validateScaleDefinition,type ScaleDefinitionV2} from '../scale-definition'
import {getScaleCustomScorerKeys} from '../scale-scoring'
import {scaleInstrumentSourceV1Schema} from '../onboarding/schema'
import {reportTemplateSchema} from '../../measurement-content/report-template'
import {assetReference} from '../../measurement-content/release'
import {validateReferenceSetDefinition} from '../../assessment-reference/reference'

const version=z.string().trim().min(1).max(120),hash=z.string().regex(/^[a-f0-9]{64}$/)
const source=scaleInstrumentSourceV1Schema.shape
export const componentMetadataSchema=z.object({
  title:z.string().trim().min(1).max(300),
  instruction:source.instruction,applicability:source.applicability,disclosure:source.disclosure,
  catalog:source.catalog.optional(),localization:source.localization,usageRequirements:source.usageRequirements,
  educationApplicability:source.educationApplicability,educationExpertApplicability:source.educationExpertApplicability,
  educationalFeedback:source.educationalFeedback,
}).strict()
export const parameterPayloadSchema=z.object({referencePolicy:scaleReferencePolicySchema,references:z.array(z.record(z.string(),z.unknown())).max(100)}).strict().superRefine((p,ctx)=>{
  p.references.forEach((r,i)=>validateReferenceSetDefinition(r).issues.filter(x=>x.severity==='error').forEach(x=>ctx.addIssue({code:'custom',path:['references',i,x.path],message:x.message})))
})
// The wrapper preserves all installed report-engine blocks without modifying
// the legacy R payload/hash contract. Existing unwrapped R remains supported.
export const reportPayloadSchema=z.union([scaleReportDefinitionSchema,z.object({definition:scaleReportDefinitionSchema,template:reportTemplateSchema,assetRefs:z.array(assetReference).optional()}).strict()])
export const componentDraftSchema=z.object({
  toolKey:z.string().regex(/^[a-z][a-z0-9_]*$/).max(120),
  configurationName:z.string().trim().min(1).max(300),
  baseCombination:z.object({releaseId:z.string().uuid(),combinationHash:hash}).strict().nullable(),
  changedParts:z.object({
    CONTENT:z.object({version:z.string().regex(/^\d+\.\d+\.\d+$/),definition:scaleDefinitionSchema,metadata:componentMetadataSchema}).strict().optional(),
    PARAMETERS:z.object({version,payload:parameterPayloadSchema.nullable()}).strict().optional(),
    REPORT:z.object({version,payload:reportPayloadSchema.nullable()}).strict().optional(),
  }).strict().refine(parts=>Object.keys(parts).length>0,'至少提供一个 C/P/R 组分'),
}).strict()
export type ComponentDraft=z.infer<typeof componentDraftSchema>
export type ImportIssue={sheet:string;row:number;path:string;message:string}
export type ImportEntry={index:number;toolKey:string|null;draft:ComponentDraft|null;issues:ImportIssue[]}
export function unsupportedFields(raw:unknown,parsed:unknown,path=''):Array<{path:string;message:string}>{
  if(!raw||typeof raw!=='object'||!parsed||typeof parsed!=='object')return []
  return Object.entries(raw).flatMap(([key,value])=>Object.prototype.hasOwnProperty.call(parsed,key)?unsupportedFields(value,(parsed as Record<string,unknown>)[key],path?path+'.'+key:key):[{path:path?path+'.'+key:key,message:'不支持此字段，未保存或执行'}])
}
export function parseComponentDraft(value:unknown){
  const draft=componentDraftSchema.parse(value),extra=unsupportedFields(value,draft)
  if(extra.length)throw new z.ZodError(extra.map(i=>({code:'custom',path:i.path.split('.'),message:i.message})))
  const c=draft.changedParts.CONTENT
  if(c){
    const validation=validateScaleDefinition(c.definition,{instrumentClass:'STANDARD',forPublish:false,scorerKeys:getScaleCustomScorerKeys()})
    const errors=validation.issues.filter(i=>i.severity==='error')
    if(errors.length)throw new z.ZodError(errors.map(i=>({code:'custom',path:['changedParts','CONTENT','definition',...i.path.split('.')],message:i.message})))
  }
  return draft
}
export const componentDraftHash=(draft:ComponentDraft)=>canonicalHash(draft)
export function emptyReport(scores:ScaleDefinitionV2['scoring']['scores']):ScaleDefinitionV2['report']{
  return {reportVersion:'none-v1',primaryScoreKeys:scores.map(s=>s.key),scoreOrder:scores.map(s=>s.key),interpretations:scores.map(s=>({scoreKey:s.key,headline:s.label,source:{type:'score_only'},summary:'本配置不提供文字报告。',bands:[],guidance:[]})),limitations:[],disclaimer:'本配置不提供文字报告。'}
}
