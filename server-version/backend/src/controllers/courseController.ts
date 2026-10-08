import { Request, Response } from 'express'
import { canReadLegacyContent } from '../utils/legacyContentRoles'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound } from '../utils/response'
import { UserRole, CourseStatus, CourseStudentStatus } from '../types'
import { generateCourseCode } from '../utils/courseCode'
import { logger } from '../utils/logger'
import { cache } from '../utils/cache'
import { Messages, CACHE_TTL } from '../constants'
import { z } from 'zod'
import {
  canAccessCourseContent,
  canAccessCourseRoster,
  hasActiveCourseMembership,
} from '../utils/courseAccess'
import { attachAssetReference, discardUnreferencedAsset, getSignedAssetUrl, storeAsset } from '../services/assetStorage'
import { removeCredentialHandoff, writeCredentialHandoff } from '../utils/credentialHandoff'
import path from 'node:path'
import { CourseNotJoinableError, courseJoinabilityMessage, isCourseJoinable } from '../utils/courseEnrollment'

const createCourseSchema = z.object({
  title: z.string().min(1, '课程标题不能为空'),
  description: z.string().optional(),
  isLibrary: z.boolean().optional(),
})

const updateCourseSchema = z.object({
  title: z.string().min(1, '课程标题不能为空').optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'COMPLETED']).optional(),
  coverUrl: z.string().optional(),
  isLibrary: z.boolean().optional(),
})

// 分页参数解析工具函数
const getPaginationParams = (req: Request) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const pageSize = Math.min(100, parseInt(req.query.pageSize as string) || 100)
  return { page, pageSize, skip: (page - 1) * pageSize }
}

/**
 * AssetReference is intentionally polymorphic, so Prisma cannot cascade
 * references when a course removes its assignments/check-ins. Collect every
 * descendant id and clean the references in the same transaction as the
 * course delete.
 */
const deleteCourseWithAssetReferences = async (courseId: string) => {
  await prisma.$transaction(async (tx) => {
    const assignments = await tx.assignment.findMany({
      where: { courseId },
      select: { id: true },
    })
    const checkins = await tx.checkin.findMany({
      where: { courseId },
      select: { id: true },
    })

    const assignmentIds = assignments.map(({ id }) => id)
    const checkinIds = checkins.map(({ id }) => id)
    const submissions = checkinIds.length > 0
      ? await tx.checkinSubmission.findMany({
        where: { checkinId: { in: checkinIds } },
        select: { id: true },
      })
      : []

    await tx.assetReference.deleteMany({
      where: {
        entityType: 'Course',
        entityId: courseId,
      },
    })

    if (assignmentIds.length > 0) {
      await tx.assetReference.deleteMany({
        where: {
          entityType: 'Assignment',
          entityId: { in: assignmentIds },
        },
      })
    }

    if (checkinIds.length > 0) {
      await tx.assetReference.deleteMany({
        where: {
          entityType: 'Checkin',
          entityId: { in: checkinIds },
        },
      })
    }

    const submissionIds = submissions.map(({ id }) => id)
    if (submissionIds.length > 0) {
      await tx.assetReference.deleteMany({
        where: {
          entityType: 'CheckinSubmission',
          entityId: { in: submissionIds },
        },
      })
    }

    await tx.course.delete({ where: { id: courseId } })
  })
}

