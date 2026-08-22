import { randomBytes } from 'crypto'
import { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { config } from '../../config'
import { encryptField, safeDecrypt } from '../../utils/encryption'
import { calculateScores, generateFeedbackWithLevels } from '../../services/scoringService'
import { createAccessToken, createRecoveryCredential, hashRecoveryToken } from '../../services/anonymousAccess'
import { encryptCognitivePayload, decryptCognitivePayload, getParticipantKey } from '../cognitive/cognitive.security'
import { requireCognitiveRegistryEntry } from '../cognitive/cognitive.registry'
import { resolveCognitiveReference } from '../cognitive/reference'
import { logger } from '../../utils/logger'
import {
  CompositeServiceError,
  compositeBadRequest,
  compositeConflict,
  compositeForbidden,
  compositeNotFound,
} from './composite.errors'
import type {
  AddCompositeItemInput,
  CreateCompositeInput,
  UpdateCompositeInput,
} from './composite.schema'

type Db = any

const isTeacherOrAdmin = (role: UserRole) => role === UserRole.TEACHER || role === UserRole.ADMIN

const assertTeacher = (role: UserRole) => {
  if (!isTeacherOrAdmin(role)) throw compositeForbidden('需要教师权限')
}

const assertOwner = (resource: { createdBy: string | null }, userId: string, role: UserRole) => {
  if (role === UserRole.ADMIN) return
  if (role !== UserRole.TEACHER || resource.createdBy !== userId) {
    throw compositeForbidden()
  }
}

const parseDate = (value: string | null | undefined) => (value ? new Date(value) : null)

const loadComposite = async (id: string, includeItems = false) => {
  const composite = await prisma.compositeAssessment.findUnique({
    where: { id },
    include: includeItems
      ? {
          items: {
            orderBy: { position: 'asc' },
            include: {
              scale: {
                include: {
                  items: { orderBy: { sortOrder: 'asc' }, include: { itemDimensions: true } },
                  dimensions: true,
                },
              },
              cognitiveAssignment: { include: { config: true } },
            },
          },
        }
      : undefined,
  })
  if (!composite) throw compositeNotFound()
  return composite as any
}

const validateCourse = async (courseId: string | null | undefined, userId: string, role: UserRole) => {
  if (!courseId) return null
  const course = await prisma.course.findUnique({ where: { id: courseId } })
  if (!course) throw compositeNotFound('课程不存在')
  if (role === UserRole.TEACHER && course.creatorId !== userId) {
    throw compositeForbidden('只能在自己创建的课程中发布综合测评')
  }
  return course
}

const assertDraft = (composite: { status: string }) => {
  if (composite.status !== 'DRAFT') throw compositeConflict('只有草稿状态的综合测评可以修改')
}

const assertCognitiveModuleEnabled = () => {
  if (!config.cognitiveModuleEnabled) throw compositeBadRequest('认知模块未启用')
}

const assertSupportedComposite = (composite: { items?: Array<{ type: string }> }) => {
  if (!config.cognitiveModuleEnabled && composite.items?.some((item) => item.type === 'COGNITIVE')) {
    throw compositeBadRequest('认知模块未启用')
  }
}

const validateCognitiveConfig = (config: any) => {
  try {
    const entry = requireCognitiveRegistryEntry(config.testType, config.engineVersion, config.scoringVersion)
    const parsed = entry.configSchema.safeParse(config.config)
    if (!parsed.success) throw compositeBadRequest('认知任务配置不符合当前版本规范')
    return parsed.data
  } catch (err) {
    if (err instanceof CompositeServiceError) throw err
    throw compositeBadRequest('认知任务配置版本不可用')
  }
}

const assertValidItem = async (input: AddCompositeItemInput, userId: string, role: UserRole) => {
  const supplied = [input.scaleId, input.cognitiveAssignmentId, input.formLabel].filter(Boolean).length
  if (input.type === 'SCALE') {
    if (!input.scaleId || supplied !== 1) throw compositeBadRequest('量表模块必须提供 scaleId')
    const scale = await prisma.scale.findUnique({ where: { id: input.scaleId } })
    if (!scale) throw compositeNotFound('量表不存在')
    if (scale.status !== 'PUBLISHED') throw compositeBadRequest('只能添加已发布量表')
    if (role !== UserRole.ADMIN && scale.creatorId !== userId) {
      throw compositeForbidden('无权限使用此量表')
    }
    return
  }

  if (input.type === 'COGNITIVE') {
    assertCognitiveModuleEnabled()
    if (!input.cognitiveAssignmentId || supplied !== 1) throw compositeBadRequest('认知模块必须提供 cognitiveAssignmentId')
    const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id: input.cognitiveAssignmentId }, include: { config: true } })
    if (!assignment) throw compositeNotFound('认知任务不存在')
    if (assignment.status !== 'PUBLISHED' || assignment.config.status !== 'PUBLISHED') {
      throw compositeBadRequest('只能添加已发布认知任务')
    }
    validateCognitiveConfig(assignment.config)
    if (role !== UserRole.ADMIN && assignment.createdBy !== userId) {
      throw compositeForbidden('无权限使用此认知任务')
    }
    return
  }

  if (input.type === 'FORM') {
    if (!input.formType || !input.formLabel || supplied !== 1) {
      throw compositeBadRequest('表单模块必须提供 formType 和 formLabel')
    }
    if (input.formType === 'single_choice' || input.formType === 'multiple_choice') {
      const options = input.formOptions ?? []
      const values = options.map((option) => option.value)
      if (values.length === 0) throw compositeBadRequest('选择题必须提供至少一个选项')
      if (new Set(values).size !== values.length) throw compositeBadRequest('表单选项不能重复')
    }
    return
  }

  throw compositeBadRequest('不支持的综合测评模块类型')
}

