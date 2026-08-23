import { MaterialResourceType, UserRole } from '@prisma/client'
import { prisma } from '../config/database'
import { config } from '../config'

export class MaterialGrantError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'MaterialGrantError'
    this.statusCode = statusCode
  }
}

export type ScaleSource = 'owned' | 'granted' | 'other'

const grantNotFound = (message = '授权记录不存在') => new MaterialGrantError(message, 404)
const grantBadRequest = (message: string) => new MaterialGrantError(message, 400)

const isEligibleTeacher = (user: {
  role: UserRole | string
  teacherApproved?: boolean | null
  isActive?: boolean | null
  isFrozen?: boolean | null
}) =>
  user.role === UserRole.TEACHER
  && user.teacherApproved === true
  && user.isActive === true
  && user.isFrozen === false

export const scaleSource = (
  userId: string,
  role: UserRole | string,
  scale: { creatorId: string },
): ScaleSource => {
  if (scale.creatorId === userId) return 'owned'
  if (role === UserRole.ADMIN) return 'other'
  return 'granted'
}

export const grantedResourceIds = async (userId: string, resourceType: MaterialResourceType): Promise<string[]> => {
  if (!config.materialGrantsEnabled) return []
  const rows = await prisma.materialGrant.findMany({
    where: { teacherId: userId, resourceType },
    select: { resourceId: true },
  })
  return rows.map((row) => row.resourceId)
}

export const scaleWhereForViewer = async (
  userId: string,
  role: UserRole | string,
  extra: Record<string, unknown> = {},
) => {
  if (role === UserRole.ADMIN) return extra
  // 学生等非教师角色：GET /scales/tags 只要求登录，保持全量标签，不要按 creatorId 滤成空。
  if (role !== UserRole.TEACHER) return extra
  if (!config.materialGrantsEnabled) return { ...extra, creatorId: userId }
  const grantedIds = await grantedResourceIds(userId, MaterialResourceType.SCALE)
  return {
    ...extra,
    OR: [
      { creatorId: userId },
      { id: { in: grantedIds }, status: 'PUBLISHED' },
    ],
  }
}

// 撤销 grant 只拦新的 addItem / addScale / 空白 createAssignment。
// 已挂在 DRAFT 综合测评或问卷里的 scaleId 仍可发布；不扫描草稿、不拆已发布容器。
export const canUseScale = async (
  userId: string,
  role: UserRole | string,
  scale: { id: string; creatorId: string; status: string },
): Promise<boolean> => {
  if (role === UserRole.ADMIN) return true
  if (scale.creatorId === userId) return true
  if (!config.materialGrantsEnabled) return false
  if (scale.status !== 'PUBLISHED') return false
  const grant = await prisma.materialGrant.findUnique({
    where: {
      teacherId_resourceType_resourceId: {
        teacherId: userId,
        resourceType: MaterialResourceType.SCALE,
        resourceId: scale.id,
      },
    },
  })
  return Boolean(grant)
}

export const canInstantiateConfig = async (
  userId: string,
  role: UserRole | string,
  testConfig: { id: string; status: string; accessPolicy?: 'OPEN' | 'GRANT' | string | null },
): Promise<boolean> => {
  if (role === UserRole.ADMIN) return true
  if (testConfig.status !== 'PUBLISHED') return false
  if (!config.materialGrantsEnabled) return true
  if (testConfig.accessPolicy !== 'GRANT') return true
  const grant = await prisma.materialGrant.findUnique({
    where: {
      teacherId_resourceType_resourceId: {
        teacherId: userId,
        resourceType: MaterialResourceType.COGNITIVE_CONFIG,
        resourceId: testConfig.id,
      },
    },
  })
  return Boolean(grant)
}

const assertEligibleTeacher = async (teacherId: string) => {
  const teacher = await prisma.user.findUnique({ where: { id: teacherId } })
  if (!teacher) throw grantNotFound('教师不存在')
  if (!isEligibleTeacher(teacher)) throw grantBadRequest('只能授权给已审核且未冻结的在职教师')
  return teacher
}

const assertGrantableResource = async (resourceType: MaterialResourceType, resourceId: string) => {
  if (resourceType === MaterialResourceType.SCALE) {
    const scale = await prisma.scale.findUnique({ where: { id: resourceId } })
    if (!scale) throw grantNotFound('量表不存在')
    if (scale.status !== 'PUBLISHED') throw grantBadRequest('只能授权已发布量表')
    return
  }
  if (resourceType === MaterialResourceType.COGNITIVE_CONFIG) {
    const testConfig = await prisma.cognitiveTestConfig.findUnique({ where: { id: resourceId } })
    if (!testConfig) throw grantNotFound('认知任务类型不存在')
    if (testConfig.status !== 'PUBLISHED') throw grantBadRequest('只能授权已发布的认知任务类型')
    return
  }
  throw grantBadRequest('不支持的材料类型')
}

