import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ authority: vi.fn(), find: vi.fn(), stat: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { exportArtifact: { findFirst: mocks.find }, compositeAssessmentAttempt: { count: vi.fn().mockResolvedValue(0) } } }))
vi.mock('node:fs', () => ({ promises: { stat: mocks.stat } }))
vi.mock('../../modules/cognitive/assignment.service', () => ({ getAssignmentForTeacher: mocks.authority }))
vi.mock('../../modules/composite/composite.service', () => ({ getExportContext: mocks.authority, isCompositeError: () => false }))
vi.mock('../../modules/composite/composite-export.service', () => ({ compositeExportService: {}, teacherRelationalExportVisibility: vi.fn().mockResolvedValue(null) }))
vi.mock('../../modules/composite/composite-export-projection', () => ({ resolveCompositeExportProjectionBinding: vi.fn().mockResolvedValue({ fingerprint: 'current' }), compositeExportFileNameMatchesProjection: () => true }))
import { cognitiveController } from '../../modules/cognitive/cognitive.controller'
import { compositeExportController } from '../../modules/composite/composite-export.controller'
const res = () => { const r: any = {}; r.status = vi.fn(() => r); r.json = vi.fn(() => r); r.download = vi.fn(); return r }
describe.each([
  ['COGNITIVE', cognitiveController.downloadExportFile, 'cognitive', 'cognitive-frozen-export-v1'],
  ['COMPOSITE', compositeExportController.download, 'composite', 'current'],
] as const)('routed %s download', (resourceType, download, prefix, projectionFingerprint) => {
  const fileName = `${prefix}_12345678_summary_2026-09-30T00-00-00_00000000-0000-4000-8000-000000000001.csv`
  const req: any = { user: { userId: 'teacher', role: 'TEACHER' }, params: { id: '12345678-full-resource', fileName } }
  const artifact = () => ({ resourceType, resourceId: req.params.id, storageKey: fileName, format: 'csv', status: 'READY', createdBy: 'teacher', anonymized: true, expiresAt: new Date(Date.now() + 60000), provenance: { version: 1, generation: '00000000-0000-4000-8000-000000000001', creatorRole: 'TEACHER', audience: 'teacher', detail: 'summary', dateRange: {}, projectionFingerprint, attemptIds: [] } })
  beforeEach(() => { vi.clearAllMocks(); mocks.authority.mockResolvedValue({ listedStandalone: true }); mocks.find.mockResolvedValue(artifact()); mocks.stat.mockResolvedValue({ isFile: () => true }) })
  it('allows a current creator through the actual controller', async () => { const r = res(); await download(req, r); expect(r.download).toHaveBeenCalledOnce() })
  it('rejects the correct admin filename before serving nonanonymous bytes', async () => { mocks.find.mockResolvedValue({ ...artifact(), createdBy: 'admin', anonymized: false }); const r = res(); await download(req, r); expect(r.download).not.toHaveBeenCalled(); expect(r.status).toHaveBeenCalledWith(404) })
  it('denies current authority revocation before artifact lookup', async () => { mocks.authority.mockRejectedValue(Object.assign(new Error('revoked'), { statusCode: 403 })); const r = res(); await download(req, r); expect(r.download).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled() })
  it('denies retained expired files through the route', async () => { mocks.find.mockResolvedValue({ ...artifact(), expiresAt: new Date(0) }); const r = res(); await download(req, r); expect(r.download).not.toHaveBeenCalled(); expect(mocks.stat).not.toHaveBeenCalled() })
})
