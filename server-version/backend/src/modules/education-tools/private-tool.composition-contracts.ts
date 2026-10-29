import {disclosureCapabilitiesV1Schema} from '../scale/policy/schema'
import {assessmentContextKeySchema} from '../assessment-context/context'
import {z} from 'zod'
import {resultAudiencePolicySchema} from '../assessment-policy/result-disclosure'
import {compileEducationApplicability} from '../scale-library-governance/education-applicability'
import {expertCompositionAdministrationSchema,expertTargetKindSchema,isExpertComposition} from './expert-observation.contract'
import {educationCognitiveSourceSchema,educationSjtSourceSchema} from './native-source.contracts'
import {selectedConfigurationPointerSchema} from '../assessment-authorization/standard-configuration-binding'

const id=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/)
// P1 consumes immutable author-private leaves. Public/native providers are added
// by their own resolver adapters; neither a package nor a composition is a leaf.
export const privateCompositionSourceSchema=z.discriminatedUnion('provider',[
 z.object({provider:z.literal('PRIVATE_VERSION'),kind:z.enum(['SCALE','FORM']),versionId:id,contentHash:hash}).strict(),
 z.object({provider:z.literal('LIBRARY_SCALE'),kind:z.literal('SCALE'),versionId:id,contentHash:hash}).strict(),
 z.object({provider:z.literal('STANDARD_SCALE'),kind:z.literal('SCALE'),versionId:id,contentHash:hash,selectedBinding:selectedConfigurationPointerSchema.optional()}).strict(),
 z.object({provider:z.literal('PUBLIC_FORM'),kind:z.literal('FORM'),versionId:id,contentHash:hash}).strict(),
 educationCognitiveSourceSchema,educationSjtSourceSchema,
])
export const educationCompositionResponseModeSchema=z.enum(['SELF','PARENT_REPORT','TEACHER_REPORT','STUDENT_REPORT','EXPERT_REPORT'])
const v1AdministrationSchema=z.discriminatedUnion('population',[
 z.object({population:z.literal('STUDENT'),responseMode:z.enum(['SELF','PARENT_REPORT','TEACHER_REPORT'])}).strict(),
 z.object({population:z.literal('TEACHER'),responseMode:z.enum(['SELF','STUDENT_REPORT'])}).strict(),
])
export const privateCompositionAdministrationSchema=z.union([v1AdministrationSchema,expertCompositionAdministrationSchema])
/** Read-only catalog/preview filter. Task identity still comes from the sealed
 * version in the write adapter, never from this client-selected filter. */
export const educationCompositionAdministrationForEntry=(entry:'SCHOOL'|'TEACHER',responseMode:unknown='SELF',targetKind?:unknown)=>
 privateCompositionAdministrationSchema.parse({population:entry==='SCHOOL'?'STUDENT':'TEACHER',responseMode,...(targetKind!==undefined?{targetKind}:{})})
export const privateCompositionDefinitionSchema=z.object({schemaVersion:z.union([z.literal(1),z.literal(2)]),adapterVersion:z.enum(['1.0.0','2.0.0']),
 administration:privateCompositionAdministrationSchema,
 contextFields:z.array(z.object({contextKey:assessmentContextKeySchema,formType:z.enum(['year_month','single_choice','fill_blank']),formLabel:z.string().min(1).max(240),formOptions:z.array(z.object({value:z.string().min(1).max(240),label:z.string().min(1).max(240)}).strict()).max(50)}).strict()).min(1).max(5).optional(),
 instruction:z.string().max(16000),blocks:z.array(z.object({blockId:id,instruction:z.string().max(16000),
  source:privateCompositionSourceSchema}).strict()).max(50),
}).strict().superRefine((value,ctx)=>{
 if(isExpertComposition(value)?value.schemaVersion!==2||value.adapterVersion!=='2.0.0':value.schemaVersion!==1||value.adapterVersion!=='1.0.0')
  ctx.addIssue({code:'custom',message:'专家观察必须使用独立的 V2 合同，既有施测方式保持 V1'})
 if(isExpertComposition(value)&&value.contextFields?.length)ctx.addIssue({code:'custom',message:'专家背景不能作为受评教师的计分背景'})
 if(value.administration.responseMode!=='SELF'&&value.blocks.some(block=>['COGNITIVE','SJT'].includes(block.source.kind)))ctx.addIssue({code:'custom',message:'认知与 SJT 只能本人作答'})
 if(value.contextFields&&new Set(value.contextFields.map(field=>field.contextKey)).size!==value.contextFields.length)ctx.addIssue({code:'custom',path:['contextFields'],message:'背景字段不能重复'})
 if(new Set(value.blocks.map(block=>block.blockId)).size!==value.blocks.length)
  ctx.addIssue({code:'custom',path:['blocks'],message:'问卷工具块身份不能重复'})
})
export type PrivateCompositionDefinition=z.infer<typeof privateCompositionDefinitionSchema>

