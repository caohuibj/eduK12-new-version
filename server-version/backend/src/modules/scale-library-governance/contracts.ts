import {z} from 'zod'
export const libraryProduct=z.enum(['TRAINING','SURVEY'])
export type LibraryProduct=z.infer<typeof libraryProduct>
export const libraryMetadata=z.object({
  title:z.string().trim().min(1).max(200),author:z.string().trim().min(1).max(500),
  copyright:z.string().trim().min(1).max(2000),applicability:z.string().trim().min(1).max(2000),
  scoringDescription:z.string().trim().min(1).max(4000),reportDescription:z.string().trim().min(1).max(4000),
}).strict()
export const submissionInput=z.object({requestId:z.string().uuid(),releaseId:z.string().uuid(),metadata:libraryMetadata,
  mediaConsent:z.object({manifestHash:z.string().regex(/^[a-f0-9]{64}$/),shareWithAuthorizedUsers:z.literal(true)}).strict().optional(),
  dependencyReleaseIds:z.array(z.string().uuid()).max(20).refine(v=>new Set(v).size===v.length).default([])}).strict()
const reason=z.string().trim().min(1).max(1000)
export const transitionInput=z.object({expectedVersion:z.number().int().positive(),reason}).strict()
export const reviewInput=transitionInput.extend({decision:z.enum(['APPROVE','RETURN']),grantId:z.string().uuid().optional()}).strict()
export const entryStatusInput=transitionInput.extend({status:z.enum(['WITHDRAWN','EMERGENCY_DISABLED']),grantId:z.string().uuid().optional()}).strict()
export const distributionInput=z.object({requestId:z.string().uuid(),userId:z.string().uuid(),product:libraryProduct,
  grantId:z.string().uuid().optional(),expectedGrantVersion:z.number().int().positive().optional()}).strict()
export class ScaleLibraryError extends Error {
  constructor(public readonly statusCode:number,message:string){super(message);this.name='ScaleLibraryError'}
}
// A declaration makes the never-returning control-flow contract visible to callers.
// Keep the same exception/status: this is not an authorization fallback.
export function fail(message: string, status = 409): never {
  throw new ScaleLibraryError(status, message)
}
export const LIBRARY_SCOPE='scale-library-governance'
