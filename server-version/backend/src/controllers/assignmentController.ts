import { EXPORT_BATCH_SIZE, sendTaskExport, TaskExportBusyError, TaskExportLimitError, TaskExportPermissionError, TaskExportAuthenticationError, refreshTaskExportAuthentication } from '../utils/streamingTaskExport'
import { REVIEW_PAGE_SIZE, REVIEW_BATCH_SIZE, REVIEW_SELECTION_LIMIT, ReviewInputError, freezeSelection, readSelection, reviewCursor, nextReviewCursor, gradeReviewChunk } from '../modules/assignment-review/selection'
import { managementTaskList } from '../modules/training-catalog/tasks'
import { Request, Response } from 'express'
import { canReadLegacyContent } from '../utils/legacyContentRoles'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound } from '../utils/response'
import { UserRole, AssignmentStatus, SubmissionStatus, CourseStudentStatus, Question } from '../types'
import { logger } from '../utils/logger'
import { Messages } from '../constants'
import { getPaginationParams, buildPaginatedResult } from '../utils/pagination'
import { z } from 'zod'
import { hashIdempotencyKey, hashIdempotencyPayload } from '../utils/idempotency'
import { canAccessCourseContent, canAccessCourseRoster, hasActiveCourseMembership } from '../utils/courseAccess'
import { config } from '../config'
import { createAttachmentSchema } from '../utils/attachmentSchema'
import {
  AssetReferenceValidationError,
  hydrateAssetReferences,
  hydrateAssetReferenceBatch,
  syncAssetReferences,
  validateAssetReferencesForCourse,
} from '../services/assetStorage'
import {
  assignmentSubmissionSnapshot,
  createAssignmentIdempotencyReceipt,
  findAssignmentIdempotencyReceipt,
} from '../utils/submissionIdempotency'

const attachmentSchema = createAttachmentSchema(config.legacyUploadsEnabled)
const attachmentsSchema = z.array(attachmentSchema).max(100)

const createAssignmentSchema = z.object({
  courseId: z.string().min(1, '课程ID不能为空'),
  title: z.string().min(1, '练习标题不能为空'),
  description: z.string().optional(),
  deadline: z.string().optional(), // 接受任何字符串格式，后端再转换
  questions: z.array(z.any()).optional(),
  videos: attachmentsSchema.optional(),
  documents: attachmentsSchema.optional(),
  images: attachmentsSchema.optional(),
  tags: z.array(z.string().max(20, '标签最多20个字符')).max(10, '最多10个标签').optional().default([]),
  content: z.string().optional(),
})

const updateAssignmentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  deadline: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  questions: z.array(z.any()).optional(),
  videos: attachmentsSchema.optional(),
  documents: attachmentsSchema.optional(),
  images: attachmentsSchema.optional(),
  tags: z.array(z.string().max(20, '标签最多20个字符')).max(10, '最多10个标签').optional(),
  content: z.string().optional(),
})

export const parseAssignmentDeadline = (value: string | undefined): Date | null | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') throw new Error('截止日期格式无效')
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw new Error('截止日期格式无效')

  const now = Date.now()
  if (parsed.getTime() < now - 60_000) throw new Error('截止日期不能早于当前时间')
  const maxDate = new Date()
  maxDate.setFullYear(maxDate.getFullYear() + 10)
  if (parsed.getTime() > maxDate.getTime()) throw new Error('截止日期不能超过10年')
  return parsed
}

const isUniqueConstraintError = (error: unknown): boolean => (
  Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002')
)

const withSubmissionTransaction = async <T>(callback: (tx: any) => Promise<T>): Promise<T> => {
  const transaction = (prisma as any).$transaction
  // The fallback only supports lightweight controller unit mocks. Real
  // Prisma clients always take the transaction path below.
  return typeof transaction === 'function' ? transaction.call(prisma, callback) : callback(prisma)
}

const findExistingSubmission = async (tx: any, assignmentId: string, studentId: string) => {
  if (typeof tx.submission.findUnique === 'function') {
    return tx.submission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId } } })
  }
  return tx.submission.findFirst({ where: { assignmentId, studentId } })
}

const assignmentSubmissionPayload = (submission: { content?: unknown; answers?: unknown }) => ({
  content: submission.content ?? null,
  answers: submission.answers ?? {},
})

class IdempotencyPayloadMismatchError extends Error {
  constructor() {
    super('Idempotency-Key 已用于其他提交内容')
    this.name = 'IdempotencyPayloadMismatchError'
  }
}

class SubmissionRevisionConflictError extends Error {
  constructor() {
    super('提交版本已过期，请刷新后重试')
    this.name = 'SubmissionRevisionConflictError'
  }
}

const submissionRevision = (submission: { revision?: unknown } | null | undefined): number => (
  typeof submission?.revision === 'number'
    && Number.isInteger(submission.revision)
    && submission.revision >= 0
    ? submission.revision
    : 0
)

// Keep the append-only history useful without allowing a single student to
// exhaust storage by repeatedly resubmitting the same assignment forever.
// The mutable Submission row remains the source of truth for the latest value.
export const MAX_SUBMISSION_HISTORY_VERSIONS = 100

