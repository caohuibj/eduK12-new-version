import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { createCustomScaleDefinition, hashScaleDefinition } from '../../modules/scale/scale-definition'
import { descriptiveResourceEntry, listRegisteredResources, readPublishedRegisteredResource, listReleasedRegisteredResourcePage } from '../../modules/assessment-run/registeredResources'
import { reportingContentController } from '../../modules/reporting/content.controller'
import type { Request, Response } from 'express'
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
  it('paginates the administrator catalog and creates a spec from an exact resource beyond its first page', async () => {
    const actor = { userId: adminId, platformRole: 'SYSTEM_ADMIN' }
    const first = await listRegisteredResources(actor), second = await listRegisteredResources(actor, 2)
    expect(first.list).toHaveLength(100); expect(first.nextPage).toBe(2)
    expect(second.list.length).toBeGreaterThan(0)
    const [old] = await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM registered_assessment_resources WHERE scale_id=${scales[0]} ORDER BY created_at,id LIMIT 1`
    expect(first.list.some(row=>row.id===old.id)).toBe(false)
    expect((await readPublishedRegisteredResource(actor,old.id)).id).toBe(old.id)
    await expect(readPublishedRegisteredResource({userId:teacherId,platformRole:'STANDARD'},old.id)).rejects.toMatchObject({code:'RESOURCE_AUTHORITY'})
    const response = { setHeader: vi.fn(), json: vi.fn(), status: vi.fn() }
    response.status.mockReturnValue(response)
    const specKey = marker + ':exact-spec'
    try {
      await reportingContentController.createDescriptiveSpec({user:{userId:adminId,platformRole:'SYSTEM_ADMIN'},body:{resourceId:old.id,specKey,version:1,analysisKind:'INDIVIDUAL_LONGITUDINAL',minimumN:3}} as Request, response as unknown as Response)
      expect(response.json).toHaveBeenCalledWith(expect.objectContaining({code:0,data:expect.objectContaining({specKey,status:'DRAFT'})}))
      await prisma.$executeRaw`UPDATE registered_assessment_resources SET status='RETIRED' WHERE id=${old.id}`
      await expect(readPublishedRegisteredResource(actor,old.id)).rejects.toMatchObject({code:'RESOURCE_NOT_PUBLISHED'})
      await prisma.$executeRaw`UPDATE registered_assessment_resources SET status='PUBLISHED' WHERE id=${old.id}`
    } finally {
      await prisma.$executeRaw`DELETE FROM reporting_analysis_specs WHERE spec_key=${specKey}`
      await prisma.$executeRaw`DELETE FROM organization_governance_audits WHERE payload->>'specKey'=${specKey}`
    }
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
