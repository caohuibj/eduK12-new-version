import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockService, mockExportService } = vi.hoisted(() => ({
  mockService: {
    getExportContext: vi.fn(),
    isCompositeError: vi.fn(() => false),
  },
  mockExportService: {
    getExportData: vi.fn(),
    saveExportFiles: vi.fn(),
  },
}))

vi.mock('../../modules/composite/composite.service', () => mockService)
vi.mock('../../modules/composite/composite-export.service', () => ({ compositeExportService: mockExportService }))

import { compositeController } from '../../modules/composite/composite.controller'

const response = () => ({
  json: vi.fn(),
  status: vi.fn().mockReturnThis(),
  download: vi.fn(),
}) as any

const exportData = {
  assessmentId: 'composite-1',
  assessmentName: '综合测评',
  detail: 'summary',
  fields: [{ name: 'U_id', label: '参与者编号', type: 'string' }],
  rows: [{}],
  trialCount: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockService.isCompositeError.mockReturnValue(false)
  mockService.getExportContext.mockResolvedValue({ id: 'composite-1' })
  mockExportService.getExportData.mockResolvedValue(exportData)
  mockExportService.saveExportFiles.mockResolvedValue({ filePath: '/exports/composite_composite_summary_2026-08-20T00-00-00_00000000-0000-0000-0000-000000000000.csv' })
})

describe('Composite export controller authorization and limits', () => {
  it('rejects unauthenticated preview/export before touching the exporter', async () => {
    const res = response()
    await compositeController.exportData({ params: { id: 'composite-1' }, body: {} } as any, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(mockService.getExportContext).not.toHaveBeenCalled()
    expect(mockExportService.getExportData).not.toHaveBeenCalled()
  })

  it('forces teacher exports to anonymous while preserving admin opt-out', async () => {
    const teacherRes = response()
    await compositeController.exportData({
      params: { id: 'composite-1' },
      body: { detail: 'summary', format: 'csv', anonymize: false },
      user: { userId: 'teacher-1', role: UserRole.TEACHER },
    } as any, teacherRes)
    expect(mockExportService.getExportData).toHaveBeenCalledWith('composite-1', expect.objectContaining({ anonymize: true }))
    expect(mockExportService.saveExportFiles).toHaveBeenCalledWith('composite-1', expect.objectContaining({ anonymize: true }), 'csv', exportData)

    mockExportService.getExportData.mockClear()
    const adminRes = response()
    await compositeController.exportData({
      params: { id: 'composite-1' },
      body: { detail: 'summary', format: 'csv', anonymize: false },
      user: { userId: 'admin-1', role: UserRole.ADMIN },
    } as any, adminRes)
    expect(mockExportService.getExportData).toHaveBeenCalledWith('composite-1', expect.objectContaining({ anonymize: false }))
  })

  it('returns other-teacher denial from the ownership service', async () => {
    const denial = Object.assign(new Error('只能导出自己的综合测评'), { statusCode: 403 })
    mockService.getExportContext.mockRejectedValue(denial)
    const res = response()

    await compositeController.exportPreview({
      params: { id: 'composite-1' },
      query: { detail: 'summary' },
      user: { userId: 'teacher-2', role: UserRole.TEACHER },
    } as any, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(mockExportService.getExportData).not.toHaveBeenCalled()
  })

  it('preserves the 413 export-limit response instead of converting it to success', async () => {
    const limit = Object.assign(new Error('导出记录数超过上限'), { statusCode: 413 })
    mockExportService.getExportData.mockRejectedValue(limit)
    const res = response()

    await compositeController.exportData({
      params: { id: 'composite-1' },
      body: { detail: 'summary', format: 'csv', anonymize: true },
      user: { userId: 'admin-1', role: UserRole.ADMIN },
    } as any, res)

    expect(res.status).toHaveBeenCalledWith(413)
    expect(mockExportService.saveExportFiles).not.toHaveBeenCalled()
  })
})
