import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MaterialResourceType, UserRole } from '@prisma/client'

const flags = vi.hoisted(() => ({ materialGrantsEnabled: true }))
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    materialGrant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
    scale: { findUnique: vi.fn() },
    cognitiveTestConfig: { findUnique: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../config', () => ({
  config: {
    get materialGrantsEnabled() {
      return flags.materialGrantsEnabled
    },
  },
}))

import {
  batchCreateGrants,
  canInstantiateConfig,
  canUseScale,
  createGrant,
  deleteGrant,
  listGrants,
  scaleSource,
  scaleWhereForViewer,
  setGrants,
} from '../../services/materialGrant'

const TEACHER = UserRole.TEACHER
const ADMIN = UserRole.ADMIN
const ownScale = { id: 'scale-own', creatorId: 'teacher-1', status: 'DRAFT' }
const otherPublished = { id: 'scale-other', creatorId: 'admin-1', status: 'PUBLISHED' }
const otherDraft = { id: 'scale-draft', creatorId: 'admin-1', status: 'DRAFT' }

beforeEach(() => {
  vi.clearAllMocks()
  flags.materialGrantsEnabled = true
  mockPrisma.materialGrant.findUnique.mockResolvedValue(null)
  mockPrisma.materialGrant.findMany.mockResolvedValue([])
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
})

describe('canUseScale', () => {
  it('allows ADMIN for any scale', async () => {
    expect(await canUseScale('admin-1', ADMIN, otherPublished)).toBe(true)
  })

  it('allows the creator for any status including DRAFT', async () => {
    expect(await canUseScale('teacher-1', TEACHER, ownScale)).toBe(true)
  })

  it('denies another teacher without a grant', async () => {
    expect(await canUseScale('teacher-1', TEACHER, otherPublished)).toBe(false)
  })

  it('allows a published scale with a grant', async () => {
    mockPrisma.materialGrant.findUnique.mockResolvedValue({ id: 'g1' })
    expect(await canUseScale('teacher-1', TEACHER, otherPublished)).toBe(true)
  })

  it('denies a granted DRAFT', async () => {
    mockPrisma.materialGrant.findUnique.mockResolvedValue({ id: 'g1' })
    expect(await canUseScale('teacher-1', TEACHER, otherDraft)).toBe(false)
  })

  it('ignores grants when MATERIAL_GRANTS_ENABLED is false', async () => {
    flags.materialGrantsEnabled = false
    mockPrisma.materialGrant.findUnique.mockResolvedValue({ id: 'g1' })
    expect(await canUseScale('teacher-1', TEACHER, otherPublished)).toBe(false)
  })
})

describe('canInstantiateConfig', () => {
  const open = { id: 'cfg-open', status: 'PUBLISHED', accessPolicy: 'OPEN' as const }
  const grant = { id: 'cfg-grant', status: 'PUBLISHED', accessPolicy: 'GRANT' as const }

  it('allows ADMIN', async () => {
    expect(await canInstantiateConfig('admin-1', ADMIN, grant)).toBe(true)
  })

  it('rejects unpublished configs', async () => {
    expect(await canInstantiateConfig('teacher-1', TEACHER, { ...open, status: 'DRAFT' })).toBe(false)
  })

  it('allows OPEN configs', async () => {
    expect(await canInstantiateConfig('teacher-1', TEACHER, open)).toBe(true)
  })

  it('denies GRANT configs without a grant', async () => {
    expect(await canInstantiateConfig('teacher-1', TEACHER, grant)).toBe(false)
  })

  it('allows GRANT configs with a grant', async () => {
    mockPrisma.materialGrant.findUnique.mockResolvedValue({ id: 'g1' })
    expect(await canInstantiateConfig('teacher-1', TEACHER, grant)).toBe(true)
  })

  it('treats GRANT as open when MATERIAL_GRANTS_ENABLED is false', async () => {
    flags.materialGrantsEnabled = false
    expect(await canInstantiateConfig('teacher-1', TEACHER, grant)).toBe(true)
  })
})

