import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn(), stat: vi.fn(), visibility: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { exportArtifact: { findFirst: mocks.find }, compositeAssessmentAttempt: { count: mocks.count } } }))
vi.mock('node:fs', () => ({ promises: { stat: mocks.stat } }))
vi.mock('../../modules/composite/composite-export.service', () => ({ teacherRelationalExportVisibility: mocks.visibility }))
import { resolveAssessmentExport } from '../../services/assessmentExportArtifact'

const provenance = { version: 1, generation: '00000000-0000-4000-8000-000000000001', creatorRole: 'TEACHER', audience: 'teacher', detail: 'summary', dateRange: {}, projectionFingerprint: 'current', attemptIds: ['attempt'] }
const input = { resourceType: 'COMPOSITE' as const, resourceId: 'assessment', actor: { userId: 'teacher', role: 'TEACHER' as const }, fileName: 'known.csv', projectionFingerprint: 'current' }
const artifact = () => ({ resourceType: 'COMPOSITE', resourceId: 'assessment', createdBy: 'teacher', anonymized: true, storageKey: 'known.csv', format: 'csv', status: 'READY', expiresAt: new Date(Date.now() + 60000), provenance })
describe('assessment artifact authority (known exact filename)', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.find.mockResolvedValue(artifact()); mocks.stat.mockResolvedValue({ isFile: () => true }); mocks.count.mockResolvedValue(1); mocks.visibility.mockResolvedValue({ assignmentRef: null }) })
  it('allows a current teacher to download their own anonymized current-scope export', async () => {
    expect(await resolveAssessmentExport(input)).toMatch(/known.csv$/)
    expect(mocks.count).toHaveBeenCalledWith({ where: { AND: [{ id: { in: ['attempt'] }, compositeAssessmentId: 'assessment', status: 'COMPLETED' }, { assignmentRef: null }] } })
  })
  it.each([false, true])('rejects admin exports to the owner teacher, anonymized=%s', async (anonymized) => {
    mocks.find.mockResolvedValue({ ...artifact(), createdBy: 'admin', anonymized, provenance: { ...provenance, creatorRole: 'ADMIN' } })
    expect(await resolveAssessmentExport(input)).toBeNull(); expect(mocks.stat).not.toHaveBeenCalled()
  })
  it('rejects creator role downgrade even for anonymized bytes', async () => {
    mocks.find.mockResolvedValue({ ...artifact(), provenance: { ...provenance, creatorRole: 'ADMIN' } })
    expect(await resolveAssessmentExport(input)).toBeNull()
  })
  it.each([new Date(Date.now() - 1), new Date(0), new Date(NaN)])('rejects expired/corrupt expiry before reading retained bytes: %s', async (expiresAt) => {
    mocks.find.mockResolvedValue({ ...artifact(), expiresAt }); expect(await resolveAssessmentExport(input)).toBeNull(); expect(mocks.stat).not.toHaveBeenCalled()
  })
  it.each([null, {}, { ...provenance, projectionFingerprint: 'stale' }])('rejects absent/corrupt/stale provenance: %s', async (value) => {
    mocks.find.mockResolvedValue({ ...artifact(), provenance: value }); expect(await resolveAssessmentExport(input)).toBeNull()
  })
  it('rejects revoked relational row visibility', async () => { mocks.count.mockResolvedValue(0); expect(await resolveAssessmentExport(input)).toBeNull(); expect(mocks.stat).not.toHaveBeenCalled() })
  it('rejects an unregistered legacy filename', async () => { mocks.find.mockResolvedValue(null); expect(await resolveAssessmentExport(input)).toBeNull() })
  it('rejects wrong resource identity', async () => { mocks.find.mockResolvedValue({ ...artifact(), resourceId: 'other' }); expect(await resolveAssessmentExport(input)).toBeNull() })
  it('handles missing files locally', async () => { mocks.stat.mockRejectedValue(new Error('ENOENT')); expect(await resolveAssessmentExport(input)).toBeNull() })
  it('retains administrator access to registered nonanonymous artifacts', async () => { mocks.find.mockResolvedValue({ ...artifact(), anonymized: false }); expect(await resolveAssessmentExport({ ...input, actor: { userId: 'admin', role: 'ADMIN' } })).toMatch(/known.csv$/) })
})
