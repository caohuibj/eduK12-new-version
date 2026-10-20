import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { verifyRuntimePrivileges } from '../../../scripts/runtime-role-contract.mjs'
import { verifyReleaseSchema } from '../../../scripts/release-schema-contract.mjs'
import { publishContentRelease, transitionContentRelease } from '../../modules/measurement-content/repository'
import { assertContentAuthority, revokeContentAuthority } from '../../modules/measurement-content/content-authority.repository'
import { lockInstrumentSourceIdentity } from '../../modules/assessment-authorization/source-identity-lock'

// Opt-in, newly created synthetic cluster only. These are connected persistence,
// runtime-role and two-transaction lock contracts, not browser/family/API proofs.
const selected = process.env.MEASUREMENT_V10_FIXTURE === '1'
const suite = selected ? describe : describe.skip
let owner: PrismaClient, one: PrismaClient, two: PrismaClient
const actor = randomUUID(), issuer = randomUUID(), scopeId = randomUUID(), prefix = 'v10-' + randomUUID()
const scope = { product: 'TRAINING', scopeKind: 'COURSE', scopeId, resourceKind: 'reference', resourceKeys: ['fixture-reference'] } as const
const options = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3000, timeout: 7000 }
const fixture = (suffix: string) => ({
  family: 'SCALE', layer: 'MEASUREMENT', key: `${prefix}:${suffix}`, version: '1',
  scope: { kind: 'PRIVATE', ownerId: actor, product: 'TRAINING', resourceId: scopeId },
  provenance: { sourceKind: 'V10_SYNTHETIC_PERSISTENCE_FIXTURE' }, assetRefs: [], sourceReleaseId: null,
  content: { projectionVersion: 1, instrumentVersion: '1', measurementHash: 'a'.repeat(64), measurementHashScheme: 'SCALE_AXES_V1',
    scoringVersion: '1', runnerKey: 'scale', runnerVersion: '2', locale: 'zh-CN', localizationVersion: '1',
    metrics: [{ metricKey: 'total', unit: 'points', direction: 'descriptive' }], executable: { items: [{ key: 'fixture' }] } },
})
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function transactionSettings(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2500ms'")
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='4000ms'")
}
async function actualWait(tx: Prisma.TransactionClient, pid: number) {
  const deadline = Date.now() + 1800
  while (Date.now() < deadline) {
    const [row] = await tx.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=${pid} AND NOT granted) AS waiting`
    if (row.waiting) return
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  throw new Error('Expected a real PostgreSQL lock wait, not timing-only serialization')
}
async function interleave<T, U>(
  first: (tx: Prisma.TransactionClient) => Promise<T>, second: (tx: Prisma.TransactionClient) => Promise<U>,
  beforeRelease: (tx: Prisma.TransactionClient) => Promise<void> = async () => {},
) {
  const held = deferred<void>(), waiter = deferred<number>()
  const a = one.$transaction(async tx => {
    await transactionSettings(tx)
    const result = await first(tx)
    held.resolve()
    const pid = await waiter.promise
    await actualWait(tx, pid)
    await beforeRelease(tx)
    return result
  }, options)
  const aObserved = a.then(value => ({ status: 'fulfilled' as const, value }), reason => {
    held.reject(reason); return { status: 'rejected' as const, reason }
  })
  await held.promise
  const b = two.$transaction(async tx => {
    await transactionSettings(tx)
    const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
    waiter.resolve(row.pid)
    return second(tx)
  }, options)
  const bObserved = b.then(value => ({ status: 'fulfilled' as const, value }), reason => {
    waiter.reject(reason); return { status: 'rejected' as const, reason }
  })
  return Promise.all([aObserved, bObserved])
}
async function grant(expiresInSeconds = 60) {
  const id = randomUUID()
  await owner.$executeRaw(Prisma.sql`INSERT INTO content_capability_grants
    (id,subject_id,issuer_id,product,scope_kind,scope_id,resource_kind,resource_keys,capabilities,
     delegable_capabilities,remaining_delegation_depth,valid_from,expires_at,ancestry)
    VALUES (${id},${actor},${issuer},'TRAINING','COURSE',${scopeId},'reference',ARRAY['fixture-reference'],
      ARRAY['reference.publish'],ARRAY[]::text[],0,clock_timestamp()-interval '1 minute',
      clock_timestamp()+${expiresInSeconds}*interval '1 second',ARRAY[${id}])`)
  return id
}
const authority = (tx: Prisma.TransactionClient, id: string) => assertContentAuthority(tx, {
  actorId: actor, grantId: id, capability: 'reference.publish', scope: { ...scope, resourceKeys: [...scope.resourceKeys] },
})
const revoke = (tx: Prisma.TransactionClient, id: string) => revokeContentAuthority(tx, {
  actorId: issuer, grantId: id, expectedVersion: 1, reason: 'Bounded V10 synthetic revocation',
})

suite('V10 real PostgreSQL restricted runtime and two-connection boundaries', () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test' || !/^[a-f0-9]{40}$/.test(process.env.MEASUREMENT_V10_HEAD || '')) throw new Error('Exact isolated test invocation required')
    const runtime = new URL(process.env.MEASUREMENT_V10_RUNTIME_DATABASE_URL || '')
    const admin = new URL(process.env.MEASUREMENT_V10_OWNER_DATABASE_URL || '')
    if (runtime.hostname !== '127.0.0.1' || runtime.port !== '39403' || runtime.pathname !== '/eduk12_measurement_v10_test'
      || admin.hostname !== runtime.hostname || admin.port !== runtime.port || admin.pathname !== runtime.pathname
      || admin.username !== 'v10_owner' || !/^v10_runtime_[a-f0-9]{8}$/.test(runtime.username)
      || process.env.DATABASE_URL !== runtime.href || runtime.password === admin.password) throw new Error('New dedicated loopback fixture principal required')
    owner = new PrismaClient({ datasources: { db: { url: admin.href } } })
    const oneUrl = new URL(runtime.href); oneUrl.searchParams.set('connection_limit', '1')
    one = new PrismaClient({ datasources: { db: { url: oneUrl.href } } })
    two = new PrismaClient({ datasources: { db: { url: oneUrl.href } } })
    await Promise.all([owner.$connect(), one.$connect(), two.$connect()])
    for (const [id, role] of [[actor, 'subject'], [issuer, 'issuer']]) {
      await owner.user.create({ data: { id, username: `${prefix}-${role}`, passwordHash: 'synthetic-fixture-no-login', role: 'TEACHER',
        accountDomain: 'LEGACY', isActive: true, teacherApproved: true } })
    }
  }, 15000)
  afterAll(async () => {
    // Immutable fixture rows intentionally remain in this disposable cluster.
    // The owning launcher stops only its own new processes; no TRUNCATE or real cleanup.
    await Promise.all([owner?.$disconnect(), one?.$disconnect(), two?.$disconnect()])
  })

  it('verifies actual restricted principal and exact migration ledger, then refuses an unknown table without granting it', async () => {
    expect(await verifyRuntimePrivileges(one)).toMatchObject({ restrictedRuntimeRole: true })
    expect((await verifyReleaseSchema(one)).migrationCount).toBeGreaterThan(190)
    await owner.$executeRawUnsafe('CREATE TABLE v10_unclassified_fixture (id text)')
    try {
      await expect(verifyRuntimePrivileges(one)).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE')
      await expect(one.$queryRawUnsafe('SELECT * FROM v10_unclassified_fixture')).rejects.toThrow()
    } finally { await owner.$executeRawUnsafe('DROP TABLE v10_unclassified_fixture') }
    expect((await verifyRuntimePrivileges(one)).restrictedRuntimeRole).toBe(true)
  }, 15000)

  it('allows runtime publication/status-event writes but keeps row immutability and ownership protections real', async () => {
    const release = await one.$transaction(tx => publishContentRelease(tx, fixture('role'), actor), options)
    await one.$transaction(tx => transitionContentRelease(tx, { releaseId: release.releaseId, expectedStatus: 'PUBLISHED',
      status: 'SUPERSEDED', actorId: actor, reason: 'Synthetic successor' }), options)
    await expect(one.$executeRaw`UPDATE measurement_content_releases SET content_hash=${'b'.repeat(64)} WHERE id=${release.releaseId}`)
      .rejects.toThrow('CONTENT_RELEASE_IMMUTABLE')
    await expect(one.$executeRaw`DELETE FROM measurement_content_releases WHERE id=${release.releaseId}`)
      .rejects.toThrow('CONTENT_RELEASE_DELETE_FORBIDDEN')
    await expect(one.$executeRaw`UPDATE measurement_content_release_events SET reason='tampered' WHERE release_id=${release.releaseId}`)
      .rejects.toThrow('CONTENT_EVENT_IMMUTABLE')
    await expect(one.$executeRawUnsafe('ALTER TABLE measurement_content_releases DISABLE TRIGGER ALL')).rejects.toThrow()
    await expect(one.$executeRawUnsafe('TRUNCATE measurement_content_releases')).rejects.toThrow()
    const events = await one.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM measurement_content_release_events WHERE release_id=${release.releaseId}`
    expect(Number(events[0].n)).toBe(1)
  }, 15000)

  it('rolls back release and lifecycle event together after a failure in the real owning transaction', async () => {
    const input = fixture('rollback')
    await expect(one.$transaction(async tx => {
      const release = await publishContentRelease(tx, input, actor)
      await transitionContentRelease(tx, { releaseId: release.releaseId, expectedStatus: 'PUBLISHED', status: 'RETIRED', actorId: actor, reason: 'Synthetic rollback' })
      throw new Error('V10_CONTROLLED_ROLLBACK')
    }, options)).rejects.toThrow('V10_CONTROLLED_ROLLBACK')
    const rows = await one.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM measurement_content_releases WHERE content_key=${input.key}`
    expect(Number(rows[0].n)).toBe(0)
  }, 15000)

  it('serializes duplicate real publication through the original advisory lock and returns one immutable identity', async () => {
    const input = fixture('parallel')
    const results = await interleave(tx => publishContentRelease(tx, input, actor), tx => publishContentRelease(tx, input, actor))
    expect(results[0].status).toBe('fulfilled'); expect(results[1].status).toBe('fulfilled')
    if (results[0].status === 'fulfilled' && results[1].status === 'fulfilled') expect(results[0].value.releaseId).toBe(results[1].value.releaseId)
    const rows = await one.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM measurement_content_releases WHERE content_key=${input.key}`
    expect(Number(rows[0].n)).toBe(1)
  }, 15000)

  it('observes source READ versus WRITE advisory exclusion in both orders without deadlock', async () => {
    const identity = { instrumentKey: prefix, instrumentVersion: '1' }
    for (const [first, second] of [['READ', 'WRITE'], ['WRITE', 'READ']] as const) {
      const results = await interleave(tx => lockInstrumentSourceIdentity(tx, identity, first), tx => lockInstrumentSourceIdentity(tx, identity, second))
      expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled'])
    }
  }, 20000)

  it('lets an already protected capability write serialize before revoke, then rejects subsequent authorization', async () => {
    const id = await grant()
    const results = await interleave(tx => authority(tx, id), tx => revoke(tx, id))
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled'])
    await expect(one.$transaction(tx => authority(tx, id), options)).rejects.toThrow()
    const [row] = await one.$queryRaw<Array<{ version: number; revoked_at: Date | null }>>`SELECT version,revoked_at FROM content_capability_grants WHERE id=${id}`
    expect(row.version).toBe(2); expect(row.revoked_at).not.toBeNull()
  }, 15000)

  it('denies a waiting capability reader after revoke commits instead of using pre-wait authority', async () => {
    const id = await grant()
    const results = await interleave(tx => revoke(tx, id), tx => authority(tx, id))
    expect(results[0].status).toBe('fulfilled'); expect(results[1].status).toBe('rejected')
    if (results[1].status === 'rejected') expect(String(results[1].reason)).toMatch(/CONTENT_AUTHORITY/)
  }, 15000)

  it('uses the real database clock after lock wait and rejects a grant that expired while waiting', async () => {
    const id = await grant(1.2)
    const results = await interleave(async tx => {
      await tx.$queryRaw`SELECT id FROM content_capability_grants WHERE id=${id} FOR UPDATE`
    }, tx => authority(tx, id), async tx => {
      const deadline = Date.now() + 1800
      while (Date.now() < deadline) {
        const [row] = await tx.$queryRaw<Array<{ expired: boolean }>>`SELECT expires_at<=clock_timestamp() AS expired FROM content_capability_grants WHERE id=${id}`
        if (row.expired) return
        await new Promise(resolve => setTimeout(resolve, 60))
      }
      throw new Error('Synthetic grant did not reach its bounded expiry')
    })
    expect(results[0].status).toBe('fulfilled'); expect(results[1].status).toBe('rejected')
    if (results[1].status === 'rejected') expect(String(results[1].reason)).toMatch(/CONTENT_AUTHORITY/)
  }, 15000)
})
