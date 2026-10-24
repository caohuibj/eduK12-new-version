import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MaterialResourceType, UserRole } from '@prisma/client'
import { listReportPackageDefinitions, reportPackageResourceId } from '../../modules/cognitive-analysis/report-package.registry'

const bundles = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('../../modules/bundle-product/service', () => ({ bundleDefinitionProvider: bundles }))

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
    $queryRaw: vi.fn(),
    scale: { findUnique: vi.fn(), findMany: vi.fn() },
    questionnaire: { findMany: vi.fn() },
    storedAsset: { findMany: vi.fn() },
    cognitiveTestConfig: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}))

vi.mock('../../modules/scale-library-governance/readers',()=>({libraryReadableScaleIds:vi.fn(async(userId:string)=>({systemAdmin:userId==='admin-1',ids:[]}))}))
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
  mockPrisma.scale.findMany.mockResolvedValue([{ id: 'scale-1', name: '焦虑', status: 'PUBLISHED' }])
  mockPrisma.questionnaire.findMany.mockResolvedValue([])
  mockPrisma.storedAsset.findMany.mockResolvedValue([])
  mockPrisma.cognitiveTestConfig.findMany.mockResolvedValue([])
  mockPrisma.$queryRaw.mockResolvedValue([])
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
        { creatorId: 'teacher-1', libraryEntryId: null },
        { id: { in: ['scale-other'] }, status: 'PUBLISHED', libraryEntryId: null },
        { id: { in: [] }, status: 'PUBLISHED' },
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
    mockPrisma.scale.findMany.mockResolvedValue([])
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

