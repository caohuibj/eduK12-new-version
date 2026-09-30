import { readTemporaryUpload, acceptedImageTypes } from '../middleware/uploadAdmission'
import { createTemporaryUploadStorage } from '../utils/uploadTemp'
import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound, unauthorized } from '../utils/response'
import { UserRole, CourseStudentStatus } from '../types'
import { logger } from '../utils/logger'
import { Messages } from '../constants'
import { getPaginationParams, buildPaginatedResult } from '../utils/pagination'
import { z } from 'zod'
import multer from 'multer'
import { canAccessCourseContent, hasActiveCourseMembership } from '../utils/courseAccess'
import {
  AssetDatabase,
  AssetReferenceValidationError,
  attachAssetReference,
  discardUnreferencedAsset,
  getSignedAssetUrl,
  hydrateAssetReferences,
  storeAsset,
  syncAssetReferences,
  validateAssetReferencesForCourse,
} from '../services/assetStorage'
import { config } from '../config'
import { detectMimeType } from '../utils/fileValidator'
import { createAttachmentSchema, isLegacyUploadReference } from '../utils/attachmentSchema'
import { MAX_TOKEN_USES } from '../constants'
import { hashIdempotencyKey, hashIdempotencyPayload } from '../utils/idempotency'
import {
  checkinSubmissionSnapshot,
  createCheckinIdempotencyReceipt,
  findCheckinIdempotencyReceipt,
} from '../utils/submissionIdempotency'

const attachmentSchema = createAttachmentSchema(config.legacyUploadsEnabled)
const attachmentsSchema = z.array(attachmentSchema).max(100)

const createCheckinSchema = z.object({
  courseId: z.string().min(1, '课程ID不能为空'),
  title: z.string().min(1, '打卡标题不能为空'),
  description: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string().max(20)).max(10).optional(),
  videos: attachmentsSchema.optional().nullable().default([]),
  images: attachmentsSchema.optional().nullable().default([]),
  documents: attachmentsSchema.optional().nullable().default([]),
  endTime: z.union([z.string(), z.null()]).optional(),
  allowViewOthers: z.boolean().optional().default(false),
})

const updateCheckinSchema = z.object({
  title: z.string().min(1, '打卡标题不能为空').optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string().max(20)).max(10).optional(),
  videos: attachmentsSchema.optional().nullable(),
  images: attachmentsSchema.optional().nullable(),
  documents: attachmentsSchema.optional().nullable(),
  endTime: z.union([z.string(), z.null()]).optional(),
  allowViewOthers: z.boolean().optional(),
})

