import { UserRole, CourseStudentStatus, CognitiveAssignmentStatus } from '@prisma/client'
import { prisma } from '../../config/database'
import { parseCognitiveConfig } from './config/config-validator'
import { CreateAssignmentInput, UpdateAssignmentInput, ListAssignmentsQuery } from './cognitive.schema'
import {
  CognitiveServiceError,
  NOT_FOUND,
  FORBIDDEN,
  BAD_REQUEST,
  CONFLICT,
} from './cognitive.errors'

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
  if (config.status !== 'PUBLISHED') throw BAD_REQUEST('CognitiveTestConfig must be PUBLISHED')

  try {
    const parsed = parseCognitiveConfig(
      {
        testType: config.testType,
        engineVersion: config.engineVersion,
        scoringVersion: config.scoringVersion,
      },
      config.config
    )
    return { course, config, entry: parsed.entry, validatedConfig: parsed.config }
  } catch {
    throw BAD_REQUEST('CognitiveTestConfig config does not match its registry schema')
  }
}

const isTeacherOrAdmin = (role: UserRole) => role === UserRole.TEACHER || role === UserRole.ADMIN

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

  const { course, config } = await validateConfigForAssignment(input.courseId, input.configId, role, userId)

  // create 只建 DRAFT；createdBy 由 JWT 决定；courseSnapshot 在 publish 时写入。
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
    },
  })

  return { ...assignment, config: undefined, course: { id: course.id, title: course.title, courseCode: course.courseCode } }
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
    where: { courseId: { in: courseIds }, status: 'PUBLISHED' },
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
  if (assignment.status !== 'PUBLISHED' || !assignment.courseId) throw NOT_FOUND('CognitiveAssignment not found')

  const membership = await prisma.courseStudent.findUnique({
    where: { courseId_studentId: { courseId: assignment.courseId, studentId: userId } },
  })
  if (!membership || (membership.status !== CourseStudentStatus.ACTIVE && membership.status !== CourseStudentStatus.APPROVED)) {
    throw FORBIDDEN('Not a member of this course')
  }

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

  const updated = await prisma.cognitiveAssignment.update({ where: { id }, data })
  return updated
}

export const publishAssignment = async (userId: string, role: UserRole, id: string) => {
  if (!isTeacherOrAdmin(role)) throw FORBIDDEN('Teacher role required')

  const existing = await prisma.cognitiveAssignment.findUnique({ where: { id }, include: { course: true } })
  if (!existing) throw NOT_FOUND('CognitiveAssignment not found')
  assertCanManage(existing, role, userId)
  if (existing.status !== 'DRAFT') throw CONFLICT('Only DRAFT assignments can be published')

  // publish 重检 Course/Config/Registry/schema（复用校验链）。
  const { course } = await validateConfigForAssignment(
    existing.courseId as string,
    existing.configId,
    role,
    userId
  )

  // 单次条件写：DRAFT -> PUBLISHED + publishedAt + 最小 courseSnapshot。
  const { count } = await prisma.cognitiveAssignment.updateMany({
    where: { id, status: 'DRAFT' },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      courseSnapshot: { id: course.id, title: course.title, courseCode: course.courseCode },
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

  // DRAFT/PUBLISHED -> ARCHIVED；不物理删除；不提供 ARCHIVED -> PUBLISHED。
  const { count } = await prisma.cognitiveAssignment.updateMany({
    where: { id, status: { in: ['DRAFT', 'PUBLISHED'] as CognitiveAssignmentStatus[] } },
    data: { status: 'ARCHIVED' },
  })
  if (count === 0) throw CONFLICT('Assignment cannot be archived in its current state')

  const archived = await prisma.cognitiveAssignment.findUnique({ where: { id } })
  return archived
}
