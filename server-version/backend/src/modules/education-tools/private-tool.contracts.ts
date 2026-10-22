import {z} from 'zod'
import type {AuthenticatedPrincipal} from '../../types'
import type {EducationToolEntry} from './access'
export type PrivateToolContext={principal:Pick<AuthenticatedPrincipal,'userId'|'accountDomain'>;entry:EducationToolEntry;organizationId:string}
export const privateToolKind=z.enum(['SCALE','FORM'])
export type PrivateToolKind=z.infer<typeof privateToolKind>
export const privateToolId=z.string().uuid()
const title=z.string().trim().min(1).max(200)
export const createPrivateToolInput=z.object({kind:privateToolKind,title}).strict()
export const updatePrivateToolInput=z.object({expectedRevision:z.number().int().positive(),title,definition:z.record(z.unknown())}).strict()
export const freezePrivateToolInput=z.object({expectedRevision:z.number().int().positive(),expectedContentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()
export const previewPrivateToolInput=z.object({answers:z.unknown().optional(),rawScores:z.record(z.number().finite()).optional()}).strict()
export class EducationPrivateToolError extends Error {
 constructor(readonly code:string,readonly statusCode=409,readonly issues:unknown[]=[]){super(code)}
}
export function privateToolFail(code:string,status=409,issues:unknown[]=[]):never{throw new EducationPrivateToolError(code,status,issues)}