describe('scaleSource / scaleWhereForViewer', () => {
  it('labels teacher rows owned or granted, never other', () => {
    expect(scaleSource('teacher-1', TEACHER, { creatorId: 'teacher-1' })).toBe('owned')
    expect(scaleSource('teacher-1', TEACHER, { creatorId: 'admin-1' })).toBe('granted')
  })

  it('labels admin rows owned or other', () => {
    expect(scaleSource('admin-1', ADMIN, { creatorId: 'admin-1' })).toBe('owned')
    expect(scaleSource('admin-1', ADMIN, { creatorId: 'teacher-1' })).toBe('other')
  })

  it('unions owned and granted published ids for teachers', async () => {
    mockPrisma.materialGrant.findMany.mockResolvedValue([{ resourceId: 'scale-other' }])
    await expect(scaleWhereForViewer('teacher-1', TEACHER, { status: 'PUBLISHED' })).resolves.toEqual({
      status: 'PUBLISHED',
      OR: [
        { creatorId: 'teacher-1' },
        { id: { in: ['scale-other'] }, status: 'PUBLISHED' },
      ],
    })
  })

  it('does not filter ADMIN by creatorId', async () => {
    await expect(scaleWhereForViewer('admin-1', ADMIN, { status: 'PUBLISHED' })).resolves.toEqual({
      status: 'PUBLISHED',
    })
  })

  it('does not isolate students by creatorId so /scales/tags stays global', async () => {
    await expect(scaleWhereForViewer('student-1', UserRole.STUDENT)).resolves.toEqual({})
  })
})

