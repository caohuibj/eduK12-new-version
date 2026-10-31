import {z} from 'zod'
const id=z.string().guid()
export const educationMarkerBindingSchema=z.object({schemaVersion:z.literal(1),product:z.enum(['SCHOOL','TEACHER']),organizationId:id,resourceId:id,
 sourceCompositeId:id,sourceItemId:id,runtimeCompositeId:id,runtimeItemId:id,ownerId:id,
 resourceVersion:z.literal('2.0.0').optional()}).strict()
export type EducationMarkerBinding=z.infer<typeof educationMarkerBindingSchema>
