import { assertCognitiveProductEligible } from './product-eligibility'
import { Prisma, UserRole, CourseStudentStatus, CognitiveAssignmentStatus, MaterialResourceType } from '@prisma/client'
import { prisma } from '../../config/database'
import { readCognitiveQuota } from './attempt-quota'
import { getCognitiveRegistryEntry, hasCognitiveProfile } from './cognitive.registry'
import { freezeAssignmentProfile, freezeDataForWrite, hashResolvedConfig, readFrozenReport } from './profile-freeze'
import type { CognitiveProfile } from './cognitive.types'
import { CreateAssignmentInput, UpdateAssignmentInput, ListAssignmentsQuery } from './cognitive.schema'
import {
  CognitiveServiceError,
  NOT_FOUND,
  FORBIDDEN,
  BAD_REQUEST,
  CONFLICT,
} from './cognitive.errors'
import { isCompositeWrapper, rejectWrapperForStandaloneUse } from './assignment.access'
import { canInstantiateConfig, grantedResourceIds } from '../../services/materialGrant'
import { config as appConfig } from '../../config'
import { assertTaskContractValid } from './v2/publication-gate'
import { getCognitiveV2TaskDefinition } from './v2/registry'

export { CognitiveServiceError }

/**
 * D3 — Cognitive Assignment / Distribution 服务。
 *
 * 边界（D3 §3）：不创建 Session、不算 attemptNo、不生成 randomSeed、
 * 不做 Trial / Completion / History；不物理删除 Assignment；
 * 不引入 repository abstraction / policy engine / state machine 包。
 */

/** 校验链：Course 存在 → 归属 → Config PUBLISHED → Registry 可识别 → configSchema.parse。 */
const validateConfigForAssignment = async (courseId: string, configId: string, role: UserRole, userId: string) => {
  const course = await prisma.course.findUnique({ where: { id: courseId } })
  if (!course) throw NOT_FOUND('Course not found')

  if (role === UserRole.TEACHER && course.creatorId !== userId) {
    throw FORBIDDEN('Not the creator of this course')
  }

  const config = await prisma.cognitiveTestConfig.findUnique({ where: { id: configId } })
  if (!config) throw NOT_FOUND('CognitiveTestConfig not found')
  assertCognitiveProductEligible(config.testType)
  if (config.status !== 'PUBLISHED') throw BAD_REQUEST('CognitiveTestConfig must be PUBLISHED')

  const entry = getCognitiveRegistryEntry(config.testType, config.engineVersion, config.scoringVersion)
  if (!entry) {
    throw BAD_REQUEST(
      `No registry implementation for ${config.testType}/${config.engineVersion}/${config.scoringVersion}`
    )
  }

  const parsed = entry.configSchema.safeParse(config.config)
  if (!parsed.success) {
    throw BAD_REQUEST('CognitiveTestConfig config does not match its registry schema')
  }

  return { course, config, entry, validatedConfig: parsed.data }
}

const isTeacherOrAdmin = (role: UserRole) => role === UserRole.TEACHER || role === UserRole.ADMIN

type CognitiveConfigIdentity = {
  testType: string
  engineVersion: string
  scoringVersion: string
}

/**
 * Verify that the exact v2 implementation remains structurally executable.
 * Product availability is already authorized by CognitiveTestConfig.status;
 * this helper must never maintain or consult a second lifecycle state.
 */
const requireReadyCognitiveV2Definition = (config: CognitiveConfigIdentity) => {
  assertCognitiveProductEligible(config.testType)
  const definition = getCognitiveV2TaskDefinition(
    config.testType,
    config.engineVersion,
    config.scoringVersion,
  )
  if (!definition) throw BAD_REQUEST('No Cognitive v2 definition for this task version')
  try {
    assertTaskContractValid(definition)
  } catch (err) {
    throw BAD_REQUEST(err instanceof Error ? err.message : 'Cognitive task contract validation failed')
  }
  return definition
}