describe('createGrant / listGrants / deleteGrant', () => {
  const eligibleTeacher = {
    id: 'teacher-1',
    role: TEACHER,
    teacherApproved: true,
    isActive: true,
    isFrozen: false,
  }

  it('rejects a frozen teacher', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...eligibleTeacher, isFrozen: true })
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-1', status: 'PUBLISHED' })
    await expect(createGrant({
      teacherId: 'teacher-1',
      resourceType: MaterialResourceType.SCALE,
      resourceId: 'scale-1',
      grantedBy: 'admin-1',
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects an unpublished scale', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(eligibleTeacher)
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-1', status: 'DRAFT' })
    await expect(createGrant({
      teacherId: 'teacher-1',
      resourceType: MaterialResourceType.SCALE,
      resourceId: 'scale-1',
      grantedBy: 'admin-1',
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('upserts so a concurrent duplicate grant does not throw', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(eligibleTeacher)
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-1', status: 'PUBLISHED', name: '焦虑' })
    const existing = {
      id: 'g1',
      teacherId: 'teacher-1',
      resourceType: MaterialResourceType.SCALE,
      resourceId: 'scale-1',
      grantedBy: 'admin-1',
      createdAt: new Date(),
      teacher: { id: 'teacher-1', username: 't', nickname: 'T', role: TEACHER },
      granter: { id: 'admin-1', username: 'a', nickname: 'A' },
    }
    mockPrisma.materialGrant.upsert.mockResolvedValue(existing)
    const result = await createGrant({
      teacherId: 'teacher-1',
      resourceType: MaterialResourceType.SCALE,
      resourceId: 'scale-1',
      grantedBy: 'admin-1',
    })
    expect(result.id).toBe('g1')
    expect(mockPrisma.materialGrant.upsert).toHaveBeenCalled()
    expect(mockPrisma.materialGrant.create).not.toHaveBeenCalled()
  })

  it('marks missing resources instead of throwing', async () => {
    mockPrisma.materialGrant.findMany.mockResolvedValue([{
      id: 'orphan',
      teacherId: 'teacher-1',
      resourceType: MaterialResourceType.SCALE,
      resourceId: 'missing',
      grantedBy: 'admin-1',
      createdAt: new Date(),
      teacher: { id: 'teacher-1', username: 't', nickname: null, role: TEACHER },
      granter: { id: 'admin-1', username: 'a', nickname: null },
    }])
    mockPrisma.scale.findUnique.mockResolvedValue(null)
    const list = await listGrants({})
    expect(list[0].resourceMissing).toBe(true)
  })

  it('deletes orphan grants by id', async () => {
    mockPrisma.materialGrant.findUnique.mockResolvedValue({ id: 'orphan' })
    mockPrisma.materialGrant.delete.mockResolvedValue({ id: 'orphan' })
    await expect(deleteGrant('orphan')).resolves.toEqual({ id: 'orphan' })
  })
})

describe('batchCreateGrants', () => {
  const eligibleTeacher = {
    id: 'teacher-1',
    role: TEACHER,
    teacherApproved: true,
    isActive: true,
    isFrozen: false,
    username: 't1',
    nickname: 'T1',
  }

  it('pre-validates teachers and writes nothing when one is ineligible', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-1', status: 'PUBLISHED', name: '焦虑' })
    mockPrisma.user.findMany.mockResolvedValue([
      eligibleTeacher,
      { ...eligibleTeacher, id: 'teacher-2', isFrozen: true },
    ])
    await expect(batchCreateGrants({
      resourceType: MaterialResourceType.SCALE,
      resourceId: 'scale-1',
      teacherIds: ['teacher-1', 'teacher-2'],
      grantedBy: 'admin-1',
    })).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.materialGrant.createMany).not.toHaveBeenCalled()
  })

  it('creates all grants in one transaction when every teacher is eligible', async () => {
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-1', status: 'PUBLISHED', name: '焦虑' })
    mockPrisma.user.findMany.mockResolvedValue([
      eligibleTeacher,
      { ...eligibleTeacher, id: 'teacher-2', username: 't2' },
    ])
    mockPrisma.materialGrant.createMany.mockResolvedValue({ count: 2 })
    mockPrisma.materialGrant.findMany.mockResolvedValue([
      {
        id: 'g1',
        teacherId: 'teacher-1',
        resourceType: MaterialResourceType.SCALE,
        resourceId: 'scale-1',
        grantedBy: 'admin-1',
        createdAt: new Date(),
        teacher: { id: 'teacher-1', username: 't1', nickname: 'T1', role: TEACHER },
        granter: { id: 'admin-1', username: 'a', nickname: 'A' },
      },
      {
        id: 'g2',
        teacherId: 'teacher-2',
        resourceType: MaterialResourceType.SCALE,
        resourceId: 'scale-1',
        grantedBy: 'admin-1',
        createdAt: new Date(),
        teacher: { id: 'teacher-2', username: 't2', nickname: 'T1', role: TEACHER },
        granter: { id: 'admin-1', username: 'a', nickname: 'A' },
      },
    ])
    const list = await batchCreateGrants({
      resourceType: MaterialResourceType.SCALE,
      resourceId: 'scale-1',
      teacherIds: ['teacher-1', 'teacher-2'],
      grantedBy: 'admin-1',
    })
    expect(mockPrisma.materialGrant.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: [
        { teacherId: 'teacher-1', resourceType: MaterialResourceType.SCALE, resourceId: 'scale-1', grantedBy: 'admin-1' },
        { teacherId: 'teacher-2', resourceType: MaterialResourceType.SCALE, resourceId: 'scale-1', grantedBy: 'admin-1' },
      ],
    }))
    expect(list).toHaveLength(2)
  })
})