const attachResource = async (grant: {
  id: string
  teacherId: string
  resourceType: MaterialResourceType
  resourceId: string
  grantedBy: string
  createdAt: Date
  teacher?: { id: string; username: string; nickname: string | null; role: UserRole }
  granter?: { id: string; username: string; nickname: string | null }
}) => {
  let resourceMissing = false
  let resource: { id: string; name: string; status?: string } | null = null
  if (grant.resourceType === MaterialResourceType.SCALE) {
    const scale = await prisma.scale.findUnique({ where: { id: grant.resourceId }, select: { id: true, name: true, status: true } })
    resource = scale
    resourceMissing = !scale
  } else {
    const testConfig = await prisma.cognitiveTestConfig.findUnique({
      where: { id: grant.resourceId },
      select: { id: true, name: true, status: true },
    })
    resource = testConfig
    resourceMissing = !testConfig
  }
  return {
    id: grant.id,
    teacherId: grant.teacherId,
    resourceType: grant.resourceType,
    resourceId: grant.resourceId,
    grantedBy: grant.grantedBy,
    createdAt: grant.createdAt,
    teacher: grant.teacher || null,
    granter: grant.granter || null,
    resource,
    resourceMissing,
  }
}

export const listGrants = async (query: {
  resourceType?: MaterialResourceType
  resourceId?: string
  teacherId?: string
}) => {
  const where: Record<string, unknown> = {}
  if (query.resourceType) where.resourceType = query.resourceType
  if (query.resourceId) where.resourceId = query.resourceId
  if (query.teacherId) where.teacherId = query.teacherId
  const rows = await prisma.materialGrant.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      teacher: { select: { id: true, username: true, nickname: true, role: true } },
      granter: { select: { id: true, username: true, nickname: true } },
    },
  })
  return Promise.all(rows.map((row) => attachResource(row)))
}

export const createGrant = async (input: {
  teacherId: string
  resourceType: MaterialResourceType
  resourceId: string
  grantedBy: string
}) => {
  await assertEligibleTeacher(input.teacherId)
  await assertGrantableResource(input.resourceType, input.resourceId)
  const grantInclude = {
    teacher: { select: { id: true, username: true, nickname: true, role: true } },
    granter: { select: { id: true, username: true, nickname: true } },
  } as const
  const upserted = await prisma.materialGrant.upsert({
    where: {
      teacherId_resourceType_resourceId: {
        teacherId: input.teacherId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      },
    },
    create: {
      teacherId: input.teacherId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      grantedBy: input.grantedBy,
    },
    update: {},
    include: grantInclude,
  })
  return attachResource(upserted)
}

export const deleteGrant = async (id: string) => {
  const existing = await prisma.materialGrant.findUnique({ where: { id } })
  if (!existing) throw grantNotFound()
  await prisma.materialGrant.delete({ where: { id } })
  return { id }
}

export const batchCreateGrants = async (input: {
  resourceType: MaterialResourceType
  resourceId: string
  teacherIds: string[]
  grantedBy: string
}) => {
  if (!Array.isArray(input.teacherIds) || input.teacherIds.length === 0) {
    throw grantBadRequest('teacherIds 不能为空')
  }
  await assertGrantableResource(input.resourceType, input.resourceId)
  const uniqueIds = [...new Set(input.teacherIds)]
  const teachers = await prisma.user.findMany({ where: { id: { in: uniqueIds } } })
  if (teachers.length !== uniqueIds.length) throw grantNotFound('教师不存在')
  if (teachers.some((teacher) => !isEligibleTeacher(teacher))) {
    throw grantBadRequest('只能授权给已审核且未冻结的在职教师')
  }

  await prisma.$transaction(async (tx) => {
    await tx.materialGrant.createMany({
      data: uniqueIds.map((teacherId) => ({
        teacherId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        grantedBy: input.grantedBy,
      })),
      skipDuplicates: true,
    })
  })

  const rows = await prisma.materialGrant.findMany({
    where: {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      teacherId: { in: uniqueIds },
    },
    include: {
      teacher: { select: { id: true, username: true, nickname: true, role: true } },
      granter: { select: { id: true, username: true, nickname: true } },
    },
  })
  return Promise.all(rows.map((row) => attachResource(row)))
}
