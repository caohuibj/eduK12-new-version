import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { assertContentDelegation, assertContentGrantChain, contentGrantInputSchema, type ContentGrant, type ContentGrantInput } from '../../modules/measurement-content/content-authority'
import { assertContentAuthority, delegateContentAuthority, revokeContentAuthority } from '../../modules/measurement-content/content-authority.repository'
const now = new Date('2026-10-20T00:00:00Z')
const root = (): ContentGrant => ({
  id: 'root', subjectId: 'entry-admin', issuerId: 'system-admin', parentGrantId: null,
  scope: { product: 'SURVEY', scopeKind: 'PROJECT', scopeId: 'project1', resourceKind: 'report', resourceKeys: ['report1','report2'] },
  capabilities: ['report.edit','report.publish'], delegableCapabilities: ['report.edit'], remainingDelegationDepth: 1,
  validFrom: new Date('2026-10-19'), expiresAt: new Date('2026-11-01'), ancestry: ['root'], version: 1, revokedAt: null,
})
const child = (): ContentGrant => ({ ...root(), id: 'child', subjectId: 'author', issuerId: 'entry-admin', parentGrantId: 'root',
  capabilities: ['report.edit'], delegableCapabilities: [], remainingDelegationDepth: 0,
  scope: { ...root().scope, resourceKeys: ['report1'] }, ancestry: ['root','child'] })
const input = (g = child()): ContentGrantInput => ({ subjectId: g.subjectId, scope: g.scope, capabilities: g.capabilities,
  delegableCapabilities: g.delegableCapabilities, remainingDelegationDepth: g.remainingDelegationDepth,
  validFrom: g.validFrom, expiresAt: g.expiresAt })
const row = (g: ContentGrant) => ({ id:g.id, subject_id:g.subjectId, issuer_id:g.issuerId, parent_grant_id:g.parentGrantId,
  product:g.scope.product, scope_kind:g.scope.scopeKind, scope_id:g.scope.scopeId, resource_kind:g.scope.resourceKind,
  resource_keys:g.scope.resourceKeys, capabilities:g.capabilities, delegable_capabilities:g.delegableCapabilities,
  remaining_delegation_depth:g.remainingDelegationDepth, valid_from:g.validFrom, expires_at:g.expiresAt,
  ancestry:g.ancestry, version:g.version, revoked_at:g.revokedAt, subject_active:true, subject_frozen:false, subject_expires_at:null })
