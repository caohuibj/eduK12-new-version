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
    expect(result).toHaveLength(6)
    expect(result.every((item) => item.status === 'DRAFT' && item.disabledReason)).toBe(true)
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
