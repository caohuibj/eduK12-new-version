import {z} from 'zod'
import type {ContentGrantInput} from '../measurement-content/content-authority'

// Exact immutable public origins, not a Composite wrapper, a mutable private
// template, a wildcard, or a right to adapt/distribute the original.
const id=z.string().guid(),hash=z.string().regex(/^[a-f0-9]{64}$/)
export const educationPublicSource=z.object({kind:z.enum(['STANDARD_SCALE','FORM']),id,hash}).strict()
export type EducationPublicSource=z.infer<typeof educationPublicSource>
export const educationPublicSourceKey=(source:EducationPublicSource)=>`education-source:${source.kind}:${source.id}:${source.hash}`
export function parseEducationPublicSourceKey(key:string):EducationPublicSource|null{
 const [prefix,kind,sourceId,contentHash,...extra]=key.split(':')
 if(prefix!=='education-source'||extra.length)return null
 const parsed=educationPublicSource.safeParse({kind,id:sourceId,hash:contentHash})
 return parsed.success?parsed.data:null
}
export function educationMaterialUse(grant:Pick<ContentGrantInput,'scope'|'capabilities'>){
 return ['SCHOOL','TEACHER'].includes(grant.scope.product)&&grant.scope.scopeKind==='ORGANIZATION'
  &&grant.scope.resourceKind==='material'&&grant.capabilities.length===1&&grant.capabilities[0]==='material.use'
}
