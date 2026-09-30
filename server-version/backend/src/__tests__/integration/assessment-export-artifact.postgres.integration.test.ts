import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
const suite = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL') ? describe : describe.skip
suite('persisted assessment artifact access boundary', () => {
  let root: string; let userId: string; let artifactId: string
  let api: typeof import('../../services/assessmentExportArtifact')
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'assessment-export-regression-'))
    process.env.EXPORT_DIR = root
    api = await import('../../services/assessmentExportArtifact')
    const user = await prisma.user.create({ data: { username: `export-regression-${randomUUID()}`, passwordHash: 'test-only', role: 'ADMIN' } })
    userId = user.id
  })
  afterAll(async () => {
    if (artifactId) await prisma.exportArtifact.deleteMany({ where: { id: artifactId } })
    if (userId) await prisma.user.delete({ where: { id: userId } })
    if (root) await fs.rm(root, { recursive: true, force: true })
    await prisma.$disconnect()
  })
  it('persists provenance, rejects cross-user/demotion, and enforces expiry while bytes remain', async () => {
    const filePath = path.join(root, `${randomUUID()}.csv`)
    await fs.writeFile(filePath, 'sensitive,name\n1,test\n')
    const artifact = await api.registerAssessmentExport({ resourceType: 'COGNITIVE', resourceId: 'complete-resource-id', actor: { userId, role: 'ADMIN' }, anonymized: false, filePath, format: 'csv', detail: 'full', projectionFingerprint: 'frozen' })
    artifactId = artifact.id
    const input = { resourceType: 'COGNITIVE' as const, resourceId: 'complete-resource-id', actor: { userId, role: 'ADMIN' as const }, fileName: path.basename(filePath), projectionFingerprint: 'frozen' }
    expect(await api.resolveAssessmentExport(input)).toBe(filePath)
    expect(await api.resolveAssessmentExport({ ...input, actor: { userId: 'other', role: 'TEACHER' } })).toBeNull()
    expect(await api.resolveAssessmentExport({ ...input, actor: { userId, role: 'TEACHER' } })).toBeNull()
    await prisma.exportArtifact.update({ where: { id: artifact.id }, data: { expiresAt: new Date(0) } })
    expect(await api.resolveAssessmentExport(input)).toBeNull()
    expect(await fs.readFile(filePath, 'utf8')).toContain('sensitive')
  })
})