const mapItemForTeacher = (item: any) => ({
  id: item.id,
  type: item.type,
  position: item.position,
  required: item.required,
  scale: item.scale ? { id: item.scale.id, code: item.scale.code, name: item.scale.name } : null,
  cognitiveAssignment: item.cognitiveAssignment
    ? {
        id: item.cognitiveAssignment.id,
        title: item.cognitiveAssignment.title,
        status: item.cognitiveAssignment.status,
        config: {
          id: item.cognitiveAssignment.config.id,
          testType: item.cognitiveAssignment.config.testType,
          name: item.cognitiveAssignment.config.name,
          engineVersion: item.cognitiveAssignment.config.engineVersion,
          scoringVersion: item.cognitiveAssignment.config.scoringVersion,
        },
      }
    : null,
  form: item.type === 'FORM'
    ? {
        type: item.formType,
        label: item.formLabel,
        placeholder: item.formPlaceholder,
        options: item.formOptions,
      }
    : null,
})

type AttemptCounts = {
  started: number
  inProgress: number
  completed: number
  abandoned: number
}

const emptyAttemptCounts = (): AttemptCounts => ({
  started: 0,
  inProgress: 0,
  completed: 0,
  abandoned: 0,
})

const loadAttemptCountsByCompositeIds = async (ids: string[]): Promise<Map<string, AttemptCounts>> => {
  const byId = new Map<string, AttemptCounts>()
  if (ids.length === 0) return byId
  const grouped = await prisma.compositeAssessmentAttempt.groupBy({
    by: ['compositeAssessmentId', 'status'],
    where: { compositeAssessmentId: { in: ids } },
    _count: { _all: true },
  })
  for (const row of grouped) {
    const current = byId.get(row.compositeAssessmentId) ?? emptyAttemptCounts()
    const n = row._count._all
    if (row.status === 'IN_PROGRESS') current.inProgress += n
    else if (row.status === 'COMPLETED') current.completed += n
    else if (row.status === 'ABANDONED') current.abandoned += n
    current.started = current.inProgress + current.completed + current.abandoned
    byId.set(row.compositeAssessmentId, current)
  }
  return byId
}

const mapAttemptRowForTeacher = (attempt: {
  id: string
  status: string
  progress: number
  completedItems: number
  startedAt: Date
  lastSavedAt: Date
  completedAt: Date | null
  totalTime: number | null
  anonymousCode: string | null
  userId: string | null
  user: { id: string; nickname: string | null; username: string } | null
}) => {
  const base = {
    id: attempt.id,
    status: attempt.status,
    progress: attempt.progress,
    completedItems: attempt.completedItems,
    startedAt: attempt.startedAt,
    lastSavedAt: attempt.lastSavedAt,
    completedAt: attempt.completedAt,
    totalTime: attempt.totalTime,
    userId: attempt.userId,
  }
  if (attempt.anonymousCode) {
    return {
      ...base,
      isAnonymous: true,
      anonymousCode: attempt.anonymousCode,
      nickname: null,
      username: null,
      displayName: attempt.anonymousCode,
    }
  }
  if (!attempt.user) {
    return {
      ...base,
      isAnonymous: false,
      anonymousCode: null,
      nickname: null,
      username: null,
      displayName: '已删除用户',
    }
  }
  return {
    ...base,
    isAnonymous: false,
    anonymousCode: null,
    nickname: attempt.user.nickname,
    username: attempt.user.username,
    displayName: attempt.user.nickname,
    userId: attempt.user.id,
  }
}

export const createComposite = async (userId: string, role: UserRole, input: CreateCompositeInput) => {
  assertTeacher(role)
  await validateCourse(input.courseId, userId, role)
  if (input.publicEnabled && !input.expiresAt) {
    throw compositeBadRequest('公开链接必须设置有效期')
  }
  const existing = await prisma.compositeAssessment.findUnique({ where: { code: input.code } })
  if (existing) throw compositeConflict('综合测评编码已存在')

  return prisma.compositeAssessment.create({
    data: {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      instruction: input.instruction ?? null,
      courseId: input.courseId ?? null,
      createdBy: userId,
      opensAt: parseDate(input.opensAt),
      expiresAt: parseDate(input.expiresAt),
      maxAttempts: input.maxAttempts,
      publicEnabled: input.publicEnabled,
    },
  })
}

export const listComposites = async (userId: string, role: UserRole) => {
  assertTeacher(role)
  const where = role === UserRole.ADMIN ? {} : { createdBy: userId }
  const list = await prisma.compositeAssessment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      course: { select: { id: true, title: true, courseCode: true } },
      items: {
        orderBy: { position: 'asc' },
        include: {
          scale: { select: { id: true, name: true } },
          cognitiveAssignment: {
            select: {
              id: true,
              title: true,
              status: true,
              config: {
                select: {
                  id: true,
                  testType: true,
                  name: true,
                  engineVersion: true,
                  scoringVersion: true,
                },
              },
            },
          },
        },
      },
    },
  })
  const supportedList = config.cognitiveModuleEnabled
    ? list
    : list.filter((item: any) => !item.items.some((child: any) => child.type === 'COGNITIVE'))
  const counts = await loadAttemptCountsByCompositeIds(supportedList.map((item: any) => item.id))
  return supportedList.map((item: any) => {
    const { _count: _ignoredCount, ...rest } = item
    return {
      ...rest,
      itemCount: item.items.length,
      items: item.items.map(mapItemForTeacher),
      attemptCounts: counts.get(item.id) ?? emptyAttemptCounts(),
    }
  })
}

export const getCompositeForTeacher = async (userId: string, role: UserRole, id: string) => {
  assertTeacher(role)
  const composite = await loadComposite(id, true)
  assertOwner(composite, userId, role)
  const counts = await loadAttemptCountsByCompositeIds([composite.id])
  return {
    id: composite.id,
    code: composite.code,
    name: composite.name,
    description: composite.description,
    instruction: composite.instruction,
    status: composite.status,
    courseId: composite.courseId,
    opensAt: composite.opensAt,
    expiresAt: composite.expiresAt,
    maxAttempts: composite.maxAttempts,
    publicEnabled: composite.publicEnabled,
    publishedAt: composite.publishedAt,
    items: composite.items.map(mapItemForTeacher),
    attemptCounts: counts.get(composite.id) ?? emptyAttemptCounts(),
  }
}

