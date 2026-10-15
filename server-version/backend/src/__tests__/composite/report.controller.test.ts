import { QuestionnaireCompletionAdmissionBusyError } from '../../services/questionnaireCompletionAdmission'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockService, mockBuildExport } = vi.hoisted(() => ({
  mockService: {
    isCompositeError: vi.fn(() => false),
    getReport: vi.fn(),
    getCompositeReportStatus: vi.fn(),
    retryCompositeQuestionnaireReport: vi.fn(),
    getCompositeReportStatusForTeacher: vi.fn(),
    getReportForTeacher: vi.fn(),
    getAnalysisExportForParticipant: vi.fn(),
    getAnalysisExportForTeacher: vi.fn(),
    listPackageAnalysisSnapshotsForTeacher: vi.fn(),
    reanalyzePackageAttempt: vi.fn(),
  },
  mockBuildExport: vi.fn(),
}))

vi.mock('../../modules/composite/composite.service', () => mockService)
vi.mock('../../modules/composite/composite-export.service', () => ({ buildCompositeAnalysisExport: mockBuildExport }))

import { compositeController } from '../../modules/composite/composite.controller'
import { hashRecoveryToken } from '../../services/anonymousAccess'

const response = () => ({
  json: vi.fn(),
  status: vi.fn().mockReturnThis(),
  setHeader: vi.fn(),
  send: vi.fn().mockReturnThis(),
}) as any

beforeEach(() => {
  vi.clearAllMocks()
  mockService.getReport.mockResolvedValue({ id: 'attempt-1' })
  mockService.getReportForTeacher.mockResolvedValue({ id: 'attempt-1' })
  mockService.getAnalysisExportForParticipant.mockResolvedValue({ attemptId: 'attempt-1' })
  mockService.getAnalysisExportForTeacher.mockResolvedValue({ attemptId: 'attempt-1' })
  mockService.listPackageAnalysisSnapshotsForTeacher.mockResolvedValue({ list: [], total: 0 })
  mockService.reanalyzePackageAttempt.mockResolvedValue({ id: 'snapshot-1' })
  mockBuildExport.mockReturnValue({
    fileName: 'analysis.json',
    contentType: 'application/json',
    body: Buffer.from('{"ok":true}'),
  })
})

