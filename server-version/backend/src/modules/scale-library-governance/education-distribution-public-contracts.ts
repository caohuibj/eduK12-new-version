import {z} from 'zod'
import {educationLibraryProduct} from './contracts'
const uuid=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/)
const exact={releaseId:uuid,contentHash:hash,grantId:uuid.optional()}
const query={...exact,product:educationLibraryProduct,keyword:z.string().trim().max(100).default(''),cursor:uuid.optional()}
export const educationRecipientInput=z.union([
 z.object({...query,scopeKind:z.literal('ORGANIZATION')}).strict(),
 z.object({...query,scopeKind:z.literal('USER'),organizationId:uuid}).strict(),
])
export type EducationRecipientInput=z.infer<typeof educationRecipientInput>
const grant={...exact,product:educationLibraryProduct,requestId:uuid,expectedGrantVersion:z.number().int().positive().optional(),organizationId:uuid}
export const educationPublicGrantInput=z.union([
 z.object({...grant,scopeKind:z.literal('ORGANIZATION'),userId:z.null()}).strict(),
 z.object({...grant,scopeKind:z.literal('USER'),userId:uuid}).strict(),
])