export const listAttemptsForTeacher = async (
  userId: string,
  role: UserRole,
  compositeId: string,
  query: {
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'
    q?: string
    page: number
    pageSize: number
  },
) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)

  const where: Record<string, unknown> = { compositeAssessmentId: compositeId }
  if (query.status) where.status = query.status
  const q = query.q?.trim()
  if (q) {
    where.OR = [
      { anonymousCode: { contains: q, mode: 'insensitive' } },
      { user: { is: { nickname: { contains: q, mode: 'insensitive' } } } },
      { user: { is: { username: { contains: q, mode: 'insensitive' } } } },
    ]
  }

  const [attempts, total, counts] = await Promise.all([
    prisma.compositeAssessmentAttempt.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: [
        { completedAt: { sort: 'desc', nulls: 'last' } },
        { startedAt: 'desc' },
      ],
      select: {
        id: true,
        status: true,
        progress: true,
        completedItems: true,
        startedAt: true,
        lastSavedAt: true,
        completedAt: true,
        totalTime: true,
        anonymousCode: true,
        userId: true,
        user: { select: { id: true, nickname: true, username: true } },
      },
    }),
    prisma.compositeAssessmentAttempt.count({ where }),
    loadAttemptCountsByCompositeIds([compositeId]),
  ])

  const totalPages = Math.ceil(total / query.pageSize)
  return {
    assessment: {
      id: composite.id,
      name: composite.name,
      code: composite.code,
      status: composite.status,
      courseId: composite.courseId,
    },
    attemptCounts: counts.get(compositeId) ?? emptyAttemptCounts(),
    list: attempts.map(mapAttemptRowForTeacher),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages,
    hasMore: query.page < totalPages,
  }
}

export const updateComposite = async (userId: string, role: UserRole, id: string, input: UpdateCompositeInput) => {
  assertTeacher(role)
  const existing = await loadComposite(id)
  assertOwner(existing, userId, role)
  const providedKeys = (Object.keys(input) as Array<keyof UpdateCompositeInput>).filter((key) => input[key] !== undefined)
  const publicWindowOnly = providedKeys.length > 0 && providedKeys.every((key) => key === 'expiresAt' || key === 'publicEnabled')
  if (existing.status !== 'DRAFT' && !publicWindowOnly) {
    throw compositeConflict('已发布的综合测评只能调整公开有效期')
  }
  const nextCourseId = input.courseId === undefined ? existing.courseId : input.courseId
  if (existing.status === 'DRAFT') {
    await validateCourse(nextCourseId, userId, role)
  }
  const nextOpensAt = input.opensAt === undefined ? existing.opensAt : parseDate(input.opensAt)
  const nextExpiresAt = input.expiresAt === undefined ? existing.expiresAt : parseDate(input.expiresAt)
  if (nextOpensAt && nextExpiresAt && nextExpiresAt.getTime() < nextOpensAt.getTime()) {
    throw compositeBadRequest('expiresAt 必须晚于或等于 opensAt')
  }
  if ((input.publicEnabled ?? existing.publicEnabled) && !nextExpiresAt) {
    throw compositeBadRequest('公开链接必须设置有效期')
  }
  return prisma.compositeAssessment.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
      ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
      ...(input.opensAt !== undefined ? { opensAt: parseDate(input.opensAt) } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: parseDate(input.expiresAt) } : {}),
      ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
      ...(input.publicEnabled !== undefined ? { publicEnabled: input.publicEnabled } : {}),
    },
  })
}

export const addItem = async (userId: string, role: UserRole, compositeId: string, input: AddCompositeItemInput) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId, true)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  await assertValidItem(input, userId, role)
  const position = input.position ?? (composite.items.length ? Math.max(...composite.items.map((item: any) => item.position)) + 1 : 0)
  if (composite.items.some((item: any) => item.position === position)) {
    throw compositeConflict('模块排序位置已存在')
  }
  return prisma.compositeAssessmentItem.create({
    data: {
      compositeAssessmentId: compositeId,
      type: input.type,
      position,
      required: input.required,
      scaleId: input.type === 'SCALE' ? input.scaleId : null,
      cognitiveAssignmentId: input.type === 'COGNITIVE' ? input.cognitiveAssignmentId : null,
      formType: input.type === 'FORM' ? input.formType : null,
      formLabel: input.type === 'FORM' ? input.formLabel : null,
      formPlaceholder: input.type === 'FORM' ? input.formPlaceholder ?? null : null,
      formOptions: input.type === 'FORM' ? (input.formOptions as any) ?? null : null,
    },
  })
}

export const removeItem = async (userId: string, role: UserRole, compositeId: string, itemId: string) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  const item = await prisma.compositeAssessmentItem.findUnique({ where: { id: itemId } })
  if (!item || item.compositeAssessmentId !== compositeId) throw compositeNotFound('综合测评模块不存在')
  await prisma.compositeAssessmentItem.delete({ where: { id: itemId } })
}

export const reorderItems = async (userId: string, role: UserRole, compositeId: string, items: Array<{ id: string; position: number }>) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId, true)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  if (items.length !== composite.items.length) throw compositeBadRequest('必须同时提交全部模块的排序')
  const known = new Set(composite.items.map((item: any) => item.id))
  const itemIds = new Set<string>()
  const positions = new Set<number>()
  for (const item of items) {
    if (!known.has(item.id) || itemIds.has(item.id) || positions.has(item.position)) throw compositeBadRequest('模块排序数据无效')
    itemIds.add(item.id)
    positions.add(item.position)
  }
  if (itemIds.size !== known.size || positions.size !== composite.items.length) throw compositeBadRequest('模块排序数据无效')

  // position 有唯一索引，直接交换两个位置会在事务中途碰撞。先整体移到临时区，再写入最终位置。
  const temporaryStart = Math.max(
    0,
    ...composite.items.map((item: any) => item.position),
    ...items.map((item) => item.position),
  ) + composite.items.length + 1
  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < composite.items.length; index += 1) {
      await tx.compositeAssessmentItem.update({
        where: { id: composite.items[index].id },
        data: { position: temporaryStart + index },
      })
    }
    for (const item of items) {
      await tx.compositeAssessmentItem.update({ where: { id: item.id }, data: { position: item.position } })
    }
  })
}

