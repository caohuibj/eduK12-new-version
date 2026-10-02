import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { applyImportPlan, inspectImportPlan, verifyImportPlan, type ImportAction } from '../../scripts/migration/import-plan'

const url = integrationDatabaseUrl('LEGACY_IMPORT_TEST_DATABASE_URL', 'RELEASE_INTEGRATION_DATABASE_URL', 'PR26_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
const prefix = 'legacy-fixture-' + randomUUID()
let db: PrismaClient
const batchIds: string[] = []
const entity = prefix + '-user'
const id = prefix + '-user'
const data = { id, username: prefix, passwordHash: 'synthetic-only', role: 'STUDENT', platformRole: 'STANDARD', createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z') }
const action: ImportAction = { model: 'user', operation: 'upsert', args: { where: { id }, create: data, update: {} } as any,
  mapping: { entity, legacyId: id, newId: id } }
suite('legacy importer transactions (isolated synthetic PostgreSQL)', () => {
  beforeAll(async () => {
    const parsed = url ? new URL(url) : null
    // The repository's disposable GitHub Actions PostgreSQL service uses /ptool.
    const disposableCi = process.env.CI === 'true' && parsed && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) && parsed.pathname === '/ptool'
    if (!parsed || (!disposableCi && (!/(test|rehearsal|acc)/i.test(parsed.pathname) || /\/ptool(?:_legacy)?$/i.test(parsed.pathname)))) throw new Error('Explicit isolated test database required')
    db = new PrismaClient({ datasources: { db: { url } }, log: [] })
    await db.$connect()
  })
  afterAll(async () => {
    if (!db) return
    await db.legacyImportIdMap.deleteMany({ where: { entity: { startsWith: prefix } } })
    await db.user.deleteMany({ where: { id } })
    await db.legacyImportBatch.deleteMany({ where: { id: { in: batchIds } } })
    await db.$disconnect()
  })
  const batch = async () => {
    const value = await db.legacyImportBatch.create({ data: { mode: 'apply' } })
    batchIds.push(value.id); return value.id
  }
  it('dry-run has zero business writes; apply/replay preserve content and one mapping', async () => {
    expect(await inspectImportPlan(db, [action])).toEqual({ inserts: 1, existing: 0, updates: 0 })
    expect(await db.user.findUnique({ where: { id } })).toBeNull()
    await applyImportPlan(db, [action], await batch(), 1)
    expect(await verifyImportPlan(db, [action])).toEqual({ checked: 1, mappingCount: 1 })
    expect(await inspectImportPlan(db, [action])).toEqual({ inserts: 0, existing: 1, updates: 0 })
    await applyImportPlan(db, [action], await batch(), 1)
    expect(await db.legacyImportIdMap.count({ where: { entity } })).toBe(1)
    expect((await db.user.findUniqueOrThrow({ where: { id } })).updatedAt).toEqual(data.updatedAt)
  })
  it('a failed foreign-key chunk rolls back both earlier rows and their maps', async () => {
    const rollbackId = prefix + '-rollback'
    const first: ImportAction = { ...action, args: { where: { id: rollbackId }, create: { ...data, id: rollbackId, username: rollbackId }, update: {} } as any,
      mapping: { entity: prefix + '-rollback', legacyId: rollbackId, newId: rollbackId } }
    const invalid: ImportAction = { model: 'classroomQuestion', operation: 'upsert',
      args: { where: { id: prefix + '-question' }, create: { id: prefix + '-question', classroomId: prefix + '-missing', questionIndex: 0, questionContent: { question: 'synthetic' } }, update: {} } as any,
      mapping: { entity: prefix + '-question', legacyId: prefix + '-question', newId: prefix + '-question' } }
    await expect(applyImportPlan(db, [first, invalid], await batch(), 50)).rejects.toThrow()
    expect(await db.user.findUnique({ where: { id: rollbackId } })).toBeNull()
    expect(await db.legacyImportIdMap.count({ where: { entity: prefix + '-rollback' } })).toBe(0)
  })
  it('rejects a changed record instead of silently overwriting or passing verification', async () => {
    await db.user.update({ where: { id }, data: { nickname: 'changed', username: prefix + '-changed' } })
    await expect(verifyImportPlan(db, [action])).rejects.toThrow('content mismatch')
    await expect(inspectImportPlan(db, [action])).rejects.toThrow('conflicts')
    await expect(applyImportPlan(db, [action], await batch(), 50)).rejects.toThrow('conflicts')
    expect((await db.user.findUniqueOrThrow({ where: { id } })).username).toBe(prefix + '-changed')
  })
})
