import { z } from 'zod'

export const CONTENT_CAPABILITIES = [
  'measurement.edit', 'measurement.publish', 'reference.analyze', 'reference.review',
  'reference.publish', 'report.edit', 'report.publish', 'catalog.manage',
  'material.use', 'material.adapt', 'material.distribute', 'data.reinterpret',
] as const
export const MAX_CONTENT_GRANT_DEPTH = 2
const identifier = z.string().trim().min(1).max(240)
const unique = (values: readonly string[]) => new Set(values).size === values.length
const capabilities = z.array(z.enum(CONTENT_CAPABILITIES)).max(CONTENT_CAPABILITIES.length).refine(unique)
export const contentAuthorityScopeSchema = z.object({
  product: z.enum(['TRAINING', 'SURVEY', 'SCHOOL', 'TEACHER']),
  scopeKind: z.enum(['PLATFORM', 'ORGANIZATION', 'PROJECT', 'COURSE']),
  scopeId: identifier,
  resourceKind: z.enum(['measurement', 'reference', 'report', 'catalog', 'material', 'data']),
  resourceKeys: z.array(identifier).min(1).max(128).refine(unique),
}).strict().refine(scope => scope.resourceKind !== 'data' ||
  scope.product === 'SURVEY' && scope.scopeKind === 'PROJECT' ||
  scope.product === 'TRAINING' && scope.scopeKind === 'COURSE', {
  message: 'Data reinterpretation requires exact Survey project or Training course scope',
})
export const contentGrantInputSchema = z.object({
  subjectId: identifier,
  scope: contentAuthorityScopeSchema,
  capabilities: capabilities.refine(v => v.length > 0),
  delegableCapabilities: capabilities,
  remainingDelegationDepth: z.number().int().min(0).max(MAX_CONTENT_GRANT_DEPTH - 1),
  validFrom: z.date(),
  expiresAt: z.date(),
}).strict().superRefine((grant, ctx) => {
  if (grant.expiresAt <= grant.validFrom) ctx.addIssue({ code: 'custom', message: 'Invalid grant interval' })
  if (grant.capabilities.some(c => !c.startsWith(`${grant.scope.resourceKind}.`)))
    ctx.addIssue({ code: 'custom', message: 'Capability/resource domain mismatch' })
  if (grant.delegableCapabilities.some(c => !grant.capabilities.includes(c)))
    ctx.addIssue({ code: 'custom', message: 'Delegation exceeds capability' })
  if (grant.remainingDelegationDepth === 0 && grant.delegableCapabilities.length)
    ctx.addIssue({ code: 'custom', message: 'Delegation depth exhausted' })
})
export type ContentCapability = typeof CONTENT_CAPABILITIES[number]
export type ContentAuthorityScope = z.infer<typeof contentAuthorityScopeSchema>
export type ContentGrantInput = z.infer<typeof contentGrantInputSchema>
export type ContentGrant = ContentGrantInput & {
  id: string; issuerId: string; parentGrantId: string | null; ancestry: string[];
  version: number; revokedAt: Date | null;
}
export class ContentAuthorityError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'ContentAuthorityError' }
}
const deny = (): never => { throw new ContentAuthorityError('CONTENT_AUTHORITY_DENIED') }
export function contentScopeContains(parent: ContentAuthorityScope, child: ContentAuthorityScope): boolean {
  return parent.product === child.product && parent.scopeKind === child.scopeKind
    && parent.scopeId === child.scopeId && parent.resourceKind === child.resourceKind
    && child.resourceKeys.every(key => parent.resourceKeys.includes(key))
}
export function assertContentDelegation(parent: ContentGrant, input: ContentGrantInput, actorId: string): void {
  const child = contentGrantInputSchema.parse(input)
  if (parent.subjectId !== actorId || parent.remainingDelegationDepth < 1
    || child.remainingDelegationDepth >= parent.remainingDelegationDepth
    || child.capabilities.some(c => !parent.delegableCapabilities.includes(c))
    || child.delegableCapabilities.some(c => !parent.delegableCapabilities.includes(c))
    || child.validFrom < parent.validFrom || child.expiresAt > parent.expiresAt
    || !contentScopeContains(parent.scope, child.scope)) deny()
}
/** Rows may arrive in lock order. Validate the complete stored path, never just a leaf. */
export function assertContentGrantChain(rows: readonly ContentGrant[], leafId: string, now: Date): ContentGrant {
  const byId = new Map(rows.map(row => [row.id, row]))
  const leaf = byId.get(leafId)
  if (!leaf || rows.length !== leaf.ancestry.length || !rows.length || rows.length > MAX_CONTENT_GRANT_DEPTH
    || !unique(leaf.ancestry) || leaf.ancestry[leaf.ancestry.length - 1] !== leaf.id) return deny()
  let parent: ContentGrant | undefined
  for (let index = 0; index < leaf.ancestry.length; index++) {
    const grant = byId.get(leaf.ancestry[index])
    if (!grant || grant.revokedAt || grant.validFrom > now || grant.expiresAt <= now
      || grant.parentGrantId !== (parent?.id ?? null)
      || grant.ancestry.length !== index + 1
      || grant.ancestry.some((id, i) => id !== leaf.ancestry[i])) return deny()
    contentGrantInputSchema.parse({ subjectId: grant.subjectId, scope: grant.scope,
      capabilities: grant.capabilities, delegableCapabilities: grant.delegableCapabilities,
      remainingDelegationDepth: grant.remainingDelegationDepth, validFrom: grant.validFrom, expiresAt: grant.expiresAt })
    if (parent) assertContentDelegation(parent, {
      subjectId: grant.subjectId, scope: grant.scope, capabilities: grant.capabilities,
      delegableCapabilities: grant.delegableCapabilities, remainingDelegationDepth: grant.remainingDelegationDepth,
      validFrom: grant.validFrom, expiresAt: grant.expiresAt,
    }, grant.issuerId)
    parent = grant
  }
  return leaf
}