export const publishComposite = async (userId: string, role: UserRole, id: string) => {
  assertTeacher(role)
  const composite = await loadComposite(id, true)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  if (composite.items.length === 0) throw compositeBadRequest('综合测评至少需要一个模块')
  await validateCourse(composite.courseId, userId, role)
  if (composite.publicEnabled && !composite.expiresAt) throw compositeBadRequest('公开链接必须设置有效期')

  for (const item of composite.items) {
    if (item.type === 'COGNITIVE') assertCognitiveModuleEnabled()
    if (item.type === 'SCALE' && (!item.scale || item.scale.status !== 'PUBLISHED')) {
      throw compositeBadRequest('综合测评包含未发布量表')
    }
    if (item.type === 'COGNITIVE' && (!item.cognitiveAssignment || item.cognitiveAssignment.status !== 'PUBLISHED' || item.cognitiveAssignment.config.status !== 'PUBLISHED')) {
      throw compositeBadRequest('综合测评包含未发布认知任务')
    }
    if (item.type === 'COGNITIVE') validateCognitiveConfig(item.cognitiveAssignment.config)
    if (item.type === 'FORM') {
      if (!item.formType || !item.formLabel) {
        throw compositeBadRequest('综合测评包含未配置完成的表单')
      }
      if (item.formType === 'single_choice' || item.formType === 'multiple_choice') {
        const options = Array.isArray(item.formOptions) ? item.formOptions as Array<{ value: string }> : []
        const values = options.map((option) => option.value)
        if (values.length === 0 || new Set(values).size !== values.length) {
          throw compositeBadRequest('综合测评包含无效的表单选项')
        }
      }
    }
  }

  return prisma.compositeAssessment.update({
    where: { id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  })
}

const assertTokenWindow = (token: { isActive: boolean; expiresAt: Date; maxUses: number; usedCount: number }) => {
  if (!token.isActive) throw compositeForbidden('公开链接已停用')
  if (token.expiresAt.getTime() < Date.now()) throw compositeForbidden('公开链接已过期')
  if (token.maxUses > 0 && token.usedCount >= token.maxUses) throw compositeConflict('公开链接已达到最大参与次数')
}

const assertCompositeWindow = (composite: { opensAt: Date | null; expiresAt: Date | null }) => {
  if (composite.opensAt && composite.opensAt.getTime() > Date.now()) throw compositeBadRequest('综合测评尚未开始')
  if (composite.expiresAt && composite.expiresAt.getTime() < Date.now()) throw compositeBadRequest('综合测评已过期')
}

export const createAccessTokenForComposite = async (userId: string, role: UserRole, compositeId: string, expiresAt: string, maxUses: number) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  if (composite.status !== 'PUBLISHED') throw compositeBadRequest('只有已发布综合测评可以生成公开链接')
  const expiry = new Date(expiresAt)
  if (expiry.getTime() <= Date.now()) throw compositeBadRequest('有效期必须晚于当前时间')
  if (composite.expiresAt && expiry.getTime() > composite.expiresAt.getTime()) {
    throw compositeBadRequest('公开链接有效期不能晚于综合测评有效期')
  }
  const record = await prisma.compositeAssessmentAccessToken.create({
    data: { compositeAssessmentId: compositeId, token: createAccessToken(), createdBy: userId, expiresAt: expiry, maxUses },
  })
  return { id: record.id, token: record.token, expiresAt: record.expiresAt, maxUses: record.maxUses, usedCount: record.usedCount }
}

export const listAccessTokens = async (userId: string, role: UserRole, compositeId: string) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  return prisma.compositeAssessmentAccessToken.findMany({
    where: { compositeAssessmentId: compositeId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, token: true, expiresAt: true, maxUses: true, usedCount: true, isActive: true, createdAt: true },
  })
}

export const disableAccessToken = async (userId: string, role: UserRole, compositeId: string, tokenId: string) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  const token = await prisma.compositeAssessmentAccessToken.findUnique({ where: { id: tokenId } })
  if (!token || token.compositeAssessmentId !== compositeId) throw compositeNotFound('公开链接不存在')
  await prisma.compositeAssessmentAccessToken.update({ where: { id: tokenId }, data: { isActive: false } })
}

export const listAvailableForStudent = async (userId: string) => {
  const memberships = await prisma.courseStudent.findMany({ where: { studentId: userId, status: { in: ['ACTIVE', 'APPROVED'] } }, select: { courseId: true } })
  const courseIds = memberships.map((item) => item.courseId)
  if (!courseIds.length) return []
  const list = await prisma.compositeAssessment.findMany({
    where: { status: 'PUBLISHED', courseId: { in: courseIds } },
    orderBy: { publishedAt: 'desc' },
    include: { course: { select: { id: true, title: true, courseCode: true } }, items: { orderBy: { position: 'asc' }, select: { type: true, position: true, scale: { select: { name: true } }, cognitiveAssignment: { select: { title: true } }, formLabel: true } } },
  })
  const supportedList = config.cognitiveModuleEnabled
    ? list
    : list.filter((item: any) => !item.items.some((child: any) => child.type === 'COGNITIVE'))
  const attempts = await prisma.compositeAssessmentAttempt.findMany({ where: { userId, compositeAssessmentId: { in: supportedList.map((item) => item.id) } }, orderBy: { startedAt: 'desc' }, select: { id: true, compositeAssessmentId: true, status: true, progress: true, completedAt: true } })
  const latest = new Map<string, any>()
  for (const attempt of attempts) {
    // 查询已按 startedAt 倒序，最新的进行中记录必须优先于更早的已完成记录，保证可继续作答。
    if (!latest.has(attempt.compositeAssessmentId)) latest.set(attempt.compositeAssessmentId, attempt)
  }
  return supportedList.map((item: any) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    instruction: item.instruction,
    estimatedModules: item.items.length,
    course: item.course,
    items: item.items.map((child: any) => ({ type: child.type, position: child.position, label: child.scale?.name || child.cognitiveAssignment?.title || child.formLabel })),
    attempt: latest.get(item.id) ?? null,
  }))
}