describe('request-local resource metadata batches', () => {
  const grant = (resourceType: MaterialResourceType, resourceId: string, id = resourceType + resourceId) => ({
    id, resourceType, resourceId, teacherId: 'teacher-1', grantedBy: 'admin-1', createdAt: new Date('2026-10-24'),
    teacher: { id: 'teacher-1', username: 't', nickname: null, role: TEACHER },
    granter: { id: 'admin-1', username: 'a', nickname: null },
  })
  it('deduplicates 100 grants of one resource into one metadata read and preserves every row', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => grant(MaterialResourceType.SCALE, 'scale-1', String(i)))
    mockPrisma.materialGrant.findMany.mockResolvedValue(rows)
    const result = await listGrants({ resourceType: MaterialResourceType.SCALE })
    expect(mockPrisma.materialGrant.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { resourceType: MaterialResourceType.SCALE }, orderBy: { createdAt: 'desc' },
      include: { teacher: { select: { id: true, username: true, nickname: true, role: true } }, granter: { select: { id: true, username: true, nickname: true } } },
    })
    expect(mockPrisma.scale.findMany).toHaveBeenCalledExactlyOnceWith({ where: { id: { in: ['scale-1'] } }, select: { id: true, name: true, status: true } })
    expect(mockPrisma.scale.findUnique).not.toHaveBeenCalled()
    expect(result).toEqual(rows.map(row => ({ ...row, resource: { id: 'scale-1', name: '焦虑', status: 'PUBLISHED' }, resourceMissing: false })))
  })
  it('keeps same IDs isolated by resource type, deleted media missing, and input order', async () => {
    const rows = [grant(MaterialResourceType.COGNITIVE_CONFIG, 'same'), grant(MaterialResourceType.SCALE, 'same'),
      grant(MaterialResourceType.FORM_TEMPLATE, 'same'), grant(MaterialResourceType.MEDIA_ASSET, 'same'),
      grant(MaterialResourceType.MEDIA_ASSET, 'deleted'), grant(MaterialResourceType.SCALE, 'missing')]
    mockPrisma.materialGrant.findMany.mockResolvedValue(rows)
    mockPrisma.scale.findMany.mockResolvedValue([{ id: 'same', name: 'Scale', status: 'DRAFT' }])
    mockPrisma.cognitiveTestConfig.findMany.mockResolvedValue([{ id: 'same', name: 'Task', status: 'PUBLISHED' }])
    mockPrisma.questionnaire.findMany.mockResolvedValue([{ id: 'same', name: 'Form', status: 'DRAFT' }])
    mockPrisma.storedAsset.findMany.mockResolvedValue([{ id: 'same', originalName: '', deletedAt: null }, { id: 'deleted', originalName: 'Deleted', deletedAt: new Date() }])
    const result = await listGrants({})
    expect(result.map(row => row.id)).toEqual(rows.map(row => row.id))
    expect(result.map(row => row.resource?.name ?? null)).toEqual(['Task', 'Scale', 'Form', '未命名媒体', null, null])
    expect(result.map(row => row.resourceMissing)).toEqual([false, false, false, false, true, true])
    for (const model of [mockPrisma.scale, mockPrisma.cognitiveTestConfig, mockPrisma.questionnaire, mockPrisma.storedAsset]) expect(model.findMany).toHaveBeenCalledTimes(1)
  })
  it('caps each metadata batch at 250 distinct IDs without truncating results', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => grant(MaterialResourceType.SCALE, String(i)))
    mockPrisma.materialGrant.findMany.mockResolvedValue([...rows, rows[0]])
    mockPrisma.scale.findMany.mockImplementation(async ({ where }) => [...where.id.in].reverse().map((id: string) => ({ id, name: id, status: 'PUBLISHED' })))
    const result = await listGrants({})
    expect(mockPrisma.scale.findMany.mock.calls.map(([args]) => args.where.id.in.length)).toEqual([250, 250, 1])
    expect(result.map(row => row.resource?.id)).toEqual([...rows, rows[0]].map(row => row.resourceId))
  })
  it('rereads metadata on the next request and propagates lookup errors rather than returning partial success', async () => {
    mockPrisma.materialGrant.findMany.mockResolvedValue([grant(MaterialResourceType.SCALE, 'scale-1')])
    expect((await listGrants({}))[0].resourceMissing).toBe(false)
    mockPrisma.scale.findMany.mockResolvedValueOnce([])
    expect((await listGrants({}))[0].resourceMissing).toBe(true)
    mockPrisma.scale.findMany.mockRejectedValueOnce(new Error('metadata unavailable'))
    await expect(listGrants({})).rejects.toThrow('metadata unavailable')
    expect(mockPrisma.scale.findMany).toHaveBeenCalledTimes(3)
  })
  it('maps bundle and report registries with missing flags and one bundle catalog read', async () => {
    const report = listReportPackageDefinitions()[0]
    expect(report).toBeDefined()
    const reportId = reportPackageResourceId(report.key, report.version)
    bundles.list.mockReturnValue([
      { definition: { bundleKey: 'bundle', bundleVersion: 'v1', name: 'First', status: 'PUBLISHED' } },
      { definition: { bundleKey: 'bundle', bundleVersion: 'v1', name: 'Duplicate', status: 'DRAFT' } },
    ])
    mockPrisma.materialGrant.findMany.mockResolvedValue([
      grant(MaterialResourceType.ASSESSMENT_BUNDLE, 'bundle@v1', 'a'),
      grant(MaterialResourceType.ASSESSMENT_BUNDLE, 'bundle@v1', 'b'),
      grant(MaterialResourceType.ASSESSMENT_BUNDLE, 'missing'),
      grant(MaterialResourceType.REPORT_PACKAGE, reportId),
      grant(MaterialResourceType.REPORT_PACKAGE, 'missing'),
    ])
    const result = await listGrants({})
    expect(bundles.list).toHaveBeenCalledTimes(1)
    expect(result.map(row => row.resource)).toEqual([
      { id: 'bundle@v1', name: 'First', status: 'PUBLISHED' },
      { id: 'bundle@v1', name: 'First', status: 'PUBLISHED' }, null,
      { id: reportId, name: report.name, status: report.status }, null,
    ])
    expect(result.map(row => row.resourceMissing)).toEqual([false, false, true, false, true])
    expect(mockPrisma.scale.findMany).not.toHaveBeenCalled()
  })
  it('does not fetch metadata for an empty grant list', async () => {
    await expect(listGrants({})).resolves.toEqual([])
    expect(mockPrisma.scale.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.cognitiveTestConfig.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.questionnaire.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.storedAsset.findMany).not.toHaveBeenCalled()
  })
})

