import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { retainAssessmentAssetReferences } from '../../modules/assessment-media/assessment-asset'
import { retainSjtAuthorReleaseMedia, SJT_AUTHOR_MEDIA_SCOPE } from '../../modules/situational/authoring/media'
import { softDeleteStoredAsset, lockStoredAssetRows, discardUnreferencedAsset } from '../../services/assetStorage'
import { cos, deleteFromCOS } from '../../utils/cos'

const dbUrl = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = dbUrl ? describe : describe.skip
const gate = () => {
  let open!: () => void
  const ready = new Promise<void>(resolve => { open = resolve })
  return { ready, open }
}
const outcome = <T>(promise: Promise<T>) => promise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }))
const pid = async (tx: Prisma.TransactionClient) => (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0].pid
// Observe an actual PostgreSQL lock wait, rather than assuming a race from timers.
async function assertBlocked(backendPid: number) {
  const until = Date.now() + 5000
  while (Date.now() < until) {
    const rows = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
      SELECT cardinality(pg_blocking_pids(${backendPid})) > 0 AS blocked
    `
    if (rows[0]?.blocked) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Expected real PostgreSQL asset-row lock wait was not observed')
}

suite('SJT publish and attempt retain serialize with soft deletion on stable asset rows', () => {
  const ids: string[] = []
  const ownerId = `synthetic-author-${randomUUID()}`
  const sha256 = 'a'.repeat(64)
  const create = async (extra: Record<string, unknown> = {}) => {
    const id = randomUUID(); ids.push(id)
    return prisma.storedAsset.create({ data: { id, objectKey: `assets/${id}.png`, provider: 'local',
      mimeType: 'image/png', sizeBytes: 32, sha256, ownerId, accessScope: 'PRIVATE', scopeId: SJT_AUTHOR_MEDIA_SCOPE, ...extra } })
  }
  const identity = (id: string) => ({ assetId: id, contentHash: sha256, mimeType: 'image/png' as const })
  const retain = (kind: 'publish' | 'attempt', tx: Prisma.TransactionClient, id: string) => kind === 'publish'
    ? retainSjtAuthorReleaseMedia(tx, ownerId, `release-${id}`, { templateVersion: 'sjt-online-v1', display: { scenes: [{
      image: { asset: identity(id), altText: '测试情境', rightsStatus: 'self_authored', rightsNote: '合成测试图片' },
    }] } })
    : retainAssessmentAssetReferences({ db: tx, references: [identity(id)], owner: {
      entityType: 'AssessmentFrozenRuntime', entityId: `SITUATIONAL:attempt-${id}`, field: 'media',
    } })
  const remove = (tx: Prisma.TransactionClient, id: string) => softDeleteStoredAsset({ db: tx, assetId: id,
    authorize: async asset => asset.ownerId === ownerId && asset.scopeId === SJT_AUTHOR_MEDIA_SCOPE })
  beforeAll(() => {
    const selected = new URL(dbUrl!)
    const isolatedRecovery = process.env.PERF_ISOLATED_TEST_MODE === '1' && process.env.NODE_ENV === 'test'
      && ['127.0.0.1', 'localhost'].includes(selected.hostname) && selected.pathname === '/eduk12_recovery'
      && dbUrl === process.env.DATABASE_URL
    if (!isolatedRecovery) requireIsolatedReleaseDatabase(dbUrl!)
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    await prisma.assetReference.deleteMany({ where: { assetId: { in: ids } } })
    await prisma.storedAsset.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
  })
  for (const kind of ['publish', 'attempt'] as const) {
    it(`${kind} retain first: deletion blocks, rechecks and refuses without losing the image`, async () => {
      const asset = await create(), retained = gate(), release = gate(), deleting = gate()
      let deletePid = 0
      const first = outcome(prisma.$transaction(async tx => {
        await retain(kind, tx, asset.id); retained.open(); await release.ready
      }, { timeout: 15000 }))
      await retained.ready
      const second = outcome(prisma.$transaction(async tx => {
        deletePid = await pid(tx); deleting.open(); return remove(tx, asset.id)
      }, { timeout: 15000 }))
      try { await deleting.ready; await assertBlocked(deletePid) } finally { release.open() }
      expect(await first).toMatchObject({ ok: true })
      expect(await second).toEqual({ ok: true, value: 'referenced' })
      expect((await prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } })).deletedAt).toBeNull()
      expect(await prisma.assetReference.count({ where: { assetId: asset.id } })).toBe(1)
    }, 20000)
    it(`${kind} deletion first: retention blocks then rejects the deleted identity, with no retained fact`, async () => {
      const asset = await create(), deleted = gate(), release = gate(), retaining = gate()
      let retainPid = 0
      const first = outcome(prisma.$transaction(async tx => {
        expect(await remove(tx, asset.id)).toBe('deleted'); deleted.open(); await release.ready
      }, { timeout: 15000 }))
      await deleted.ready
      const second = outcome(prisma.$transaction(async tx => {
        retainPid = await pid(tx); retaining.open(); await retain(kind, tx, asset.id)
      }, { timeout: 15000 }))
      try { await retaining.ready; await assertBlocked(retainPid) } finally { release.open() }
      expect(await first).toMatchObject({ ok: true })
      const result = await second
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.name).toBe(kind === 'publish' ? 'SjtAuthorMediaError' : 'AssessmentAssetValidationError')
      expect((await prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } })).deletedAt).not.toBeNull()
      expect(await prisma.assetReference.count({ where: { assetId: asset.id } })).toBe(0)
    }, 20000)
  }
  it('rechecks ownership after a waiting delete acquires the row lock', async () => {
    const asset = await create(), changed = gate(), release = gate(), deleting = gate()
    let deletePid = 0
    const first = outcome(prisma.$transaction(async tx => {
      await lockStoredAssetRows(tx, [asset.id])
      await tx.storedAsset.update({ where: { id: asset.id }, data: { ownerId: 'different-owner' } })
      changed.open(); await release.ready
    }, { timeout: 15000 }))
    await changed.ready
    const second = outcome(prisma.$transaction(async tx => { deletePid = await pid(tx); deleting.open(); return remove(tx, asset.id) }, { timeout: 15000 }))
    try { await deleting.ready; await assertBlocked(deletePid) } finally { release.open() }
    expect(await first).toMatchObject({ ok: true })
    expect(await second).toEqual({ ok: true, value: 'forbidden' })
    expect((await prisma.storedAsset.findUniqueOrThrow({ where: { id: asset.id } })).deletedAt).toBeNull()
  }, 20000)
  it('retains shared physical COS bytes across soft deletion and canonical compensation', async () => {
    const canonical = await create({ provider: 'cos' })
    const sibling = await create({ provider: 'cos', storageObjectKey: canonical.objectKey })
    const remoteDelete = vi.spyOn(cos, 'deleteObject').mockImplementation(((_params: unknown, cb: (error: null, data: object) => void) => { cb(null, {}); return {} }) as never)
    try {
      expect(await softDeleteStoredAsset({ assetId: canonical.id, authorize: async () => true })).toBe('deleted')
      await expect(deleteFromCOS(canonical.objectKey)).rejects.toThrow('retained')
      expect(await discardUnreferencedAsset(canonical)).toBe(true)
      expect(remoteDelete).not.toHaveBeenCalled()
      await prisma.$transaction(tx => retain('attempt', tx, sibling.id))
      expect(await softDeleteStoredAsset({ assetId: sibling.id, authorize: async () => true })).toBe('referenced')
      await expect(deleteFromCOS(canonical.objectKey)).rejects.toThrow('retained')
      expect(remoteDelete).not.toHaveBeenCalled()
      expect((await prisma.storedAsset.findUniqueOrThrow({ where: { id: sibling.id } })).storageObjectKey).toBe(canonical.objectKey)
    } finally { remoteDelete.mockRestore() }
  })
})