const parseCheckinEndTime = (value: string | null | undefined): Date | null | undefined => {
  if (value === undefined) return undefined
  if (value === null || value.trim() === '') {
    if (value === '') throw new Error('截止时间格式无效')
    return null
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw new Error('截止时间格式无效')
  return parsed
}

const submissionImageSchema = config.legacyUploadsEnabled
  ? z.union([
    z.object({ assetId: z.string().min(1).max(100) }).strict(),
    z.string().min(1).max(2048).refine(isLegacyUploadReference, '图片引用无效'),
  ])
  : z.object({ assetId: z.string().min(1).max(100) }).strict()

const utf8ByteLimitedString = (limit: number, message: string) => z.string().refine(
  (value) => Buffer.byteLength(value, 'utf8') <= limit,
  { message },
)

const submitCheckinSchema = z.object({
  content: utf8ByteLimitedString(200_000, '提交内容不能超过200KB').optional(),
  tags: z.array(z.string().max(20)).max(10).optional(),
  // During the asset migration, accept only old local upload references or a
  // server-issued asset capability. Client-supplied URLs are never trusted.
  images: z.array(submissionImageSchema).max(9).optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
})

const createCheckinTokenSchema = z.object({
  expiresAt: z.string().datetime('有效期格式无效'),
  maxUses: z.number().int().min(0).max(MAX_TOKEN_USES).default(0),
}).strict()

const checkinSubmissionPayload = (submission: { content?: unknown; images?: unknown }) => ({
  content: submission.content ?? null,
  images: submission.images ?? [],
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

/** See the assignment submit controller for the OCC compatibility rules. */
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

type SubmissionAssetImage = { assetId: string }

const isSubmissionAssetImage = (value: unknown): value is SubmissionAssetImage => (
  !!value && typeof value === 'object' && typeof (value as SubmissionAssetImage).assetId === 'string'
)

const validateStudentSubmissionImages = async (
  images: Array<string | SubmissionAssetImage> | undefined,
  courseId: string,
  studentId: string,
) => {
  const values = images || []
  const assetImages = values.filter(isSubmissionAssetImage)
  const assetIds = assetImages.map((image) => image.assetId)

  if (new Set(assetIds).size !== assetIds.length) return null
  if (!assetIds.length) {
    if (!config.legacyUploadsEnabled && values.some((image) => typeof image === 'string')) return null
    return values
  }

  const assets = await prisma.storedAsset.findMany({
    where: {
      id: { in: assetIds },
      ownerId: studentId,
      accessScope: 'COURSE',
      scopeId: courseId,
      mimeType: { startsWith: 'image/' },
      deletedAt: null,
    },
    select: { id: true },
  })

  if (assets.length !== assetIds.length) return null
  if (!config.legacyUploadsEnabled && values.some((image) => typeof image === 'string')) return null
  return values
}

const publicSubmissionImageSchema = z.object({
  assetId: z.string().min(1).max(100),
}).strict()

export const STUDENT_UPLOAD_REFERENCE_ENTITY = 'CheckinStudentUploadSession'
export const STUDENT_UPLOAD_PENDING_ENTITY = 'CheckinStudentUploadPending'
export const PUBLIC_UPLOAD_REFERENCE_ENTITY = 'CheckinUploadSession'
export const PUBLIC_UPLOAD_REFERENCE_FIELD = 'staging'
export const MAX_PUBLIC_UPLOAD_IMAGES_PER_SESSION = 9
export const PUBLIC_UPLOAD_STAGING_TTL_MS = 24 * 60 * 60 * 1000

const publicSessionIdSchema = z.string().regex(/^session_[a-z0-9]{16}$/, '会话标识无效')

const publicSubmissionSchema = z.object({
  content: utf8ByteLimitedString(1000, '提交内容不能超过1KB').optional(),
  images: z.array(publicSubmissionImageSchema).max(MAX_PUBLIC_UPLOAD_IMAGES_PER_SESSION).optional().default([]),
  sessionId: publicSessionIdSchema,
})

export const publicUploadStagingEntityId = (checkinId: string, sessionId: string): string => `${checkinId}:${sessionId}`

export class PublicUploadSessionLimitError extends Error {
  constructor() {
    super(`每个匿名签到会话最多上传${MAX_PUBLIC_UPLOAD_IMAGES_PER_SESSION}张图片`)
    this.name = 'PublicUploadSessionLimitError'
  }
}

export class PublicUploadSessionAlreadySubmittedError extends Error {
  constructor() {
    super('该签到会话已经提交')
    this.name = 'PublicUploadSessionAlreadySubmittedError'
  }
}

/** Serialize every upload and submit transition for one anonymous session. */
export const withPublicUploadSessionLock = async <T>(
  db: AssetDatabase,
  checkinId: string,
  sessionId: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const stagingEntityId = publicUploadStagingEntityId(checkinId, sessionId)
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${stagingEntityId}))`
  return operation()
}

export async function stageStudentUploadAsset(db: AssetDatabase, checkinId: string, userId: string, assetId: string): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkin-submission:${checkinId}:${userId}`}))`
  const entityId = `${checkinId}:${userId}`
  const count = await db.assetReference.count({ where: { entityType: STUDENT_UPLOAD_REFERENCE_ENTITY, entityId } })
  if (count >= 9) throw new PublicUploadSessionLimitError()
  await attachAssetReference({ assetId, entityType: STUDENT_UPLOAD_REFERENCE_ENTITY, entityId, field: 'staging' }, db)
  await db.assetReference.deleteMany({ where: { assetId, entityType: STUDENT_UPLOAD_PENDING_ENTITY, entityId } })
}

let lastPublicUploadCleanupAt = 0

/** Remove abandoned anonymous upload references and their unreferenced blobs. */
export const cleanupStalePublicUploadAssets = async (): Promise<void> => {
  const now = Date.now()
  if (now - lastPublicUploadCleanupAt < 5 * 60 * 1000) return
  lastPublicUploadCleanupAt = now

  const cutoff = new Date(now - PUBLIC_UPLOAD_STAGING_TTL_MS)
  const staleReferences = await prisma.assetReference.findMany({
    where: { entityType: { in: [PUBLIC_UPLOAD_REFERENCE_ENTITY, STUDENT_UPLOAD_REFERENCE_ENTITY, STUDENT_UPLOAD_PENDING_ENTITY] }, createdAt: { lt: cutoff } },
    select: { id: true, asset: { select: { id: true, objectKey: true, provider: true } } },
    orderBy: { createdAt: 'asc' }, take: 100,
  })
  if (staleReferences.length) {
    await prisma.assetReference.deleteMany({ where: { id: { in: staleReferences.map(row => row.id) }, createdAt: { lt: cutoff } } })
    for (const row of staleReferences) await discardUnreferencedAsset(row.asset)
  }
  const staleAssets = await prisma.storedAsset.findMany({
    where: { accessScope: 'PUBLIC_CHECKIN', deletedAt: null, createdAt: { lt: cutoff }, references: { none: {} } },
    select: { id: true, objectKey: true, provider: true }, orderBy: { createdAt: 'asc' }, take: 100,
  })
  for (const asset of staleAssets) await discardUnreferencedAsset(asset)
}

const runPublicUploadCleanup = async (): Promise<void> => {
  try {
    await cleanupStalePublicUploadAssets()
  } catch (cleanupError) {
    // Cleanup is best effort and must not make a valid upload unavailable.
    logger.warn('匿名上传暂存清理失败', { errorType: cleanupError instanceof Error ? cleanupError.name : 'unknown' })
  }
}

export const validatePublicSubmissionImages = async (
  images: unknown,
  checkinId: string,
  sessionId: string,
  db: AssetDatabase = prisma,
) => {
  const result = z.array(publicSubmissionImageSchema).max(MAX_PUBLIC_UPLOAD_IMAGES_PER_SESSION).safeParse(images || [])
  if (!result.success) return null

  const assetIds = [...new Set(result.data.map((item) => item.assetId))]
  if (assetIds.length !== result.data.length) return null
  if (!assetIds.length) return result.data

  const stagingEntityId = publicUploadStagingEntityId(checkinId, sessionId)

  const assets = await db.storedAsset.findMany({
    where: {
      id: { in: assetIds },
      accessScope: 'PUBLIC_CHECKIN',
      scopeId: checkinId,
      deletedAt: null,
      references: {
        some: {
          entityType: PUBLIC_UPLOAD_REFERENCE_ENTITY,
          entityId: stagingEntityId,
          field: PUBLIC_UPLOAD_REFERENCE_FIELD,
        },
      },
    },
    select: { id: true },
  })
  return assets.length === assetIds.length ? result.data : null
}

export const stagePublicUploadAsset = async (params: {
  assetId: string
  checkinId: string
  sessionId: string
  db: AssetDatabase
}): Promise<void> => {
  const { assetId, checkinId, sessionId, db } = params
  const stagingEntityId = publicUploadStagingEntityId(checkinId, sessionId)

  await withPublicUploadSessionLock(db, checkinId, sessionId, async () => {
    const existingSubmission = await db.checkinSubmission.findUnique({
      where: {
        checkinId_sessionId: {
          checkinId,
          sessionId,
        },
      },
      select: { id: true },
    })
    if (existingSubmission) throw new PublicUploadSessionAlreadySubmittedError()

    const stagedCount = await db.assetReference.count({
      where: {
        entityType: PUBLIC_UPLOAD_REFERENCE_ENTITY,
        entityId: stagingEntityId,
        field: PUBLIC_UPLOAD_REFERENCE_FIELD,
      },
    })
    if (stagedCount >= MAX_PUBLIC_UPLOAD_IMAGES_PER_SESSION) {
      throw new PublicUploadSessionLimitError()
    }

    await attachAssetReference({
      assetId,
      entityType: PUBLIC_UPLOAD_REFERENCE_ENTITY,
      entityId: stagingEntityId,
      field: PUBLIC_UPLOAD_REFERENCE_FIELD,
    }, db)
  })
}

const syncSubmissionAssetReferences = async (
  submissionId: string,
  images: Array<string | SubmissionAssetImage>,
  db: AssetDatabase = prisma,
) => {
  const desired = images
    .filter(isSubmissionAssetImage)
    .map((image) => ({ assetId: image.assetId, field: 'images' }))
  const existing = typeof db.assetReference.findMany === 'function'
    ? (await db.assetReference.findMany({
      where: { entityType: 'CheckinSubmission', entityId: submissionId, field: 'images' },
      select: { assetId: true, field: true },
    }) || [])
    : []
  const desiredKeys = new Set(desired.map((reference) => `${reference.assetId}:${reference.field}`))
  const staleAssetIds = existing
    .filter((reference: { assetId: string; field: string }) => !desiredKeys.has(`${reference.assetId}:${reference.field}`))
    .map((reference: { assetId: string }) => reference.assetId)

  if (staleAssetIds.length > 0) {
    await db.assetReference.deleteMany({
      where: {
        entityType: 'CheckinSubmission',
        entityId: submissionId,
        field: 'images',
        assetId: { in: staleAssetIds },
      },
    })
  }

  const existingKeys = new Set(existing.map((reference: { assetId: string; field: string }) => `${reference.assetId}:${reference.field}`))
  await Promise.all(
    desired
      .filter((reference) => !existingKeys.has(`${reference.assetId}:${reference.field}`))
      .map((reference) => attachAssetReference({
        assetId: reference.assetId,
        entityType: 'CheckinSubmission',
        entityId: submissionId,
        field: reference.field,
      }, db)),
  )
}

const publicImageUpload = multer({
  storage: createTemporaryUploadStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, files: 1, fields: 10, fieldSize: 16 * 1024, parts: 11, // 10MB
  },
  // Client MIME is only a hint; detectAcceptedImageMimeType validates bytes.
  fileFilter: (_req, _file, cb) => cb(null, true),
})

const acceptedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const detectAcceptedImageMimeType = (file: { buffer: Buffer }): string | null => {
  const detected = detectMimeType(file.buffer.subarray(0, 16))
  return detected && acceptedImageMimeTypes.has(detected) ? detected : null
}

// Upload staging stays private until an authorized StoredAsset is created.
export const submissionImageUpload = publicImageUpload

export const checkinController = {
  // 获取打卡列表（添加分页优化）
  async list(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
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

      // 学生只能看到自己已加入课程中的打卡
      if (userRole === UserRole.STUDENT) {
        where.course = {
          students: {
            some: {
              studentId: userId,
              status: { in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED] },
            },
          },
        }
      }

      // 教师只能看到自己课程的打卡，管理员可以看到所有
      if (userRole === UserRole.TEACHER) {
        // 获取教师的所有课程ID
        const teacherCourses = await prisma.course.findMany({
          where: { creatorId: userId },
          select: { id: true }
        })
        const courseIds = teacherCourses.map(c => c.id)
        
        // 如果指定了courseId，检查是否属于该教师
        if (courseId) {
          if (!courseIds.includes(courseId as string)) {
            return success(res, buildPaginatedResult([], 0, pagination))
          }
        } else {
          // 未指定courseId，只看自己课程的打卡
          where.courseId = { in: courseIds }
        }
      }

      // 并行查询数据和总数
      const [checkins, total] = await Promise.all([
        prisma.checkin.findMany({
          where,
          include: {
            course: {
              select: {
                id: true,
                title: true,
              }
            },
            creator: {
              select: {
                id: true,
                nickname: true,
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
        prisma.checkin.count({ where })
      ])

      const hydratedCheckins = await Promise.all(
        checkins.map((checkin) => hydrateAssetReferences(checkin, false, {
          entityType: 'Checkin',
          entityId: checkin.id,
          courseId: checkin.courseId,
          parentAccess: true,
        })),
      )
      return success(res, buildPaginatedResult(hydratedCheckins, total, pagination))
    } catch (err) {
      logger.error('获取打卡列表错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 创建打卡
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const result = createCheckinSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { courseId, title, description, content, videos, images, documents, endTime, allowViewOthers, tags } = result.data
      let parsedEndTime: Date | null = null
      try {
        parsedEndTime = parseCheckinEndTime(endTime) || null
      } catch (endTimeError) {
        return error(res, endTimeError instanceof Error ? endTimeError.message : '截止时间格式无效')
      }

      // 检查课程
      const course = await prisma.course.findUnique({
        where: { id: courseId }
      })

      if (!course) {
        return error(res, '课程不存在')
      }

      // 权限检查
      if (course.creatorId !== userId && req.user?.role !== UserRole.ADMIN) {
        return forbidden(res, '无权限在此课程创建打卡')
      }

      const assetValues = {
        videos: videos || [],
        images: images || [],
        documents: documents || [],
      }
      const checkin = await prisma.$transaction(async (tx) => {
        await validateAssetReferencesForCourse({
          values: assetValues,
          courseId,
          ownerId: userId,
          role: req.user?.role,
          db: tx,
        })

        const created = await tx.checkin.create({
          data: {
            courseId,
            title,
            description,
            content,
            videos: videos as any,
            images: images as any,
            documents: documents as any,
            endTime: parsedEndTime,
            allowViewOthers: allowViewOthers ?? false,
            tags: tags ?? [],
            creatorId: userId,
          },
          include: {
            course: {
              select: {
                id: true,
                title: true,
              }
            },
            creator: {
              select: {
                id: true,
                nickname: true,
              }
            },
            _count: {
              select: {
                submissions: true
              }
            }
          }
        })
        await syncAssetReferences({
          entityType: 'Checkin',
          entityId: created.id,
          values: assetValues,
          db: tx,
        })
        return created
      })

      return success(res, await hydrateAssetReferences(checkin, false, {
        entityType: 'Checkin',
        entityId: checkin.id,
        courseId,
        parentAccess: true,
      }), '打卡创建成功')
    } catch (err) {
      if (err instanceof AssetReferenceValidationError) {
        return error(res, err.message)
      }
      logger.error('创建打卡错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取打卡详情
  async detail(req: Request, res: Response) {
    try {
      const { id } = req.params

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              creatorId: true,
              shares: {
                select: { sharedTo: true },
              },
            }
          },
          creator: {
            select: {
              id: true,
              nickname: true,
            }
          },
        }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      if (req.user?.role === UserRole.STUDENT) {
        if (!req.user.userId || !(await hasActiveCourseMembership(checkin.course.id, req.user.userId))) {
          return forbidden(res, '您不是该课程的学员')
        }
      } else if (!canAccessCourseContent(checkin.course, req.user?.userId, req.user?.role)) {
        return forbidden(res, '您没有权限访问此打卡')
      }

      const { course: courseWithAccess, ...checkinData } = checkin
      const { shares: _shares, ...course } = courseWithAccess
      const hydrated = await hydrateAssetReferences({ ...checkinData, course }, false, {
        entityType: 'Checkin',
        entityId: checkin.id,
        courseId: checkin.course.id,
        parentAccess: true,
      })
      return success(res, hydrated)
    } catch (err) {
      logger.error('获取打卡详情错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 更新打卡
  async update(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const result = updateCheckinSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              creatorId: true,
            }
          }
        }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 权限检查
      if (checkin.creatorId !== userId && checkin.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此打卡')
      }

      const { title, description, content, videos, images, documents, endTime, allowViewOthers, tags } = result.data
      let parsedEndTime: Date | null | undefined
      try {
        parsedEndTime = parseCheckinEndTime(endTime)
      } catch (endTimeError) {
        return error(res, endTimeError instanceof Error ? endTimeError.message : '截止时间格式无效')
      }

      const assetValues = {
        videos: videos === undefined ? checkin.videos : videos || [],
        images: images === undefined ? checkin.images : images || [],
        documents: documents === undefined ? checkin.documents : documents || [],
      }
      const updatedCheckin = await prisma.$transaction(async (tx) => {
        await validateAssetReferencesForCourse({
          values: assetValues,
          courseId: checkin.courseId,
          ownerId: userId!,
          role: userRole,
          db: tx,
        })

        const saved = await tx.checkin.update({
          where: { id },
          data: {
            title,
            description,
            content,
            videos: videos === undefined ? undefined : videos as any,
            images: images === undefined ? undefined : images as any,
            documents: documents === undefined ? undefined : documents as any,
            endTime: parsedEndTime,
            allowViewOthers,
            tags: tags === undefined ? undefined : tags,
          },
          include: {
            course: {
              select: {
                id: true,
                title: true,
              }
            },
            creator: {
              select: {
                id: true,
                nickname: true,
              }
            },
            _count: {
              select: {
                submissions: true
              }
            }
          }
        })
        await syncAssetReferences({
          entityType: 'Checkin',
          entityId: id,
          values: assetValues,
          db: tx,
        })
        return saved
      })

      return success(res, await hydrateAssetReferences(updatedCheckin, false, {
        entityType: 'Checkin',
        entityId: id,
        courseId: checkin.courseId,
        parentAccess: true,
      }), '打卡更新成功')
    } catch (err) {
      if (err instanceof AssetReferenceValidationError) {
        return error(res, err.message)
      }
      logger.error('更新打卡错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 删除打卡
  async delete(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              creatorId: true,
            }
          }
        }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 权限检查
      if (checkin.creatorId !== userId && checkin.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限删除此打卡')
      }

      await prisma.$transaction(async (tx) => {
        await tx.assetReference.deleteMany({
          where: { entityType: 'Checkin', entityId: id },
        })
        const submissions = await tx.checkinSubmission.findMany({
          where: { checkinId: id },
          select: { id: true },
        })
        if (submissions.length) {
          await tx.assetReference.deleteMany({
            where: {
              entityType: 'CheckinSubmission',
              entityId: { in: submissions.map((submission) => submission.id) },
            },
          })
        }
        await tx.checkin.delete({ where: { id } })
      })

      return success(res, null, '打卡已删除')
    } catch (err) {
      logger.error('删除打卡错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 提交打卡
  async submit(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const { id } = req.params

      const result = submitCheckinSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { content, images, expectedRevision } = result.data
      const requestedImages = images || []
      let idempotencyKeyHash: string | undefined
      try {
        idempotencyKeyHash = hashIdempotencyKey(typeof req.header === 'function' ? req.header('Idempotency-Key') : undefined)
      } catch (idempotencyError) {
        return error(res, idempotencyError instanceof Error ? idempotencyError.message : 'Idempotency-Key 无效')
      }
      const idempotencyPayloadHash = idempotencyKeyHash
        ? hashIdempotencyPayload(checkinSubmissionPayload({ content, images: requestedImages }))
        : undefined

      // 检查打卡
      const checkin = await prisma.checkin.findUnique({
        where: { id }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      if (req.user?.role !== UserRole.STUDENT || !(await hasActiveCourseMembership(checkin.courseId, userId))) {
        return forbidden(res, '您不是该课程的学员')
      }

      // Replay an already committed idempotent request even if the retry
      // arrives after the check-in deadline. A new payload still goes through
      // the normal expiry and asset validation below.
      if (idempotencyKeyHash) {
        const committedReceipt = await findCheckinIdempotencyReceipt(
          prisma,
          id,
          userId,
          idempotencyKeyHash,
        )
        if (committedReceipt) {
          if (committedReceipt.idempotencyPayloadHash !== idempotencyPayloadHash) {
            return error(res, 'Idempotency-Key 已用于其他提交内容', -1, 409)
          }
          const receiptResponse = committedReceipt.response as Record<string, any>
          return success(res, await hydrateAssetReferences(receiptResponse, false, {
            entityType: 'CheckinSubmission',
            entityId: receiptResponse.id,
            courseId: checkin.courseId,
            checkinId: id,
            parentAccess: true,
          }), '打卡成功')
        }

        const committedRetry = await prisma.checkinSubmission.findFirst({
          where: { checkinId: id, studentId: userId, idempotencyKeyHash },
        })
        if (committedRetry) {
          const committedPayloadHash = committedRetry.idempotencyPayloadHash
            || hashIdempotencyPayload(checkinSubmissionPayload(committedRetry))
          if (committedPayloadHash !== idempotencyPayloadHash) {
            return error(res, 'Idempotency-Key 已用于其他提交内容', -1, 409)
          }
          return success(res, await hydrateAssetReferences(committedRetry, false, {
            entityType: 'CheckinSubmission',
            entityId: committedRetry.id,
            courseId: checkin.courseId,
            checkinId: id,
            parentAccess: true,
          }), '打卡成功')
        }
      }

      if (checkin.endTime && new Date() > checkin.endTime) {
        return error(res, Messages.CHECKIN.EXPIRED)
      }

      const validatedImages = await validateStudentSubmissionImages(requestedImages, checkin.courseId, userId)
      if (!validatedImages) {
        return error(res, '图片凭据无效或不属于当前课程')
      }

      const submission = await prisma.$transaction(async (tx) => {
        if (typeof (tx as any).$executeRaw === 'function') {
          await (tx as any).$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkin-submission:${id}:${userId}`}))`
        }

        // Re-check the immutable receipt after acquiring the per-student
        // transaction lock so an older delayed key can only replay its
        // original payload, never overwrite a newer submission.
        if (idempotencyKeyHash) {
          const committedReceipt = await findCheckinIdempotencyReceipt(
            tx,
            id,
            userId,
            idempotencyKeyHash,
          )
          if (committedReceipt) {
            if (committedReceipt.idempotencyPayloadHash !== idempotencyPayloadHash) {
              throw new IdempotencyPayloadMismatchError()
            }
            return { saved: committedReceipt.response, wasExisting: true, replayed: true }
          }
        }

        const existing = typeof tx.checkinSubmission.findUnique === 'function'
          ? await tx.checkinSubmission.findUnique({
            where: { checkinId_studentId: { checkinId: id, studentId: userId } },
          })
          : await tx.checkinSubmission.findFirst({ where: { checkinId: id, studentId: userId } })
        if (idempotencyKeyHash && existing?.idempotencyKeyHash === idempotencyKeyHash) {
          const existingPayloadHash = existing.idempotencyPayloadHash
            || hashIdempotencyPayload(checkinSubmissionPayload(existing))
          if (existingPayloadHash !== idempotencyPayloadHash) {
            throw new IdempotencyPayloadMismatchError()
          }
          if (idempotencyKeyHash && idempotencyPayloadHash) {
            await createCheckinIdempotencyReceipt(tx, {
              checkinId: id,
              studentId: userId,
              submissionId: existing.id,
              idempotencyKeyHash,
              idempotencyPayloadHash,
              response: checkinSubmissionSnapshot(existing),
            })
          }
          return { saved: existing, wasExisting: true }
        }
        if (!existing) {
          const requestedRevision = expectedRevision ?? (idempotencyKeyHash ? 0 : undefined)
          if (requestedRevision !== undefined && requestedRevision !== 0) {
            throw new SubmissionRevisionConflictError()
          }
        } else {
          // The advisory transaction lock serializes writers; compare the
          // client-observed revision while holding it so a late first request
          // cannot overwrite a newer keyed check-in with no receipt yet.
          assertSubmissionRevision(existing, expectedRevision, Boolean(idempotencyKeyHash))
        }
        const saved = existing
          ? await tx.checkinSubmission.update({
            where: { id: existing.id },
            data: {
              content,
              images: validatedImages,
              revision: { increment: 1 },
              ...(idempotencyKeyHash
                ? { idempotencyKeyHash, idempotencyPayloadHash }
                : { idempotencyKeyHash: null, idempotencyPayloadHash: null }),
            },
          })
          : await tx.checkinSubmission.create({
            data: {
              checkinId: id,
              studentId: userId,
              revision: 1,
              content,
              images: validatedImages,
              ...(idempotencyKeyHash ? { idempotencyKeyHash, idempotencyPayloadHash } : {}),
            },
        })
        await syncSubmissionAssetReferences(saved.id, validatedImages, tx)
        await tx.assetReference.deleteMany({ where: {
          entityType: STUDENT_UPLOAD_REFERENCE_ENTITY, entityId: `${id}:${userId}`,
          assetId: { in: validatedImages.filter(isSubmissionAssetImage).map(image => image.assetId) },
        } })
        if (idempotencyKeyHash && idempotencyPayloadHash) {
          await createCheckinIdempotencyReceipt(tx, {
            checkinId: id,
            studentId: userId,
            submissionId: saved.id,
            idempotencyKeyHash,
            idempotencyPayloadHash,
            response: checkinSubmissionSnapshot(saved),
          })
        }
        return { saved, wasExisting: Boolean(existing) }
      })

      return success(res, await hydrateAssetReferences(submission.saved, false, {
        entityType: 'CheckinSubmission',
        entityId: submission.saved.id,
        courseId: checkin.courseId,
        checkinId: id,
        parentAccess: true,
      }), submission.replayed ? '打卡成功' : submission.wasExisting ? '打卡更新成功' : '打卡成功')
    } catch (err) {
      if (err instanceof IdempotencyPayloadMismatchError) {
        return error(res, err.message, -1, 409)
      }
      if (err instanceof SubmissionRevisionConflictError) {
        return error(res, err.message, -1, 409)
      }
      logger.error('提交打卡错误', err)
      // The transaction may already be committed when response hydration or
      // signing fails. Return a 5xx so the client retains its key and retries
      // the same payload instead of generating a new write.
      return error(res, Messages.COMMON.FAILED, -1, 500)
    }
  },

  // 学生提交打卡图片。文件先写入私有资产存储，提交接口会再次校验资产归属。
  async uploadStudentSubmissionImage(req: Request, res: Response) {
    let uploadedAsset: Awaited<ReturnType<typeof storeAsset>> | undefined
    try {
      const userId = req.user?.userId
      const { id } = req.params
      if (!userId || req.user?.role !== UserRole.STUDENT) {
        return forbidden(res, '仅学生可以上传打卡图片')
      }

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        select: { courseId: true, endTime: true },
      })
      if (!checkin) return notFound(res, '打卡不存在')
      if (!(await hasActiveCourseMembership(checkin.courseId, userId))) {
        return forbidden(res, '您不是该课程的学员')
      }
      if (checkin.endTime && new Date() > checkin.endTime) {
        return error(res, Messages.CHECKIN.EXPIRED)
      }

      const file = req.file
      if (!file) return error(res, '请选择图片文件')
      const detectedMimeType = detectAcceptedImageMimeType(file)
      if (!detectedMimeType) return error(res, '图片内容类型无效')

      await runPublicUploadCleanup()
      const asset = await storeAsset({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: detectedMimeType,
        ownerId: userId,
        accessScope: 'COURSE',
        scopeId: checkin.courseId,
        initialReference: { entityType: STUDENT_UPLOAD_PENDING_ENTITY, entityId: `${id}:${userId}`, field: 'pending' },
      })
      uploadedAsset = asset
      await prisma.$transaction(tx => stageStudentUploadAsset(tx, id, userId, asset.id))
      const url = await getSignedAssetUrl(asset.id)
      if (!url) throw new Error('图片上传失败')

      logger.info('学生上传打卡图片', {
        assetId: asset.id,
        checkinId: id,
      })
      return success(res, {
        assetId: asset.id,
        url,
        size: asset.sizeBytes,
      }, '上传成功')
    } catch (err) {
      if (uploadedAsset) {
        await prisma.assetReference.deleteMany({ where: { assetId: uploadedAsset.id, entityType: { in: [STUDENT_UPLOAD_REFERENCE_ENTITY, STUDENT_UPLOAD_PENDING_ENTITY] } } }).catch(() => undefined)
        await discardUnreferencedAsset(uploadedAsset).catch(() => undefined)
      }
      if (err instanceof PublicUploadSessionLimitError) return error(res, '每个打卡最多暂存9张图片', -1, 409)
      logger.error('学生上传打卡图片错误', err)
      return error(res, '上传失败')
    }
  },

  // 获取我的打卡提交（学生视角）
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

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        select: { courseId: true },
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      if (!(await hasActiveCourseMembership(checkin.courseId, userId))) {
        return forbidden(res, '您不是该课程的学员')
      }

      const submission = await prisma.checkinSubmission.findFirst({
        where: {
          checkinId: id,
          studentId: userId
        }
      })

      return success(res, submission ? await hydrateAssetReferences(submission, false, {
        entityType: 'CheckinSubmission',
        entityId: submission.id,
        courseId: checkin.courseId,
        checkinId: id,
        parentAccess: true,
      }) : null)
    } catch (err) {
      logger.error('获取我的打卡提交错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取我的打卡（学生视角）
  async myCheckins(req: Request, res: Response) {
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

      // 获取这些课程的所有打卡
      const checkins = await prisma.checkin.findMany({
        where: {
          courseId: { in: courseIds }
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
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
      const formattedCheckins = checkins.map(checkin => ({
        ...checkin,
        submission: checkin.submissions.length > 0 ? checkin.submissions[0] : undefined
      }))

      const hydratedCheckins = await Promise.all(formattedCheckins.map(async (checkin) => {
        const hydrated = await hydrateAssetReferences(checkin, false, {
          entityType: 'Checkin',
          entityId: checkin.id,
          courseId: checkin.courseId,
          parentAccess: true,
        })
        if (!checkin.submission) return hydrated
        const hydratedSubmission = await hydrateAssetReferences(checkin.submission, false, {
          entityType: 'CheckinSubmission',
          entityId: checkin.submission.id,
          courseId: checkin.courseId,
          checkinId: checkin.id,
          parentAccess: true,
        })
        return { ...(hydrated as Record<string, unknown>), submission: hydratedSubmission }
      }))

      return success(res, {
        list: hydratedCheckins,
        total: hydratedCheckins.length,
      })
    } catch (err) {
      logger.error('获取我的打卡错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取打卡所有提交（教师用）
  async submissions(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              creatorId: true,
            }
          }
        }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 权限检查
      if (checkin.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限查看此打卡的提交')
      }

      const submissions = await prisma.checkinSubmission.findMany({
        where: { checkinId: id },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatarUrl: true,
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      // 格式化返回数据，确保 images 是字符串数组
      const hydratedSubmissions = await Promise.all(
        submissions.map((submission) => hydrateAssetReferences(submission, false, {
          entityType: 'CheckinSubmission',
          entityId: submission.id,
          courseId: checkin.courseId,
          checkinId: id,
          parentAccess: true,
        })),
      )
      const formattedSubmissions = (hydratedSubmissions as any[]).map(sub => {
        let imageUrls: string[] = []
        if (sub.images) {
          // 处理可能的多种格式：字符串数组、对象数组、JSON字符串
          if (Array.isArray(sub.images)) {
            imageUrls = sub.images.map((img: any) => {
              if (typeof img === 'string') {
                return img
              }
              if (img && typeof img === 'object' && typeof img.url === 'string') {
                return img.url
              }
              return ''
            }).filter(Boolean)
          } else if (typeof sub.images === 'string') {
            try {
              const parsed = JSON.parse(sub.images)
              if (Array.isArray(parsed)) {
                imageUrls = parsed.map((img: any) => {
                  if (typeof img === 'string') return img
                  if (img && typeof img.url === 'string') return img.url
                  return ''
                }).filter(Boolean)
              }
            } catch {
              // 如果不是JSON，当作单个URL处理
              imageUrls = [sub.images]
            }
          }
        }
        return {
          ...sub,
          images: imageUrls,
        }
      })

      return success(res, {
        list: formattedSubmissions,
        total: submissions.length,
      })
    } catch (err) {
      logger.error('获取打卡提交列表错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取其他学生的打卡提交（学生用，当 allowViewOthers 为 true 时）
  async othersSubmissions(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id } = req.params

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            }
          }
        }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      if (!userId || !(await hasActiveCourseMembership(checkin.course.id, userId))) {
        return forbidden(res, '您不是该课程的学员')
      }

      // 检查是否允许查看他人打卡
      if (!checkin.allowViewOthers) {
        return forbidden(res, '该打卡不允许查看他人提交')
      }

      // 获取其他学生的提交（排除自己）
      const submissions = await prisma.checkinSubmission.findMany({
        where: { 
          checkinId: id,
          studentId: { not: userId }
        },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatarUrl: true,
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      // 格式化返回数据，确保 images 是字符串数组
      const hydratedSubmissions = await Promise.all(
        submissions.map((submission) => hydrateAssetReferences(submission, false, {
          entityType: 'CheckinSubmission',
          entityId: submission.id,
          courseId: checkin.course.id,
          checkinId: id,
          parentAccess: true,
        })),
      )
      const formattedSubmissions = (hydratedSubmissions as any[]).map(sub => {
        let imageUrls: string[] = []
        if (sub.images) {
          // 处理可能的多种格式：字符串数组、对象数组、JSON字符串
          if (Array.isArray(sub.images)) {
            imageUrls = sub.images.map((img: any) => {
              if (typeof img === 'string') {
                return img
              }
              if (img && typeof img === 'object' && typeof img.url === 'string') {
                return img.url
              }
              return ''
            }).filter(Boolean)
          } else if (typeof sub.images === 'string') {
            try {
              const parsed = JSON.parse(sub.images)
              if (Array.isArray(parsed)) {
                imageUrls = parsed.map((img: any) => {
                  if (typeof img === 'string') return img
                  if (img && typeof img.url === 'string') return img.url
                  return ''
                }).filter(Boolean)
              }
            } catch {
              // 如果不是JSON，当作单个URL处理
              imageUrls = [sub.images]
            }
          }
        }
        return {
          ...sub,
          images: imageUrls,
        }
      })

      return success(res, {
        list: formattedSubmissions,
        total: submissions.length,
      })
    } catch (err) {
      logger.error('获取他人打卡提交列表错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 导出打卡数据
  async export(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const checkin = await prisma.checkin.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              title: true,
              creatorId: true,
            }
          },
          submissions: {
            include: {
              student: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 权限检查
      if (checkin.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限导出此打卡')
      }

      // 准备导出数据
      const exportData = checkin.submissions.map((sub, index) => {
        const images = (sub.images as string[]) || []
        return {
          '序号': index + 1,
          '学生姓名': sub.student?.nickname || sub.student?.username || (sub.isAnonymous ? '匿名用户' : '未知'),
          '学号': sub.student?.username || (sub.isAnonymous ? '匿名' : ''),
          '提交内容': sub.content || '',
          '图片数量': images.length,
          '图片链接': images.length > 0 ? images.join('\n') : '',
          '提交时间': sub.createdAt ? new Date(sub.createdAt).toLocaleString('zh-CN') : '',
        }
      })

      // 创建 Excel（ExcelJS，避免旧版 xlsx 解析器漏洞）

      // 设置响应头
      const fileName = `${checkin.course.title}_${checkin.title}_打卡数据.xlsx`
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)

      // 发送文件
      const buffer = await (await import('../utils/excelWorkbook')).workbookBuffer({ '打卡提交数据': exportData })
      res.send(buffer)
    } catch (err) {
      logger.error('导出打卡错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取所有打卡标签（去重）
  async getTags(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role

      let where: any = {}

      // 教师只能看自己课程的打卡标签
      if (userRole === UserRole.TEACHER) {
        where.course = { creatorId: userId }
      }

      const checkins = await prisma.checkin.findMany({
        where,
        select: { tags: true }
      })

      const allTags = [...new Set(checkins.flatMap(c => c.tags))]

      return success(res, { tags: allTags })
    } catch (err) {
      logger.error('获取打卡标签错误', err)
      return error(res, '获取打卡标签失败')
    }
  },

  // ==================== 匿名打卡接口 ====================

  /**
   * 创建打卡访问令牌（教师）
   */
  async createAccessToken(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id: checkinId } = req.params
      const parsed = createCheckinTokenSchema.safeParse(req.body)
      if (!parsed.success) return error(res, parsed.error.errors[0]?.message || '令牌参数无效')
      const { expiresAt, maxUses } = parsed.data

      // 验证打卡是否存在
      const checkin = await prisma.checkin.findUnique({
        where: { id: checkinId },
        include: { course: true },
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 验证权限：只有课程创建者可以创建令牌
      if (checkin.course.creatorId !== userId) {
        return forbidden(res, '无权为此打卡创建令牌')
      }

      // 检查打卡是否允许匿名
      if (!checkin.allowAnonymous) {
        return error(res, '此打卡不允许匿名提交，请先开启匿名打卡功能')
      }

      // 导入令牌服务
      const { checkinTokenService } = await import('../services/checkinTokenService')

      // 创建令牌
      const token = await checkinTokenService.createToken({
        checkinId,
        createdBy: userId!,
        expiresAt: new Date(expiresAt),
        maxUses,
      })

      logger.info('教师创建打卡令牌', {
        tokenId: token.id,
        checkinId,
        createdBy: userId,
      })

      return success(res, token, '令牌创建成功')
    } catch (err) {
      logger.error('创建打卡令牌错误', err)
      return error(res, '创建令牌失败')
    }
  },

  /**
   * 获取打卡的所有令牌（教师）
   */
  async getAccessTokens(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id: checkinId } = req.params

      // 验证打卡是否存在
      const checkin = await prisma.checkin.findUnique({
        where: { id: checkinId },
        include: { course: true },
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 验证权限：只有课程创建者可以查看令牌
      if (checkin.course.creatorId !== userId) {
        return forbidden(res, '无权查看此打卡的令牌')
      }

      // 导入令牌服务
      const { checkinTokenService } = await import('../services/checkinTokenService')

      // The owner check above is the authorization gate for the explicit
      // management view. The service returns a DTO and never exposes hash or
      // ciphertext columns.
      const tokens = await checkinTokenService.getTokensByCheckin(checkinId, { reveal: true })

      return success(res, tokens)
    } catch (err) {
      logger.error('获取打卡令牌错误', err)
      return error(res, '获取令牌失败')
    }
  },

  /**
   * 删除打卡令牌（教师）
   */
  async deleteAccessToken(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { tokenId } = req.params

      // 获取令牌信息
      const token = await prisma.checkinAccessToken.findUnique({
        where: { id: tokenId },
        include: {
          checkin: {
            include: { course: true },
          },
        },
      })
      if (!token) {
        return notFound(res, '令牌不存在')
      }

      // 验证权限：只有课程创建者可以删除令牌
      if (token.checkin.course.creatorId !== userId) {
        return forbidden(res, '无权删除此令牌')
      }

      // 导入令牌服务
      const { checkinTokenService } = await import('../services/checkinTokenService')

      await checkinTokenService.deleteToken(tokenId)

      logger.info('教师删除打卡令牌', {
        tokenId,
        deletedBy: userId,
      })

      return success(res, null, '令牌已删除')
    } catch (err) {
      logger.error('删除打卡令牌错误', err)
      return error(res, '删除令牌失败')
    }
  },

  /**
   * 公开获取打卡详情（匿名用户，通过令牌访问）
   */
  async getPublicCheckin(req: Request, res: Response) {
    try {
      const { token } = req.params

      // 导入令牌服务
      const { checkinTokenService } = await import('../services/checkinTokenService')

      // 验证令牌
      const validation = await checkinTokenService.validateToken(token, { ignoreUsageLimit: true })

      if (!validation.valid) {
        let message = '无效的访问令牌'
        if (validation.expired) {
          message = '访问令牌已过期'
        } else if (validation.overLimit) {
          message = '访问令牌已达到使用上限'
        } else if (validation.disabled) {
          message = '访问令牌已被禁用'
        }
        return error(res, message)
      }

      // 获取打卡详情（不包含敏感信息）
      const checkin = await prisma.checkin.findUnique({
        where: { id: validation.checkin.id },
        select: {
          id: true,
          title: true,
          description: true,
          content: true,
          images: true,
          videos: true,
          documents: true,
          endTime: true,
          createdAt: true,
          allowViewOthers: true,
          courseId: true,
        },
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }
      const { courseId, ...publicCheckinData } = checkin
      const publicCheckin = await hydrateAssetReferences(publicCheckinData, true, {
        entityType: 'Checkin',
        entityId: checkin.id,
        checkinId: checkin.id,
        courseId,
        parentAccess: true,
      })

      // The session ID is only a locator. The capability is the signed proof
      // that this session was issued for this exact check-in token.
      const session = checkinTokenService.createSessionCapability({
        checkinId: checkin.id,
        tokenId: validation.token!.id,
        tokenExpiresAt: validation.token!.expiresAt,
      })

      logger.info('匿名用户访问打卡', {
        checkinId: checkin?.id,
        tokenId: validation.token!.id,
      })

      return success(res, {
        checkin: publicCheckin,
        sessionId: session.sessionId,
        sessionCapability: session.capability,
        sessionExpiresAt: new Date(session.expiresAt * 1000).toISOString(),
        tokenId: validation.token.id,
      })
    } catch (err) {
      logger.error('公开获取打卡详情错误', err)
      return error(res, '获取打卡详情失败')
    }
  },

  /**
   * 公开上传图片（匿名用户，通过令牌访问）
   */
  async uploadPublicImage(req: Request, res: Response) {
    let uploadedAsset: Awaited<ReturnType<typeof storeAsset>> | undefined
    let stagingReferenceCreated = false
    let stagingReferenceEntityId: string | undefined
    try {
      const { token } = req.params

      if (req.header('X-Checkin-Token') !== token) {
        return unauthorized(res, '缺少签到访问令牌')
      }

      // 验证令牌
      const { checkinTokenService } = await import('../services/checkinTokenService')
      // maxUses limits successful anonymous submissions, not page views or
      // upload steps. The submission transaction claims the slot atomically.
      const validation = await checkinTokenService.validateToken(token, { ignoreUsageLimit: true })

      if (!validation.valid) {
        let message = '无效的访问令牌'
        if (validation.expired) {
          message = '访问令牌已过期'
        } else if (validation.overLimit) {
          message = '访问令牌已达到使用上限'
        } else if (validation.disabled) {
          message = '访问令牌已被禁用'
        }
        return error(res, message)
      }

      // 使用 multer 处理上传，并等待回调结束，确保存储异常进入统一错误处理。
      await new Promise<void>((resolve, reject) => {
        publicImageUpload.single('file')(req, res, (multerErr) => {
          if (multerErr) reject(multerErr)
          else resolve()
        })
      })

      const file = req.file
      if (!file) {
        return error(res, '请选择图片文件')
      }
      const sessionResult = publicSessionIdSchema.safeParse(req.body?.sessionId)
      if (!sessionResult.success) {
        return error(res, '会话标识无效')
      }
      const sessionId = sessionResult.data
      stagingReferenceEntityId = publicUploadStagingEntityId(validation.checkin.id, sessionId)
      if (!checkinTokenService.verifySessionCapability({
        checkinId: validation.checkin.id,
        tokenId: validation.token!.id,
        sessionId,
        capability: req.header('X-Checkin-Session-Capability'),
        tokenExpiresAt: validation.token!.expiresAt,
      })) {
        return unauthorized(res, '匿名签到会话凭据无效')
      }
      const stagedCount = await prisma.assetReference.count({ where: {
        entityType: PUBLIC_UPLOAD_REFERENCE_ENTITY, entityId: stagingReferenceEntityId,
        field: PUBLIC_UPLOAD_REFERENCE_FIELD,
      } })
      if (stagedCount >= MAX_PUBLIC_UPLOAD_IMAGES_PER_SESSION) {
        return error(res, `每个会话最多上传${MAX_PUBLIC_UPLOAD_IMAGES_PER_SESSION}张图片`, -1, 409)
      }
      await readTemporaryUpload(req, acceptedImageTypes)
      const detectedMimeType = detectAcceptedImageMimeType(file)
      if (!detectedMimeType) return error(res, '图片内容类型无效')

      await runPublicUploadCleanup()

      const asset = await storeAsset({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: detectedMimeType,
        accessScope: 'PUBLIC_CHECKIN',
        scopeId: validation.checkin.id,
      })
      uploadedAsset = asset
      try {
        await prisma.$transaction(async (tx) => stagePublicUploadAsset({
          assetId: asset.id,
          checkinId: validation.checkin.id,
          sessionId,
          db: tx,
        }))
        stagingReferenceCreated = true
      } catch (referenceError) {
        await discardUnreferencedAsset(asset)
        uploadedAsset = undefined
        if (referenceError instanceof PublicUploadSessionLimitError) {
          return error(res, `每个会话最多上传${MAX_PUBLIC_UPLOAD_IMAGES_PER_SESSION}张图片`, -1, 409)
        }
        if (referenceError instanceof PublicUploadSessionAlreadySubmittedError) {
          return error(res, '该签到会话已经提交，不能继续上传图片', -1, 409)
        }
        throw referenceError
      }

      const publicUrl = await getSignedAssetUrl(asset.id, true)
      if (!publicUrl) {
        throw new Error('公开资产签名 URL 生成失败')
      }

      logger.info('匿名用户上传图片', {
        assetId: asset.id,
        checkinId: validation.checkin.id,
      })

      return success(res, {
        assetId: asset.id,
        url: publicUrl,
      }, '上传成功')
    } catch (err) {
      if (uploadedAsset) {
        if (stagingReferenceCreated && stagingReferenceEntityId) {
          await prisma.assetReference.deleteMany({
            where: {
              entityType: PUBLIC_UPLOAD_REFERENCE_ENTITY,
              entityId: stagingReferenceEntityId,
              field: PUBLIC_UPLOAD_REFERENCE_FIELD,
              assetId: uploadedAsset.id,
            },
          }).catch(() => undefined)
        }
        await discardUnreferencedAsset(uploadedAsset).catch(() => undefined)
      }
      logger.error('公开上传图片错误', err)
      return error(res, '上传失败')
    }
  },

  /**
   * 公开提交打卡（匿名用户，通过令牌访问）
   */
  async submitPublicCheckin(req: Request, res: Response) {
    try {
      const { token } = req.params

      if (req.header('X-Checkin-Token') !== token) {
        return unauthorized(res, '缺少签到访问令牌')
      }

      const parsedBody = publicSubmissionSchema.safeParse(req.body)
      if (!parsedBody.success) {
        return error(res, '提交内容格式无效')
      }
      const { content, images, sessionId } = parsedBody.data

      // 导入令牌服务
      const { checkinTokenService } = await import('../services/checkinTokenService')

      // 验证令牌
      const validation = await checkinTokenService.validateToken(token, { ignoreUsageLimit: true })

      if (!validation.valid) {
        let message = '无效的访问令牌'
        if (validation.expired) {
          message = '访问令牌已过期'
        } else if (validation.overLimit) {
          message = '访问令牌已达到使用上限'
        } else if (validation.disabled) {
          message = '访问令牌已被禁用'
        }
        return error(res, message)
      }

      if (!checkinTokenService.verifySessionCapability({
        checkinId: validation.checkin.id,
        tokenId: validation.token!.id,
        sessionId,
        capability: req.header('X-Checkin-Session-Capability'),
        tokenExpiresAt: validation.token!.expiresAt,
      })) {
        return unauthorized(res, '匿名签到会话凭据无效')
      }

      // 检查打卡是否已结束
      if (validation.checkin.endTime && new Date() > validation.checkin.endTime) {
        return error(res, Messages.CHECKIN.EXPIRED)
      }

      await runPublicUploadCleanup()

      // Claim the quota and create the submission in one transaction. A
      // session can consume at most one remaining slot.
      const result = await prisma.$transaction(async (tx) => (
        withPublicUploadSessionLock(tx, validation.checkin.id, sessionId, async () => {
          const stagingEntityId = publicUploadStagingEntityId(validation.checkin.id, sessionId)
          const existingSubmission = await tx.checkinSubmission.findUnique({
            where: {
              checkinId_sessionId: {
                checkinId: validation.checkin.id,
                sessionId,
              },
            },
          })
          if (existingSubmission) {
            await tx.assetReference.deleteMany({
              where: {
                entityType: PUBLIC_UPLOAD_REFERENCE_ENTITY,
                entityId: stagingEntityId,
                field: PUBLIC_UPLOAD_REFERENCE_FIELD,
              },
            })
            return { kind: 'existing' as const }
          }

          const validatedImages = await validatePublicSubmissionImages(
            images,
            validation.checkin.id,
            sessionId,
            tx,
          )
          if (!validatedImages) return { kind: 'invalid-images' as const }

          const claimed = await checkinTokenService.claimSubmissionSlot(validation.token.id, tx)
          if (!claimed) return { kind: 'over-limit' as const }

          const submission = await tx.checkinSubmission.create({
            data: {
              checkinId: validation.checkin.id,
              studentId: null, // 匿名提交
              content,
              images: validatedImages,
              sessionId,
              tokenId: validation.token.id,
              isAnonymous: true,
            },
          })
          await syncSubmissionAssetReferences(submission.id, validatedImages, tx)
          await tx.assetReference.deleteMany({
            where: {
              entityType: PUBLIC_UPLOAD_REFERENCE_ENTITY,
              entityId: stagingEntityId,
              field: PUBLIC_UPLOAD_REFERENCE_FIELD,
            },
          })
          return { kind: 'created' as const, submission }
        })
      ))

      if (result.kind === 'existing') return error(res, '您已经提交过了')
      if (result.kind === 'over-limit') return error(res, '访问令牌已达到匿名提交上限', -1, 409)
      if (result.kind === 'invalid-images') return error(res, '图片凭据无效或不属于当前签到')
      const submission = result.submission

      logger.info('匿名用户提交打卡', {
        submissionId: submission.id,
        checkinId: validation.checkin.id,
        tokenId: validation.token.id,
      })

      return success(res, submission, '提交成功')
    } catch (err) {
      logger.error('公开提交打卡错误', err)
      if ((err as { code?: string })?.code === 'P2002') {
        return error(res, '您已经提交过了', -1, 409)
      }
      return error(res, '提交打卡失败')
    }
  },

  /**
   * 切换打卡的匿名打卡功能（教师）
   */
  async toggleAllowAnonymous(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { id: checkinId } = req.params
      const { allowAnonymous } = req.body

      // 验证打卡是否存在
      const checkin = await prisma.checkin.findUnique({
        where: { id: checkinId },
        include: { course: true },
      })

      if (!checkin) {
        return notFound(res, '打卡不存在')
      }

      // 验证权限：只有课程创建者可以修改
      if (checkin.course.creatorId !== userId) {
        return forbidden(res, '无权修改此打卡')
      }

      // 更新打卡
      const updated = await prisma.checkin.update({
        where: { id: checkinId },
        data: { allowAnonymous },
      })

      logger.info('教师切换匿名打卡功能', {
        checkinId,
        allowAnonymous,
        updatedBy: userId,
      })

      return success(res, updated, allowAnonymous ? '已开启匿名打卡' : '已关闭匿名打卡')
    } catch (err) {
      logger.error('切换匿名打卡功能错误', err)
      return error(res, '修改失败')
    }
  }
}
