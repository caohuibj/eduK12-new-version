import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound } from '../utils/response'
import { UserRole, AssignmentStatus, SubmissionStatus, CourseStudentStatus, Question } from '../types'
import { logger } from '../utils/logger'
import { Messages } from '../constants'
import { getPaginationParams, buildPaginatedResult } from '../utils/pagination'
import { z } from 'zod'
import * as XLSX from 'xlsx'
import { canAccessCourseContent, hasActiveCourseMembership } from '../utils/courseAccess'
import { hydrateAssetReferences } from '../services/assetStorage'

const createAssignmentSchema = z.object({
  courseId: z.string().min(1, '课程ID不能为空'),
  title: z.string().min(1, '作业标题不能为空'),
  description: z.string().optional(),
  deadline: z.string().optional(), // 接受任何字符串格式，后端再转换
  questions: z.array(z.any()).optional(),
  videos: z.array(z.any()).optional(), // 改为any支持新结构
  documents: z.array(z.any()).optional(),
  images: z.array(z.any()).optional(),
  tags: z.array(z.string().max(20, '标签最多20个字符')).max(10, '最多10个标签').optional().default([]),
  content: z.string().optional(),
})

const updateAssignmentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  deadline: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  questions: z.array(z.any()).optional(),
  videos: z.array(z.any()).optional(),
  documents: z.array(z.any()).optional(),
  images: z.array(z.any()).optional(),
  tags: z.array(z.string().max(20, '标签最多20个字符')).max(10, '最多10个标签').optional(),
  content: z.string().optional(),
})

const submitSchema = z.object({
  content: z.string().optional(),
  answers: z.record(z.string()).optional(),
})

const gradeSchema = z.object({
  comment: z.string().min(1, '评语不能为空'),
})

