import {z} from 'zod'
import {compileEducationApplicability} from '../scale-library-governance/education-applicability'
import {isSupportedEducationLibraryVariant} from '../scale-library-governance/education-supported-variants'
import {privateToolFail} from './private-tool.contracts'
const uuid=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/)
export const privateScaleRuntimeOriginSchema=z.object({
 schemaVersion:z.literal(1),adapterVersion:z.literal('1.0.0'),kind:z.literal('AUTHOR_PRIVATE'),
 entry:z.enum(['SCHOOL','TEACHER']),organizationId:uuid,ownerUserId:uuid,toolId:uuid,versionId:uuid,
 contentHash:hash,definitionHash:hash,releaseId:uuid,releaseHash:hash,
 variantKey:z.enum(['STUDENT:SELF','STUDENT:PARENT_REPORT','STUDENT:TEACHER_REPORT','TEACHER:SELF']),
}).strict()
export type PrivateScaleRuntimeOrigin=z.infer<typeof privateScaleRuntimeOriginSchema>
export const privateScaleRuntimeInput=z.object({versionId:uuid,contentHash:hash,
 administration:z.object({population:z.enum(['STUDENT','TEACHER']),responseMode:z.enum(['SELF','PARENT_REPORT','TEACHER_REPORT','STUDENT_REPORT'])}).strict(),
}).strict()
export const privateScaleCode=(versionId:string)=>'education-private-scale:'+uuid.parse(versionId)
export const privateScaleResourceKey=(origin:PrivateScaleRuntimeOrigin)=>`private-scale:${origin.entry}:${origin.versionId}:${origin.variantKey}`
export function privateScaleVariant(entry:PrivateScaleRuntimeOrigin['entry'],administration:unknown){
 const variant=compileEducationApplicability({schemaVersion:1,administrations:[administration]}).variants[0]
 if(!isSupportedEducationLibraryVariant(entry,variant.variantKey))privateToolFail('PRIVATE_TOOL_RUNTIME_VARIANT_UNSUPPORTED')
 return variant
}
