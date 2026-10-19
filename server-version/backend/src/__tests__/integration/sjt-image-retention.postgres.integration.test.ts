import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { retainAssessmentAssetReferences } from '../../modules/assessment-media/assessment-asset'
import { retainSjtAuthorReleaseMedia, SJT_AUTHOR_MEDIA_SCOPE } from '../../modules/situational/authoring/media'
import { softDeleteStoredAsset, lockStoredAssetRows, discardUnreferencedAsset } from '../../services/assetStorage'
import { cos, deleteFromCOS } from '../../utils/cos'
import { inLegacyQuestionnaireTransaction } from '../../services/legacyQuestionnaireDatabase'
vi.mock('../../services/cacheService', () => ({ cacheService: { clearQuestionnaireCache: vi.fn(async () => {}) } }))

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
      SELECT cardinality(pg_blocking_pids(${backendPid}::int)) > 0 AS blocked
    `
    if (rows[0]?.blocked) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Expected real PostgreSQL asset-row lock wait was not observed')
}

suite('SJT publish and attempt retain serialize with soft deletion on stable asset rows', () => {
  const ids: string[] = []
  const questionnaires: string[] = []
  let createdAuthor = false
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
  beforeAll(async () => {
    const selected = new URL(dbUrl!)
    const isolatedRecovery = process.env.PERF_ISOLATED_TEST_MODE === '1' && process.env.NODE_ENV === 'test'
      && ['127.0.0.1', 'localhost'].includes(selected.hostname) && selected.pathname === '/eduk12_recovery'
      && dbUrl === process.env.DATABASE_URL
    if (!isolatedRecovery) requireIsolatedReleaseDatabase(dbUrl!)
    await prisma.user.create({ data: { id: ownerId, username: ownerId, passwordHash: 'synthetic-test-only', role: 'TEACHER' } })
    createdAuthor = true
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    await prisma.assetReference.deleteMany({ where: { assetId: { in: ids } } })
    await prisma.storedAsset.deleteMany({ where: { id: { in: ids } } })
    await prisma.questionnaire.deleteMany({ where: { id: { in: questionnaires } } })
    if (createdAuthor) await prisma.user.delete({ where: { id: ownerId } })
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
      await lockStoredAssetRows(tx, [asset.id], 'update')
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
  it('two different retain owners hold SHARE together while deletion waits for both', async () => {
    const asset = await create(), one = gate(), two = gate(), release = gate(), deleting = gate()
    const holding = (label: string, entered: ReturnType<typeof gate>) => outcome(prisma.$transaction(async tx => {
      await retainAssessmentAssetReferences({ db: tx, references: [identity(asset.id)],
        owner: { entityType: 'AssessmentFrozenRuntime', entityId: label + asset.id, field: 'media' } })
      entered.open(); await release.ready
    }, { timeout: 15000 }))
    const first = holding('owner-a-', one), second = holding('owner-b-', two)
    let deletePid = 0, deletion: ReturnType<typeof outcome> | undefined
    try {
      // If retains used UPDATE, the second could not reach this barrier.
      await Promise.race([Promise.all([one.ready, two.ready]), new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('SHARE retains did not overlap')), 5000); timer.unref()
      })])
      deletion = outcome(prisma.$transaction(async tx => { deletePid = await pid(tx); deleting.open(); return remove(tx, asset.id) }, { timeout: 15000 }))
      await deleting.ready; await assertBlocked(deletePid)
    } finally { release.open() }
    expect(await first).toMatchObject({ ok: true }); expect(await second).toMatchObject({ ok: true })
    expect(await deletion).toEqual({ ok: true, value: 'referenced' })
    expect(await prisma.assetReference.count({ where: { assetId: asset.id } })).toBe(2)
  }, 20000)
  it('concurrent duplicate retains of the same owner insert reversed asset sets idempotently', async () => {
    const a = await create(), b = await create()
    const owner = { entityType: 'AssessmentFrozenRuntime', entityId: `same-owner-${a.id}`, field: 'media' }
    await Promise.all([[a, b, a], [b, a, b]].map(assets => prisma.$transaction(tx =>
      retainAssessmentAssetReferences({ db: tx, owner, references: assets.map(asset => identity(asset.id)) }), { timeout: 15000 })))
    expect(await prisma.assetReference.count({ where: { ...owner, assetId: { in: [a.id, b.id] } } })).toBe(2)
  }, 20000)
  for (const type of ['GENERAL', 'COURSE'] as const) {
    it(`${type} publishes two objects with reversed shared sections and a complete shared image/video lock set`, async () => {
      const a = await create(), b = await create()
      const video = type === 'COURSE' ? await create({ mimeType: 'video/mp4' }) : undefined
      const caption = type === 'COURSE' ? await create({ mimeType: 'text/vtt' }) : undefined
      const allIds = [a.id, b.id, ...(video ? [video.id] : []), ...(caption ? [caption.id] : [])].sort()
      const makeQuestionnaire = async (reverse: boolean) => {
        const q = await prisma.questionnaire.create({ data: { code: randomUUID(), name: 'Synthetic lock regression', type, creatorId: ownerId } })
        questionnaires.push(q.id)
        const sequence = reverse ? [b, a] : [a, b]
        for (const [position, image] of sequence.entries()) {
          const section = await prisma.questionnaireFormSection.create({ data: { questionnaireId: q.id, position, title: 'Section ' + position } })
          const other = image.id === a.id ? b : a
          await prisma.questionnaireFormItem.create({ data: { questionnaireId: q.id, sectionId: section.id, position, sectionPosition: 0,
            type: 'single_choice', label: 'Synthetic choice', required: false, options: [{ value: 'yes', label: 'Yes',
              images: [{ asset: identity(image.id), altText: 'Synthetic image', order: 0 }],
              ...(video && caption ? { video: { schemaVersion: 1, video: { ...identity(video.id), mimeType: 'video/mp4' },
                poster: identity(other.id), captions: [{ asset: { ...identity(caption.id), mimeType: 'text/vtt' },
                  kind: 'captions', srcLang: 'zh', label: 'Synthetic captions' }] } } : {}),
            }] } })
        }
        return q
      }
      const [q1, q2] = await Promise.all([makeQuestionnaire(false), makeQuestionnaire(true)])
      const controller = type === 'GENERAL'
        ? (await import('../../controllers/generalQuestionnaireImageController')).generalQuestionnaireImageController
        : (await import('../../controllers/questionnaireImageController')).questionnaireImageController
      const bothLocked = gate(), observed: string[][] = []
      const publish = (questionnaireId: string) => prisma.$transaction(async tx => {
        let firstLock = true
        const proxy = new Proxy(tx, { get(target, property) {
          const value = Reflect.get(target, property)
          if (property === '$queryRaw') return async (...args: unknown[]) => {
            const rows = await (value as (...args: unknown[]) => Promise<unknown>).apply(target, args)
            const sql = args[0] as { sql?: string; values?: string[] }
            if (firstLock && sql.sql?.includes('FROM stored_assets') && sql.sql.includes('FOR SHARE')) {
              firstLock = false; observed.push([...(sql.values || [])])
              if (observed.length === 2) bothLocked.open()
              await Promise.race([bothLocked.ready, new Promise((_, reject) => {
                const timer = setTimeout(() => reject(new Error('Publication SHARE locks did not overlap')), 5000); timer.unref()
              })])
            }
            return rows
          }
          return typeof value === 'function' ? value.bind(target) : value
        } })
        const res: any = { statusCode: 200 }
        res.status = (code: number) => { res.statusCode = code; return res }
        res.json = (body: unknown) => { res.body = body; return res }
        await inLegacyQuestionnaireTransaction(proxy, () => controller.publish({ params: { id: questionnaireId },
          user: { userId: ownerId, role: 'TEACHER' } } as never, res))
        expect(res.body).toMatchObject({ code: 0 })
      }, { timeout: 15000 })
      await Promise.all([publish(q1.id), publish(q2.id)])
      expect(observed).toHaveLength(2)
      for (const firstSet of observed) expect(firstSet).toEqual(allIds)
      expect((await prisma.questionnaire.findMany({ where: { id: { in: [q1.id, q2.id] } } })).every(q => q.status === 'PUBLISHED')).toBe(true)
      for (const q of [q1, q2]) {
        const refs = await prisma.assetReference.findMany({ where: { entityType: 'AssessmentPublishedDefinition', entityId: { startsWith: `QUESTIONNAIRE:${q.id}:` } } })
        expect([...new Set(refs.map(ref => ref.assetId))].sort()).toEqual(allIds)
      }
    }, 20000)
  }

})