/**
 * Keyed browser submissions carry the revision they read. Older clients that
 * omit it are treated as revision zero, which is safe for first writes and
 * rejects updates once a migrated row has advanced. Unkeyed legacy requests
 * retain their historical behaviour unless they explicitly provide a
 * revision.
 */
const assertSubmissionRevision = (
  existing: { revision?: unknown },
  expectedRevision: number | undefined,
  hasIdempotencyKey: boolean,
) => {
  const requestedRevision = expectedRevision ?? (hasIdempotencyKey ? 0 : undefined)
  if (requestedRevision === undefined) return
  if (submissionRevision(existing) !== requestedRevision) {
    throw new SubmissionRevisionConflictError()
  }
}

const utf8ByteLimitedString = (limit: number, message: string) => z.string().refine(
  (value) => Buffer.byteLength(value, 'utf8') <= limit,
  { message },
)

const submissionAnswersSchema = z.record(z.string(), utf8ByteLimitedString(10_000, '单个答案不能超过10KB')).superRefine((value, ctx) => {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 256_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '答案总大小不能超过256KB' })
  }
})

const submitSchema = z.object({
  content: utf8ByteLimitedString(200_000, '提交内容不能超过200KB').optional(),
  answers: submissionAnswersSchema.refine((value) => Object.keys(value).length <= 200, '答案数量不能超过200项').optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
})

const gradeSchema = z.object({
  comment: z.string().trim().min(1, '评语不能为空').max(10000),
  expectedRevision: z.number().int().nonnegative().optional(),
})