/** teacher 侧资源归属判定（D3 §8 / §10）：TEACHER 要求 createdBy 归属；ADMIN 例外。 */
const assertCanManage = (assignment: { createdBy: string | null }, role: UserRole, userId: string) => {
  if (role === UserRole.ADMIN) return
  if (role !== UserRole.TEACHER) throw FORBIDDEN('Teacher role required')
  if (assignment.createdBy !== userId) throw FORBIDDEN('Not the creator of this assignment')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const createAssignment = async (
  userId: string,
  role: UserRole,
  input: CreateAssignmentInput
) => {
  if (!isTeacherOrAdmin(role)) throw FORBIDDEN('Teacher role required')

  const { course, config, entry } = await validateConfigForAssignment(input.courseId, input.configId, role, userId)
  if (!(await canInstantiateConfig(userId, role, config))) {
    throw FORBIDDEN('无权限使用此认知任务类型')
  }
  if (!hasCognitiveProfile(entry, input.profile)) {
    throw BAD_REQUEST('只能从该任务已声明的 Profile 中选择')
  }

  // create 只建 DRAFT；createdBy 由 JWT 决定；courseSnapshot 与 resolved snapshot 在 publish 时写入。
  const assignment = await prisma.cognitiveAssignment.create({
    data: {
      courseId: input.courseId,
      configId: input.configId,
      createdBy: userId,
      title: input.title,
      instruction: input.instruction,
      status: 'DRAFT',
      opensAt: input.opensAt ? new Date(input.opensAt) : null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      maxAttempts: input.maxAttempts,
      required: input.required,
      profile: input.profile,
    },
  })

  return { ...assignment, config: undefined, course: { id: course.id, title: course.title, courseCode: course.courseCode } }
}

/** 教师创建任务时可选的已发布配置（不含运行 config JSON）。 */
export const listPublishedConfigs = async (userId: string, role: UserRole) => {
  if (!isTeacherOrAdmin(role)) throw FORBIDDEN('Teacher role required')

  const where: Record<string, unknown> = { status: 'PUBLISHED' }
  if (role !== UserRole.ADMIN && appConfig.materialGrantsEnabled) {
    const grantedIds = await grantedResourceIds(userId, MaterialResourceType.COGNITIVE_CONFIG)
    where.OR = [
      { accessPolicy: { not: 'GRANT' } },
      { id: { in: grantedIds } },
    ]
  }

  const configs = await prisma.cognitiveTestConfig.findMany({
    where,
    orderBy: [{ testType: 'asc' }, { configVersion: 'asc' }],
    select: {
      id: true,
      testType: true,
      configVersion: true,
      name: true,
      instruction: true,
      engineVersion: true,
      scoringVersion: true,
      status: true,
      accessPolicy: true,
    },
  })

  return configs.filter((config) => {
    try {
      requireReadyCognitiveV2Definition(config)
      return true
    } catch {
      return false
    }
  })
}

export const updateConfigAccessPolicy = async (
  userId: string,
  role: UserRole,
  id: string,
  accessPolicy: 'OPEN' | 'GRANT',
) => {
  if (role !== UserRole.ADMIN) throw FORBIDDEN('Admin role required')
  const existing = await prisma.cognitiveTestConfig.findUnique({ where: { id } })
  if (!existing) throw NOT_FOUND('CognitiveTestConfig not found')
  const updated = await prisma.cognitiveTestConfig.update({
    where: { id },
    data: { accessPolicy },
    select: {
      id: true,
      testType: true,
      configVersion: true,
      name: true,
      status: true,
      accessPolicy: true,
    },
  })
  return updated
}

export const listTeacherAssignments = async (
  userId: string,
  role: UserRole,
  query: ListAssignmentsQuery
) => {
  if (!isTeacherOrAdmin(role)) throw FORBIDDEN('Teacher role required')

  const where: any = {}
  if (role === UserRole.TEACHER) where.createdBy = userId
  if (query.courseId) where.courseId = query.courseId
  if (query.status) where.status = query.status
  // Wrapper assignments materialized for report packages are implementation
  // details, not standalone teacher-library entries. Keep an explicit query
  // override for admin/tooling callers, but default only the teacher directory
  // to standalone assignments so admins can still inspect internal wrappers.
  if (query.listedStandalone !== undefined || role === UserRole.TEACHER) {
    where.listedStandalone = query.listedStandalone ?? true
  }

  const assignments = await prisma.cognitiveAssignment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { config: true },
  })

  // 返回 assignment 基础字段 + config metadata，不含完整 config JSON。
  return assignments.map((a) => ({
    id: a.id,
    courseId: a.courseId,
    title: a.title,
    instruction: a.instruction,
    status: a.status,
    opensAt: a.opensAt,
    dueAt: a.dueAt,
    maxAttempts: a.maxAttempts,
    required: a.required,
    listedStandalone: a.listedStandalone,
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    config: {
      id: a.config.id,
      testType: a.config.testType,
      configVersion: a.config.configVersion,
      name: a.config.name,
      engineVersion: a.config.engineVersion,
      scoringVersion: a.config.scoringVersion,
    },
  }))
}