const assertStudentEligibility = async (composite: any, userId: string) => {
  if (composite.status !== 'PUBLISHED') throw compositeBadRequest('综合测评尚未发布')
  if (!composite.courseId) throw compositeForbidden('该综合测评仅允许通过公开链接访问')
  const membership = await prisma.courseStudent.findUnique({ where: { courseId_studentId: { courseId: composite.courseId, studentId: userId } } })
  if (!membership || !['ACTIVE', 'APPROVED'].includes(membership.status)) throw compositeForbidden('不是该课程的有效学生')
  if (composite.opensAt && composite.opensAt.getTime() > Date.now()) throw compositeBadRequest('综合测评尚未开始')
  if (composite.expiresAt && composite.expiresAt.getTime() < Date.now()) throw compositeBadRequest('综合测评已过期')
}

const createCognitiveChild = async (db: Db, attempt: any, item: any, userId: string | null) => {
  assertCognitiveModuleEnabled()
  const assignment = item.cognitiveAssignment
  const config = assignment?.config
  if (!assignment || !config) throw compositeBadRequest('认知任务配置不存在')
  const parsedConfig = validateCognitiveConfig(config)
  const anonymous = !userId
  return db.cognitiveSession.create({
    data: {
      userId,
      participantKey: userId ? `${getParticipantKey(userId)}:${attempt.id}:${item.id}` : `anonymous:${attempt.id}:${item.id}`,
      participantSnapshotEncrypted: encryptCognitivePayload({ anonymousCode: attempt.anonymousCode ?? null }),
      assignmentId: assignment.id,
      compositeAttemptId: attempt.id,
      compositeItemId: item.id,
      configId: config.id,
      testType: config.testType,
      attemptNo: 1,
      status: 'IN_PROGRESS',
      configVersion: config.configVersion,
      configSnapshotEncrypted: encryptCognitivePayload(parsedConfig),
      engineVersion: config.engineVersion,
      scoringVersion: config.scoringVersion,
      randomSeed: randomBytes(16).toString('hex'),
      anonymousCode: anonymous ? attempt.anonymousCode : null,
    },
  })
}

const createChildRecords = async (db: Db, attempt: any, items: any[], userId: string | null) => {
  for (const item of items) {
    if (!item.required) continue
    if (item.type === 'SCALE') {
      await db.assessment.create({
        data: {
          scaleId: item.scaleId,
          userId,
          status: 'IN_PROGRESS',
          progress: 0,
          answers: [],
          compositeAttemptId: attempt.id,
          compositeItemId: item.id,
        },
      })
    } else if (item.type === 'COGNITIVE') {
      await createCognitiveChild(db, attempt, item, userId)
    }
  }
}

const createAttempt = async (
  db: Db,
  composite: any,
  userId: string | null,
  accessTokenId: string | null,
  credential?: ReturnType<typeof createRecoveryCredential>,
  attemptNo = 1,
) => {
  const attempt = await db.compositeAssessmentAttempt.create({
    data: {
      compositeAssessmentId: composite.id,
      userId,
      accessTokenId,
      recoveryTokenHash: credential?.hash ?? null,
      participantKey: credential?.participantKey ?? `user:${userId}`,
      anonymousCode: credential?.anonymousCode ?? null,
      attemptNo,
    },
  })
  await createChildRecords(db, attempt, composite.items, userId)
  return attempt
}

export const startUserAttempt = async (userId: string, compositeId: string) => {
  const composite = await loadComposite(compositeId, true)
  assertSupportedComposite(composite)
  await assertStudentEligibility(composite, userId)

  const isUniqueConstraintError = (err: unknown) =>
    typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'P2002'

  for (let retry = 0; retry < 2; retry += 1) {
    try {
      const attempt = await prisma.$transaction(async (tx: Db) => {
        // 所有登录学生的开始流程先锁住模板行，串行化“查询进行中记录/统计次数/创建记录”。
        // 复合唯一索引作为第二道防线，避免未来新增入口绕过该锁时产生相同序号。
        await tx.$queryRaw`SELECT "id" FROM "composite_assessments" WHERE "id" = ${compositeId} FOR UPDATE`
        const existing = await tx.compositeAssessmentAttempt.findFirst({
          where: { compositeAssessmentId: compositeId, userId, status: 'IN_PROGRESS' },
          orderBy: { startedAt: 'desc' },
        })
        if (existing) return existing

        const used = await tx.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: compositeId, userId } })
        if (used >= composite.maxAttempts) throw compositeConflict('已达到综合测评最大次数')
        const latest = await tx.compositeAssessmentAttempt.findFirst({
          where: { compositeAssessmentId: compositeId, userId },
          orderBy: { attemptNo: 'desc' },
          select: { attemptNo: true },
        })
        return createAttempt(tx, composite, userId, null, undefined, (latest?.attemptNo ?? 0) + 1)
      })
      return { attempt: await getAttemptState(attempt.id, { userId }), recoveryToken: null }
    } catch (err) {
      if (!isUniqueConstraintError(err) || retry === 1) throw err
    }
  }

  throw compositeConflict('无法创建综合测评记录，请稍后重试')
}

const findPublicToken = async (tokenValue: string) => {
  const token = await prisma.compositeAssessmentAccessToken.findUnique({ where: { token: tokenValue }, include: { compositeAssessment: { include: { items: { orderBy: { position: 'asc' }, include: { scale: { include: { items: { orderBy: { sortOrder: 'asc' }, include: { itemDimensions: true } }, dimensions: true } }, cognitiveAssignment: { include: { config: true } } } } } } } })
  if (!token) throw compositeNotFound('公开链接不存在')
  if (!token.compositeAssessment.publicEnabled || token.compositeAssessment.status !== 'PUBLISHED') throw compositeForbidden('综合测评未开放公开参与')
  assertSupportedComposite(token.compositeAssessment)
  return token as any
}

export const getPublicCompositeInfo = async (tokenValue: string) => {
  const token = await findPublicToken(tokenValue)
  assertTokenWindow(token)
  const composite = token.compositeAssessment
  assertCompositeWindow(composite)
  return {
    id: composite.id,
    name: composite.name,
    description: composite.description,
    instruction: composite.instruction,
    expiresAt: token.expiresAt,
    maxUses: token.maxUses,
    usedCount: token.usedCount,
    items: composite.items.map((item: any) => ({ type: item.type, position: item.position, label: item.scale?.name || item.cognitiveAssignment?.title || item.formLabel })),
  }
}