export const assignmentController = {
  // 获取练习列表（添加分页优化）
  async list(req: Request, res: Response) {
    try {
      if (req.query.view === 'summary') return await managementTaskList(req, res, 'assignment')
      const userId = req.user?.userId
      const userRole = req.user?.role
      if (!canReadLegacyContent(userRole)) return forbidden(res, '当前角色不能访问旧练习列表')
      const { courseId, tags } = req.query
      const pagination = getPaginationParams(req)

      let where: any = {}

      if (courseId) {
        where.courseId = courseId as string
      }

      // 标签筛选
      if (tags) {
        const tagArray = (tags as string).split(',').map(t => t.trim()).filter(Boolean)
        if (tagArray.length > 0) {
          where.tags = { hasEvery: tagArray }
        }
      }

      // 学生只能看到自己已加入课程中的已发布练习
      if (userRole === UserRole.STUDENT) {
        where.status = AssignmentStatus.PUBLISHED
        where.course = {
          students: {
            some: {
              studentId: userId,
              status: { in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED] },
            },
          },
        }
      }

      // 教师只能看到自己课程的练习，管理员可以看到所有
      if (userRole === UserRole.TEACHER) {
        // Enforce ownership in the task query itself instead of materializing
        // every owned course ID (also keeps a supplied courseId constrained).
        where.course = { creatorId: userId }
      }

      // The old training list is not an Activity discovery API. Global
      // platform ADMIN must not enumerate school-only assignments or tags.
      // Merge the filter with the student enrollment predicate, rather than
      // overwriting that predicate.
      where.course = { ...where.course, courseType: { not: 'CAMPUS_ACTIVITY' } }

      // 并行查询数据和总数
      const [assignments, total] = await Promise.all([
        prisma.assignment.findMany({
          where,
          include: {
            course: {
              select: {
                id: true,
                title: true,
                courseCode: true,
              }
            },
            _count: {
              select: {
                submissions: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: pagination.skip,
          take: pagination.take,
        }),
        prisma.assignment.count({ where })
      ])

      // 如果是学生，查询自己的提交状态
      let formattedAssignments = assignments
      if (userRole === UserRole.STUDENT) {
        const submissions = await prisma.submission.findMany({
          where: {
            studentId: userId,
            assignmentId: {
              in: assignments.map(a => a.id)
            }
          }
        })

        const submissionMap = new Map(submissions.map(s => [s.assignmentId, s]))

        formattedAssignments = assignments.map(assignment => ({
          ...assignment,
          mySubmission: submissionMap.get(assignment.id) || null,
        }))
      }

      const hydratedAssignments = await hydrateAssetReferenceBatch(
        formattedAssignments.map((assignment) => ({ value: assignment, context: {
          entityType: 'Assignment', entityId: assignment.id,
          courseId: assignment.courseId, parentAccess: true,
        } })),
      )
      return success(res, buildPaginatedResult(hydratedAssignments, total, pagination))
    } catch (err) {
      logger.error('获取练习列表错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 创建练习
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const result = createAssignmentSchema.safeParse(req.body)
      if (!result.success) {
        logger.error('Schema validation error', result.error.issues)
        return error(res, result.error.issues[0].message)
      }

      const { courseId, title, description, deadline, questions, videos, images, documents, content, tags } = result.data

      // 检查课程是否存在
      const course = await prisma.course.findUnique({
        where: { id: courseId }
      })

      if (!course) {
        return error(res, '课程不存在')
      }

      // 检查权限
      if (course.creatorId !== userId && req.user?.role !== UserRole.ADMIN) {
        return forbidden(res, '无权限在此课程创建练习')
      }

      let deadlineDate: Date | null = null
      try {
        deadlineDate = parseAssignmentDeadline(deadline) || null
      } catch (deadlineError) {
        return error(res, deadlineError instanceof Error ? deadlineError.message : '截止日期格式无效')
      }

      const assetValues = {
        videos: videos || [],
        images: images || [],
        documents: documents || [],
      }
      const assignment = await prisma.$transaction(async (tx) => {
        await validateAssetReferencesForCourse({
          values: assetValues,
          courseId,
          ownerId: userId,
          role: req.user?.role,
          db: tx,
        })

        const created = await tx.assignment.create({
          data: {
            courseId,
            title,
            description,
            content: content || null,
            deadline: deadlineDate,
            status: AssignmentStatus.PUBLISHED,
            questions: questions || [],
            tags: tags || [],
            videos: (videos || []) as any,
            images: (images || []) as any,
            documents: (documents || []) as any,
          },
          include: {
            course: {
              select: {
                id: true,
                title: true,
                courseCode: true,
              }
            }
          }
        })
        await syncAssetReferences({
          entityType: 'Assignment',
          entityId: created.id,
          values: assetValues,
          db: tx,
        })
        return created
      })

      return success(res, await hydrateAssetReferences(assignment, false, {
        entityType: 'Assignment',
        entityId: assignment.id,
        courseId,
        parentAccess: true,
      }), '练习创建成功')
    } catch (err) {
      if (err instanceof AssetReferenceValidationError) {
        return error(res, err.message)
      }
      logger.error('创建练习错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取练习详情
  async detail(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const assignment = await prisma.assignment.findUnique({
        where: { id },
        select: {
          id: true,
          courseId: true,
          tags: true,
          // Learners never receive roster counts; avoid aggregating every submission.
          _count: userRole !== UserRole.STUDENT ? { select: { submissions: true } } : false,
          title: true,
          description: true,
          content: true,
          deadline: true,
          status: true,
          questions: true,
          videos: true,
          images: true,
          documents: true,
          createdAt: true,
          updatedAt: true,
          course: {
            select: {
              id: true,
              title: true,
              courseCode: true,
              creatorId: true,
              shares: {
                select: { sharedTo: true },
              },
            }
          }
        }
      })

      if (!assignment || (req.query.courseId !== undefined && req.query.courseId !== assignment.courseId)) {
        return notFound(res, '练习不存在')
      }

      if (userRole === UserRole.STUDENT) {
        if (!userId || !(await hasActiveCourseMembership(assignment.course.id, userId))) {
          return forbidden(res, '您不是该课程的学员')
        }
        // 学生只能看到已发布的练习
        if (assignment.status !== AssignmentStatus.PUBLISHED) {
          return forbidden(res, '无权限查看此练习')
        }
      } else if (!canAccessCourseContent(assignment.course, userId, userRole)) {
        return forbidden(res, '您没有权限访问此练习')
      }

      // 查询学生的提交
      let mySubmission = null
      if (userRole === UserRole.STUDENT) {
        mySubmission = await prisma.submission.findFirst({
          where: {
            assignmentId: id,
            studentId: userId!
          }
        })
      }

      const { shares: _shares, ...course } = assignment.course
      const { _count, ...assignmentData } = assignment

      return success(res, await hydrateAssetReferences({
        ...assignmentData,
        course,
        ...(canAccessCourseRoster(course, userId, userRole) ? { _count } : {}),
        mySubmission,
      }, false, {
        entityType: 'Assignment',
        entityId: assignment.id,
        courseId: assignment.course.id,
        parentAccess: true,
      }))
    } catch (err) {
      logger.error('获取练习详情错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 更新练习
  async update(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const assignment = await prisma.assignment.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              creatorId: true,
            }
          }
        }
      })

      if (!assignment) {
        return notFound(res, '练习不存在')
      }

      // 权限检查
      if (assignment.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此练习')
      }

      const result = updateAssignmentSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.issues[0].message)
      }

      const updateData: any = { ...result.data }
      try {
        if (result.data.deadline !== undefined) {
          updateData.deadline = parseAssignmentDeadline(result.data.deadline)
        }
      } catch (deadlineError) {
        return error(res, deadlineError instanceof Error ? deadlineError.message : '截止日期格式无效')
      }

      const assetValues = {
        videos: result.data.videos === undefined ? assignment.videos : result.data.videos,
        images: result.data.images === undefined ? assignment.images : result.data.images,
        documents: result.data.documents === undefined ? assignment.documents : result.data.documents,
      }
      const updated = await prisma.$transaction(async (tx) => {
        await validateAssetReferencesForCourse({
          values: assetValues,
          courseId: assignment.courseId,
          ownerId: userId!,
          role: userRole,
          db: tx,
        })
        const saved = await tx.assignment.update({
          where: { id },
          data: updateData,
          include: {
            course: {
              select: {
                id: true,
                title: true,
                courseCode: true,
              }
            }
          }
        })
        await syncAssetReferences({
          entityType: 'Assignment',
          entityId: id,
          values: assetValues,
          db: tx,
        })
        return saved
      })

      return success(res, await hydrateAssetReferences(updated, false, {
        entityType: 'Assignment',
        entityId: id,
        courseId: assignment.courseId,
        parentAccess: true,
      }), '练习更新成功')
    } catch (err) {
      if (err instanceof AssetReferenceValidationError) {
        return error(res, err.message)
      }
      logger.error('更新练习错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 删除练习
  async delete(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const assignment = await prisma.assignment.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              creatorId: true,
            }
          }
        }
      })

      if (!assignment) {
        return notFound(res, '练习不存在')
      }

      // 权限检查
      if (assignment.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限删除此练习')
      }

      await prisma.$transaction(async (tx) => {
        await tx.assetReference.deleteMany({
          where: { entityType: 'Assignment', entityId: id },
        })
        await tx.assignment.delete({ where: { id } })
      })

      return success(res, null, '练习已删除')
    } catch (err) {
      logger.error('删除练习错误', err)
      return error(res, '删除练习失败')
    }
  },

  // 提交练习
  async submit(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const { id } = req.params

      const result = submitSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.issues[0].message)
      }

      const { content, answers, expectedRevision } = result.data
      const normalizedAnswers = answers || {}
      let idempotencyKeyHash: string | undefined
      try {
        idempotencyKeyHash = hashIdempotencyKey(typeof req.header === 'function' ? req.header('Idempotency-Key') : undefined)
      } catch (idempotencyError) {
        return error(res, idempotencyError instanceof Error ? idempotencyError.message : 'Idempotency-Key 无效')
      }
      const idempotencyPayloadHash = idempotencyKeyHash
        ? hashIdempotencyPayload(assignmentSubmissionPayload({ content, answers: normalizedAnswers }))
        : undefined

      // 检查练习是否存在
      const assignment = await prisma.assignment.findUnique({
        where: { id },
        // Submission gates do not consume the task body or attachment JSON.
        select: { courseId: true, status: true, deadline: true },
      })

      if (!assignment) {
        return notFound(res, '练习不存在')
      }

      if (req.user?.role !== UserRole.STUDENT || !(await hasActiveCourseMembership(assignment.courseId, userId))) {
        return forbidden(res, '您不是该课程的学员')
      }

      // A client may retry after the original request committed but the
      // assignment has since closed. Replay the committed idempotent result
      // before applying current publication/deadline gates.
      if (idempotencyKeyHash) {
        const committedReceipt = await findAssignmentIdempotencyReceipt(
          prisma,
          id,
          userId,
          idempotencyKeyHash,
        )
        if (committedReceipt) {
          if (committedReceipt.idempotencyPayloadHash !== idempotencyPayloadHash) {
            return error(res, 'Idempotency-Key 已用于其他提交内容', -1, 409)
          }
          return success(res, committedReceipt.response, '练习提交成功')
        }

        const committedRetry = await prisma.submission.findFirst({
          where: { assignmentId: id, studentId: userId, idempotencyKeyHash },
        })
        if (committedRetry) {
          const committedPayloadHash = committedRetry.idempotencyPayloadHash
            || hashIdempotencyPayload(assignmentSubmissionPayload(committedRetry))
          if (committedPayloadHash !== idempotencyPayloadHash) {
            return error(res, 'Idempotency-Key 已用于其他提交内容', -1, 409)
          }
          return success(res, committedRetry, '练习提交成功')
        }
      }

      if (assignment.status !== AssignmentStatus.PUBLISHED) {
        return error(res, '练习未发布')
      }

      if (assignment.deadline && new Date() > assignment.deadline) {
        return error(res, Messages.ASSIGNMENT.DEADLINE_PASSED)
      }

      const submissionResult = await withSubmissionTransaction(async (tx) => {
        const lockKey = `assignment-submission:${id}:${userId}`
        if (typeof tx.$executeRaw === 'function') {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
        }

        // Re-check the immutable receipt after acquiring the per-student
        // transaction lock.  This closes the race where a delayed retry was
        // already in flight while a newer keyed submission committed.
        if (idempotencyKeyHash) {
          const committedReceipt = await findAssignmentIdempotencyReceipt(
            tx,
            id,
            userId,
            idempotencyKeyHash,
          )
          if (committedReceipt) {
            if (committedReceipt.idempotencyPayloadHash !== idempotencyPayloadHash) {
              throw new IdempotencyPayloadMismatchError()
            }
            return { submission: committedReceipt.response, wasExisting: true, replayed: true }
          }
        }

        // Use the composite unique key so the lock and the database invariant
        // agree. A legacy client racing this code is handled by the P2002
        // retry below and still receives an idempotent success.
        let existing = await findExistingSubmission(tx, id, userId)

        if (!existing) {
          const requestedRevision = expectedRevision ?? (idempotencyKeyHash ? 0 : undefined)
          if (requestedRevision !== undefined && requestedRevision !== 0) {
            throw new SubmissionRevisionConflictError()
          }
          try {
            const created = await tx.submission.create({
              data: {
                assignmentId: id,
                studentId: userId,
                revision: 1,
                content,
                answers: normalizedAnswers,
                status: SubmissionStatus.SUBMITTED,
                ...(idempotencyKeyHash ? { idempotencyKeyHash, idempotencyPayloadHash } : {}),
              },
            })
            if (idempotencyKeyHash && idempotencyPayloadHash) {
              await createAssignmentIdempotencyReceipt(tx, {
                assignmentId: id,
                studentId: userId,
                submissionId: created.id,
                idempotencyKeyHash,
                idempotencyPayloadHash,
                response: assignmentSubmissionSnapshot(created),
              })
            }
            return { submission: created, wasExisting: false }
          } catch (createError) {
            if (!isUniqueConstraintError(createError)) throw createError
            existing = await findExistingSubmission(tx, id, userId)
            if (!existing) throw createError
          }
        }

        // A retry carrying the same explicit key is an idempotent success,
        // not another history version. Requests without a key retain the
        // existing versioning behavior for intentional resubmissions.
        if (idempotencyKeyHash && existing.idempotencyKeyHash === idempotencyKeyHash) {
          const existingPayloadHash = existing.idempotencyPayloadHash
            || hashIdempotencyPayload(assignmentSubmissionPayload(existing))
          if (existingPayloadHash !== idempotencyPayloadHash) {
            throw new IdempotencyPayloadMismatchError()
          }
          if (idempotencyKeyHash && idempotencyPayloadHash) {
            await createAssignmentIdempotencyReceipt(tx, {
              assignmentId: id,
              studentId: userId,
              submissionId: existing.id,
              idempotencyKeyHash,
              idempotencyPayloadHash,
              response: assignmentSubmissionSnapshot(existing),
            })
          }
          return { submission: existing, wasExisting: true }
        }

        // The advisory transaction lock serializes writers; this revision
        // check makes the serialized order observable to clients as an OCC
        // conflict instead of allowing a late first request to overwrite a
        // newer keyed submission that has no receipt yet.
        assertSubmissionRevision(existing, expectedRevision, Boolean(idempotencyKeyHash))

        const latestHistory = await tx.submissionHistory.findFirst({
          where: { submissionId: existing.id },
          orderBy: { version: 'desc' },
          select: { version: true },
        })
        const newVersion = latestHistory ? latestHistory.version + 1 : 1
        await tx.submissionHistory.create({
          data: {
            submissionId: existing.id,
            content: existing.content,
            answers: existing.answers as any,
            version: newVersion,
          },
        })
        if (newVersion > MAX_SUBMISSION_HISTORY_VERSIONS && typeof tx.submissionHistory.deleteMany === 'function') {
          await tx.submissionHistory.deleteMany({
            where: {
              submissionId: existing.id,
              version: { lt: newVersion - MAX_SUBMISSION_HISTORY_VERSIONS + 1 },
            },
          })
        }

        const updated = await tx.submission.update({
          where: { id: existing.id },
          data: {
            content,
            answers: normalizedAnswers,
            submittedAt: new Date(),
            status: SubmissionStatus.SUBMITTED,
            revision: { increment: 1 },
            ...(idempotencyKeyHash
              ? { idempotencyKeyHash, idempotencyPayloadHash }
              : { idempotencyKeyHash: null, idempotencyPayloadHash: null }),
          },
        })
        if (idempotencyKeyHash && idempotencyPayloadHash) {
          await createAssignmentIdempotencyReceipt(tx, {
            assignmentId: id,
            studentId: userId,
            submissionId: updated.id,
            idempotencyKeyHash,
            idempotencyPayloadHash,
            response: assignmentSubmissionSnapshot(updated),
          })
        }
        return { submission: updated, wasExisting: true }
      })

      const message = submissionResult.replayed
        ? '练习提交成功'
        : submissionResult.wasExisting
          ? '练习更新成功'
          : '练习提交成功'
      return success(res, submissionResult.submission, message)
    } catch (err) {
      if (err instanceof IdempotencyPayloadMismatchError) {
        return error(res, err.message, -1, 409)
      }
      if (err instanceof SubmissionRevisionConflictError) {
        return error(res, err.message, -1, 409)
      }
      logger.error('提交练习错误', err)
      // An unknown failure may occur after the database write is committed
      // (for example while constructing the response). Mark it as a 5xx so
      // clients retain the idempotency key and safely retry the same payload.
      return error(res, '提交练习失败', -1, 500)
    }
  },

  // 获取提交列表
  async submissions(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const assignment = await prisma.assignment.findUnique({
        where: { id },
        select: {
          course: {
            select: {
              creatorId: true,
            }
          }
        }
      })

      if (!assignment) {
        return notFound(res, '练习不存在')
      }

      // 权限检查
      if (assignment.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限查看提交')
      }

      const cursor = reviewCursor(req.query.cursor)
      const pageSize = req.query.pageSize === undefined ? REVIEW_PAGE_SIZE : Number(req.query.pageSize)
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return error(res, '每页数量须为 1–100', -1, 400)
      const result = await prisma.$transaction(async tx => {
        const where = { assignmentId: id }
        const [total, gradedCount, rows] = await Promise.all([
          tx.submission.count({ where }),
          tx.submission.count({ where: { ...where, status: SubmissionStatus.GRADED } }),
          tx.submission.findMany({
            where: { ...where, ...(cursor ? { id: { lt: cursor.id } } : {}) },
            include: { student: { select: { id: true, nickname: true, username: true, avatarUrl: true } } },
            orderBy: { id: 'desc' }, take: pageSize + 1,
          }),
        ])
        const list = rows.slice(0, pageSize)
        return { list, total, gradedCount, ungradedCount: total - gradedCount,
          nextCursor: rows.length > pageSize ? nextReviewCursor(list[list.length - 1]) : null }
      }, { isolationLevel: 'RepeatableRead' })
      return success(res, result)
    } catch (err) {
      if (err instanceof ReviewInputError) return error(res, err.message, -1, 400)
      logger.error('获取提交列表错误', err)
      return error(res, '获取提交列表失败')
    }
  },

  // 批改练习
  async grade(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id, submissionId } = req.params

      const result = gradeSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.issues[0].message)
      }

      const { comment } = result.data

      // 检查练习和提交
      const assignment = await prisma.assignment.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              creatorId: true,
            }
          }
        }
      })

      if (!assignment) {
        return notFound(res, '练习不存在')
      }

      // 权限检查
      if (assignment.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限批改此练习')
      }

      const submission = await prisma.submission.findFirst({
        where: {
          id: submissionId,
          assignmentId: id
        }
      })

      if (!submission) {
        return notFound(res, '提交记录不存在')
      }

      const updated = await prisma.$transaction(async tx => {
        const lockKey = `assignment-submission:${id}:${submission.studentId}`
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
        const changed = await tx.submission.updateMany({
          where: { id: submissionId, assignmentId: id, revision: result.data.expectedRevision ?? submission.revision, ...(userRole !== UserRole.ADMIN ? { assignment: { course: { creatorId: userId } } } : {}) },
          data: { comment, status: SubmissionStatus.GRADED, reviewedAt: new Date(), revision: { increment: 1 } },
        })
        if (!changed.count) throw new SubmissionRevisionConflictError()
        return tx.submission.findUnique({ where: { id: submissionId } })
      })

      return success(res, updated, '批改成功')
    } catch (err) {
      if (err instanceof SubmissionRevisionConflictError) return error(res, '提交已更新，请刷新后重试', -1, 409)
      logger.error('批改练习错误', err)
      return error(res, '批改失败')
    }
  },

  // Capture IDs and revisions only. The signed, expiring snapshot cannot include later arrivals.
  async reviewSelection(req: Request, res: Response) {
    try {
      const id = req.params.id
      const actor = req.user!.userId
      const assignment = await prisma.assignment.findUnique({ where: { id }, select: { course: { select: { creatorId: true } } } })
      if (!assignment) return notFound(res, '练习不存在')
      if (assignment.course.creatorId !== actor && req.user?.role !== UserRole.ADMIN) return forbidden(res, '无权限批改此练习')
      const parsed = z.union([
        z.object({ scope: z.literal('all-ungraded') }),
        z.object({ scope: z.literal('page'), items: z.array(z.object({ id: z.string().min(1).max(100), revision: z.number().int().nonnegative() })).min(1).max(100) }),
      ]).safeParse(req.body)
      if (!parsed.success) return error(res, '选择范围无效', -1, 400)
      const selection = parsed.data
      const items = await prisma.submission.findMany({
        where: { assignmentId: id, status: { not: SubmissionStatus.GRADED }, ...(selection.scope === 'page' ? { OR: selection.items.map(item => ({ id: item.id, revision: item.revision })) } : {}) },
        select: { id: true, revision: true }, orderBy: { id: 'asc' }, take: REVIEW_SELECTION_LIMIT + 1,
      })
      if (items.length > REVIEW_SELECTION_LIMIT) return error(res, `全部选择最多支持 ${REVIEW_SELECTION_LIMIT} 份，请按本页分批批改`, -1, 400)
      return success(res, freezeSelection(actor, id, items))
    } catch (err) {
      logger.error('选择待批改练习失败', err)
      return error(res, '选择失败，请重试', -1, 500)
    }
  },

  // Explicit snapshots are processed in bounded chunks; legacy clients retain statement-time all-ungraded semantics.
  async batchGrade(req: Request, res: Response) {
    try {
      const { id } = req.params
      const result = gradeSchema.safeParse(req.body)
      if (!result.success) return error(res, result.error.issues[0].message, -1, 400)
      const assignment = await prisma.assignment.findUnique({ where: { id }, select: { course: { select: { creatorId: true } } } })
      if (!assignment) return notFound(res, '练习不存在')
      if (assignment.course.creatorId !== req.user?.userId && req.user?.role !== UserRole.ADMIN) return forbidden(res, '无权限批改此练习')
      if (req.body.selectionToken === undefined) {
        // Older mini-program callers explicitly request all ungraded. Bound the snapshot,
        // never load answers or silently grade just a prefix when the protective limit is exceeded.
        const items = await prisma.submission.findMany({ where: { assignmentId: id, status: { not: SubmissionStatus.GRADED } }, select: { id: true, revision: true }, orderBy: { id: 'asc' }, take: REVIEW_SELECTION_LIMIT + 1 })
        if (items.length > REVIEW_SELECTION_LIMIT) throw new ReviewInputError(`全部批改最多支持 ${REVIEW_SELECTION_LIMIT} 份，请使用分页批改`)
        let gradedCount = 0
        try {
          for (let offset = 0; offset < items.length; offset += REVIEW_BATCH_SIZE) gradedCount += (await gradeReviewChunk(id, items.slice(offset, offset + REVIEW_BATCH_SIZE), result.data.comment, req.user!.userId, req.user?.role === UserRole.ADMIN)).count
        } catch (err) {
          logger.error('批量批改部分完成', err)
          return error(res, `已确认批改 ${gradedCount} 份，后续批次失败；请刷新确认后重试`, -1, 500)
        }
        return success(res, { gradedCount, skippedCount: items.length - gradedCount }, `批量批改成功，共 ${gradedCount} 份练习`)
      }
      const selection = readSelection(req.body.selectionToken, req.user!.userId, id)
      const updated = await gradeReviewChunk(id, selection.items, result.data.comment, req.user!.userId, req.user?.role === UserRole.ADMIN)
      return success(res, { gradedCount: updated.count, skippedCount: selection.items.length - updated.count,
        selectionId: selection.selectionId, index: selection.index, total: selection.total })
    } catch (err) {
      if (err instanceof ReviewInputError) return error(res, err.message, -1, 400)
      logger.error('批量批改错误', err)
      return error(res, '批量批改失败，可重试未完成批次', -1, 500)
    }
  },

  // 导出数据
  async export(req: Request, res: Response) {
    try {
      let userId = req.user?.userId
      let userRole = req.user?.role
      const { id } = req.params

      // 检查练习
      let assignment = await prisma.assignment.findUnique({
        where: { id },
        select: {
          title: true,
          questions: true,
          course: {
            select: {
              creatorId: true,
            }
          }
        }
      })

      if (!assignment) {
        return notFound(res, '练习不存在')
      }

      // 权限检查
      if (assignment.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限导出数据')
      }

      const authorize = async (db: Pick<typeof prisma, 'assignment'>) => {
        const current = await db.assignment.findUnique({ where: { id }, select: { course: { select: { creatorId: true } } } })
        if (!current || (current.course.creatorId !== userId && userRole !== UserRole.ADMIN)) {
          throw new TaskExportPermissionError('无权限导出数据')
        }
      }
      await sendTaskExport(res, () => `${assignment!.title}_提交数据.xlsx`, '练习提交数据', async (append, checkConnected) => {
        // One bounded MVCC snapshot: concurrent edits/inserts never move or duplicate rows.
        // Spool only within the transaction; compression and download happen after release.
        await prisma.$transaction(async tx => {
          const snapshotMetadata = await tx.assignment.findUnique({ where: { id }, select: { title: true, questions: true, course: { select: { creatorId: true } } } })
          if (!snapshotMetadata || (snapshotMetadata.course.creatorId !== userId && userRole !== UserRole.ADMIN)) throw new TaskExportPermissionError('无权限导出数据')
          assignment = snapshotMetadata
          const questions: Question[] = (snapshotMetadata.questions as unknown as Question[]) || []
          let cursor: { time: Date; id: string } | undefined
          let rowCount = 0
          while (true) {
            checkConnected()
            const submissions = await tx.submission.findMany({
              where: { assignmentId: id, ...(cursor ? { OR: [
                  { submittedAt: { lt: cursor.time } },
                  { submittedAt: cursor.time, id: { lt: cursor.id } },
                ] } : {}) },
              take: EXPORT_BATCH_SIZE,
              select: {
                id: true,
                submittedAt: true,
                reviewedAt: true,
                status: true,
                comment: true,
                answers: true,
                content: true,
                student: {
                  select: {
                    nickname: true,
                    username: true,
                    phone: true,
                  }
                }
              },
              orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }]
            })
            if (!submissions.length) break



            const exportData = submissions.map((sub, index) => {
              const baseRecord: any = {
                '序号': rowCount + index + 1,
                '学员姓名': sub.student.nickname || sub.student.username,
                '手机号': sub.student.phone || '-',
                '提交时间': sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('zh-CN') : '-',
                '更新时间': sub.reviewedAt ? new Date(sub.reviewedAt).toLocaleString('zh-CN') : '-',
                '状态': sub.status === 'GRADED' ? '已批改' : (sub.status === 'SUBMITTED' ? '已提交' : '草稿'),
                '评语': sub.comment || '-',
              }

              // 添加题目作答
              const answers = (sub.answers as Record<string, string>) || {}
              questions.forEach((q, qIndex) => {
                baseRecord[`题${qIndex + 1}_题目`] = q.question

                // 正确判断题目类型
                if (q.type === 'single_choice') {
                  baseRecord[`题${qIndex + 1}_类型`] = '单选题'
                  const answer = answers[qIndex.toString()] || answers[q.id] || '未作答'
                  baseRecord[`题${qIndex + 1}_答案`] = answer
                } else if (q.type === 'multiple_choice') {
                  baseRecord[`题${qIndex + 1}_类型`] = '多选题'
                  const answer = answers[qIndex.toString()] || answers[q.id] || '未作答'
                  baseRecord[`题${qIndex + 1}_答案`] = answer
                } else if (q.type === 'text') {
                  baseRecord[`题${qIndex + 1}_类型`] = '主观题'
                  // 主观题从 answers 中获取答案
                  const answer = answers[qIndex.toString()] || answers[q.id] || '未作答'
                  baseRecord[`题${qIndex + 1}_答案`] = answer
                } else {
                  baseRecord[`题${qIndex + 1}_类型`] = '未知'
                  baseRecord[`题${qIndex + 1}_答案`] = '未作答'
                }
              })

              // 添加默认作答内容（content字段）
              const contentIndex = questions.length + 1
              baseRecord[`题${contentIndex}_题目`] = '作答内容'
              baseRecord[`题${contentIndex}_类型`] = '主观题'
              baseRecord[`题${contentIndex}_答案`] = sub.content || '未作答'

              return baseRecord
            })


            await append(exportData)
            rowCount += submissions.length
            const last = submissions[submissions.length - 1]
            cursor = { time: last.submittedAt, id: last.id }
            if (submissions.length < EXPORT_BATCH_SIZE) break
          }
        }, { isolationLevel: 'RepeatableRead', timeout: 5000, maxWait: 2000 })
      }, async () => {
        await refreshTaskExportAuthentication(req, res)
        userId = req.user?.userId
        userRole = req.user?.role
        await authorize(prisma)
      })
    } catch (err) {
      if (err instanceof TaskExportAuthenticationError) return
      logger.error('导出数据错误', err)
      if (res.headersSent || res.destroyed) {
        if (!res.destroyed) res.destroy()
        return
      }
      res.removeHeader('Content-Type')
      res.removeHeader('Content-Disposition')
      res.removeHeader('Content-Length')
      if (err instanceof TaskExportPermissionError) return forbidden(res, err.message)
      if (err instanceof TaskExportBusyError) return error(res, err.message, -1, 503)
      if (err instanceof TaskExportLimitError) return error(res, err.message, -1, 413)
      return error(res, '导出数据失败')
    }
  },

  // 获取我的提交（学生视角）
  async mySubmission(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      if (!userId) {
        return error(res, '未登录')
      }

      if (req.user?.role !== UserRole.STUDENT) {
        return forbidden(res, '仅学生可以查看自己的提交')
      }

      const assignment = await prisma.assignment.findUnique({
        where: { id },
        select: { courseId: true },
      })

      if (!assignment) {
        return notFound(res, '练习不存在')
      }

      if (!(await hasActiveCourseMembership(assignment.courseId, userId))) {
        return forbidden(res, '您不是该课程的学员')
      }

      const submission = await prisma.submission.findFirst({
        where: {
          assignmentId: id,
          studentId: userId
        }
      })

      return success(res, submission)
    } catch (err) {
      logger.error('获取我的提交错误', err)
      return error(res, '获取我的提交失败')
    }
  },

  // 获取我的练习（学生视角）
  async myAssignments(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      // 获取学生加入的所有课程ID
      const courseStudents = await prisma.courseStudent.findMany({
        where: {
          studentId: userId,
          status: { in: ['ACTIVE', 'APPROVED'] }
        },
        select: { courseId: true }
      })
      const courseIds = courseStudents.map(cs => cs.courseId)

      // 获取这些课程的已发布练习
      const assignments = await prisma.assignment.findMany({
        where: {
          courseId: { in: courseIds },
          status: AssignmentStatus.PUBLISHED
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              courseCode: true,
            }
          },
          submissions: {
            where: {
              studentId: userId
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      // 格式化返回数据
      const formattedAssignments = assignments.map(assignment => ({
        ...assignment,
        submitted: assignment.submissions.length > 0,
        mySubmission: assignment.submissions.length > 0 ? assignment.submissions[0] : undefined
      }))

      return success(res, {
        list: formattedAssignments,
        total: formattedAssignments.length,
      })
    } catch (err) {
      logger.error('获取我的练习错误', err)
      return error(res, '获取我的练习失败')
    }
  },

  // 获取练习标签列表
  async getTags(req: Request, res: Response) {
    try {
      const { userId, role: userRole } = req.user!

      if (!canReadLegacyContent(userRole)) return forbidden(res, '当前角色不能访问旧内容标签')

      let where: any = {}

      // 教师只能看自己创建的练习标签
      if (userRole === UserRole.TEACHER) {
        where.course = { creatorId: userId }
      }

      where.course = { ...where.course, courseType: { not: 'CAMPUS_ACTIVITY' } }
      const assignments = await prisma.assignment.findMany({
        where,
        select: { tags: true }
      })

      const allTags = [...new Set(assignments.flatMap(a => a.tags))]

      return success(res, { tags: allTags })
    } catch (err) {
      logger.error('获取练习标签错误', err)
      return error(res, '获取练习标签失败')
    }
  }
}