/** 学生分发列表（D3 §12）：只回 PUBLISHED + 课程成员 ACTIVE/APPROVED；不按时间隐藏过期。 */
export const listStudentAssignments = async (userId: string) => {
  const memberships = await prisma.courseStudent.findMany({
    where: { studentId: userId, status: { in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED] } },
    select: { courseId: true },
  })
  const courseIds = memberships.map((m) => m.courseId)
  if (courseIds.length === 0) return []

  const assignments = await prisma.cognitiveAssignment.findMany({
    where: { courseId: { in: courseIds }, status: 'PUBLISHED', listedStandalone: true, course: { isLibrary: false } },
    orderBy: { publishedAt: 'desc' },
    include: { config: true, course: true },
  })

  return assignments.map((a) => ({
    id: a.id,
    courseId: a.courseId,
    title: a.title,
    instruction: a.instruction,
    status: a.status,
    opensAt: a.opensAt,
    dueAt: a.dueAt,
    maxAttempts: a.maxAttempts,
    required: a.required,
    publishedAt: a.publishedAt,
    course: a.course ? { id: a.course.id, title: a.course.title, courseCode: a.course.courseCode } : null,
    config: {
      id: a.config.id,
      testType: a.config.testType,
      configVersion: a.config.configVersion,
      name: a.config.name,
      engineVersion: a.config.engineVersion,
      scoringVersion: a.config.scoringVersion,
    },
  }))
}

export const getAssignmentForTeacher = async (userId: string, role: UserRole, id: string) => {
  if (!isTeacherOrAdmin(role)) throw FORBIDDEN('Teacher role required')
  const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id }, include: { config: true, course: true } })
  if (!assignment) throw NOT_FOUND('CognitiveAssignment not found')
  assertCanManage(assignment, role, userId)

  const packageReference = await prisma.compositeAssessmentItem.findFirst({
    where: {
      cognitiveAssignmentId: id,
      compositeAssessment: { reportPackageKey: { not: null } },
    },
    select: { id: true },
  })

  return {
    id: assignment.id,
    courseId: assignment.courseId,
    title: assignment.title,
    instruction: assignment.instruction,
    status: assignment.status,
    opensAt: assignment.opensAt,
    dueAt: assignment.dueAt,
    maxAttempts: assignment.maxAttempts,
    required: assignment.required,
    listedStandalone: assignment.listedStandalone,
    reportPackageLocked: Boolean(packageReference),
    publishedAt: assignment.publishedAt,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    course: assignment.course ? { id: assignment.course.id, title: assignment.course.title, courseCode: assignment.course.courseCode } : null,
    config: {
      id: assignment.config.id,
      testType: assignment.config.testType,
      configVersion: assignment.config.configVersion,
      name: assignment.config.name,
      engineVersion: assignment.config.engineVersion,
      scoringVersion: assignment.config.scoringVersion,
    },
  }
}

/** 学生侧详情（D3 §13）：只回 metadata，**不返回实际运行 config JSON**。 */
export const getAssignmentForStudent = async (userId: string, id: string) => {
  const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id }, include: { config: true, course: true } })
  if (!assignment) throw NOT_FOUND('CognitiveAssignment not found')
  if (assignment.status !== 'PUBLISHED' || !assignment.courseId || isCompositeWrapper(assignment) || assignment.course?.isLibrary) {
    throw NOT_FOUND('CognitiveAssignment not found')
  }

  const membership = await prisma.courseStudent.findUnique({
    where: { courseId_studentId: { courseId: assignment.courseId, studentId: userId } },
  })
  if (!membership || (membership.status !== CourseStudentStatus.ACTIVE && membership.status !== CourseStudentStatus.APPROVED)) {
    throw FORBIDDEN('Not a member of this course')
  }

  const quota = await prisma.$transaction(tx => readCognitiveQuota(tx, userId, id))
  return {
    id: assignment.id,
    courseId: assignment.courseId,
    title: assignment.title,
    instruction: assignment.instruction,
    status: assignment.status,
    opensAt: assignment.opensAt,
    dueAt: assignment.dueAt,
    ...quota,
    required: assignment.required,
    publishedAt: assignment.publishedAt,
    course: assignment.course ? { id: assignment.course.id, title: assignment.course.title, courseCode: assignment.course.courseCode } : null,
    config: {
      id: assignment.config.id,
      testType: assignment.config.testType,
      configVersion: assignment.config.configVersion,
      name: assignment.config.name,
      engineVersion: assignment.config.engineVersion,
      scoringVersion: assignment.config.scoringVersion,
    },
  }
}

