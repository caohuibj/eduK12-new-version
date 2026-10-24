import {educationApplicabilitySchema} from './education-applicability'
import {z} from 'zod'
export const libraryProduct=z.enum(['TRAINING','SURVEY','SCHOOL','TEACHER'])
// Authoring origin is distinct from legacy, organization-free use authority.
export const legacyLibraryProduct=z.enum(['TRAINING','SURVEY'])
export type LegacyLibraryProduct=z.infer<typeof legacyLibraryProduct>
export const librarySourceProduct=z.enum(['TRAINING','SURVEY','SCHOOL','TEACHER'])
export type LibrarySourceProduct=z.infer<typeof librarySourceProduct>
export const educationLibraryProduct=z.enum(['SCHOOL','TEACHER'])
export type EducationLibraryProduct=z.infer<typeof educationLibraryProduct>
export type LibraryProduct=z.infer<typeof libraryProduct>
export const libraryMetadata=z.object({
  title:z.string().trim().min(1).max(200),author:z.string().trim().min(1).max(500),
  copyright:z.string().trim().min(1).max(2000),applicability:z.string().trim().min(1).max(2000),
  scoringDescription:z.string().trim().min(1).max(4000),reportDescription:z.string().trim().min(1).max(4000),
}).strict()
export const submissionInput=z.object({requestId:z.string().guid(),releaseId:z.string().guid(),metadata:libraryMetadata,
  educationApplicability:educationApplicabilitySchema.optional(),
  mediaConsent:z.object({manifestHash:z.string().regex(/^[a-f0-9]{64}$/),shareWithAuthorizedUsers:z.literal(true)}).strict().optional(),
  dependencyReleaseIds:z.array(z.string().guid()).max(20).refine(v=>new Set(v).size===v.length).default([])}).strict()
const reason=z.string().trim().min(1).max(1000)
export const transitionInput=z.object({expectedVersion:z.number().int().positive(),reason}).strict()
export const reviewInput=transitionInput.extend({decision:z.enum(['APPROVE','RETURN']),grantId:z.string().guid().optional()}).strict()
export const entryStatusInput=transitionInput.extend({status:z.enum(['WITHDRAWN','EMERGENCY_DISABLED']),grantId:z.string().guid().optional()}).strict()
const distributionBase={requestId:z.string().guid(),grantId:z.string().guid().optional(),expectedGrantVersion:z.number().int().positive().optional()}
export const legacyDistributionInput=z.object({...distributionBase,userId:z.string().guid(),product:legacyLibraryProduct,
  scopeKind:z.literal('USER').default('USER')}).strict()
export const educationDistributionInput=z.union([
  z.object({...distributionBase,product:educationLibraryProduct,scopeKind:z.literal('USER'),organizationId:z.string().guid(),userId:z.string().guid()}).strict(),
  // Organization-wide use must be explicit. No user is inferred or silently ignored.
  z.object({...distributionBase,product:educationLibraryProduct,scopeKind:z.literal('ORGANIZATION'),organizationId:z.string().guid(),userId:z.null().default(null)}).strict(),
])
export const distributionInput=z.union([legacyDistributionInput,educationDistributionInput])
export const EDUCATION_LIBRARY_ADAPTER_NOT_READY='EDUCATION_LIBRARY_ADAPTER_NOT_READY'
export const libraryAdminEntry={TRAINING:'TRAINING',SURVEY:'SURVEY',SCHOOL:'HUISCHOOL',TEACHER:'HUITEACHER'} as const
export const educationLibraryEntry={SCHOOL:'HUISCHOOL',TEACHER:'HUITEACHER'} as const
export class ScaleLibraryError extends Error {
  constructor(public readonly statusCode:number,message:string){super(message);this.name='ScaleLibraryError'}
}
// A declaration makes the never-returning control-flow contract visible to callers.
// Keep the same exception/status: this is not an authorization fallback.
export function fail(message: string, status = 409): never {
  throw new ScaleLibraryError(status, message)
}
export const LIBRARY_SCOPE='scale-library-governance'