export const assignmentController = {
  // 获取作业列表（添加分页优化）
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

      // 学生只能看到自己已加入课程中的已发布作业
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

      // 教师只能看到自己课程的作业，管理员可以看到所有
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
          // 未指定courseId，只看自己课程的作业
          where.courseId = { in: courseIds }
        }
      }

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

      const hydratedAssignments = await Promise.all(
        formattedAssignments.map((assignment) => hydrateAssetReferences(assignment, false)),
      )
      return success(res, buildPaginatedResult(hydratedAssignments, total, pagination))
    } catch (err) {
      logger.error('获取作业列表错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 创建作业
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const result = createAssignmentSchema.safeParse(req.body)
      if (!result.success) {
        logger.error('Schema validation error', result.error.errors)
        return error(res, result.error.errors[0].message)
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
        return forbidden(res, '无权限在此课程创建作业')
      }

      // 处理 deadline 格式 - 添加严格验证
      let deadlineDate = null
      if (deadline) {
        try {
          deadlineDate = new Date(deadline)
          // 验证日期有效性
          if (isNaN(deadlineDate.getTime())) {
            return error(res, '截止日期格式无效')
          }
          // 验证日期不能早于当前时间（允许1分钟误差）
          const now = new Date()
          if (deadlineDate.getTime() < now.getTime() - 60000) {
            return error(res, '截止日期不能早于当前时间')
          }
          // 验证日期不能超过10年
          const maxDate = new Date()
          maxDate.setFullYear(maxDate.getFullYear() + 10)
          if (deadlineDate.getTime() > maxDate.getTime()) {
            return error(res, '截止日期不能超过10年')
          }
        } catch {
          return error(res, '截止日期格式无效')
        }
      }

      const assignment = await prisma.assignment.create({
        data: {
          courseId,
          title,
          description,
          content: content || null,
          deadline: deadlineDate,
          status: AssignmentStatus.PUBLISHED,
          questions: questions || [],
          tags: tags || [],
          videos: videos || [],
          images: images || [],
          documents: documents || [],
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

      return success(res, await hydrateAssetReferences(assignment, false), '作业创建成功')
    } catch (err) {
      logger.error('创建作业错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 获取作业详情
  async detail(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const assignment = await prisma.assignment.findUnique({
        where: { id },
        select: {
          id: true,
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

      if (!assignment) {
        return notFound(res, '作业不存在')
      }

      if (userRole === UserRole.STUDENT) {
        if (!userId || !(await hasActiveCourseMembership(assignment.course.id, userId))) {
          return forbidden(res, '您不是该课程的学员')
        }
        // 学生只能看到已发布的作业
        if (assignment.status !== AssignmentStatus.PUBLISHED) {
          return forbidden(res, '无权限查看此作业')
        }
      } else if (!canAccessCourseContent(assignment.course, userId, userRole)) {
        return forbidden(res, '您没有权限访问此作业')
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

      return success(res, await hydrateAssetReferences({
        ...assignment,
        course,
        mySubmission,
      }, false))
    } catch (err) {
      logger.error('获取作业详情错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 更新作业
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
        return notFound(res, '作业不存在')
      }

      // 权限检查
      if (assignment.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限修改此作业')
      }

      const result = updateAssignmentSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const updateData: any = { ...result.data }
      if (result.data.deadline) {
        try {
          const deadlineDate = new Date(result.data.deadline)
          updateData.deadline = isNaN(deadlineDate.getTime()) ? null : deadlineDate
        } catch {
          updateData.deadline = null
        }
      }

      const updated = await prisma.assignment.update({
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

      return success(res, await hydrateAssetReferences(updated, false), '作业更新成功')
    } catch (err) {
      logger.error('更新作业错误', err)
      return error(res, Messages.COMMON.FAILED)
    }
  },

  // 删除作业
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
        return notFound(res, '作业不存在')
      }

      // 权限检查
      if (assignment.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限删除此作业')
      }

      await prisma.assignment.delete({
        where: { id }
      })

      return success(res, null, '作业已删除')
    } catch (err) {
      logger.error('删除作业错误', err)
      return error(res, '删除作业失败')
    }
  },

  // 提交作业
  async submit(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      if (!userId) {
        return error(res, '未登录')
      }

      const { id } = req.params

      const result = submitSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { content, answers } = result.data

      // 检查作业是否存在
      const assignment = await prisma.assignment.findUnique({
        where: { id }
      })

      if (!assignment) {
        return notFound(res, '作业不存在')
      }

      if (req.user?.role !== UserRole.STUDENT || !(await hasActiveCourseMembership(assignment.courseId, userId))) {
        return forbidden(res, '您不是该课程的学员')
      }

      if (assignment.status !== AssignmentStatus.PUBLISHED) {
        return error(res, '作业未发布')
      }

      if (assignment.deadline && new Date() > assignment.deadline) {
        return error(res, Messages.ASSIGNMENT.DEADLINE_PASSED)
      }

      // 检查是否已提交
      const existing = await prisma.submission.findFirst({
        where: {
          assignmentId: id,
          studentId: userId
        }
      })

      if (existing) {
        // 获取当前版本号
        const latestHistory = await prisma.submissionHistory.findFirst({
          where: { submissionId: existing.id },
          orderBy: { version: 'desc' }
        })
        const newVersion = latestHistory ? latestHistory.version + 1 : 1

        // 记录历史版本
        await prisma.submissionHistory.create({
          data: {
            submissionId: existing.id,
            content: existing.content,
            answers: existing.answers as any, // Prisma JsonValue 类型兼容
            version: newVersion,
          }
        })

        // 更新提交
        const updated = await prisma.submission.update({
          where: { id: existing.id },
          data: {
            content,
            answers: answers || {},
            submittedAt: new Date(),
            status: SubmissionStatus.SUBMITTED,
          }
        })
        return success(res, updated, '作业更新成功')
      }

      // 创建新提交
      const submission = await prisma.submission.create({
        data: {
          assignmentId: id,
          studentId: userId,
          content,
          answers: answers || {},
          status: SubmissionStatus.SUBMITTED,
        }
      })

      return success(res, submission, '作业提交成功')
    } catch (err) {
      logger.error('提交作业错误', err)
      return error(res, '提交作业失败')
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
        include: {
          course: {
            select: {
              creatorId: true,
            }
          }
        }
      })

      if (!assignment) {
        return notFound(res, '作业不存在')
      }

      // 权限检查
      if (assignment.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限查看提交')
      }

      const submissions = await prisma.submission.findMany({
        where: { assignmentId: id },
        include: {
          student: {
            select: {
              id: true,
              nickname: true,
              username: true,
              avatarUrl: true,
            }
          }
        },
        orderBy: {
          submittedAt: 'desc'
        }
      })

      return success(res, {
        list: submissions,
        total: submissions.length,
      })
    } catch (err) {
      logger.error('获取提交列表错误', err)
      return error(res, '获取提交列表失败')
    }
  },

  // 批改作业
  async grade(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id, submissionId } = req.params

      const result = gradeSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { comment } = result.data

      // 检查作业和提交
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
        return notFound(res, '作业不存在')
      }

      // 权限检查
      if (assignment.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限批改此作业')
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

      const updated = await prisma.submission.update({
        where: { id: submissionId },
        data: {
          comment,
          status: SubmissionStatus.GRADED,
          reviewedAt: new Date(),
        }
      })

      return success(res, updated, '批改成功')
    } catch (err) {
      logger.error('批改作业错误', err)
      return error(res, '批改失败')
    }
  },

  // 批量批改
  async batchGrade(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params
      const { comment } = req.body

      if (!comment) {
        return error(res, '评语不能为空')
      }

      // 检查作业
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
        return notFound(res, '作业不存在')
      }

      // 权限检查
      if (assignment.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限批改此作业')
      }

      // 获取所有未批改的提交
      const submissions = await prisma.submission.findMany({
        where: {
          assignmentId: id,
          status: { not: SubmissionStatus.GRADED }
        }
      })

      // 批量更新 - 使用事务保证原子性
      await prisma.$transaction(
        submissions.map(submission =>
          prisma.submission.update({
            where: { id: submission.id },
            data: {
              comment,
              status: SubmissionStatus.GRADED,
              reviewedAt: new Date(),
            }
          })
        )
      )

      return success(res, {
        gradedCount: submissions.length
      }, `批量批改成功，共 ${submissions.length} 份作业`)
    } catch (err) {
      logger.error('批量批改错误', err)
      return error(res, '批量批改失败')
    }
  },

  // 导出数据
  async export(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      // 检查作业
      const assignment = await prisma.assignment.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              creatorId: true,
              title: true,
            }
          }
        }
      })

      if (!assignment) {
        return notFound(res, '作业不存在')
      }

      // 权限检查
      if (assignment.course.creatorId !== userId && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限导出数据')
      }

      // 获取所有提交
      const submissions = await prisma.submission.findMany({
        where: { assignmentId: id },
        include: {
          student: {
            select: {
              nickname: true,
              username: true,
              phone: true,
            }
          }
        },
        orderBy: {
          submittedAt: 'desc'
        }
      })

      // 准备 Excel 数据
      const questions: Question[] = (assignment.questions as unknown as Question[]) || []

      const exportData = submissions.map((sub, index) => {
        const baseRecord: any = {
          '序号': index + 1,
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

      // 创建 Excel
      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '作业提交数据')

      // 设置响应头
      const fileName = `${assignment.title}_提交数据.xlsx`
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)

      // 发送文件
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      res.send(buffer)
    } catch (err) {
      logger.error('导出数据错误', err)
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
        return notFound(res, '作业不存在')
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

  // 获取我的作业（学生视角）
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

      // 获取这些课程的已发布作业
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
      logger.error('获取我的作业错误', err)
      return error(res, '获取我的作业失败')
    }
  },

  // 获取作业标签列表
  async getTags(req: Request, res: Response) {
    try {
      const { userId, role: userRole } = req.user!

      let where: any = {}

      // 教师只能看自己创建的作业标签
      if (userRole === UserRole.TEACHER) {
        const teacherCourses = await prisma.course.findMany({
          where: { creatorId: userId },
          select: { id: true }
        })
        const courseIds = teacherCourses.map(c => c.id)
        where.courseId = { in: courseIds }
      }

      const assignments = await prisma.assignment.findMany({
        where,
        select: { tags: true }
      })

      const allTags = [...new Set(assignments.flatMap(a => a.tags))]

      return success(res, { tags: allTags })
    } catch (err) {
      logger.error('获取作业标签错误', err)
      return error(res, '获取作业标签失败')
    }
  }
}