export const updateDraftAssignment = async (
  userId: string,
  role: UserRole,
  id: string,
  input: UpdateAssignmentInput
) => {
  if (!isTeacherOrAdmin(role)) throw FORBIDDEN('Teacher role required')

  const existing = await prisma.cognitiveAssignment.findUnique({ where: { id } })
  if (!existing) throw NOT_FOUND('CognitiveAssignment not found')
  assertCanManage(existing, role, userId)
  if (isCompositeWrapper(existing)) {
    const packageReference = await prisma.compositeAssessmentItem.findFirst({
      where: {
        cognitiveAssignmentId: id,
        compositeAssessment: { reportPackageKey: { not: null } },
      },
      select: { id: true },
    })
    if (packageReference) throw CONFLICT('报告包引用的认知任务已冻结，不能修改')
    const blocked = ['maxAttempts', 'required', 'opensAt', 'dueAt'] as const
    if (blocked.some((key) => input[key] !== undefined)) {
      throw BAD_REQUEST('综合测评用认知任务只能修改标题和指导语')
    }
    const updated = await prisma.cognitiveAssignment.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
      },
    })
    return updated
  }
  if (existing.status !== 'DRAFT') throw BAD_REQUEST('Only DRAFT assignments can be updated')

  // D6.1 (P1)：时间窗不变量必须跨"本次 request + 既有行"合并校验 ——
  // 只校验本次同时提供的字段会漏掉"只 PATCH opensAt/dueAt 其一"制造的非法状态。
  const nextOpensAt = input.opensAt !== undefined ? new Date(input.opensAt) : existing.opensAt
  const nextDueAt = input.dueAt !== undefined ? new Date(input.dueAt) : existing.dueAt
  if (nextOpensAt && nextDueAt && nextDueAt.getTime() < nextOpensAt.getTime()) {
    throw BAD_REQUEST('dueAt must be equal to or after opensAt')
  }

  const data: any = {}
  if (input.title !== undefined) data.title = input.title
  if (input.instruction !== undefined) data.instruction = input.instruction
  if (input.opensAt !== undefined) data.opensAt = nextOpensAt
  if (input.dueAt !== undefined) data.dueAt = nextDueAt
  if (input.maxAttempts !== undefined) data.maxAttempts = input.maxAttempts
  if (input.required !== undefined) data.required = input.required
  if (input.profile !== undefined) {
    const config = await prisma.cognitiveTestConfig.findUnique({ where: { id: existing.configId } })
    if (!config) throw NOT_FOUND('CognitiveTestConfig not found')
    const entry = getCognitiveRegistryEntry(config.testType, config.engineVersion, config.scoringVersion)
    if (!entry || !hasCognitiveProfile(entry, input.profile)) {
      throw BAD_REQUEST('只能从该任务已声明的 Profile 中选择')
    }
    data.profile = input.profile
  }

  const updated = await prisma.cognitiveAssignment.update({ where: { id }, data })
  return updated
}

