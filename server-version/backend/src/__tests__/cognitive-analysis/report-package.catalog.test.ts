import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { materialGrant: { findMany: vi.fn() } },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { listReportPackageCatalog } from '../../modules/cognitive-analysis/report-package.catalog.service'

describe('ReportPackage catalog visibility', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lets admins inspect all package versions, including disabled drafts', async () => {
    const result = await listReportPackageCatalog('admin-1', UserRole.ADMIN)
    const expectedKeys = [
      'attention_stability_v1',
      'inhibitory_control_v1',
      'inhibitory_control_multisource_v1',
      'working_memory_v1',
      'executive_control_v1',
      'learning_reasoning_v1',
      'k12_core_profile_v1',
    ]
    for (const key of expectedKeys) {
      expect(result.find((item) => item.key === key)).toMatchObject({ status: 'DRAFT', disabledReason: expect.any(String) })
    }
    expect(result.find((item) => item.key === 'inhibitory_control_multisource_v1')?.slots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'SCALE',
        expectedScaleCode: 'adexi_v1',
        expectedDimensionCode: 'inhibition',
        respondentType: 'participant_self_report',
        valueSelector: 'dimensionScore',
      }),
    ]))
    expect(mockPrisma.materialGrant.findMany).not.toHaveBeenCalled()
  })

  it('does not expose ungranted packages to teachers', async () => {
    mockPrisma.materialGrant.findMany.mockResolvedValue([])
    await expect(listReportPackageCatalog('teacher-1', UserRole.TEACHER)).resolves.toEqual([])
    expect(mockPrisma.materialGrant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { teacherId: 'teacher-1', resourceType: 'REPORT_PACKAGE' },
    }))
  })
})