const dbFor = (grants = [root(),child()]) => {
  const query = vi.fn().mockResolvedValueOnce(grants.map(row)).mockResolvedValueOnce([{now}])
  const execute = vi.fn().mockResolvedValue(1)
  return { db: {$queryRaw:query,$executeRaw:execute} as unknown as Prisma.TransactionClient, query, execute }
}
describe('bounded permanent content authority', () => {
  it('permits exact-resource one-level delegation without platform catalog approval', () => {
    expect(assertContentGrantChain([child(),root()], 'child', now).subjectId).toBe('author')
    expect(() => assertContentDelegation(root(),input(),'entry-admin')).not.toThrow()
  })
  it('rejects cross-product, scope, resource, capability, expiry and redelegation escalation', () => {
    const attempts: ContentGrantInput[] = [
      {...input(),scope:{...input().scope,product:'TRAINING'}},
      {...input(),scope:{...input().scope,scopeId:'project2'}},
      {...input(),scope:{...input().scope,resourceKeys:['other']}},
      {...input(),capabilities:['report.publish']},
      {...input(),expiresAt:new Date('2027-01-01')},
      {...input(),remainingDelegationDepth:1,delegableCapabilities:['report.edit']},
    ]
    for (const attempt of attempts) expect(() => assertContentDelegation(root(),attempt,'entry-admin')).toThrow()
    expect(() => assertContentDelegation(root(),input(),'other-admin')).toThrow()
    expect(() => assertContentDelegation(child(),input(),'author')).toThrow()
  })
  it('does not promote use licenses into reference or report rights and rejects policy DSL/empty resource selectors', () => {
    expect(() => contentGrantInputSchema.parse({...input(),capabilities:['material.use']})).toThrow()
    expect(() => contentGrantInputSchema.parse({...input(),policy:{allow:'*'}})).toThrow()
    expect(() => contentGrantInputSchema.parse({...input(),scope:{...input().scope,resourceKeys:[]}})).toThrow()
    expect(() => contentGrantInputSchema.parse({...input(),remainingDelegationDepth:2})).toThrow()
  })
  it('denies revoked/expired/missing/malformed ancestors immediately', () => {
    for (const ancestor of [{...root(),revokedAt:now},{...root(),expiresAt:now},{...root(),validFrom:new Date('2026-10-21')}])
      expect(() => assertContentGrantChain([ancestor,child()],'child',now)).toThrow()
    expect(() => assertContentGrantChain([child()],'child',now)).toThrow()
    expect(() => assertContentGrantChain([root(),{...child(),issuerId:'intruder'}],'child',now)).toThrow()
    expect(() => assertContentGrantChain([root(),{...child(),ancestry:['child','root']}],'child',now)).toThrow()
  })
  it('uses one locked ancestry query and a post-lock expiry clock for authorization', async () => {
    const {db,query}=dbFor()
    await expect(assertContentAuthority(db,{actorId:'author',grantId:'child',capability:'report.edit',scope:child().scope})).resolves.toEqual({grantId:'child',version:1})
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0][0].sql).toContain('FOR SHARE OF a, u')
    expect(query.mock.calls[1][0].sql).toContain('clock_timestamp()')
  })
  it('checks current actor, user freeze and ancestor state instead of cached rights', async () => {
    const invoke=(db:Prisma.TransactionClient,actorId='author')=>assertContentAuthority(db,{actorId,grantId:'child',capability:'report.edit',scope:child().scope})
    await expect(invoke(dbFor().db,'intruder')).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
    await expect(invoke(dbFor([{...root(),revokedAt:now},child()]).db)).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
    const {db,query}=dbFor(); query.mockReset().mockResolvedValueOnce([{...row(root()),subject_frozen:true},row(child())]).mockResolvedValueOnce([{now}])
    await expect(invoke(db)).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
  })
  it('denies an inactive ancestor User even when the leaf account and grants are active', async () => {
    const {db,query}=dbFor()
    query.mockReset().mockResolvedValueOnce([{...row(root()),subject_active:false},row(child())]).mockResolvedValueOnce([{now}])
    await expect(assertContentAuthority(db,{actorId:'author',grantId:'child',capability:'report.edit',scope:child().scope})).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
  })
  it('CAS rejects stale delegation before insertion; success stores exact parent path', async () => {
    const stale=dbFor([root()])
    await expect(delegateContentAuthority(stale.db,{actorId:'entry-admin',parentGrantId:'root',expectedParentVersion:2,grant:input()})).rejects.toThrow('CONTENT_AUTHORITY_STALE')
    expect(stale.execute).not.toHaveBeenCalled()
    const ok=dbFor([root()])
    await expect(delegateContentAuthority(ok.db,{actorId:'entry-admin',parentGrantId:'root',expectedParentVersion:1,grant:input()})).resolves.toMatch(/^[a-f0-9-]+$/)
    expect(ok.execute).toHaveBeenCalledTimes(1)
  })
  it('revokes only issuer/recipient with reason and CAS; never rewrites descendants', async () => {
    const {db,execute}=dbFor()
    await revokeContentAuthority(db,{actorId:'entry-admin',grantId:'child',expectedVersion:1,reason:'Removed project responsibility'})
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][0].sql).toContain('issuer_id=')
    expect(execute.mock.calls[0][0].sql).toContain('version=version+1')
    execute.mockResolvedValueOnce(0)
    await expect(revokeContentAuthority(db,{actorId:'intruder',grantId:'child',expectedVersion:1,reason:'No'})).rejects.toThrow('CONTENT_AUTHORITY_STALE_OR_DENIED')
  })
})