describe('setGrants', () => {
  const eligibleTeacher = {
    id: 'teacher-1',
    role: TEACHER,
    teacherApproved: true,
    isActive: true,
    isFrozen: false,
    username: 't1',
    nickname: 'T1',
  }
  const grantRow = (teacherId: string, id = `g-${teacherId}`) => ({
    id,
    teacherId,
    resourceType: MaterialResourceType.SCALE,
    resourceId: 'scale-1',
    grantedBy: 'admin-1',
    createdAt: new Date(),
    teacher: { id: teacherId, username: teacherId, nickname: teacherId, role: TEACHER },
    granter: { id: 'admin-1', username: 'a', nickname: 'A' },
  })

  beforeEach(() => {
    mockPrisma.scale.findUnique.mockResolvedValue({ id: 'scale-1', status: 'PUBLISHED', name: '焦虑' })
  })

  it('adds and removes in one transaction', async () => {
    mockPrisma.materialGrant.findMany
      .mockResolvedValueOnce([{ id: 'g-old', teacherId: 'teacher-1' }])
      .mockResolvedValueOnce([grantRow('teacher-2')])
    mockPrisma.user.findMany.mockResolvedValue([{ ...eligibleTeacher, id: 'teacher-2' }])
    mockPrisma.materialGrant.createMany.mockResolvedValue({ count: 1 })
    mockPrisma.materialGrant.deleteMany.mockResolvedValue({ count: 1 })

    const list = await setGrants({
      resourceType: MaterialResourceType.SCALE,
      resourceId: 'scale-1',
      teacherIds: ['teacher-2'],
      grantedBy: 'admin-1',
    })

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.materialGrant.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: [{
        teacherId: 'teacher-2',
        resourceType: MaterialResourceType.SCALE,
        resourceId: 'scale-1',
        grantedBy: 'admin-1',
      }],
    }))
    expect(mockPrisma.materialGrant.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['g-old'] } },
    })
    expect(list).toHaveLength(1)
    expect(list[0].teacherId).toBe('teacher-2')
  })

  it('writes nothing when a newly added teacher is ineligible', async () => {
    mockPrisma.materialGrant.findMany.mockResolvedValueOnce([{ id: 'g-old', teacherId: 'teacher-1' }])
    mockPrisma.user.findMany.mockResolvedValue([{ ...eligibleTeacher, id: 'teacher-2', isFrozen: true }])

    await expect(setGrants({
      resourceType: MaterialResourceType.SCALE,
      resourceId: 'scale-1',
      teacherIds: ['teacher-1', 'teacher-2'],
      grantedBy: 'admin-1',
    })).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.materialGrant.createMany).not.toHaveBeenCalled()
    expect(mockPrisma.materialGrant.deleteMany).not.toHaveBeenCalled()
  })

  it('keeps an existing grant to a now-ineligible teacher without re-validating them', async () => {
    mockPrisma.materialGrant.findMany
      .mockResolvedValueOnce([{ id: 'g-frozen', teacherId: 'teacher-frozen' }])
      .mockResolvedValueOnce([grantRow('teacher-frozen', 'g-frozen')])

    const list = await setGrants({
      resourceType: MaterialResourceType.SCALE,
      resourceId: 'scale-1',
      teacherIds: ['teacher-frozen'],
      grantedBy: 'admin-1',
    })

    expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.materialGrant.createMany).not.toHaveBeenCalled()
    expect(mockPrisma.materialGrant.deleteMany).not.toHaveBeenCalled()
    expect(list[0].teacherId).toBe('teacher-frozen')
  })

  it('revokes every grant when teacherIds is empty', async () => {
    mockPrisma.materialGrant.findMany
      .mockResolvedValueOnce([{ id: 'g1', teacherId: 'teacher-1' }, { id: 'g2', teacherId: 'teacher-2' }])
      .mockResolvedValueOnce([])
    mockPrisma.materialGrant.deleteMany.mockResolvedValue({ count: 2 })

    const list = await setGrants({
      resourceType: MaterialResourceType.SCALE,
      resourceId: 'scale-1',
      teacherIds: [],
      grantedBy: 'admin-1',
    })

    expect(mockPrisma.materialGrant.createMany).not.toHaveBeenCalled()
    expect(mockPrisma.materialGrant.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['g1', 'g2'] } },
    })
    expect(list).toEqual([])
  })

  it('rolls back both writes when deleteMany fails inside the transaction', async () => {
    mockPrisma.materialGrant.findMany.mockResolvedValueOnce([{ id: 'g-old', teacherId: 'teacher-1' }])
    mockPrisma.user.findMany.mockResolvedValue([{ ...eligibleTeacher, id: 'teacher-2' }])
    mockPrisma.materialGrant.createMany.mockResolvedValue({ count: 1 })
    mockPrisma.materialGrant.deleteMany.mockRejectedValue(new Error('db down'))

    await expect(setGrants({
      resourceType: MaterialResourceType.SCALE,
      resourceId: 'scale-1',
      teacherIds: ['teacher-2'],
      grantedBy: 'admin-1',
    })).rejects.toThrow('db down')
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.materialGrant.createMany).toHaveBeenCalled()
  })
})