export const educationCompositionOriginSchema=z.object({schemaVersion:z.union([z.literal(1),z.literal(2)]),adapterVersion:z.enum(['1.0.0','2.0.0']),
 mode:z.literal('COMPOSITION'),entry:z.enum(['SCHOOL','TEACHER']),organizationId:id,ownerUserId:id,toolId:id,
 versionId:id,contentHash:hash,variantKey:z.enum(['STUDENT:SELF','STUDENT:PARENT_REPORT','STUDENT:TEACHER_REPORT','TEACHER:SELF','TEACHER:STUDENT_REPORT','TEACHER:EXPERT_REPORT']),targetKind:expertTargetKindSchema.optional()}).strict()
 .superRefine((origin,ctx)=>{
  if(origin.variantKey.startsWith('STUDENT:')!==(origin.entry==='SCHOOL'))
   ctx.addIssue({code:'custom',message:'教育入口与施测对象不匹配'})
  if(isExpertComposition(origin)?origin.schemaVersion!==2||origin.adapterVersion!=='2.0.0'||origin.entry!=='TEACHER'||!origin.targetKind:
    origin.schemaVersion!==1||origin.adapterVersion!=='1.0.0'||origin.targetKind!==undefined)
   ctx.addIssue({code:'custom',message:'专家观察身份必须与显式 V2 目标声明一致'})
 })
/** Existing applicability compiler supplies role/relationship semantics. This
 * describes a fixed version; it grants no actor, relationship or report right. */
export function educationCompositionVariant(origin:Pick<z.infer<typeof educationCompositionOriginSchema>,'variantKey'>){
 if(isExpertComposition(origin))throw Error('EXPERT_OBSERVATION_REQUIRES_FIELD_AUTHORITY')
 const [population,responseMode]=origin.variantKey.split(':')
 return compileEducationApplicability({schemaVersion:1,administrations:[{population,responseMode}]}).variants[0]
}
export function matchesEducationCompositionRespondent(origin:Pick<z.infer<typeof educationCompositionOriginSchema>,'variantKey'>,assignment:{
 subjectUserId:string;respondentUserId:string;subjectRole:string;respondentRole:string;relationshipKind:string;perspective:string;
}){
 const variant=educationCompositionVariant(origin)
 return assignment.subjectRole===variant.subjectRole&&assignment.respondentRole===variant.respondentRole
  &&assignment.perspective===variant.perspective&&variant.relationshipKinds.some(kind=>kind===assignment.relationshipKind)
  &&(variant.responseMode==='SELF')===(assignment.subjectUserId===assignment.respondentUserId)
}
export const educationCompositionBindingSchema=z.object({schemaVersion:z.literal(1),origin:educationCompositionOriginSchema,
 sealed:z.literal(true),context:z.object({sectionId:id,itemIds:z.array(id).min(1).max(5)}).strict().optional(),manifest:z.array(z.object({blockId:id,instruction:z.string().max(16000),kind:z.enum(['SCALE','FORM','COGNITIVE','SJT']),versionId:id,contentHash:hash,
  sourceProvider:z.enum(['PRIVATE_VERSION','PUBLIC_FORM','STANDARD_SCALE','LIBRARY_SCALE','COGNITIVE_CONFIG','SJT_RELEASE']),sourceInstruction:z.string().max(16000).optional(),
  toolId:id,itemIds:z.array(id).min(1).max(1000),sectionIds:z.array(id).max(500)}).strict()).min(1).max(50),
}).strict().superRefine((binding,ctx)=>{
 const {manifest}=binding
 for(const field of ['blockId','itemIds','sectionIds'] as const){
  const values=manifest.flatMap(block=>field==='blockId'?[block.blockId]:block[field])
  if(new Set(values).size!==values.length)ctx.addIssue({code:'custom',message:'封存映射身份重复'})
 }
 if(manifest.some(block=>block.kind!=='FORM'?(block.itemIds.length!==1||block.sectionIds.length!==0):block.sectionIds.length===0))
  ctx.addIssue({code:'custom',message:'工具映射与原始类型不匹配'})
 if(manifest.some(block=>['STANDARD_SCALE','LIBRARY_SCALE'].includes(block.sourceProvider)&&block.kind!=='SCALE'))ctx.addIssue({code:'custom',message:'标准量表不能冒充其他工具'})
 if(manifest.some(block=>block.sourceProvider==='PUBLIC_FORM'&&block.kind!=='FORM'))ctx.addIssue({code:'custom',message:'公共表单不能冒充计分工具'})
 if(manifest.some(block=>block.sourceProvider==='COGNITIVE_CONFIG'?block.kind!=='COGNITIVE':block.sourceProvider==='SJT_RELEASE'?block.kind!=='SJT':['COGNITIVE','SJT'].includes(block.kind)))ctx.addIssue({code:'custom',message:'原生单元必须保留精确来源类型'})
 if(!binding.origin.variantKey.endsWith(':SELF')&&manifest.some(block=>['COGNITIVE','SJT'].includes(block.kind)))ctx.addIssue({code:'custom',message:'原生认知和 SJT 不能作为他评'})
 if(manifest.reduce((sum,block)=>sum+block.itemIds.length,0)>1000)
  ctx.addIssue({code:'custom',message:'问卷运行单元过多'})
})
export type EducationCompositionBinding=z.infer<typeof educationCompositionBindingSchema>
export type EducationCompositionOrigin=z.infer<typeof educationCompositionOriginSchema>
export const educationCompositionKey=(origin:EducationCompositionOrigin)=>
 `education-composition:${origin.entry}:${origin.versionId}:${origin.variantKey}:${origin.adapterVersion}`