describe('minimal current grant admission projections', () => {
  const select = { role: true, teacherApproved: true, isActive: true, isFrozen: true }
  const eligible = { role: TEACHER, teacherApproved: true, isActive: true, isFrozen: false }
  const input = { resourceType: MaterialResourceType.SCALE, resourceId: 'scale-1', grantedBy: 'admin-1' }
  const run = (mode: 'single' | 'batch' | 'set') => mode === 'single'
    ? createGrant({ ...input, teacherId: 'teacher-1' })
    : mode === 'batch' ? batchCreateGrants({ ...input, teacherIds: ['teacher-1', 'teacher-1'] })
      : setGrants({ ...input, teacherIds: ['teacher-1', 'teacher-1'] })
  beforeEach(() => {
    // Admission mocks return exactly the selected fields, without IDs or profile.
    mockPrisma.user.findUnique.mockResolvedValue(eligible)
    mockPrisma.user.findMany.mockResolvedValue([eligible])
    mockPrisma.scale.findUnique.mockResolvedValue({ status: 'PUBLISHED', instrumentClass: 'STANDARDIZED' })
    mockPrisma.materialGrant.upsert.mockResolvedValue({ id: 'g', teacherId: 'teacher-1', ...input, createdAt: new Date() })
    mockPrisma.materialGrant.deleteMany.mockResolvedValue({ count: 1 })
  })
  it.each(['single', 'batch', 'set'] as const)('%s validates successfully using only the four eligibility fields', async mode => {
    await run(mode)
    const args = mode === 'single' ? mockPrisma.user.findUnique.mock.calls[0][0] : mockPrisma.user.findMany.mock.calls[0][0]
    expect(args).toEqual({ where: { id: mode === 'single' ? 'teacher-1' : { in: ['teacher-1'] } }, select })
    expect(mockPrisma.scale.findUnique.mock.calls[0][0]).toEqual({ where: { id: 'scale-1' }, select: { status: true, instrumentClass: true } })
  })
  it.each([
    { role: UserRole.STUDENT }, { teacherApproved: false }, { isActive: false }, { isFrozen: true },
  ])('retains rejection of ineligible minimal rows: %j', async patch => {
    mockPrisma.user.findMany.mockResolvedValue([{ ...eligible, ...patch }])
    await expect(run('set')).rejects.toMatchObject({ statusCode: 400 })
    expect(mockPrisma.materialGrant.createMany).not.toHaveBeenCalled()
    expect(mockPrisma.materialGrant.deleteMany).not.toHaveBeenCalled()
  })
  it('keeps exact missing-teacher and custom-scale rejections before writes', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([])
    await expect(run('batch')).rejects.toMatchObject({ statusCode: 404, message: '教师不存在' })
    mockPrisma.scale.findUnique.mockResolvedValueOnce({ status: 'PUBLISHED', instrumentClass: 'CUSTOM_DESCRIPTIVE' })
    await expect(run('set')).rejects.toMatchObject({ statusCode: 400, message: '自编量表新授权必须通过精确版本共用库审批与分配，旧授权不得扩大' })
    expect(mockPrisma.materialGrant.createMany).not.toHaveBeenCalled()
    expect(mockPrisma.materialGrant.deleteMany).not.toHaveBeenCalled()
  })
  it('checks cognitive publication with status only and deletion existence with id only', async () => {
    mockPrisma.cognitiveTestConfig.findUnique.mockResolvedValue({ status: 'PUBLISHED' })
    await batchCreateGrants({ ...input, resourceType: MaterialResourceType.COGNITIVE_CONFIG, teacherIds: ['teacher-1'] })
    expect(mockPrisma.cognitiveTestConfig.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: 'scale-1' }, select: { status: true } })
    mockPrisma.materialGrant.findUnique.mockResolvedValueOnce({ id: 'g' })
    expect(await deleteGrant('g')).toEqual({ id: 'g' })
    expect(mockPrisma.materialGrant.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: 'g' }, select: { id: true } })
    mockPrisma.materialGrant.findUnique.mockResolvedValueOnce(null)
    await expect(deleteGrant('gone')).rejects.toMatchObject({ statusCode: 404 })
    expect(mockPrisma.materialGrant.delete).toHaveBeenCalledTimes(1)
  })
  it('preserves the full desired set, first occurrence order and existing-only removals at scale', async () => {
    const existing = Array.from({ length: 1000 }, (_, i) => ({ id: `g-${i}`, teacherId: `t-${i}` }))
    const desired = existing.slice(500).map(row => row.teacherId)
    desired.push('new-second', 'new-first', 'new-second', ...desired.slice(0, 50))
    mockPrisma.materialGrant.findMany.mockResolvedValueOnce(existing).mockResolvedValueOnce([])
    mockPrisma.user.findMany.mockResolvedValue([eligible, eligible])
    await setGrants({ ...input, teacherIds: desired })
    expect(mockPrisma.user.findMany).toHaveBeenCalledExactlyOnceWith({ where: { id: { in: ['new-second', 'new-first'] } }, select })
    expect(mockPrisma.materialGrant.createMany).toHaveBeenCalledExactlyOnceWith({ data: ['new-second', 'new-first'].map(teacherId => ({ teacherId, ...input })), skipDuplicates: true })
    expect(mockPrisma.materialGrant.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: { in: existing.slice(0, 500).map(row => row.id) } } })
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })
})
