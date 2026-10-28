import {disclosureCapabilitiesV1Schema} from '../scale/policy/schema'
import {assessmentContextKeySchema} from '../assessment-context/context'
import {z} from 'zod'
import {resultAudiencePolicySchema} from '../assessment-policy/result-disclosure'

const id=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/)
// P1 consumes immutable author-private leaves. Public/native providers are added
// by their own resolver adapters; neither a package nor a composition is a leaf.
export const privateCompositionSourceSchema=z.discriminatedUnion('provider',[
 z.object({provider:z.literal('PRIVATE_VERSION'),kind:z.enum(['SCALE','FORM']),versionId:id,contentHash:hash}).strict(),
 z.object({provider:z.literal('STANDARD_SCALE'),kind:z.literal('SCALE'),versionId:id,contentHash:hash}).strict(),
 z.object({provider:z.literal('PUBLIC_FORM'),kind:z.literal('FORM'),versionId:id,contentHash:hash}).strict(),
])
export const privateCompositionDefinitionSchema=z.object({schemaVersion:z.literal(1),adapterVersion:z.literal('1.0.0'),
 administration:z.object({population:z.enum(['STUDENT','TEACHER']),responseMode:z.literal('SELF')}).strict(),
 contextFields:z.array(z.object({contextKey:assessmentContextKeySchema,formType:z.enum(['year_month','single_choice','fill_blank']),formLabel:z.string().min(1).max(240),formOptions:z.array(z.object({value:z.string().min(1).max(240),label:z.string().min(1).max(240)}).strict()).max(50)}).strict()).min(1).max(5).optional(),
 instruction:z.string().max(16000),blocks:z.array(z.object({blockId:id,instruction:z.string().max(16000),
  source:privateCompositionSourceSchema}).strict()).max(50),
}).strict().superRefine((value,ctx)=>{
 if(value.contextFields&&new Set(value.contextFields.map(field=>field.contextKey)).size!==value.contextFields.length)ctx.addIssue({code:'custom',path:['contextFields'],message:'背景字段不能重复'})
 if(new Set(value.blocks.map(block=>block.blockId)).size!==value.blocks.length)
  ctx.addIssue({code:'custom',path:['blocks'],message:'问卷工具块身份不能重复'})
})
export type PrivateCompositionDefinition=z.infer<typeof privateCompositionDefinitionSchema>

export const educationCompositionOriginSchema=z.object({schemaVersion:z.literal(1),adapterVersion:z.literal('1.0.0'),
 mode:z.literal('COMPOSITION'),entry:z.enum(['SCHOOL','TEACHER']),organizationId:id,ownerUserId:id,toolId:id,
 versionId:id,contentHash:hash,variantKey:z.enum(['STUDENT:SELF','TEACHER:SELF'])}).strict()
export const educationCompositionBindingSchema=z.object({schemaVersion:z.literal(1),origin:educationCompositionOriginSchema,
 sealed:z.literal(true),context:z.object({sectionId:id,itemIds:z.array(id).min(1).max(5)}).strict().optional(),manifest:z.array(z.object({blockId:id,instruction:z.string().max(16000),kind:z.enum(['SCALE','FORM']),versionId:id,contentHash:hash,
  sourceProvider:z.enum(['PRIVATE_VERSION','PUBLIC_FORM','STANDARD_SCALE']),sourceInstruction:z.string().max(16000).optional(),
  toolId:id,itemIds:z.array(id).min(1).max(1000),sectionIds:z.array(id).max(500)}).strict()).min(1).max(50),
}).strict().superRefine((binding,ctx)=>{
 const {origin,manifest}=binding
 if(origin.variantKey!==(origin.entry==='SCHOOL'?'STUDENT:SELF':'TEACHER:SELF'))
  ctx.addIssue({code:'custom',message:'教育入口与施测对象不匹配'})
 for(const field of ['blockId','itemIds','sectionIds'] as const){
  const values=manifest.flatMap(block=>field==='blockId'?[block.blockId]:block[field])
  if(new Set(values).size!==values.length)ctx.addIssue({code:'custom',message:'封存映射身份重复'})
 }
 if(manifest.some(block=>block.kind==='SCALE'?(block.itemIds.length!==1||block.sectionIds.length!==0):block.sectionIds.length===0))
  ctx.addIssue({code:'custom',message:'工具映射与原始类型不匹配'})
 if(manifest.some(block=>block.sourceProvider==='STANDARD_SCALE'&&block.kind!=='SCALE'))ctx.addIssue({code:'custom',message:'标准量表不能冒充其他工具'})
 if(manifest.some(block=>block.sourceProvider==='PUBLIC_FORM'&&block.kind!=='FORM'))ctx.addIssue({code:'custom',message:'公共表单不能冒充计分工具'})
 if(manifest.reduce((sum,block)=>sum+block.itemIds.length,0)>1000)
  ctx.addIssue({code:'custom',message:'问卷运行单元过多'})
})
export type EducationCompositionBinding=z.infer<typeof educationCompositionBindingSchema>
export type EducationCompositionOrigin=z.infer<typeof educationCompositionOriginSchema>
export const educationCompositionKey=(origin:EducationCompositionOrigin)=>
 `education-composition:${origin.entry}:${origin.versionId}:${origin.variantKey}:${origin.adapterVersion}`

export const educationCompositionResourceKeySchema=z.string().regex(/^education-composition:(SCHOOL|TEACHER):[0-9a-f-]{36}:(STUDENT|TEACHER):SELF:1\.0\.0$/)
export const privateCompositionSelectionSchema=z.object({versionId:id,contentHash:hash}).strict()
/** Frozen task anchor. Native scores are scoped to a block, never pooled into
 * an invented cross-tool score or widened by a same-named score in another unit. */
export const educationCompositionPolicyBindingSchema=z.object({origin:educationCompositionOriginSchema,manifestHash:hash,
 unitReports:z.array(z.object({blockId:id,versionId:id,contentHash:hash,respondent:resultAudiencePolicySchema}).strict()).max(50),
}).strict()
export type EducationCompositionPolicyBinding=z.infer<typeof educationCompositionPolicyBindingSchema>
export const educationCompositionRuntimeAnchorSchema=educationCompositionPolicyBindingSchema.pick({origin:true,manifestHash:true})
export type EducationCompositionRuntimeAnchor=z.infer<typeof educationCompositionRuntimeAnchorSchema>

/** Exact approved source descriptor; authority stays outside frozen content. */
export const educationStandardSourceSchema=z.object({releaseId:id,combinationHash:hash,toolKey:z.string().min(1),instrumentVersion:z.string().min(1),
 nativeDefinitionHash:hash,parametersAxisHash:hash,reportAxisHash:hash,respondentDisclosure:disclosureCapabilitiesV1Schema,reportAudience:z.enum(['student','teacher','parent'])}).strict()
export type EducationStandardSource=z.infer<typeof educationStandardSourceSchema>
