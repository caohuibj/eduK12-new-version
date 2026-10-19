import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ find: vi.fn(), resolve: vi.fn(), legacy: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { exportArtifact: { findUnique: mocks.find } } }))
vi.mock('../../services/assessmentExportArtifact', () => ({ resolveAssessmentExport: mocks.resolve }))
vi.mock('../../services/exportJobService', () => ({ exportArtifactUrl: (_type: string, resourceId: string, artifactId: string) => `/api/courses/${resourceId}/training-analysis/export/artifacts/${artifactId}` }))
vi.mock('../../modules/cognitive/assignment.service', () => ({ getAssignmentForTeacher: mocks.legacy }))
vi.mock('../../modules/composite/composite.service', () => ({ getExportContext: mocks.legacy }))
vi.mock('../../modules/composite/composite-export-projection', () => ({ resolveCompositeExportProjectionBinding: mocks.legacy }))
import { assessmentExportHttp } from '../../services/assessmentExportHttp'
import { actor, courseId, exportOptions } from './export-fixtures'

const req = () => ({ user: { userId: actor.id, role: actor.role }, params: { id: courseId, artifactId: 'artifact-id' } })
const res = () => { const value: any = {}; value.status = vi.fn(() => value); value.json = vi.fn(() => value); value.download = vi.fn(); return value }
const artifact = () => ({ id: 'artifact-id', batchId: 'batch-id', resourceType: 'TRAINING_ANALYSIS', resourceId: courseId,
  status: 'READY', errorCode: null, storageKey: 'training_analysis_known.csv', format: 'csv',
  expiresAt: new Date(Date.now() + 60000), provenance: { trainingAnalysis: exportOptions() } })

describe('Training original artifact HTTP lifecycle', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.find.mockResolvedValue(artifact()); mocks.resolve.mockResolvedValue('/safe/training_analysis_known.csv') })
  it('returns only safe status fields after live authorization, without a synthetic composite context', async () => {
    const response = res(); await assessmentExportHttp('TRAINING_ANALYSIS', true)(req() as any, response)
    expect(mocks.resolve).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'TRAINING_ANALYSIS', resourceId: courseId, metadataOnly: true }))
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: expect.objectContaining({ id: 'artifact-id', status: 'READY' }) }))
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('sourceHashes')
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('authorityHash')
    expect(mocks.legacy).not.toHaveBeenCalled(); expect(response.download).not.toHaveBeenCalled()
  })
  it('downloads only the resolver-approved path and honors revoked READY authorization', async () => {
    const response = res(); await assessmentExportHttp('TRAINING_ANALYSIS', false)(req() as any, response)
    expect(response.download).toHaveBeenCalledWith('/safe/training_analysis_known.csv')
    mocks.resolve.mockResolvedValue(null)
    const denied = res(); await assessmentExportHttp('TRAINING_ANALYSIS', false)(req() as any, denied)
    expect(denied.status).toHaveBeenCalledWith(404); expect(denied.download).not.toHaveBeenCalled()
  })
  it('rejects cross-course or cross-resource artifact IDs without invoking a source reader', async () => {
    for (const patch of [{ resourceId: 'another-course' }, { resourceType: 'COMPOSITE' }]) {
      mocks.find.mockResolvedValue({ ...artifact(), ...patch }); const response = res()
      await assessmentExportHttp('TRAINING_ANALYSIS', false)(req() as any, response)
      expect(response.status).toHaveBeenCalledWith(404); expect(response.download).not.toHaveBeenCalled()
    }
    expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.legacy).not.toHaveBeenCalled()
  })
})