export const startPublicAttempt = async (tokenValue: string, recoveryToken?: string) => {
  const token = await findPublicToken(tokenValue)
  if (recoveryToken) {
    const recoveryTokenHash = hashRecoveryToken(recoveryToken)
    const existing = await prisma.compositeAssessmentAttempt.findFirst({ where: { accessTokenId: token.id, recoveryTokenHash } })
    if (existing) return { attempt: await getAttemptState(existing.id, { recoveryTokenHash }), recoveryToken: null }
    throw compositeForbidden('恢复凭证无效')
  }
  assertTokenWindow(token)
  assertCompositeWindow(token.compositeAssessment)
  const credential = createRecoveryCredential()
  const attempt = await prisma.$transaction(async (tx) => {
    const claimed = await tx.compositeAssessmentAccessToken.updateMany({
      where: { id: token.id, isActive: true, expiresAt: { gt: new Date() }, OR: [{ maxUses: 0 }, { usedCount: { lt: token.maxUses } }] },
      data: { usedCount: { increment: 1 } },
    })
    if (claimed.count !== 1) throw compositeConflict('公开链接已达到最大参与次数')
    return createAttempt(tx, token.compositeAssessment, null, token.id, credential)
  })
  return { attempt: await getAttemptState(attempt.id, { recoveryTokenHash: credential.hash }), recoveryToken: credential.token }
}

const loadAttemptWithChildren = async (attemptId: string) => {
  const attempt = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      compositeAssessment: {
        include: {
          items: {
            orderBy: { position: 'asc' },
            include: {
              scale: { include: { items: { orderBy: { sortOrder: 'asc' }, include: { itemDimensions: true } }, dimensions: true } },
              cognitiveAssignment: { include: { config: true } },
            },
          },
        },
      },
      scaleAssessments: { include: { scale: true } },
      cognitiveSessions: {
        include: {
          trials: {
            orderBy: { trialIndex: 'desc' },
            take: 1,
            select: { trialIndex: true },
          },
        },
      },
      formAnswers: true,
    },
  })
  if (!attempt) throw compositeNotFound('综合测评记录不存在')
  return attempt as any
}

const findAttempt = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const attempt = await loadAttemptWithChildren(attemptId)
  const authorized = context.userId
    ? attempt.userId === context.userId
    : Boolean(context.recoveryTokenHash && attempt.recoveryTokenHash === context.recoveryTokenHash && !attempt.userId)
  if (!authorized) throw compositeForbidden('无权限查看此综合测评记录')
  assertSupportedComposite(attempt.compositeAssessment)
  return attempt
}

const cognitiveRunnerPayload = (session: any) => {
  const config = decryptCognitivePayload<Record<string, unknown>>(session.configSnapshotEncrypted)
  const result = session.status === 'COMPLETED' && session.scoreEncrypted && session.metricsEncrypted && session.qualityFlagsEncrypted
    ? {
        score: decryptCognitivePayload<number>(session.scoreEncrypted),
        metrics: decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted),
        qualityFlags: decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted),
      }
    : undefined
  return {
    sessionId: session.id,
    assignmentId: session.assignmentId,
    testType: session.testType,
    attemptNo: session.attemptNo,
    status: session.status,
    configVersion: session.configVersion,
    engineVersion: session.engineVersion,
    scoringVersion: session.scoringVersion,
    config,
    randomSeed: session.randomSeed,
    nextTrialIndex: (session.trials?.[0]?.trialIndex ?? -1) + 1,
    ...(result ? { result } : {}),
  }
}

const completeAttemptIfReady = async (attempt: any, completedItems: number, totalItems: number) => {
  const progress = totalItems ? Math.round((completedItems / totalItems) * 100) : 100
  const shouldComplete = totalItems > 0 && completedItems === totalItems

  if (shouldComplete) {
    const completedAt = new Date()
    const updated = await prisma.compositeAssessmentAttempt.updateMany({
      where: { id: attempt.id, status: 'IN_PROGRESS' },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedItems,
        completedAt,
        totalTime: completedAt.getTime() - attempt.startedAt.getTime(),
        lastSavedAt: completedAt,
      },
    })
    if (updated.count === 1) return { status: 'COMPLETED', progress: 100, completedAt }
  } else if (attempt.status === 'IN_PROGRESS') {
    // Never let a stale GET lower progress or completedItems observed by a newer request.
    await prisma.compositeAssessmentAttempt.updateMany({
      where: {
        id: attempt.id,
        status: 'IN_PROGRESS',
        completedItems: { lte: completedItems },
      },
      data: { progress, completedItems, lastSavedAt: new Date() },
    })
  }

  const latest = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attempt.id },
    select: { status: true, progress: true, completedAt: true },
  })
  if (!latest) throw compositeNotFound('综合测评记录不存在')
  return latest
}