export const publishAssignment = async (userId: string, role: UserRole, id: string) => {
  if (!isTeacherOrAdmin(role)) throw FORBIDDEN('Teacher role required')

  const existing = await prisma.cognitiveAssignment.findUnique({ where: { id }, include: { course: true } })
  if (!existing) throw NOT_FOUND('CognitiveAssignment not found')
  assertCanManage(existing, role, userId)
  if (existing.status !== 'DRAFT') throw CONFLICT('Only DRAFT assignments can be published')

  // publish 重检 Course/Config/Registry/schema（复用校验链），并在此时冻结 Profile。
  const { course, config, entry } = await validateConfigForAssignment(
    existing.courseId as string,
    existing.configId,
    role,
    userId
  )

  // DB CognitiveTestConfig.status already authorizes product release. The v2
  // definition is checked only for executable contract completeness.
  requireReadyCognitiveV2Definition(config)

  if (!existing.profile) {
    throw BAD_REQUEST('发布前必须选择 Profile')
  }
  const freeze = freezeAssignmentProfile({
    entry,
    baseConfig: config.config,
    profile: existing.profile as CognitiveProfile,
  })
  // 单次条件写：DRAFT -> PUBLISHED + publishedAt + 最小 courseSnapshot + resolved snapshot。
  const { count } = await prisma.cognitiveAssignment.updateMany({
    where: { id, status: 'DRAFT' },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      courseSnapshot: { id: course.id, title: course.title, courseCode: course.courseCode },
      ...freezeDataForWrite(freeze),
    },
  })

  if (count === 0) {
    const reloaded = await prisma.cognitiveAssignment.findUnique({ where: { id } })
    if (reloaded?.status === 'PUBLISHED') throw CONFLICT('Assignment already published')
    throw CONFLICT('Assignment cannot be published in its current state')
  }

  const published = await prisma.cognitiveAssignment.findUnique({ where: { id } })
  return published
}

export const archiveAssignment = async (userId: string, role: UserRole, id: string) => {
  if (!isTeacherOrAdmin(role)) throw FORBIDDEN('Teacher role required')

  const existing = await prisma.cognitiveAssignment.findUnique({ where: { id } })
  if (!existing) throw NOT_FOUND('CognitiveAssignment not found')
  assertCanManage(existing, role, userId)

  if (isCompositeWrapper(existing)) {
    const packageReference = await prisma.compositeAssessmentItem.findFirst({
      where: {
        cognitiveAssignmentId: id,
        compositeAssessment: { reportPackageKey: { not: null } },
      },
      select: { id: true },
    })
    if (packageReference) throw CONFLICT('报告包引用的认知任务已冻结，不能修改')
  }

  const referenced = await prisma.compositeAssessmentItem.findFirst({
    where: { cognitiveAssignmentId: id, compositeAssessment: { status: { not: 'ARCHIVED' } } },
    select: { id: true },
  })
  if (referenced) throw CONFLICT('任务仍被未归档测评引用。请先在“组合测评”中归档相关测评；草稿可移除该认知单元，再重试归档。历史记录会保留。')

  // DRAFT/PUBLISHED -> ARCHIVED；不物理删除；不提供 ARCHIVED -> PUBLISHED。
  const { count } = await prisma.cognitiveAssignment.updateMany({
    where: { id, status: { in: ['DRAFT', 'PUBLISHED'] as CognitiveAssignmentStatus[] } },
    data: { status: 'ARCHIVED' },
  })
  if (count === 0) throw CONFLICT('Assignment cannot be archived in its current state')

  const archived = await prisma.cognitiveAssignment.findUnique({ where: { id } })
  return archived
}

export type FrozenAssignmentCopy = {
  profile: string | null
  profileDefinitionVersion: string | null
  resolvedConfigSnapshotEncrypted: string | null
  resolvedConfigHash: string | null
  resolvedReportSnapshotEncrypted: string | null
}

