import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { applyImportPlan, inspectImportPlan, verifyImportPlan, type ImportAction } from '../../scripts/migration/import-plan'

const suite = process.env.ADMIN_PERMISSIONS_ISOLATED_TEST === '1' ? describe : describe.skip
suite('cross-version mapped import preserves current authority', () => {
  let db: PrismaClient
  beforeAll(() => {
    if (!new URL(process.env.DATABASE_URL!).pathname.startsWith('/eduk12_admin_permissions_')) throw new Error('Dedicated disposable DB required')
    db = new PrismaClient()
  })
  afterAll(() => db?.$disconnect())
  it.each(['SYSTEM_ADMIN','STANDARD'] as const)('dry-run/apply/verify retain existing %s without elevating', async platformRole => {
    const id = randomUUID(), stamp = new Date('2026-01-01T00:00:00Z')
    const data = { id, username: 'import-compat-' + id, passwordHash: 'unusable-synthetic', role: 'ADMIN', platformRole: 'STANDARD', createdAt: stamp, updatedAt: stamp }
    const batch = await db.legacyImportBatch.create({ data: { mode: 'apply' } })
    await db.user.create({ data: { ...data, role: 'ADMIN', platformRole } })
    await db.legacyImportIdMap.create({ data: { entity: 'user', legacyId: id, newId: id, batchId: batch.id } })
    // The fresh-user plan stays STANDARD, even when replaying the prior importer.
    const action: ImportAction = { model: 'user', operation: 'upsert', args: { where: { id }, create: data, update: {} },
      mapping: { entity: 'user', legacyId: id, newId: id } }
    const scoped = { ...db, legacyImportIdMap: { findUnique: db.legacyImportIdMap.findUnique.bind(db.legacyImportIdMap),
      count: () => db.legacyImportIdMap.count({ where: { entity: 'user', legacyId: id } }) } } as unknown as PrismaClient
    // Bind the real Prisma methods; this only scopes the existing global-count
    // invariant to this independently created synthetic import batch.
    Object.defineProperty(scoped, 'user', { value: db.user })
    expect(await inspectImportPlan(db, [action])).toMatchObject({ existing: 1, inserts: 0 })
    await applyImportPlan(db, [action], batch.id, 1)
    expect(await verifyImportPlan(scoped, [action])).toMatchObject({ checked: 1, mappingCount: 1 })
    expect((await db.user.findUniqueOrThrow({ where: { id } })).platformRole).toBe(platformRole)
    await expect(inspectImportPlan(db, [{ ...action, args: { ...action.args, create: { ...data, username: 'tampered' } } }])).rejects.toThrow('conflicts')
    // Unmapped collisions are still rejected, even if platformRole is the only difference.
    await db.legacyImportIdMap.delete({ where: { entity_legacyId: { entity: 'user', legacyId: id } } })
    await expect(inspectImportPlan(db, [action])).rejects.toThrow('conflicts')
  })
  it('new imported legacy ADMIN remains STANDARD', async () => {
    const id = randomUUID(), batch = await db.legacyImportBatch.create({ data: { mode: 'apply' } })
    const action: ImportAction = { model: 'user', operation: 'upsert', args: { where: { id }, update: {},
      create: { id, username: 'import-new-' + id, passwordHash: 'unusable-synthetic', role: 'ADMIN', platformRole: 'STANDARD' } },
      mapping: { entity: 'user', legacyId: id, newId: id } }
    await applyImportPlan(db, [action], batch.id, 1)
    expect((await db.user.findUniqueOrThrow({ where: { id } })).platformRole).toBe('STANDARD')
  })
})
