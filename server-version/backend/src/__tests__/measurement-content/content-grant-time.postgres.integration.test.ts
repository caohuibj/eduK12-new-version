import { readFileSync } from 'node:fs'
import { Prisma, PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { issueAdminContentRoot, readAdminContentGrant, revokeAdminContentGrant } from '../../modules/measurement-content/admin-authority.service'
import { assertContentAuthority, delegateContentAuthority, revokeContentAuthority } from '../../modules/measurement-content/content-authority.repository'
import { listFormalReferenceAuthorities } from '../../modules/measurement-content/formal-reference-authority'
import { assertContentGrantChain, type ContentGrant } from '../../modules/measurement-content/content-authority'

const state = vi.hoisted(() => ({ tx: null as any, audits: new Map<string, any>() }))
vi.mock('../../config/database', () => ({ prisma: { $transaction: (fn: any) => fn(state.tx) } }))
// Opt-in only: the caller must supply an isolated DB, never the running/production DB.
const url = process.env.CONTENT_GRANT_TIME_TEST_DATABASE_URL
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const actor = id(1), subject = id(2), childSubject = id(3), resource = id(4), rootId = id(5)

describe.skipIf(!url)('content grant UTC storage contract on real PostgreSQL', () => {
  it.each(['UTC', 'Asia/Tokyo', 'America/Los_Angeles'])('root, delegation, metadata, discovery and revocation: %s', async zone => {
    const db = new PrismaClient({ datasources: { db: { url } } })
    const rollback = new Error('ROLLBACK_SYNTHETIC_TIME_FIXTURES')
    try {
      await expect(db.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('TimeZone', ${zone}, true)`
        // Temporary tables shadow real names on this connection; public data is never mutated.
        await tx.$executeRawUnsafe('CREATE TEMP TABLE content_capability_grants (LIKE public.content_capability_grants INCLUDING ALL) ON COMMIT DROP')
        await tx.$executeRawUnsafe(`CREATE TEMP TABLE users (id text PRIMARY KEY, token_version int DEFAULT 3,
          platform_role text, account_domain text DEFAULT 'TRAINING', role text DEFAULT 'TEACHER', teacher_approved boolean DEFAULT true,
          is_active boolean DEFAULT true, is_frozen boolean DEFAULT false, must_change_password boolean DEFAULT false, expires_at timestamp(3)) ON COMMIT DROP`)
        await tx.$executeRawUnsafe('CREATE TEMP TABLE measurement_content_releases (id text PRIMARY KEY, layer text, status text) ON COMMIT DROP')
        await tx.$executeRaw`INSERT INTO users (id, platform_role) VALUES (${actor},'SYSTEM_ADMIN'), (${subject},'STANDARD'), (${childSubject},'STANDARD')`
        await tx.$executeRaw`INSERT INTO measurement_content_releases VALUES (${resource},'MEASUREMENT','PUBLISHED')`
        // Execute the current trigger body against temporary rows, including its delegation guard.
        const triggerSource = readFileSync('prisma/migrations/20261025040000_content_grant_utc_time/migration.sql', 'utf8')
        const functionSql = triggerSource.slice(triggerSource.indexOf('CREATE OR REPLACE FUNCTION'))
          .replace('CREATE OR REPLACE FUNCTION guard_content_capability_grant()', 'CREATE FUNCTION pg_temp.guard_content_capability_grant()')
        await tx.$executeRawUnsafe(functionSql)
        await tx.$executeRawUnsafe('CREATE TRIGGER content_capability_grants_guard BEFORE INSERT OR UPDATE OR DELETE ON content_capability_grants FOR EACH ROW EXECUTE FUNCTION pg_temp.guard_content_capability_grant()')
        state.audits.clear()
        state.tx = new Proxy(tx, { get(target, key) {
          if (key === 'adminAuthorizationAudit') return {
            create: async ({ data }: any) => { state.audits.set(data.id, data); return data },
            findUnique: async ({ where }: any) => state.audits.get(where.id),
          }
          const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value
        } })
        const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
        const from = new Date(clock.now.getTime() - 60_000), until = new Date(clock.now.getTime() + 60_000)
        const proof = { tokenVersion: 3, adminSessionId: 'synthetic-time-contract', adminVerifiedAt: Math.floor(Date.now() / 1000) }
        const grant = { subjectId: subject, scope: { product: 'TRAINING' as const, scopeKind: 'PLATFORM' as const,
          scopeId: 'reference-governance', resourceKind: 'reference' as const, resourceKeys: [resource] },
          capabilities: ['reference.review' as const], delegableCapabilities: ['reference.review' as const],
          remainingDelegationDepth: 1, validFrom: from, expiresAt: until }
        const request = { requestId: rootId, expectedVersion: 0, reason: 'Synthetic time contract',
          grant: { ...grant, validFrom: from.toISOString(), expiresAt: until.toISOString() } }
        expect(await issueAdminContentRoot(actor, proof, request)).toMatchObject({ changed: true })
        expect(await readAdminContentGrant(actor, proof, rootId)).toMatchObject({ validFrom: from.toISOString(), expiresAt: until.toISOString() })
        const [stored] = await tx.$queryRaw<Array<{valid_from: Date; expires_at: Date; utc_text: string}>>`SELECT valid_from,expires_at,to_char(valid_from,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS utc_text FROM content_capability_grants WHERE id=${rootId}`
        expect(stored.valid_from.toISOString()).toBe(from.toISOString()); expect(stored.utc_text).toBe(from.toISOString())
        expect(stored.expires_at.toISOString()).toBe(until.toISOString())
        expect(await issueAdminContentRoot(actor, proof, request)).toMatchObject({ changed: false })
        expect(await listFormalReferenceAuthorities(tx, subject)).toHaveLength(1)
        const authority = { actorId: subject, grantId: rootId, capability: 'reference.review' as const, scope: grant.scope }
        await expect(assertContentAuthority(tx, authority)).resolves.toMatchObject({ version: 1 })
        await expect(assertContentAuthority(tx, { ...authority, actorId: actor })).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
        await expect(assertContentAuthority(tx, { ...authority, scope: { ...grant.scope, resourceKeys: [id(999)] } })).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
        await expect(issueAdminContentRoot(actor, proof, { ...request, requestId: id(6), grant: { ...request.grant,
          validFrom: new Date(clock.now.getTime() - 120_000).toISOString(), expiresAt: new Date(clock.now.getTime() - 60_000).toISOString() } })).rejects.toMatchObject({ statusCode: 403 })
        await issueAdminContentRoot(actor, proof, { ...request, requestId: id(7), grant: { ...request.grant,
          validFrom: new Date(clock.now.getTime() + 30_000).toISOString() } })
        await expect(assertContentAuthority(tx, { ...authority, grantId: id(7) })).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
        expect(await listFormalReferenceAuthorities(tx, subject)).toHaveLength(1)
        const childId = await delegateContentAuthority(tx, { actorId: subject, parentGrantId: rootId, expectedParentVersion: 1,
          grant: { ...grant, subjectId: childSubject, remainingDelegationDepth: 0, delegableCapabilities: [] } })
        expect(await readAdminContentGrant(actor, proof, childId)).toMatchObject({ validFrom: from.toISOString(), expiresAt: until.toISOString() })
        await assertContentAuthority(tx, { ...authority, actorId: childSubject, grantId: childId })
        // Same stored instants: inclusive start and exclusive end, one-millisecond edges.
        const root: ContentGrant = { ...grant, validFrom: stored.valid_from, expiresAt: stored.expires_at, id: rootId, issuerId: actor, parentGrantId: null, ancestry: [rootId], version: 1, revokedAt: null }
        for (const ms of [from.getTime(), until.getTime() - 1]) expect(assertContentGrantChain([root], rootId, new Date(ms))).toBe(root)
        for (const ms of [from.getTime() - 1, until.getTime()]) expect(() => assertContentGrantChain([root], rootId, new Date(ms))).toThrow('CONTENT_AUTHORITY_DENIED')
        await revokeContentAuthority(tx, { actorId: subject, grantId: childId, expectedVersion: 1, reason: 'Synthetic child withdrawal' })
        await expect(assertContentAuthority(tx, { ...authority, actorId: childSubject, grantId: childId })).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
        await revokeAdminContentGrant(actor, proof, rootId, { expectedVersion: 1, reason: 'Synthetic root withdrawal' })
        const revoked = await readAdminContentGrant(actor, proof, rootId)
        expect(Math.abs(new Date(revoked.revokedAt!).getTime() - Date.now())).toBeLessThan(10_000)
        await expect(assertContentAuthority(tx, authority)).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
        expect(await listFormalReferenceAuthorities(tx, subject)).toHaveLength(0)
        throw rollback
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 })).rejects.toBe(rollback)
    } finally { state.tx = null; await db.$disconnect() }
  }, 40_000)
})