export const ensureTeacherPublishedAssignment = async (
  tx: Prisma.TransactionClient,
  input: {
    userId: string
    courseId: string
    configId: string
    title: string
    instruction: string | null
    sourceFreeze?: FrozenAssignmentCopy | null
    profile?: CognitiveProfile
    quotaSourceAssignmentId?: string | null
    maxAttempts?: number
  },
) => {
  const config = await tx.cognitiveTestConfig.findUnique({ where: { id: input.configId } })
  if (!config) throw NOT_FOUND('CognitiveTestConfig not found')
  assertCognitiveProductEligible(config.testType)
  if (config.status !== 'PUBLISHED') throw BAD_REQUEST('CognitiveTestConfig must be PUBLISHED')

  const entry = getCognitiveRegistryEntry(config.testType, config.engineVersion, config.scoringVersion)
  if (!entry) {
    throw BAD_REQUEST(`No registry implementation for ${config.testType}/${config.engineVersion}/${config.scoringVersion}`)
  }
  const parsed = entry.configSchema.safeParse(config.config)
  if (!parsed.success) throw BAD_REQUEST('CognitiveTestConfig config does not match its registry schema')

  const source = input.sourceFreeze ?? null
  if (source && input.profile) throw BAD_REQUEST('不能同时指定来源冻结信息和新 Profile')
  const freezeFields = [
    source?.profile,
    source?.profileDefinitionVersion,
    source?.resolvedConfigSnapshotEncrypted,
    source?.resolvedConfigHash,
    source?.resolvedReportSnapshotEncrypted,
  ]
  const presentCount = freezeFields.filter((value) => value != null && value !== '').length
  if (presentCount > 0 && presentCount < freezeFields.length) {
    throw BAD_REQUEST('来源认知任务冻结信息不完整，无法复制')
  }
  const hasCopiedFreeze = presentCount === freezeFields.length
  const generatedFreeze = input.profile
    ? freezeDataForWrite(freezeAssignmentProfile({ entry, baseConfig: parsed.data, profile: input.profile }))
    : null
  const copiedProfile = source?.profile ?? generatedFreeze?.profile ?? null
  const copiedHash = source?.resolvedConfigHash ?? generatedFreeze?.resolvedConfigHash ?? null
  const hasFreeze = hasCopiedFreeze || generatedFreeze !== null

  // A generated freeze is a new materialization, so the exact v2 executable
  // contract must still be valid. Historical copied freezes remain readable
  // even if the live implementation later changes or is retired in DB.
  if (input.profile && !hasCopiedFreeze) {
    requireReadyCognitiveV2Definition(config)
  }

  // copy / ensure 不调用 canInstantiateConfig：模板上已有的 configId 是一次性实例化许可。
  const candidates = await tx.cognitiveAssignment.findMany({
    where: {
      createdBy: input.userId,
      courseId: input.courseId,
      configId: input.configId,
      status: 'PUBLISHED',
      listedStandalone: false,
      profile: copiedProfile,
      resolvedConfigHash: copiedHash,
      quotaSourceAssignmentId: input.quotaSourceAssignmentId ?? null,
    },
  })
  if (hasFreeze) {
    const expectedDefinitionVersion = source?.profileDefinitionVersion ?? generatedFreeze?.profileDefinitionVersion
    const expectedReportEncrypted = source?.resolvedReportSnapshotEncrypted ?? generatedFreeze?.resolvedReportSnapshotEncrypted
    const sourceReportHash = hashResolvedConfig(readFrozenReport(expectedReportEncrypted))
    const existing = candidates.find((candidate) =>
      candidate.profileDefinitionVersion === expectedDefinitionVersion
      && hashResolvedConfig(readFrozenReport(candidate.resolvedReportSnapshotEncrypted)) === sourceReportHash
    )
    if (existing) return existing
  } else if (candidates[0]) {
    return candidates[0]
  }

  const course = await tx.course.findUnique({ where: { id: input.courseId } })
  if (!course) throw NOT_FOUND('Course not found')

  const freezeData = hasCopiedFreeze
    ? {
        profile: copiedProfile,
        profileDefinitionVersion: source?.profileDefinitionVersion ?? null,
        resolvedConfigSnapshotEncrypted: source?.resolvedConfigSnapshotEncrypted ?? null,
        resolvedConfigHash: copiedHash,
        resolvedReportSnapshotEncrypted: source?.resolvedReportSnapshotEncrypted ?? null,
      }
    : generatedFreeze
      ? generatedFreeze
      : {
          profile: null,
          profileDefinitionVersion: null,
          resolvedConfigSnapshotEncrypted: null,
          resolvedConfigHash: null,
          resolvedReportSnapshotEncrypted: null,
        }

  return tx.cognitiveAssignment.create({
    data: {
      courseId: input.courseId,
      configId: input.configId,
      createdBy: input.userId,
      title: input.title,
      instruction: input.instruction,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      listedStandalone: false,
      required: false,
      maxAttempts: input.maxAttempts ?? 1,
      quotaSourceAssignmentId: input.quotaSourceAssignmentId ?? null,
      courseSnapshot: { id: course.id, title: course.title, courseCode: course.courseCode },
      ...freezeData,
    },
  })
}
