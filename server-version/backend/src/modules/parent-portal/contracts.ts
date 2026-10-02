import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'

export class ParentPortalError extends Error {
  constructor(readonly code: string, readonly status: number, message = '内容不存在或无权访问') { super(message) }
}
export const fail = (code = 'PARENT_RESOURCE_NOT_FOUND', status = 404, message?: string): never => { throw new ParentPortalError(code, status, message) }
export const LINK_CONSENT_VERSION = 'parent-link-student-confirmation-v1'
export const LINK_CONSENT_TEXT = '我确认此账号为需要关联的家长。关联允许查看有限的孩子概况；每份报告需要我另外同意并经过报告披露授权。双方可以解除关联。'
export const REPORT_CONSENT_VERSION = 'parent-report-exact-artifact-v1'
export const REPORT_CONSENT_TEXT = '我同意将预览中这一份报告提供给所选家长。同意有效期为30天，还需独立的报告披露授权才可查看；我可以随时撤回同意。此同意不包含原始作答或其他报告。'
const hash = z.string().regex(/^[0-9a-f]{64}$/)
const text = z.string().max(10000)
const parentPolicy = z.object({ key:z.string().min(1).max(128), version:z.string().min(1).max(128), audience:z.literal('PARENT'), mode:z.enum(['COMPLETION_ONLY','EDUCATIONAL_SUMMARY']), rawAnswers:z.literal(false), itemLevel:z.literal(false), researchExport:z.literal(false) }).strict()
export const parentToolRefSchema=z.object({family:z.enum(['SCALE','FORM','BUNDLE','COGNITIVE','SITUATIONAL']),key:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),version:z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/)}).strict()
export const parentProjectionSchema = z.object({
  schemaVersion:z.literal(1), audience:z.literal('PARENT'), artifactId:z.string().min(1), subjectUserId:z.string().min(1),
  title:z.string().min(1).max(200), publicationStatus:z.literal('PUBLISHED'), policy:parentPolicy, policyHash:hash,
  toolRef:parentToolRefSchema.optional(),disclosedMetricKeys:z.array(z.string().min(1)).max(100).optional(),disclosedLongitudinalMetricKeys:z.array(z.string().min(1)).max(100).optional(),
  summary:text, blocks:z.array(z.object({title:z.string().max(200),text}).strict()).max(30),
}).strict().superRefine((value,ctx)=>{
  if((value.disclosedLongitudinalMetricKeys||[]).some(key=>!value.disclosedMetricKeys?.includes(key)))ctx.addIssue({code:z.ZodIssueCode.custom,message:'longitudinal metrics require declared metric provenance'})
  if(canonicalHash(value.policy)!==value.policyHash)ctx.addIssue({code:z.ZodIssueCode.custom,message:'parent policy hash mismatch'})
  if(value.policy.mode==='COMPLETION_ONLY'&&(value.summary!==''||value.blocks.length||value.disclosedMetricKeys?.length||value.disclosedLongitudinalMetricKeys?.length))ctx.addIssue({code:z.ZodIssueCode.custom,message:'completion-only projection cannot carry interpretation'})
})
export type ParentProjection = z.infer<typeof parentProjectionSchema>
export interface ParentReportSource { artifactId:string; subjectUserId:string; organizationId:string|null; policyDomain:string; sourceHash:string; projection:ParentProjection }
export function parseParentProjection(value:unknown, artifactId:string, subjectUserId:string):ParentProjection {
  const result=parentProjectionSchema.safeParse(value)
  if(!result.success||result.data.artifactId!==artifactId||result.data.subjectUserId!==subjectUserId) return fail('PARENT_PROJECTION_UNAVAILABLE')
  return result.data
}
export function assertStudentConfirmation(input:{actorUserId:string;studentUserId:string;status:string;consentVersion:string}) {
  if(input.actorUserId!==input.studentUserId)return fail()
  if(input.status!=='PENDING')return fail('PARENT_LINK_STATE',409,'关联状态已变化，请刷新')
  if(input.consentVersion!==LINK_CONSENT_VERSION)return fail('PARENT_CONSENT_VERSION',409,'同意内容已变化，请重新确认')
}
export function assertExactReportBinding(input:{parentUserId:string;studentUserId:string;relationshipId:string;artifactId:string},grant:{parentUserId:string;studentUserId:string;relationshipId:string;sourceArtifactId:string}) {
  if(input.parentUserId!==grant.parentUserId||input.studentUserId!==grant.studentUserId||input.relationshipId!==grant.relationshipId||input.artifactId!==grant.sourceArtifactId)return fail()
}
