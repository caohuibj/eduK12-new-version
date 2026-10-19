import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ find: vi.fn(), stat: vi.fn(), principal: vi.fn(), revalidate: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { exportArtifact: { findFirst: mocks.find } } }))
vi.mock('node:fs', () => ({ promises: { stat: mocks.stat } }))
vi.mock('../../modules/organization/principal', () => ({ loadCurrentPrincipal: mocks.principal }))
vi.mock('../../modules/training-analysis/service', () => ({ revalidateTrainingAnalysisManifest: mocks.revalidate }))
import { resolveAssessmentExport } from '../../services/assessmentExportArtifact'
import { actor, courseId, currentPrincipal, exportOptions } from './export-fixtures'

const input = { resourceType: 'TRAINING_ANALYSIS' as const, resourceId: courseId, actor: { userId: actor.id, role: actor.role }, fileName: 'training_analysis_known.csv' }
const artifact = () => ({ resourceType: input.resourceType, resourceId: courseId, createdBy: actor.id,
  format: 'csv', storageKey: input.fileName, status: 'READY', anonymized: true,
  expiresAt: new Date(Date.now() + 60000), provenance: { version: 2, resourceType: 'TRAINING_ANALYSIS',
    generation: '60000000-0000-4000-8000-000000000001', creatorRole: actor.role, audience: 'teacher', trainingAnalysis: exportOptions() } })

describe('Training artifact live exact-creator manifest gate', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.find.mockResolvedValue(artifact()); mocks.stat.mockResolvedValue({ isFile: () => true }); mocks.principal.mockResolvedValue(currentPrincipal()); mocks.revalidate.mockResolvedValue(undefined) })
  it('revalidates the exact frozen manifest before opening READY bytes', async () => {
    expect(await resolveAssessmentExport(input)).toMatch(/training_analysis_known.csv$/)
    expect(mocks.revalidate).toHaveBeenCalledWith(actor, exportOptions().manifest)
    expect(mocks.revalidate.mock.invocationCallOrder[0]).toBeLessThan(mocks.stat.mock.invocationCallOrder[0])
  })
  it.each([false, true])('rejects changed quality, source or permission before bytes and metadata, metadataOnly=%s', async (metadataOnly) => {
    mocks.revalidate.mockRejectedValue(new Error('TRAINING_ANALYSIS_STALE'))
    expect(await resolveAssessmentExport({ ...input, metadataOnly })).toBeNull()
    expect(mocks.stat).not.toHaveBeenCalled()
  })
  it('keeps queued status readable only after current manifest revalidation, without reading bytes', async () => {
    mocks.find.mockResolvedValue({ ...artifact(), status: 'PROCESSING' })
    expect(await resolveAssessmentExport({ ...input, metadataOnly: true })).toBe(input.fileName)
    expect(mocks.revalidate).toHaveBeenCalledOnce(); expect(mocks.stat).not.toHaveBeenCalled()
    expect(await resolveAssessmentExport(input)).toBeNull()
  })
  it('does not grant another admin access to a teacher-bound analysis manifest', async () => {
    expect(await resolveAssessmentExport({ ...input, actor: { userId: 'other-admin', role: 'ADMIN' } })).toBeNull()
    expect(mocks.revalidate).not.toHaveBeenCalled(); expect(mocks.stat).not.toHaveBeenCalled()
  })
  it.each(['isFrozen', 'mustChangePassword'])('rejects revoked current account field %s', async (field) => {
    mocks.principal.mockResolvedValue({ ...currentPrincipal(), [field]: true })
    expect(await resolveAssessmentExport(input)).toBeNull(); expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it('rejects a role downgrade or a stale request actor role', async () => {
    mocks.principal.mockResolvedValue({ ...currentPrincipal(), role: 'STUDENT' })
    expect(await resolveAssessmentExport(input)).toBeNull(); expect(mocks.stat).not.toHaveBeenCalled()
  })
  it('rejects absent or tampered provenance and cross-course filenames', async () => {
    const row = artifact()
    for (const value of [null, { ...row.provenance, version: 1 }, { ...row.provenance, trainingAnalysis: { ...row.provenance.trainingAnalysis, table: 'illegal' } }]) {
      mocks.find.mockResolvedValue({ ...row, provenance: value }); expect(await resolveAssessmentExport(input)).toBeNull()
    }
    mocks.find.mockResolvedValue({ ...row, resourceId: 'other-course' }); expect(await resolveAssessmentExport(input)).toBeNull()
    expect(mocks.stat).not.toHaveBeenCalled()
  })
  it('rejects retained expired files without refreshing or serving them', async () => {
    mocks.find.mockResolvedValue({ ...artifact(), expiresAt: new Date(0) })
    expect(await resolveAssessmentExport(input)).toBeNull(); expect(mocks.revalidate).not.toHaveBeenCalled(); expect(mocks.stat).not.toHaveBeenCalled()
  })
})
