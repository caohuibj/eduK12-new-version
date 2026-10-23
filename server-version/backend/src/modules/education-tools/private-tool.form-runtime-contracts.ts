import {z} from 'zod'
import {privateScaleRuntimeInput,privateScaleVariant} from './private-tool.runtime-origin'
export const privateFormRuntimeInput=privateScaleRuntimeInput
export const privateFormVariant=privateScaleVariant
export const privateFormOriginSchema=z.object({schemaVersion:z.literal(1),adapterVersion:z.literal('1.0.0'),
 kind:z.literal('AUTHOR_PRIVATE_FORM'),entry:z.enum(['SCHOOL','TEACHER']),organizationId:z.string().uuid(),ownerUserId:z.string().uuid(),
 toolId:z.string().uuid(),versionId:z.string().uuid(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),
 variantKey:z.enum(['STUDENT:SELF','STUDENT:PARENT_REPORT','STUDENT:TEACHER_REPORT','TEACHER:SELF']),}).strict()
export type PrivateFormOrigin=z.infer<typeof privateFormOriginSchema>
export const privateFormResourceKey=(o:PrivateFormOrigin)=>`private-form:${o.entry}:${o.versionId}:${o.variantKey}`
export const privateFormResourceKeySchema=z.string().regex(/^private-form:(SCHOOL|TEACHER):[a-f0-9-]{36}:(STUDENT:(SELF|PARENT_REPORT|TEACHER_REPORT)|TEACHER:SELF)$/)
export type PrivateFormCompatibilityIssue={pageKey:string|null;itemKey:string|null;reason:string;message:string}
