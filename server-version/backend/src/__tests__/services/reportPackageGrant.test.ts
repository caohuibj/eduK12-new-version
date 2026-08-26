import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MaterialResourceType, UserRole } from '@prisma/client'

const flags = vi.hoisted(() => ({ materialGrantsEnabled: true }))
const { mockPrisma, getPackage, getPackageByResource } = vi.hoisted(() => ({
  mockPrisma: {
    materialGrant: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
  },
  getPackage: vi.fn(),
  getPackageByResource: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../config', () => ({
  config: {
    get materialGrantsEnabled() { return flags.materialGrantsEnabled },
  },
}))
vi.mock('../../modules/cognitive-analysis/report-package.registry', () => ({
  getReportPackageDefinition: getPackage,
  getReportPackageByResourceId: getPackageByResource,
  reportPackageResourceId: (key: string, version: string) => `${key}@${version}`,
}))

import { canUseReportPackage, createGrant } from '../../services/materialGrant'

const definition = {
  key: 'attention_stability_v1',
  version: '1.0.0',
  status: 'PUBLISHED',
  name: '注意与稳定性',
}

describe('REPORT_PACKAGE MaterialGrant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    flags.materialGrantsEnabled = true
    getPackage.mockReturnValue(definition)
    getPackageByResource.mockReturnValue(definition)
    mockPrisma.materialGrant.findUnique.mockResolvedValue(null)
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'teacher-1', role: UserRole.TEACHER, teacherApproved: true, isActive: true, isFrozen: false,
    })
    mockPrisma.materialGrant.upsert.mockResolvedValue({
      id: 'grant-1', teacherId: 'teacher-1', resourceType: MaterialResourceType.REPORT_PACKAGE,
      resourceId: 'attention_stability_v1@1.0.0', grantedBy: 'admin-1', createdAt: new Date(),
      teacher: { id: 'teacher-1', username: 'teacher', nickname: null, role: UserRole.TEACHER },
      granter: { id: 'admin-1', username: 'admin', nickname: null },
    })
  })

  it('requires an exact grant for teachers and allows admins', async () => {
    await expect(canUseReportPackage('teacher-1', UserRole.TEACHER, definition.key, definition.version)).resolves.toBe(false)
    mockPrisma.materialGrant.findUnique.mockResolvedValue({ id: 'grant-1' })
    await expect(canUseReportPackage('teacher-1', UserRole.TEACHER, definition.key, definition.version)).resolves.toBe(true)
    await expect(canUseReportPackage('admin-1', UserRole.ADMIN, definition.key, definition.version)).resolves.toBe(true)
  })

  it('creates package grants through the existing MaterialGrant table', async () => {
    const result = await createGrant({
      teacherId: 'teacher-1',
      resourceType: MaterialResourceType.REPORT_PACKAGE,
      resourceId: 'attention_stability_v1@1.0.0',
      grantedBy: 'admin-1',
    })
    expect(mockPrisma.materialGrant.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: {
        teacherId: 'teacher-1',
        resourceType: MaterialResourceType.REPORT_PACKAGE,
        resourceId: 'attention_stability_v1@1.0.0',
        grantedBy: 'admin-1',
      },
    }))
    expect(result.resource?.name).toBe('注意与稳定性')
  })
})