export const getAttemptState = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const attempt = await findAttempt(attemptId, context)
  const scaleMap = new Map<string, any>(attempt.scaleAssessments.map((item: any) => [item.compositeItemId, item]))
  const cognitiveMap = new Map<string, any>(attempt.cognitiveSessions.map((item: any) => [item.compositeItemId, item]))
  const formMap = new Map<string, any>(attempt.formAnswers.map((item: any) => [item.itemId, item]))
  const completed = (item: any) => {
    if (!item.required) return true
    if (item.type === 'SCALE') return scaleMap.get(item.id)?.status === 'COMPLETED'
    if (item.type === 'COGNITIVE') return cognitiveMap.get(item.id)?.status === 'COMPLETED'
    return formMap.get(item.id)?.completed !== false && formMap.has(item.id)
  }
  const completedItems = attempt.compositeAssessment.items.filter(completed).length
  const status = await completeAttemptIfReady(attempt, completedItems, attempt.compositeAssessment.items.length)
  const currentIndex = attempt.compositeAssessment.items.findIndex((item: any) => !completed(item))
  const current = currentIndex >= 0 ? attempt.compositeAssessment.items[currentIndex] : null
  let currentItem: any = null
  if (current?.type === 'FORM') {
    currentItem = { id: current.id, type: current.type, position: current.position, required: current.required, form: { type: current.formType, label: current.formLabel, placeholder: current.formPlaceholder, options: current.formOptions }, value: formMap.get(current.id)?.value ?? null }
  } else if (current?.type === 'SCALE') {
    const assessment = scaleMap.get(current.id)
    currentItem = { id: current.id, type: current.type, position: current.position, required: current.required, scaleAssessmentId: assessment?.id, scale: current.scale, answers: decodeJson<any[]>(assessment?.answers) ?? [] }
  } else if (current?.type === 'COGNITIVE') {
    const session = cognitiveMap.get(current.id)
    currentItem = { id: current.id, type: current.type, position: current.position, required: current.required, cognitiveSession: session ? cognitiveRunnerPayload(session) : null }
  }
  return {
    id: attempt.id,
    assessmentId: attempt.compositeAssessment.id,
    name: attempt.compositeAssessment.name,
    instruction: attempt.compositeAssessment.instruction,
    status: status.status,
    progress: status.progress,
    completedItems,
    totalItems: attempt.compositeAssessment.items.length,
    currentIndex: currentIndex < 0 ? attempt.compositeAssessment.items.length : currentIndex,
    startedAt: attempt.startedAt,
    lastSavedAt: attempt.lastSavedAt,
    completedAt: status.completedAt,
    anonymousCode: attempt.anonymousCode,
    items: attempt.compositeAssessment.items.map((item: any, index: number) => ({ id: item.id, type: item.type, position: item.position, label: item.scale?.name || item.cognitiveAssignment?.title || item.formLabel, completed: completed(item), index })),
    currentItem,
  }
}

const decodeJson = <T extends object>(value: unknown): T | null => {
  if (typeof value === 'string') return safeDecrypt<T>(value) ?? null
  return (value as T) ?? null
}

const getOwnedChild = async (attemptId: string, itemId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const attempt = await findAttempt(attemptId, context)
  const item = attempt.compositeAssessment.items.find((candidate: any) => candidate.id === itemId)
  if (!item) throw compositeNotFound('综合测评模块不存在')
  return { attempt, item }
}

const lockScaleAssessment = async (tx: Db, assessmentId: string) => {
  const rows = await tx.$queryRaw<Array<{ status: string; answers: unknown }>>`
    SELECT "status", "answers"
    FROM "assessments"
    WHERE "id" = ${assessmentId}
    FOR UPDATE
  `
  const assessment = rows[0]
  if (!assessment) throw compositeNotFound('量表测评记录不存在')
  return assessment
}

