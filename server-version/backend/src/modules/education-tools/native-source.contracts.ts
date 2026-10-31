import {z} from 'zod'
import {selectedConfigurationPointerSchema} from '../assessment-authorization/standard-configuration-binding'

const id=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/)
export const educationCognitiveProfileSchema=z.enum(['experience','standard','research'])
export const educationCognitiveSourceSchema=z.object({provider:z.literal('COGNITIVE_CONFIG'),kind:z.literal('COGNITIVE'),versionId:id,contentHash:hash,profile:educationCognitiveProfileSchema,artifactHash:hash.optional(),selectedBinding:selectedConfigurationPointerSchema.optional()}).strict().superRefine((source,ctx)=>{if(Boolean(source.artifactHash)!==Boolean(source.selectedBinding))ctx.addIssue({code:'custom',message:'精确认知配置必须同时保留 artifact 与原授权'})})
export const educationSjtSourceSchema=z.object({provider:z.literal('SJT_RELEASE'),kind:z.literal('SJT'),versionId:id,contentHash:hash}).strict()
/** The original U names the immutable native config/release. A selected profile
 * is separately frozen into the root version and the native child; it is never
 * inferred from an assignment, an entry name or a missing snapshot. */
export const educationNativeDescriptorSchema=z.discriminatedUnion('provider',[
 z.object({provider:z.literal('COGNITIVE_CONFIG'),sourceId:id,contentHash:hash,sourceMeasurementReleaseId:id,profile:educationCognitiveProfileSchema,
  profileDefinitionVersion:z.string().min(1).max(240),resolvedConfigHash:hash,reportHash:hash,artifactHash:hash.optional(),selectedBinding:selectedConfigurationPointerSchema.optional()}).strict(),
 z.object({provider:z.literal('SJT_RELEASE'),sourceId:id,contentHash:hash}).strict(),
])
export type EducationNativeDescriptor=z.infer<typeof educationNativeDescriptorSchema>