describe('PR9 composite report controller', () => {
  it.each([
    new QuestionnaireCompletionAdmissionBusyError('queue_full', 2),
    { code: 'P2024' }, { code: 'P2034' }, { code: '40001' },
  ])('returns an explicit retryable 503 for known report capacity errors', async busy => {
    mockService.getReport.mockRejectedValueOnce(busy)
    const res = response()
    await compositeController.report({ params: { attemptId: 'attempt-1' }, query: {}, user: { userId: 'student-1' } } as any, res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String))
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'COMPLETION_BUSY' }))
  })

  it('keeps unknown errors as 500 and permission errors as 403', async () => {
    for (const [failure, status] of [[new Error('program defect'), 500], [{ statusCode: 403, message: 'denied' }, 403]] as const) {
      mockService.getReport.mockRejectedValueOnce(failure)
      const res = response()
      await compositeController.report({ params: { attemptId: 'attempt-1' }, query: {}, user: { userId: 'student-1' } } as any, res)
      expect(res.status).toHaveBeenCalledWith(status)
    }
  })

  it('keeps student report on the participant path even when snapshotId is supplied', async () => {
    const res = response()
    await compositeController.report({ params: { attemptId: 'attempt-1' }, query: { snapshotId: 'snapshot-2' }, user: { userId: 'student-1', role: UserRole.STUDENT } } as any, res)
    expect(mockService.getReport).toHaveBeenCalledWith('attempt-1', { userId: 'student-1' })
  })

  it('passes only a strict Snapshot query to teacher/admin reports', async () => {
    const res = response()
    await compositeController.teacherReport({
      params: { id: 'composite-1', attemptId: 'attempt-1' },
      query: { snapshotId: 'snapshot-2' },
      user: { userId: 'teacher-1', role: UserRole.TEACHER },
    } as any, res)
    expect(mockService.getReportForTeacher).toHaveBeenCalledWith('teacher-1', UserRole.TEACHER, 'composite-1', 'attempt-1', 'snapshot-2')

    const invalid = response()
    await compositeController.teacherReport({ params: { id: 'composite-1', attemptId: 'attempt-1' }, query: { attemptId: 'other' }, user: { userId: 'teacher-1', role: UserRole.TEACHER } } as any, invalid)
    expect(invalid.status).toHaveBeenCalledWith(400)
  })

  it('authorizes history through service and accepts only an empty reanalysis body', async () => {
    const history = response()
    await compositeController.snapshots({ params: { attemptId: 'attempt-1' }, user: { userId: 'teacher-1', role: UserRole.TEACHER } } as any, history)
    expect(mockService.listPackageAnalysisSnapshotsForTeacher).toHaveBeenCalledWith('teacher-1', UserRole.TEACHER, 'attempt-1')

    const reanalysis = response()
    await compositeController.reanalyze({ params: { attemptId: 'attempt-1' }, body: {}, user: { userId: 'admin-1', role: UserRole.ADMIN } } as any, reanalysis)
    expect(mockService.reanalyzePackageAttempt).toHaveBeenCalledWith('admin-1', UserRole.ADMIN, 'attempt-1')

    const invalid = response()
    await compositeController.reanalyze({ params: { attemptId: 'attempt-1' }, body: { snapshotId: 'snapshot-1' }, user: { userId: 'admin-1', role: UserRole.ADMIN } } as any, invalid)
    expect(invalid.status).toHaveBeenCalledWith(400)

    const nullBody = response()
    await compositeController.reanalyze({ params: { attemptId: 'attempt-1' }, body: null, user: { userId: 'admin-1', role: UserRole.ADMIN } } as any, nullBody)
    expect(nullBody.status).toHaveBeenCalledWith(400)
    expect(mockService.reanalyzePackageAttempt).toHaveBeenCalledTimes(1)
  })

  it('wires the authenticated student analysis export as a binary attachment', async () => {
    const res = response()
    await compositeController.analysisExport({
      params: { attemptId: 'attempt-1' },
      query: { format: 'json' },
      user: { userId: 'student-1', role: UserRole.STUDENT },
    } as any, res)

    expect(mockService.getAnalysisExportForParticipant).toHaveBeenCalledWith('attempt-1', { userId: 'student-1' })
    expect(mockBuildExport).toHaveBeenCalledWith({ attemptId: 'attempt-1' }, 'json')
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="analysis.json"')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith(Buffer.from('{"ok":true}'))

    const invalid = response()
    await compositeController.analysisExport({
      params: { attemptId: 'attempt-1' },
      query: { format: 'json', snapshotId: 'history-1' },
      user: { userId: 'student-1', role: UserRole.STUDENT },
    } as any, invalid)
    expect(invalid.status).toHaveBeenCalledWith(400)
  })

  it('passes the selected Snapshot through the teacher/admin export controller', async () => {
    const res = response()
    await compositeController.teacherAnalysisExport({
      params: { id: 'composite-1', attemptId: 'attempt-1' },
      query: { format: 'xlsx', snapshotId: 'snapshot-2' },
      user: { userId: 'teacher-1', role: UserRole.TEACHER },
    } as any, res)

    expect(mockService.getAnalysisExportForTeacher).toHaveBeenCalledWith(
      'teacher-1',
      UserRole.TEACHER,
      'composite-1',
      'attempt-1',
      'snapshot-2',
    )
    expect(mockBuildExport).toHaveBeenCalledWith({ attemptId: 'attempt-1' }, 'xlsx')
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json')
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', String(Buffer.from('{"ok":true}').length))
  })

  it('requires the recovery header on the public analysis export and never reads credentials from params', async () => {
    const recoveryToken = 'r'.repeat(32)
    const res = response()
    await compositeController.publicAnalysisExport({
      params: { attemptId: 'attempt-public' },
      query: { format: 'zip' },
      headers: { 'x-recovery-token': recoveryToken },
    } as any, res)

    expect(mockService.getAnalysisExportForParticipant).toHaveBeenCalledWith('attempt-public', {
      recoveryTokenHash: hashRecoveryToken(recoveryToken),
    })
    expect(mockBuildExport).toHaveBeenCalledWith({ attemptId: 'attempt-1' }, 'zip')

    const missing = response()
    await compositeController.publicAnalysisExport({
      params: { attemptId: 'attempt-public', recoveryToken },
      query: { format: 'zip' },
      headers: {},
    } as any, missing)
    expect(missing.status).toHaveBeenCalledWith(400)
    expect(mockService.getAnalysisExportForParticipant).toHaveBeenCalledTimes(1)
  })
})
