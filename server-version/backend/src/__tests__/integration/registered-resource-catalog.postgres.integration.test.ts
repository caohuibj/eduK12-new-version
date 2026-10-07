import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { createCustomScaleDefinition, hashScaleDefinition } from '../../modules/scale/scale-definition'
import { descriptiveResourceEntry, listReleasedRegisteredResourcePage } from '../../modules/assessment-run/registeredResources'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
const marker = 'catalog-cross-' + randomUUID()
let adminId: string, teacherId: string, alienId: string, grantedScale: string
const composites: string[] = [], scales: string[] = [], users: string[] = []

suite('authorized registered catalog beyond the former global 100 limit', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    for (const [name, role] of [['admin', 'ADMIN'], ['teacher', 'TEACHER'], ['alien', 'ADMIN']] as const) {
      const user = await prisma.user.create({ data: { username: marker + name, passwordHash: 'synthetic-only', role, teacherApproved: true } })
      users.push(user.id)
    }
    ;[adminId, teacherId, alienId] = users
    const definition = createCustomScaleDefinition()
    definition.source = { title: '原创合成目录测试' }
    definition.items = ['Q1','Q2','Q3'].map((itemCode, sortOrder) => ({ itemCode, sortOrder, content: itemCode, type: 'single', required: true, responseSetKey: 'default', randomizeOptions: false }))
    definition.scoring.itemRules = definition.items.map(item => ({ itemCode: item.itemCode, transform: { type: 'identity' } }))
    definition.scoring.scores = [{ key: 'total', type: 'total', label: '合计', direction: 'descriptive', canonical: true, displayPrecision: 1, source: { type: 'items', aggregation: 'sum', items: definition.items.map(item => ({ itemCode: item.itemCode, weight: 1 })) } }]
    definition.report.primaryScoreKeys = ['total']; definition.report.scoreOrder = ['total']
    definition.report.interpretations = [{ scoreKey: 'total', headline: '合成描述', source: { type: 'score_only' }, summary: '描述回答合计', bands: [], guidance: [] }]
    const hash = hashScaleDefinition(definition)
    // Old authorized rows must remain visible even with 105 newer unrelated rows.
    for (const [creatorId, count] of [[teacherId, 2], [alienId, 105]] as const) {
      const scale = await prisma.scale.create({ data: { code: marker + creatorId, name: marker, creatorId, status: 'PUBLISHED', instrumentClass: 'CUSTOM_DESCRIPTIVE', definition, definitionHash: hash } })
      scales.push(scale.id); if (creatorId === alienId) grantedScale = scale.id
      const rows = Array.from({ length: count }, (_, index) => {
        const compositeId = randomUUID(); composites.push(compositeId)
        const version = '1.0.' + index
        const entry = descriptiveResourceEntry({ scaleId: scale.id, name: marker, definition, definitionHash: hash, compositeId, version, mode: 'INDIVIDUAL' })
        return { compositeId, version, entry }
      })
      await prisma.compositeAssessment.createMany({ data: rows.map(row => ({ id: row.compositeId, code: row.compositeId, name: marker, createdBy: creatorId, status: 'PUBLISHED', productKind: 'ORGANIZATION_RESOURCE' })) })
      await prisma.$executeRaw(Prisma.sql`INSERT INTO registered_assessment_resources
        (id,resource_key,resource_version,scale_id,definition_hash,composite_id,entry,entry_hash,status,created_by_user_id,reviewed_by_user_id)
        VALUES ${Prisma.join(rows.map(row => Prisma.sql`(${randomUUID()},${row.entry.applicability.resourceKey},${row.version},${scale.id},${hash},${row.compositeId},${JSON.stringify(row.entry)}::jsonb,${canonicalHash(row.entry)},'PUBLISHED',${creatorId},${adminId})`))}`)
    }
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    if (scales.length) {
      await prisma.$executeRaw`DELETE FROM registered_assessment_resources WHERE scale_id IN (${Prisma.join(scales)})`
      await prisma.materialGrant.deleteMany({ where: { resourceId: { in: scales } } })
      await prisma.compositeAssessment.deleteMany({ where: { id: { in: composites } } })
      await prisma.scale.deleteMany({ where: { id: { in: scales } } })
    }
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    await prisma.$disconnect()
  })
  it('filters before pagination, batches reads, exposes remaining pages and rechecks revocation/source versions', async () => {
    const scaleLookup = vi.spyOn(prisma.scale, 'findUnique'), grantLookup = vi.spyOn(prisma.materialGrant, 'findUnique')
    const batch = vi.spyOn(prisma, '$queryRaw')
    const first = await listReleasedRegisteredResourcePage(teacherId, UserRole.TEACHER)
    expect(first.entries).toHaveLength(2); expect(first.nextPage).toBeNull()
    expect(batch).toHaveBeenCalledOnce(); expect(scaleLookup).not.toHaveBeenCalled(); expect(grantLookup).not.toHaveBeenCalled()
    await prisma.materialGrant.create({ data: { teacherId, resourceType: 'SCALE', resourceId: grantedScale, grantedBy: adminId } })
    batch.mockClear()
    const [page1, page2] = await Promise.all([listReleasedRegisteredResourcePage(teacherId, UserRole.TEACHER), listReleasedRegisteredResourcePage(teacherId, UserRole.TEACHER, 2)])
    expect(page1.entries).toHaveLength(100); expect(page1.nextPage).toBe(2)
    expect(page2.entries).toHaveLength(7); expect(page2.nextPage).toBeNull(); expect(batch).toHaveBeenCalledTimes(2)
    expect(new Set([...page1.entries, ...page2.entries].map(entry => entry.applicability.resourceKey + '@' + entry.applicability.resourceVersion)).size).toBe(107)
    await prisma.materialGrant.deleteMany({ where: { teacherId, resourceId: grantedScale } })
    expect((await listReleasedRegisteredResourcePage(teacherId, UserRole.TEACHER)).entries).toHaveLength(2)
    await prisma.scale.update({ where: { id: grantedScale }, data: { definitionHash: 'f'.repeat(64) } })
    const adminPage = await listReleasedRegisteredResourcePage(adminId, UserRole.ADMIN)
    expect(adminPage.entries.some(entry => entry.applicability.resourceKey.includes(grantedScale))).toBe(false)
    await expect(listReleasedRegisteredResourcePage(teacherId, UserRole.TEACHER, 0)).rejects.toMatchObject({ code: 'RESOURCE_PAGE_INVALID' })
  })
})