export const courseController = {
  // 获取课程列表 - 添加缓存优化
  async list(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      if (!canReadLegacyContent(userRole)) return forbidden(res, '当前角色不能访问旧课程列表')
      const { status = 'all' } = req.query
      const { page, pageSize, skip } = getPaginationParams(req)

      // 构建缓存键
      const cacheKey = `courses:list:${userRole}:${userId}:${status}:${page}:${pageSize}`
      
      // 尝试从缓存获取
      const cached = cache.get(cacheKey)
      if (cached) {
        logger.debug('Course list cache hit', { cacheKey })
        return success(res, cached)
      }

      let where: any = {}

      if (status !== 'all') {
        where.status = status
      }

      // 教师只能看到自己创建的课程，管理员可以看到所有
      if (userRole === UserRole.TEACHER) {
        where.creatorId = userId
      }

      // 学生只能看到自己已加入（ACTIVE/APPROVED）的课程，避免列出全站课程
      if (userRole === UserRole.STUDENT) {
        where.isLibrary = false
        where.students = {
          some: {
            studentId: userId,
            status: { in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED] },
          },
        }
      }

      // 并行执行查询和计数
      const [courses, total] = await Promise.all([
        prisma.course.findMany({
          where,
          include: {
            creator: {
              select: {
                id: true,
                nickname: true,
                username: true,
                role: true,
              }
            },
            _count: {
              select: {
                students: {
                  where: {
                    status: {
                      in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED]
                    }
                  }
                }
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip,
          take: pageSize,
        }),
        prisma.course.count({ where })
      ])

      // 格式化返回数据
      const formattedCourses = await Promise.all(courses.map(async course => ({
        ...course,
        coverUrl: course.coverAssetId ? await getSignedAssetUrl(course.coverAssetId) : course.coverUrl,
        studentCount: course._count.students,
        isRecruiting: course.isRecruiting,
        _count: undefined,
      })))

      const result = {
        list: formattedCourses,
        total,
        page,
        pageSize,
      }

      // 存入缓存，短期缓存（1分钟）用于频繁查询
      cache.set(cacheKey, result, CACHE_TTL.SHORT)

      return success(res, result)
    } catch (err) {
      logger.error('获取课程列表错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 创建课程
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const result = createCourseSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { title, description, isLibrary } = result.data
      const userRole = req.user?.role
      if (isLibrary !== undefined && userRole !== UserRole.ADMIN) {
        return forbidden(res, '只有管理员可以设置库课程')
      }

      // 生成课程号
      const courseCode = await generateCourseCode()

      const course = await prisma.course.create({
        data: {
          title,
          description,
          courseCode,
          creatorId: userId,
          status: CourseStatus.PUBLISHED,
          ...(isLibrary ? { isLibrary: true, isRecruiting: false } : {}),
        },
        include: {
          creator: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        }
      })

      // 清除相关缓存
      const clearedKeys = cache.clearPattern(`courses:list:`)
      logger.info('[课程创建] 缓存已清除', { userId, clearedKeys })
      logger.debug('Course cache cleared after create', { userId })

      return success(res, course, Messages.COURSE.CREATE_SUCCESS)
    } catch (err) {
      logger.error('创建课程错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取课程详情
  async detail(req: Request, res: Response) {
    try {
      const { id } = req.params

      const course = await prisma.course.findUnique({
        where: { id },
        include: {
          creator: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          },
          shares: {
            select: { sharedTo: true },
          },
          _count: {
            select: {
              students: {
                where: {
                  status: {
                    in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED]
                  }
                }
              }
            }
          }
        }
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      if (req.user?.role === UserRole.STUDENT && course.isLibrary) {
        return notFound(res, '课程不存在')
      }

      if (req.user?.role === UserRole.STUDENT) {
        const isMember = await hasActiveCourseMembership(id, req.user.userId)
        if (!isMember) {
          return forbidden(res, '您不是该课程的学员')
        }
      } else if (!canAccessCourseContent(course, req.user?.userId, req.user?.role)) {
        return forbidden(res, '您没有权限访问该课程')
      }

      const canViewRoster = canAccessCourseRoster(course, req.user?.userId, req.user?.role)
      // Fetch identity rows only after authorization, for an owner/admin who
      // receives them. Student/shared reads need the count, never the full roster.
      const roster = canViewRoster ? await prisma.courseStudent.findMany({
        where: { courseId: id },
        include: { student: { select: { id: true, nickname: true, username: true, avatarUrl: true } } },
      }) : undefined
      const { _count, students: _students, shares: _shares, courseCode, ...courseFields } = course as typeof course & { students?: unknown }
      const coverUrl = course.coverAssetId ? await getSignedAssetUrl(course.coverAssetId) : course.coverUrl

      return success(res, {
        ...courseFields,
        coverUrl,
        ...(canViewRoster ? { courseCode, students: roster } : {}),
        studentCount: _count.students,
        isRecruiting: course.isRecruiting,
        _count: undefined,
      })
    } catch (err) {
      logger.error('获取课程详情错误', err)
      return error(res, '获取课程详情失败')
    }
  },

  // 更新课程
  async update(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const course = await prisma.course.findUnique({
        where: { id },
        include: { creator: { select: { role: true } } },
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      // 权限检查：只有创建者或管理员可以更新
      if (course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此课程')
      }

      const result = updateCourseSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      if (result.data.isLibrary !== undefined) {
        if (userRole !== UserRole.ADMIN) {
          return forbidden(res, '只有管理员可以设置库课程')
        }
        if (result.data.isLibrary && course.creator.role !== UserRole.ADMIN) {
          return forbidden(res, '不能把教师的课改成库课程')
        }
      }

      const updateData: Record<string, unknown> = { ...result.data }
      if (result.data.isLibrary === true) {
        updateData.isRecruiting = false
      }

      const updatedCourse = await prisma.course.update({
        where: { id },
        data: updateData,
        include: {
          creator: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        }
      })

      // 清除相关缓存
      cache.clearPattern(`courses:list:`)
      cache.delete(`course:${id}`)
      logger.debug('Course cache cleared after update', { courseId: id })

      return success(res, updatedCourse, Messages.COURSE.UPDATE_SUCCESS)
    } catch (err) {
      logger.error('更新课程错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // Rotate the join code after a leak or roster change. The update is
  // ownership-checked and serialized on the course row so an old code stops
  // working as soon as the new code is committed.
  async rotateCourseCode(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params
      const course = await prisma.course.findUnique({ where: { id }, select: { id: true, creatorId: true } })
      if (!course) return notFound(res, '课程不存在')
      if (course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限轮换此课程码')
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (typeof (tx as any).$executeRaw === 'function') {
          await (tx as any).$executeRaw`SELECT id FROM "courses" WHERE id = ${id} FOR UPDATE`
        }
        const newCourseCode = await generateCourseCode(tx)
        return tx.course.update({ where: { id }, data: { courseCode: newCourseCode }, select: { id: true, courseCode: true } })
      })

      cache.clearPattern(`courses:list:`)
      cache.delete(`course:${id}`)
      return success(res, updated, '课程码已轮换，请通知学生使用新课程码')
    } catch (err) {
      logger.error('轮换课程码错误', err)
      return error(res, '轮换课程码失败')
    }
  },

  // 删除课程
  async delete(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const course = await prisma.course.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              students: {
                where: {
                  status: {
                    in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED]
                  }
                }
              }
            }
          }
        }
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      const hasStudents = course._count.students > 0
      const isCompleted = course.status === CourseStatus.COMPLETED

      // 权限检查
      if (userRole === UserRole.ADMIN) {
        // 管理员可以删除任何课程
        await deleteCourseWithAssetReferences(id)
        // 清除相关缓存
        cache.clearPattern(`courses:list:`)
        cache.delete(`course:${id}`)
        logger.debug('Course cache cleared after delete', { courseId: id })

        return success(res, {
          deletedStudents: course._count.students
        }, hasStudents ? '课程已删除（包含学生数据）' : '课程已删除')
      }

      // 非管理员，检查是否是创建者
      if (course.creatorId !== userId) {
        return forbidden(res, '无权限删除此课程')
      }

      // 教师删除条件：1.无学生 2.课程已完结
      if (hasStudents) {
        return error(res, `该课程还有 ${course._count.students} 名学生，仅管理员可以删除有学生的课程`)
      }

      if (!isCompleted) {
        return error(res, '课程未完结，请先结束课程后再删除')
      }

      // 满足条件，可以删除
      await deleteCourseWithAssetReferences(id)

      // 清除相关缓存
      cache.clearPattern(`courses:list:`)
      cache.delete(`course:${id}`)
      logger.debug('Course cache cleared after delete', { courseId: id })

      return success(res, null, Messages.COURSE.DELETE_SUCCESS)
    } catch (err) {
      logger.error('删除课程错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 加入课程
  async join(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { courseCode } = req.body

      if (!courseCode) {
        return error(res, '请输入课程号')
      }

      // 查找课程
      const course = await prisma.course.findUnique({
        where: { courseCode }
      })

      if (!course) {
        return error(res, '课程号不存在')
      }

      if (!isCourseJoinable(course)) return error(res, courseJoinabilityMessage(course))

      await prisma.$transaction(async (tx) => {
        // The final check is serialized with stop-recruiting/end-course.
        if (typeof (tx as any).$executeRaw === 'function') {
          await (tx as any).$executeRaw`SELECT id FROM "courses" WHERE id = ${course.id} FOR UPDATE`
        }
        const lockedCourse = await tx.course.findUnique({ where: { id: course.id } })
        // The initial lookup only identifies the row to lock.  A teacher may
        // rotate the code while this request is waiting for that row lock;
        // accepting the refreshed row without comparing the submitted code
        // would make the old code valid after rotation.
        if (
          !lockedCourse
          || lockedCourse.courseCode !== courseCode
          || !isCourseJoinable(lockedCourse)
        ) {
          throw new CourseNotJoinableError(
            !lockedCourse || lockedCourse.courseCode !== courseCode
              ? '课程号不存在'
              : courseJoinabilityMessage(lockedCourse),
          )
        }

        const existing = await tx.courseStudent.findUnique({
          where: {
            courseId_studentId: {
              courseId: lockedCourse.id,
              studentId: userId!,
            },
          },
        })

        if (existing) {
          if (existing.status === CourseStudentStatus.ACTIVE || existing.status === CourseStudentStatus.APPROVED) {
            throw new Error('您已经是该课程的学员')
          }
          await tx.courseStudent.update({
            where: { id: existing.id },
            data: { status: CourseStudentStatus.ACTIVE },
          })
          return
        }

        await tx.courseStudent.create({
          data: {
            courseId: lockedCourse.id,
            studentId: userId!,
            status: CourseStudentStatus.ACTIVE,
          },
        })
      })

      return success(res, null, '加入课程成功')
    } catch (err) {
      if (err instanceof CourseNotJoinableError || (err instanceof Error && err.message === '您已经是该课程的学员')) {
        return error(res, err.message)
      }
      logger.error('加入课程错误', err)
      return error(res, '加入课程失败')
    }
  },

  // 获取我的课程（学生视角）
  async myCourses(req: Request, res: Response) {
    try {
      const userId = req.user?.userId

      const courseStudents = await prisma.courseStudent.findMany({
        where: {
          studentId: userId,
          status: {
            in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED]
          },
          course: { isLibrary: false },
        },
        include: {
          course: {
            include: {
              creator: {
                select: {
                  id: true,
                  nickname: true,
                  username: true,
                }
              },
              _count: {
                select: {
                  students: true
                }
              }
            }
          }
        },
        orderBy: {
          joinedAt: 'desc'
        }
      })

      const courses = courseStudents.map(cs => ({
        ...cs.course,
        studentCount: cs.course._count.students
      }))

      return success(res, {
        list: courses,
        total: courses.length,
      })
    } catch (err) {
      logger.error('获取我的课程错误', err)
      return error(res, '获取我的课程失败')
    }
  },

  // 验证课程码（公开接口）
  async verifyCourseCode(req: Request, res: Response) {
    try {
      const { courseCode } = req.body

      if (!courseCode) {
        return error(res, '请输入课程码')
      }

      const course = await prisma.course.findUnique({
        where: { courseCode },
        include: {
          creator: {
            select: {
              nickname: true,
            }
          }
        }
      })

      if (!course) {
        return error(res, '课程码无效')
      }

      if (!isCourseJoinable(course)) return error(res, courseJoinabilityMessage(course))

      return success(res, {
        courseId: course.id,
        courseName: course.title,
        teacherName: course.creator?.nickname,
        isRecruiting: course.isRecruiting,
      }, '课程码有效')
    } catch (err) {
      logger.error('验证课程码错误', err)
      return error(res, '验证失败')
    }
  },

  // 结束课程：只关闭本课（停止招募），不冻结学生在其他课程的账号
  async endCourse(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const course = await prisma.course.findUnique({
        where: { id },
        include: {
          students: {
            where: {
              status: 'ACTIVE'
            },
            select: {
              studentId: true
            }
          }
        }
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      // 权限检查：只有管理员或课程创建者可以结束课程
      if (userRole !== UserRole.ADMIN && course.creatorId !== userId) {
        return forbidden(res, '无权限结束此课程')
      }

      const now = new Date()
      const studentCount = course.students.length

      await prisma.course.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          endedAt: now,
          isRecruiting: false,
        }
      })

      // 清除课程列表缓存
      cache.clearPattern(`courses:list:`)
      logger.info('[结束课程] 缓存已清除', { courseId: id })

      return success(res, {
        endedAt: now,
        studentCount,
      }, Messages.COURSE.END_SUCCESS)
    } catch (err) {
      logger.error('结束课程错误', err)
      return error(res, '结束课程失败')
    }
  },

  // 获取课程学生列表（教师/管理员）
  async getStudents(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const course = await prisma.course.findUnique({
        where: { id }
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      // 权限检查
      if (!canAccessCourseRoster(course, userId, userRole)) {
        return forbidden(res, '无权限查看此课程的学生')
      }

      const students = await prisma.courseStudent.findMany({
        where: {
          courseId: id,
          status: {
            in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED, CourseStudentStatus.PENDING]
          }
        },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatarUrl: true,
              isFrozen: true,
              createdAt: true,
            }
          }
        },
        orderBy: {
          joinedAt: 'desc'
        }
      })

      return success(res, {
        list: students.map(s => ({
          id: s.student.id,
          username: s.student.username,
          nickname: s.student.nickname,
          avatarUrl: s.student.avatarUrl,
          isFrozen: s.student.isFrozen,
          joinedAt: s.joinedAt,
        })),
        total: students.length,
      })
    } catch (err) {
      logger.error('获取学生列表错误', err)
      return error(res, '获取学生列表失败')
    }
  },

  // 重置学生密码
  async resetStudentPassword(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      // Course ownership permits roster management, not global credential changes.
      if (userRole !== UserRole.ADMIN) return forbidden(res, '重置全局账号密码仅限平台管理员')
      const { courseId, studentId } = req.params

      // 验证课程权限
      const course = await prisma.course.findUnique({
        where: { id: courseId }
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      if (!canAccessCourseRoster(course, userId, userRole)) {
        return forbidden(res, '无权限管理此课程的学生')
      }

      // 验证学生是否在该课程中
      const courseStudent = await prisma.courseStudent.findFirst({
        where: {
          courseId,
          studentId,
        }
      })

      if (!courseStudent) {
        return error(res, '该学生未加入此课程')
      }

      // 生成随机临时密码
      const { hashPassword, generateTempPassword } = await import('../utils/password')
      const tempPassword = generateTempPassword()
      const hashedPassword = await hashPassword(tempPassword)

      const student = await prisma.user.findUnique({ where: { id: studentId }, select: { username: true } })
      const handoffFile = await writeCredentialHandoff([{ username: student?.username || studentId, temporaryPassword: tempPassword }], 'student-password-reset')
      try {
        await prisma.user.update({
          where: { id: studentId },
          data: {
            passwordHash: hashedPassword,
            tokenVersion: { increment: 1 },
            mustChangePassword: true,
          }
        })
      } catch (updateError) {
        removeCredentialHandoff(handoffFile)
        throw updateError
      }

      return success(res, { handoffFile: path.basename(handoffFile) }, '密码已重置；临时密码已写入受保护的本地交接文件')
    } catch (err) {
      logger.error('重置密码错误', err)
      return error(res, '重置密码失败')
    }
  },

  // 批量获取多个课程的学生列表（优化 N+1 查询）
  async getBatchStudents(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { courseIds } = req.body

      if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
        return error(res, '请提供课程ID列表')
      }

      // 验证权限：只能查看自己创建的课程或管理员查看所有
      const courses = await prisma.course.findMany({
        where: {
          id: { in: courseIds },
          ...(userRole !== UserRole.ADMIN ? { creatorId: userId } : {})
        },
        select: { id: true }
      })

      const allowedCourseIds = courses.map(c => c.id)

      if (allowedCourseIds.length === 0) {
        return forbidden(res, '无权限查看这些课程的学生')
      }

      // 一次性获取所有课程的学生
      const courseStudents = await prisma.courseStudent.findMany({
        where: {
          courseId: { in: allowedCourseIds },
          status: {
            in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED, CourseStudentStatus.PENDING]
          }
        },
        include: {
          student: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatarUrl: true,
              isFrozen: true,
              createdAt: true,
            }
          }
        },
        orderBy: {
          joinedAt: 'desc'
        }
      })

      // 按课程ID分组
      const groupedByCourse: Record<string, any[]> = {}
      allowedCourseIds.forEach(id => {
        groupedByCourse[id] = []
      })

      courseStudents.forEach(cs => {
        if (groupedByCourse[cs.courseId]) {
          groupedByCourse[cs.courseId].push({
            id: cs.student.id,
            username: cs.student.username,
            nickname: cs.student.nickname,
            avatarUrl: cs.student.avatarUrl,
            isFrozen: cs.student.isFrozen,
            joinedAt: cs.joinedAt,
          })
        }
      })

      return success(res, {
        data: groupedByCourse,
        total: courseStudents.length,
      })
    } catch (err) {
      logger.error('批量获取学生列表错误', err)
      return error(res, '获取学生列表失败')
    }
  },

  // 上传课程封面
  async uploadCover(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const course = await prisma.course.findUnique({
        where: { id }
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      // 权限检查
      if (course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此课程')
      }

      const file = req.file
      if (!file) {
        return error(res, '请选择图片文件')
      }

      const detectedMimeType = (file as Express.Multer.File & { detectedMimeType?: string }).detectedMimeType
      if (!detectedMimeType || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(detectedMimeType)) {
        return error(res, '图片内容类型无效')
      }

      const asset = await storeAsset({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: detectedMimeType,
        ownerId: userId,
        accessScope: 'COURSE',
        scopeId: id,
      })

      // Keep the course pointer and its reference in one transaction. The
      // previous cover reference is removed only after the new pointer is
      // ready, so an asset cannot be detached from a live course by a
      // partially completed upload.
      try {
        await prisma.$transaction(async (tx) => {
          if (typeof (tx as any).$executeRaw === 'function') {
            await (tx as any).$executeRaw`SELECT id FROM "courses" WHERE id = ${id} FOR UPDATE`
          }
          const currentCourse = await tx.course.findUnique({
            where: { id },
            select: { coverAssetId: true },
          })
          if (!currentCourse) throw new Error('课程不存在')
          await tx.course.update({
            where: { id },
            data: { coverAssetId: asset.id, coverUrl: null }
          })
          if (currentCourse.coverAssetId && currentCourse.coverAssetId !== asset.id) {
            await tx.assetReference.deleteMany({
              where: {
                assetId: currentCourse.coverAssetId,
                entityType: 'Course',
                entityId: id,
                field: 'cover',
              },
            })
          }
          await attachAssetReference({ assetId: asset.id, entityType: 'Course', entityId: id, field: 'cover' }, tx)
        })
      } catch (transactionError) {
        // The StoredAsset was created before the parent transaction. Remove it
        // only when no concurrent reference appeared; otherwise let normal GC
        // handle it conservatively.
        await discardUnreferencedAsset(asset).catch(() => undefined)
        throw transactionError
      }

      return success(res, { coverUrl: await getSignedAssetUrl(asset.id) }, '封面上传成功')
    } catch (err) {
      logger.error('上传封面错误', err)
      return error(res, '上传封面失败')
    }
  },

  // 移除学生
  async removeStudent(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { courseId, studentId } = req.params

      // 验证课程权限
      const course = await prisma.course.findUnique({
        where: { id: courseId }
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      if (!canAccessCourseRoster(course, userId, userRole)) {
        return forbidden(res, '无权限管理此课程的学生')
      }

      // 删除课程学生关系
      await prisma.courseStudent.deleteMany({
        where: {
          courseId,
          studentId,
        }
      })

      return success(res, null, '学生已从课程中移除')
    } catch (err) {
      logger.error('移除学生错误', err)
      return error(res, '移除学生失败')
    }
  },

  // 冻结/解冻学生账号
  async toggleFreezeStudent(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { courseId, studentId } = req.params
      const { isFrozen } = req.body

      // 验证课程权限
      const course = await prisma.course.findUnique({
        where: { id: courseId }
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      if (!canAccessCourseRoster(course, userId, userRole)) {
        return forbidden(res, '无权限管理此课程的学生')
      }

      // 验证学生是否在该课程中
      const courseStudent = await prisma.courseStudent.findFirst({
        where: {
          courseId,
          studentId,
        }
      })

      if (!courseStudent) {
        return error(res, '该学生未加入此课程')
      }

      // 更新学生冻结状态
      await prisma.user.update({
        where: { id: studentId },
        data: {
          isFrozen,
          tokenVersion: { increment: 1 },
        }
      })

      return success(res, { isFrozen }, isFrozen ? '学生账号已冻结' : '学生账号已解冻')
    } catch (err) {
      logger.error('冻结/解冻学生错误', err)
      return error(res, '操作失败')
    }
  },

  // 停止招募 - 不再允许新学生加入
  async stopRecruiting(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const course = await prisma.course.findUnique({
        where: { id }
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      // 权限检查
      if (userRole !== UserRole.ADMIN && course.creatorId !== userId) {
        return forbidden(res, '无权限修改此课程')
      }

      // 只有已发布的课程可以停止招募
      if (course.status !== CourseStatus.PUBLISHED) {
        return error(res, '只有已发布的课程可以停止招募')
      }

      // 更新招募状态
      const updatedCourse = await prisma.course.update({
        where: { id },
        data: { isRecruiting: false },
        include: {
          creator: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        }
      })

      // 清除课程列表缓存
      cache.clearPattern(`courses:list:`)
      logger.info('[停止招募] 缓存已清除', { courseId: id })

      return success(res, updatedCourse, '课程已停止招募，现有学生不受影响')
    } catch (err) {
      logger.error('停止招募错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 恢复招募 - 重新允许新学生加入
  async resumeRecruiting(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const course = await prisma.course.findUnique({
        where: { id }
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      // 权限检查
      if (userRole !== UserRole.ADMIN && course.creatorId !== userId) {
        return forbidden(res, '无权限修改此课程')
      }

      // 只有已完结的课程不能恢复招募
      if (course.status === CourseStatus.COMPLETED) {
        return error(res, '已完结的课程无法恢复招募')
      }

      if (course.isLibrary) {
        return error(res, '库课程不能开启招募')
      }

      // 更新招募状态
      const updatedCourse = await prisma.course.update({
        where: { id },
        data: { isRecruiting: true },
        include: {
          creator: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        }
      })

      // 清除课程列表缓存
      cache.clearPattern(`courses:list:`)
      logger.info('[恢复招募] 缓存已清除', { courseId: id })

      return success(res, updatedCourse, '课程已恢复招募')
    } catch (err) {
      logger.error('恢复招募错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 复制课程 - 复制课程、作业和打卡，不复制学生数据
  async cloneCourse(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      // 获取原课程详情
      const originalCourse = await prisma.course.findUnique({
        where: { id },
        include: {
          assignments: true,
          checkins: true,
        }
      })

      if (!originalCourse) {
        return notFound(res, '课程不存在')
      }

      // 权限检查：只有管理员或课程创建者可以复制
      if (userRole !== UserRole.ADMIN && originalCourse.creatorId !== userId) {
        return forbidden(res, '无权限复制此课程')
      }

      // 生成新课程码
      const { generateCourseCode } = await import('../utils/courseCode')
      const newCourseCode = await generateCourseCode()

      // 创建新课程（草稿状态）
      const newCourse = await prisma.course.create({
        data: {
          title: `${originalCourse.title} (复制)`,
          description: originalCourse.description,
          courseCode: newCourseCode,
          creatorId: userId!,
          status: CourseStatus.DRAFT,
          isRecruiting: true,
        },
        include: {
          creator: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        }
      })

      // 复制作业（清空截止时间）
      if (originalCourse.assignments.length > 0) {
        await prisma.assignment.createMany({
          data: originalCourse.assignments.map(assignment => ({
            courseId: newCourse.id,
            title: assignment.title,
            description: assignment.description,
            status: 'DRAFT' as const,
            questions: assignment.questions as any,
            videos: assignment.videos as any,
            // 不复制 deadline，让教师重新设置
          }))
        })
      }

      // 复制打卡
      if (originalCourse.checkins.length > 0) {
        await prisma.checkin.createMany({
          data: originalCourse.checkins.map(checkin => ({
            courseId: newCourse.id,
            title: checkin.title,
            description: checkin.description,
            creatorId: userId!,
          }))
        })
      }

      // 获取复制后的完整课程信息
      const clonedCourseWithDetails = await prisma.course.findUnique({
        where: { id: newCourse.id },
        include: {
          creator: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          },
          _count: {
            select: {
              students: true,
              assignments: true,
              checkins: true,
            }
          }
        }
      })

      // 清除课程列表缓存
      cache.clearPattern(`courses:list:`)
      logger.info('[复制课程] 缓存已清除', { courseId: newCourse.id })

      return success(res, {
        ...clonedCourseWithDetails,
        studentCount: 0,
        _count: undefined,
      }, `课程复制成功，包含 ${originalCourse.assignments.length} 个作业和 ${originalCourse.checkins.length} 个打卡`)
    } catch (err) {
      logger.error('复制课程错误', err)
      return error(res, '复制课程失败')
    }
  },

  // 获取课程的作业列表（学生视角）
  async getAssignments(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      // 管理员可以直接访问所有课程
      if (userRole !== UserRole.ADMIN) {
        // 教师和学生需要检查权限
        if (userRole === UserRole.STUDENT) {
          const courseStudent = await prisma.courseStudent.findFirst({
            where: {
              courseId: id,
              studentId: userId,
              status: { in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED] }
            }
          })

          if (!courseStudent) {
            return forbidden(res, '您不是该课程的学员')
          }
        } else {
          // 教师需要验证课程存在且有权限
          const course = await prisma.course.findFirst({
            where: {
              id,
              OR: [
                { creatorId: userId },
                { shares: { some: { sharedTo: userId } } }
              ]
            }
          })
          if (!course) {
            return forbidden(res, '您没有权限访问该课程')
          }
        }
      }

      // 获取课程的已发布作业（教师看全部，学生看已发布）
      const assignments = await prisma.assignment.findMany({
        where: {
          courseId: id,
          ...(userRole === 'STUDENT' ? { status: 'PUBLISHED' } : {})
        },
        include: {
          submissions: {
            where: {
              studentId: userId
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
        }
      })

      // 格式化返回数据
      const formattedAssignments = assignments.map(assignment => ({
        ...assignment,
        submitted: assignment.submissions.length > 0,
        mySubmission: assignment.submissions.length > 0 ? assignment.submissions[0] : undefined,
        submissionCount: assignment._count?.submissions || 0
      }))

      return success(res, {
        list: formattedAssignments,
        total: formattedAssignments.length,
      })
    } catch (err) {
      logger.error('获取课程作业错误', err)
      return error(res, '获取课程作业失败')
    }
  },

  // 获取课程的打卡列表（学生视角）
  async getCheckins(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      // 管理员可以直接访问所有课程
      if (userRole !== UserRole.ADMIN) {
        // 教师和学生需要检查权限
        if (userRole === UserRole.STUDENT) {
          const courseStudent = await prisma.courseStudent.findFirst({
            where: {
              courseId: id,
              studentId: userId,
              status: { in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED] }
            }
          })

          if (!courseStudent) {
            return forbidden(res, '您不是该课程的学员')
          }
        } else {
          // 教师需要验证课程存在且有权限
          const course = await prisma.course.findFirst({
            where: {
              id,
              OR: [
                { creatorId: userId },
                { shares: { some: { sharedTo: userId } } }
              ]
            }
          })
          if (!course) {
            return forbidden(res, '您没有权限访问该课程')
          }
        }
      }

      // 获取课程的所有打卡
      const checkins = await prisma.checkin.findMany({
        where: {
          courseId: id
        },
        include: {
          submissions: {
            where: {
              studentId: userId
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
        }
      })

      // 格式化返回数据
      const formattedCheckins = checkins.map(checkin => ({
        ...checkin,
        submitted: checkin.submissions.length > 0,
        submission: checkin.submissions.length > 0 ? checkin.submissions[0] : undefined,
        submissionCount: checkin._count?.submissions || 0
      }))

      return success(res, {
        list: formattedCheckins,
        total: formattedCheckins.length,
      })
    } catch (err) {
      logger.error('获取课程打卡错误', err)
      return error(res, '获取课程打卡失败')
    }
  },

  // 分享课程给指定用户
  async shareCourse(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params
      const { userIds } = req.body // 要分享给的用户ID数组

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return error(res, '请选择要分享的用户')
      }

      // 只有管理员可以分享课程
      if (userRole !== UserRole.ADMIN) {
        return forbidden(res, '只有管理员可以分享课程')
      }

      // 检查课程是否存在
      const course = await prisma.course.findUnique({
        where: { id }
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      // 只能分享自己创建的课程
      if (course.creatorId !== userId) {
        return forbidden(res, '只能分享自己创建的课程')
      }

      // 批量创建分享记录
      const shareData = userIds.map(targetUserId => ({
        courseId: id,
        sharedBy: userId!,
        sharedTo: targetUserId,
      }))

      // 使用 upsert 避免重复分享
      for (const data of shareData) {
        await prisma.courseShare.upsert({
          where: {
            courseId_sharedTo: {
              courseId: data.courseId,
              sharedTo: data.sharedTo
            }
          },
          update: {}, // 已存在则不更新
          create: data
        })
      }

      logger.info('[分享课程] 课程已分享', { courseId: id, recipientCount: userIds.length })

      return success(res, {
        sharedCount: userIds.length
      }, `课程已分享给 ${userIds.length} 个用户`)
    } catch (err) {
      logger.error('分享课程错误', err)
      return error(res, '分享课程失败')
    }
  },

  // 获取分享给我的课程列表
  async getSharedToMe(req: Request, res: Response) {
    try {
      const userId = req.user?.userId

      const shares = await prisma.courseShare.findMany({
        where: { sharedTo: userId },
        include: {
          course: {
            include: {
              creator: {
                select: {
                  id: true,
                  nickname: true,
                  username: true,
                }
              },
              _count: {
                select: {
                  students: true,
                  assignments: true,
                  checkins: true,
                }
              }
            }
          },
          sharer: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })

      // 格式化返回数据
      const formattedShares = shares.map(share => {
        // A share grants reusable course content, not the original course
        // join secret or enrolled student identity data.
        const { courseCode: _courseCode, _count, ...courseFields } = share.course
        return {
          id: share.id,
          createdAt: share.createdAt,
          course: {
            ...courseFields,
            studentCount: _count.students,
            _count: undefined,
          },
          sharer: share.sharer,
        }
      })

      return success(res, {
        list: formattedShares,
        total: formattedShares.length,
      })
    } catch (err) {
      logger.error('获取分享课程错误', err)
      return error(res, '获取分享课程失败')
    }
  },

  // 取消分享
  async removeShare(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { shareId } = req.params

      const share = await prisma.courseShare.findUnique({
        where: { id: shareId },
        include: { course: true }
      })

      if (!share) {
        return notFound(res, '分享记录不存在')
      }

      // 只有分享者或管理员可以取消分享
      if (share.sharedBy !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权取消此分享')
      }

      await prisma.courseShare.delete({
        where: { id: shareId }
      })

      logger.info('[取消分享] 分享记录已删除', { shareId })

      return success(res, null, '已取消分享')
    } catch (err) {
      logger.error('取消分享错误', err)
      return error(res, '取消分享失败')
    }
  },

  // 从分享复制课程
  async cloneFromShare(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const { shareId } = req.params

      // 检查分享记录是否存在
      const share = await prisma.courseShare.findUnique({
        where: { id: shareId },
        include: {
          course: {
            include: {
              assignments: true,
              checkins: true,
            }
          }
        }
      })

      if (!share) {
        return notFound(res, '分享记录不存在')
      }

      // 验证是否是分享给自己的
      if (share.sharedTo !== userId) {
        return forbidden(res, '此课程未分享给您')
      }

      const originalCourse = share.course

      // 生成新课程码
      const newCourseCode = await generateCourseCode()

      // 创建新课程（草稿状态）
      const newCourse = await prisma.course.create({
        data: {
          title: `${originalCourse.title} (复制)`,
          description: originalCourse.description,
          courseCode: newCourseCode,
          creatorId: userId!,
          status: CourseStatus.DRAFT,
          isRecruiting: true,
        },
        include: {
          creator: {
            select: {
              id: true,
              nickname: true,
              username: true,
            }
          }
        }
      })

      // 复制作业
      if (originalCourse.assignments.length > 0) {
        await prisma.assignment.createMany({
          data: originalCourse.assignments.map(assignment => ({
            courseId: newCourse.id,
            title: assignment.title,
            description: assignment.description,
            status: 'DRAFT' as const,
            questions: assignment.questions as any,
            videos: assignment.videos as any,
          }))
        })
      }

      // 复制打卡
      if (originalCourse.checkins.length > 0) {
        await prisma.checkin.createMany({
          data: originalCourse.checkins.map(checkin => ({
            courseId: newCourse.id,
            title: checkin.title,
            description: checkin.description,
            creatorId: userId!,
          }))
        })
      }

      // 清除缓存
      cache.clearPattern(`courses:list:`)
      logger.info('[从分享复制] 课程已创建', { courseId: newCourse.id })

      return success(res, newCourse, `课程复制成功`)
    } catch (err) {
      logger.error('从分享复制课程错误', err)
      return error(res, '复制课程失败')
    }
  },
}
