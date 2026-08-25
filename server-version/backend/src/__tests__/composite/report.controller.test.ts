import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockService } = vi.hoisted(() => ({
  mockService: {
    isCompositeError: vi.fn(() => false),
    getReport: vi.fn(),
    getReportForTeacher: vi.fn(),
    listPackageAnalysisSnapshotsForTeacher: vi.fn(),
    reanalyzePackageAttempt: vi.fn(),
  },
}))

vi.mock('../../modules/composite/composite.service', () => mockService)

import { compositeController } from '../../modules/composite/composite.controller'

const response = () => ({
  json: vi.fn(),
  status: vi.fn().mockReturnThis(),
}) as any

beforeEach(() => {
  vi.clearAllMocks()
  mockService.getReport.mockResolvedValue({ id: 'attempt-1' })
  mockService.getReportForTeacher.mockResolvedValue({ id: 'attempt-1' })
  mockService.listPackageAnalysisSnapshotsForTeacher.mockResolvedValue({ list: [], total: 0 })
  mockService.reanalyzePackageAttempt.mockResolvedValue({ id: 'snapshot-1' })
})

describe('PR9 composite report controller', () => {
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
})