export const educationCompositionResourceKeySchema=z.string().regex(/^education-composition:(?:(?:SCHOOL:[0-9a-f-]{36}:STUDENT:(?:SELF|PARENT_REPORT|TEACHER_REPORT)|TEACHER:[0-9a-f-]{36}:TEACHER:(?:SELF|STUDENT_REPORT)):1\.0\.0|TEACHER:[0-9a-f-]{36}:TEACHER:EXPERT_REPORT:2\.0\.0)$/)
export const privateCompositionSelectionSchema=z.object({versionId:id,contentHash:hash}).strict()
/** Frozen task anchor. Native scores are scoped to a block, never pooled into
 * an invented cross-tool score or widened by a same-named score in another unit. */
export const educationCompositionPolicyBindingSchema=z.object({origin:educationCompositionOriginSchema,manifestHash:hash,
 unitReports:z.array(z.object({blockId:id,versionId:id,contentHash:hash,respondent:resultAudiencePolicySchema,subject:resultAudiencePolicySchema.optional()}).strict()).max(50),
}).strict()
export type EducationCompositionPolicyBinding=z.infer<typeof educationCompositionPolicyBindingSchema>
export const educationCompositionRuntimeAnchorSchema=educationCompositionPolicyBindingSchema.pick({origin:true,manifestHash:true})
export type EducationCompositionRuntimeAnchor=z.infer<typeof educationCompositionRuntimeAnchorSchema>

/** Exact approved source descriptor; authority stays outside frozen content. */
export const educationStandardSourceSchema=z.object({releaseId:id,combinationHash:hash,toolKey:z.string().min(1),instrumentVersion:z.string().min(1),
 nativeDefinitionHash:hash,parametersAxisHash:hash,reportAxisHash:hash,respondentDisclosure:disclosureCapabilitiesV1Schema,reportAudience:z.enum(['student','teacher','parent'])}).strict()
export type EducationStandardSource=z.infer<typeof educationStandardSourceSchema>

export const educationLibrarySourceSchema=z.object({entryId:id,approvedSnapshotHash:hash,nativeDefinitionHash:hash,
 presentationMode:z.enum(['ALL_AT_ONCE','ONE_BY_ONE','RUNNER_DEFAULT']),reportMode:z.enum(['NATIVE','DECLARED'])}).strict()
export type EducationLibrarySource=z.infer<typeof educationLibrarySourceSchema>