export const saveAttempt = async (
  attemptId: string,
  context: { userId?: string; recoveryTokenHash?: string },
  draft?: { itemId: string; value: string },
) => {
  const attempt = await findAttempt(attemptId, context)
  if (attempt.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
  if (draft) {
    const item = attempt.compositeAssessment.items.find((candidate: any) => candidate.id === draft.itemId)
    if (!item || item.type !== 'FORM') throw compositeBadRequest('只能保存当前综合测评中的表单草稿')
    const existing = attempt.formAnswers.find((answer: any) => answer.itemId === draft.itemId)
    if (!existing || existing.completed === false) {
      await prisma.compositeFormAnswer.upsert({
        where: { attemptId_itemId: { attemptId, itemId: draft.itemId } },
        create: { attemptId, itemId: draft.itemId, value: draft.value, completed: false },
        update: { value: draft.value, completed: false },
      })
    }
  }
  return prisma.compositeAssessmentAttempt.update({ where: { id: attemptId }, data: { lastSavedAt: new Date() }, select: { id: true, lastSavedAt: true, status: true, progress: true } })
}

export const saveFormAnswer = async (attemptId: string, itemId: string, value: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const { attempt, item } = await getOwnedChild(attemptId, itemId, context)
  if (attempt.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
  if (item.type !== 'FORM') throw compositeBadRequest('当前模块不是表单')
  if (item.required && !value.trim()) throw compositeBadRequest('此表单项为必填项')
  if (item.formType === 'single_choice' || item.formType === 'multiple_choice') {
    const options = Array.isArray(item.formOptions) ? item.formOptions as Array<{ value: string }> : []
    const allowed = new Set(options.map((option) => option.value))
    const values = item.formType === 'multiple_choice' ? value.split(',').filter(Boolean) : (value ? [value] : [])
    if (values.some((candidate) => !allowed.has(candidate)) || new Set(values).size !== values.length) throw compositeBadRequest('表单选项无效')
  }
  await prisma.compositeFormAnswer.upsert({ where: { attemptId_itemId: { attemptId, itemId } }, create: { attemptId, itemId, value, completed: true }, update: { value, completed: true } })
  return getAttemptState(attempt.id, context)
}

export const saveScaleAnswer = async (attemptId: string, itemId: string, input: { itemId: string; value: number; responseTime?: number }, context: { userId?: string; recoveryTokenHash?: string }) => {
  const { attempt, item } = await getOwnedChild(attemptId, itemId, context)
  if (attempt.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
  if (item.type !== 'SCALE') throw compositeBadRequest('当前模块不是量表')
  const assessment = attempt.scaleAssessments.find((candidate: any) => candidate.compositeItemId === itemId)
  if (!assessment || assessment.status !== 'IN_PROGRESS') throw compositeBadRequest('量表模块已结束')
  const scaleItem = item.scale.items.find((candidate: any) => candidate.id === input.itemId)
  if (!scaleItem) throw compositeBadRequest('量表题目不存在')
  const scaleConfig = item.scale.config as { points?: number } | null
  const points = Number(scaleConfig?.points ?? 5)
  if (!Number.isInteger(points) || points < 2 || points > 10 || input.value < 1 || input.value > points) {
    throw compositeBadRequest('量表答案超出有效范围')
  }
  await prisma.$transaction(async (tx: Db) => {
    const locked = await lockScaleAssessment(tx, assessment.id)
    if (locked.status !== 'IN_PROGRESS') throw compositeBadRequest('量表模块已结束')
    const answers = decodeJson<any[]>(locked.answers) ?? []
    const answer = { itemId: input.itemId, value: input.value, responseTime: input.responseTime }
    const index = answers.findIndex((candidate) => candidate.itemId === input.itemId)
    if (index >= 0) answers[index] = { ...answers[index], ...answer }
    else answers.push(answer)
    await tx.assessment.update({
      where: { id: assessment.id },
      data: { answers: answers as any, progress: Math.round((answers.length / Math.max(item.scale.items.length, 1)) * 100) },
    })
  })
  return getAttemptState(attempt.id, context)
}

export const completeScale = async (attemptId: string, itemId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const { attempt, item } = await getOwnedChild(attemptId, itemId, context)
  if (item.type !== 'SCALE') throw compositeBadRequest('当前模块不是量表')
  const assessment = attempt.scaleAssessments.find((candidate: any) => candidate.compositeItemId === itemId)
  if (!assessment) throw compositeNotFound('量表测评记录不存在')
  if (assessment.status === 'COMPLETED') return getAttemptState(attempt.id, context)
  const didComplete = await prisma.$transaction(async (tx: Db) => {
    const locked = await lockScaleAssessment(tx, assessment.id)
    if (locked.status === 'COMPLETED') return false
    if (locked.status !== 'IN_PROGRESS') throw compositeBadRequest('量表模块已结束')
    const answers = decodeJson<any[]>(locked.answers) ?? []
    const requiredIds = item.scale.items.filter((candidate: any) => candidate.required).map((candidate: any) => candidate.id)
    const answered = new Set(answers.map((candidate) => candidate.itemId))
    if (requiredIds.some((id: string) => !answered.has(id))) throw compositeBadRequest('还有必答题未完成')
    const scores = calculateScores(answers, item.scale.items, item.scale.dimensions, item.scale.config as any)
    const feedback = generateFeedbackWithLevels(scores, item.scale.dimensions, item.scale.name)
    const completedAt = new Date()
    await tx.assessment.update({
      where: { id: assessment.id },
      data: {
        status: 'COMPLETED',
        progress: 100,
        answers: encryptField(answers) as any,
        scores: encryptField(scores) as any,
        feedback: encryptField(feedback) as any,
        completedAt,
        totalTime: completedAt.getTime() - assessment.startedAt.getTime(),
      },
    })
    return true
  })
  if (!didComplete) return getAttemptState(attempt.id, context)
  return getAttemptState(attempt.id, context)
}

export const buildCompositeReport = (attempt: any) => {
  const scaleMap = new Map<string, any>(attempt.scaleAssessments.map((item: any) => [item.compositeItemId, item]))
  const cognitiveMap = new Map<string, any>(attempt.cognitiveSessions.map((item: any) => [item.compositeItemId, item]))
  const formMap = new Map<string, any>(attempt.formAnswers.map((item: any) => [item.itemId, item]))
  const modules = attempt.compositeAssessment.items.map((item: any) => {
    if (item.type === 'FORM') {
      return { itemId: item.id, type: item.type, label: item.formLabel, value: formMap.get(item.id)?.value ?? null }
    }
    if (item.type === 'SCALE') {
      try {
        const result = scaleMap.get(item.id)
        return {
          itemId: item.id,
          type: item.type,
          label: item.scale?.name,
          scaleId: item.scaleId,
          scores: decodeJson(result?.scores) ?? [],
          feedback: decodeJson(result?.feedback) ?? {},
          completedAt: result?.completedAt,
          totalTime: result?.totalTime,
        }
      } catch {
        logger.warn('composite report module decrypt failed', { attemptId: attempt.id, itemId: item.id, type: item.type })
        return { itemId: item.id, type: item.type, label: item.scale?.name, scaleId: item.scaleId, decryptError: true }
      }
    }
    try {
      const session = cognitiveMap.get(item.id)
      const config = session ? decryptCognitivePayload<Record<string, any>>(session.configSnapshotEncrypted) : {}
      const score = session?.scoreEncrypted ? decryptCognitivePayload<number>(session.scoreEncrypted) : null
      const metrics = session?.metricsEncrypted ? decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted) : {}
      const qualityFlags = session?.qualityFlagsEncrypted ? decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted) : {}
      const report = config.report ?? {}
      return {
        itemId: item.id,
        type: item.type,
        label: item.cognitiveAssignment?.title,
        sessionId: session?.id,
        testType: session?.testType,
        score,
        metrics,
        qualityFlags,
        finishedAt: session?.finishedAt,
        reference: session && score !== null
          ? resolveCognitiveReference({
            testType: session.testType,
            metrics,
            score,
            referenceMode: report.referenceMode ?? 'none',
            referenceVersion: report.referenceVersion,
            referenceBand: report.referenceBand,
          })
          : undefined,
      }
    } catch {
      logger.warn('composite report module decrypt failed', { attemptId: attempt.id, itemId: item.id, type: item.type })
      return { itemId: item.id, type: item.type, label: item.cognitiveAssignment?.title, decryptError: true }
    }
  })
  return {
    id: attempt.id,
    assessmentId: attempt.compositeAssessment.id,
    name: attempt.compositeAssessment.name,
    anonymousCode: attempt.anonymousCode,
    completedAt: attempt.completedAt,
    totalTime: attempt.totalTime,
    modules,
  }
}

export const getReport = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const attempt = await findAttempt(attemptId, context)
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  return buildCompositeReport(attempt)
}

export const getReportForTeacher = async (userId: string, role: UserRole, compositeId: string, attemptId: string) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  const attempt = await loadAttemptWithChildren(attemptId)
  if (attempt.compositeAssessmentId !== compositeId) throw compositeNotFound('综合测评记录不存在')
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  assertSupportedComposite(attempt.compositeAssessment)
  return buildCompositeReport(attempt)
}

export const getExportContext = async (userId: string, role: UserRole, id: string) => {
  assertTeacher(role)
  const composite = await loadComposite(id)
  assertOwner(composite, userId, role)
  return composite
}

export const isCompositeError = (err: unknown): err is CompositeServiceError => err instanceof CompositeServiceError
