/**
 * 课堂管理控制器
 * 
 * 功能：
 * - 创建课堂
 * - 查询课堂列表
 * - 获取课堂详情
 * - 生成课堂二维码
 * - 更新课堂状态
 * - 删除课堂
 */

import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, forbidden, notFound } from '../utils/response'
import { UserRole } from '../types'
import { logger } from '../utils/logger'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { StatsAggregator } from '../services/statsAggregator'
import { userCanManageClassroom } from '../middleware/classroomAccess'
import {
  checkClassroomLookupRateLimit,
  checkFailedClassroomCodeRateLimit,
  type ClassroomRateLimitResult,
} from '../utils/classroomRateLimiter'

// ==================== Validation Schemas ====================

const createClassroomSchema = z.object({
  name: z.string().min(1, '课堂名称不能为空'),
  courseId: z.string().min(1, '课程ID不能为空'),
  questionnaireId: z.string().optional(),
})

const updateClassroomSchema = z.object({
  name: z.string().min(1, '课堂名称不能为空').optional(),
})

// ==================== Helper Functions ====================

/**
 * 生成课堂码（6位数字）
 */
async function generateClassroomCode(): Promise<string> {
  let code: string
  let exists = true

  while (exists) {
    // 生成6位随机数字
    code = Math.floor(100000 + Math.random() * 900000).toString()

    // 检查是否已存在
    const existing = await prisma.classroom.findUnique({
      where: { code },
    })

    exists = !!existing
  }

  return code!
}


function rejectClassroomRateLimit(
  res: Response,
  result: ClassroomRateLimitResult
): boolean {
  if (!result.available) {
    error(res, '公共课堂入口暂不可用，请稍后重试', -1, 503)
    return true
  }

  if (!result.allowed) {
    res.set('Retry-After', String(result.retryAfterSeconds))
    error(res, '请求过于频繁，请稍后重试', -1, 429)
    return true
  }

  return false
}

// ==================== Controller ====================

export const classroomController = {
  // ==================== 课堂管理 ====================

  /**
   * 创建课堂
   * POST /api/classrooms
   */
  async create(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role

      if (!userId) {
        return error(res, '未登录')
      }

      // 只有教师和管理员可以创建课堂
      if (userRole !== UserRole.TEACHER && userRole !== UserRole.ADMIN) {
        return forbidden(res, '无权限创建课堂')
      }

      const result = createClassroomSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const { name, courseId, questionnaireId } = result.data

      // 检查课程是否存在
      const course = await prisma.course.findUnique({
        where: { id: courseId },
      })

      if (!course) {
        return notFound(res, '课程不存在')
      }

      // 检查权限：教师只能在自己的课程中创建课堂
      if (userRole === UserRole.TEACHER && course.creatorId !== userId) {
        return forbidden(res, '无权限在该课程中创建课堂')
      }

      // 生成课堂码（6位数字）
      const code = await generateClassroomCode()

      // 创建课堂
      const classroom = await prisma.classroom.create({
        data: {
          code,
          name,
          courseId,
          questionnaireId,
          creatorId: userId,
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            },
          },
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
      })

      logger.info('创建课堂', { classroomId: classroom.id })

      return success(res, classroom, '课堂创建成功')
    } catch (err) {
      logger.error('创建课堂错误', err)
      return error(res, '创建课堂失败')
    }
  },

  /**
   * 获取课堂列表
   * GET /api/classrooms
   */
  async list(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { courseId, status } = req.query

      let where: any = {}

      // 按课程筛选
      if (courseId) {
        where.courseId = courseId as string
      }

      // 按状态筛选
      if (status) {
        where.status = status as string
      }

      // 教师只能看到自己创建的课堂
      if (userRole === UserRole.TEACHER) {
        where.creatorId = userId
      }

      const classrooms = await prisma.classroom.findMany({
        where,
        include: {
          course: {
            select: {
              id: true,
              title: true,
            },
          },
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          _count: {
            select: {
              sessions: true,
              questions: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      return success(res, {
        list: classrooms,
        total: classrooms.length,
      })
    } catch (err) {
      logger.error('获取课堂列表错误', err)
      return error(res, '获取课堂列表失败')
    }
  },

  /**
   * 获取课堂详情
   * GET /api/classrooms/:id
   */
  async detail(req: Request, res: Response) {
    try {
      const { id } = req.params

      const classroom = await prisma.classroom.findUnique({
        where: { id },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              courseCode: true,
            },
          },
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          questions: {
            orderBy: {
              questionIndex: 'asc',
            },
          },
          _count: {
            select: {
              sessions: true,
              questions: true,
            },
          },
        },
      })

      if (!classroom) {
        return notFound(res, '课堂不存在')
      }

      return success(res, classroom)
    } catch (err) {
      logger.error('获取课堂详情错误', err)
      return error(res, '获取课堂详情失败')
    }
  },

  /**
   * 通过课堂码获取课堂信息（学生端）
   * GET /api/classrooms/code/:code
   */
  async getByCode(req: Request, res: Response) {
    try {
      const code = String(req.params.code || '').trim()
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown'

      const lookupLimit = await checkClassroomLookupRateLimit(ipAddress)
      if (rejectClassroomRateLimit(res, lookupLimit)) {
        return
      }

      if (!/^\d{6}$/.test(code)) {
        const failedLimit = await checkFailedClassroomCodeRateLimit(
          ipAddress,
          code || 'invalid'
        )
        if (rejectClassroomRateLimit(res, failedLimit)) {
          return
        }
        return notFound(res, '课堂不存在或当前不可加入')
      }

      const classroom = await prisma.classroom.findUnique({
        where: { code },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      })

      if (!classroom || !['PREPARING', 'ACTIVE'].includes(classroom.status)) {
        const failedLimit = await checkFailedClassroomCodeRateLimit(
          ipAddress,
          code
        )
        if (rejectClassroomRateLimit(res, failedLimit)) {
          return
        }
        return notFound(res, '课堂不存在或当前不可加入')
      }

      return success(res, {
        id: classroom.id,
        code: classroom.code,
        name: classroom.name,
        status: classroom.status,
        course: classroom.course,
      })
    } catch (err) {
      logger.error('通过课堂码获取课堂信息错误')
      return error(res, '获取课堂信息失败')
    }
  },

  /**
   * 更新课堂
   * PUT /api/classrooms/:id
   */
  async update(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const result = updateClassroomSchema.safeParse(req.body)
      if (!result.success) {
        return error(res, result.error.errors[0].message)
      }

      const classroom = await prisma.classroom.findUnique({
        where: { id },
      })

      if (!classroom) {
        return notFound(res, '课堂不存在')
      }

      // 权限检查
      if (!(await userCanManageClassroom(id, userId, userRole))) {
        return forbidden(res, '无权限修改此课堂')
      }

      // 已结束的课堂不能修改
      if (classroom.status === 'ENDED') {
        return error(res, '已结束的课堂不能修改')
      }

      const updated = await prisma.classroom.update({
        where: { id },
        data: result.data,
        include: {
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      })

      logger.info('更新课堂', { classroomId: id })

      return success(res, updated, '课堂更新成功')
    } catch (err) {
      logger.error('更新课堂错误', err)
      return error(res, '更新课堂失败')
    }
  },

  /**
   * 删除课堂
   * DELETE /api/classrooms/:id
   */
  async delete(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      const classroom = await prisma.classroom.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              sessions: true,
            },
          },
        },
      })

      if (!classroom) {
        return notFound(res, '课堂不存在')
      }

      // 权限检查
      if (!(await userCanManageClassroom(id, userId, userRole))) {
        return forbidden(res, '无权限删除此课堂')
      }

      // 进行中的课堂不能删除
      if (classroom.status === 'ACTIVE') {
        return error(res, '进行中的课堂不能删除')
      }

      // 有学生参与的课堂建议不删除
      if (classroom._count.sessions > 0) {
        return error(res, '该课堂已有学生参与，无法删除')
      }

      await prisma.classroom.delete({
        where: { id },
      })

      logger.info('删除课堂', { classroomId: id })

      return success(res, null, '课堂已删除')
    } catch (err) {
      logger.error('删除课堂错误', err)
      return error(res, '删除课堂失败')
    }
  },

  /**
   * 生成课堂二维码
   * GET /api/classrooms/:id/qrcode
   */
  async getQRCode(req: Request, res: Response) {
    try {
      const { id } = req.params
      const userId = req.user?.userId
      const userRole = req.user?.role

      const classroom = await prisma.classroom.findUnique({
        where: { id },
        select: {
          id: true,
          code: true,
          name: true,
        },
      })

      if (!classroom) {
        return notFound(res, '课堂不存在')
      }

      if (!(await userCanManageClassroom(id, userId, userRole))) {
        return forbidden(res, '无权限生成此课堂二维码')
      }

      // 生成二维码内容（课堂码）
      // 使用请求的 origin 或环境变量
      const origin = req.get('origin') || req.headers.origin || process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`
      const qrcodeUrl = `${origin}/student/classroom/enter?code=${classroom.code}`

      return success(res, {
        classroomId: classroom.id,
        code: classroom.code,
        name: classroom.name,
        qrcodeUrl,
      })
    } catch (err) {
      logger.error('生成课堂二维码错误', err)
      return error(res, '生成二维码失败')
    }
  },

  // ==================== 题目管理 ====================

  /**
   * 创建题目
   * POST /api/classrooms/:id/questions
   */
  async createQuestion(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id: classroomId } = req.params

      const { questionContent, timeLimit } = req.body

      if (!questionContent) {
        return error(res, '题目内容不能为空')
      }

      // 检查课堂是否存在
      const classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
        include: {
          _count: {
            select: { questions: true },
          },
        },
      })

      if (!classroom) {
        return notFound(res, '课堂不存在')
      }

      // 权限检查
      if (!(await userCanManageClassroom(classroomId, userId, userRole))) {
        return forbidden(res, '无权限添加题目')
      }

      // 只能在准备中或进行中的课堂添加题目
      if (classroom.status === 'ENDED') {
        return error(res, '已结束的课堂不能添加题目')
      }

      // 创建题目
      const question = await prisma.classroomQuestion.create({
        data: {
          classroomId,
          questionIndex: classroom._count.questions + 1,
          questionContent,
          timeLimit,
        },
      })

      logger.info('创建课堂题目', { classroomId, questionId: question.id })

      return success(res, question, '题目创建成功')
    } catch (err) {
      logger.error('创建课堂题目错误', err)
      return error(res, '创建题目失败')
    }
  },

  /**
   * 更新题目
   * PUT /api/classrooms/:classroomId/questions/:questionId
   */
  async updateQuestion(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { classroomId, questionId } = req.params

      const { questionContent, timeLimit } = req.body

      // 检查题目是否存在
      const question = await prisma.classroomQuestion.findFirst({
        where: {
          id: questionId,
          classroomId,
        },
        include: {
          classroom: true,
        },
      })

      if (!question) {
        return notFound(res, '题目不存在')
      }

      // 权限检查
      if (!(await userCanManageClassroom(classroomId, userId, userRole))) {
        return forbidden(res, '无权限修改题目')
      }

      // 已结束的课堂不能修改题目
      if (question.classroom.status === 'ENDED') {
        return error(res, '已结束的课堂不能修改题目')
      }

      // 已开始答题的题目不能修改
      if (question.startedAt) {
        return error(res, '已开始答题的题目不能修改')
      }

      // 更新题目
      const updated = await prisma.classroomQuestion.update({
        where: { id: questionId },
        data: {
          questionContent,
          timeLimit,
        },
      })

      logger.info('更新课堂题目', { classroomId, questionId })

      return success(res, updated, '题目更新成功')
    } catch (err) {
      logger.error('更新课堂题目错误', err)
      return error(res, '更新题目失败')
    }
  },

  /**
   * 删除题目
   * DELETE /api/classrooms/:classroomId/questions/:questionId
   */
  async deleteQuestion(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { classroomId, questionId } = req.params

      // 检查题目是否存在
      const question = await prisma.classroomQuestion.findFirst({
        where: {
          id: questionId,
          classroomId,
        },
        include: {
          classroom: true,
          _count: {
            select: { answers: true },
          },
        },
      })

      if (!question) {
        return notFound(res, '题目不存在')
      }

      // 权限检查
      if (!(await userCanManageClassroom(classroomId, userId, userRole))) {
        return forbidden(res, '无权限删除题目')
      }

      // 已结束的课堂不能删除题目
      if (question.classroom.status === 'ENDED') {
        return error(res, '已结束的课堂不能删除题目')
      }

      // 有学生作答的题目不能删除
      if (question._count.answers > 0) {
        return error(res, '该题目已有学生作答，无法删除')
      }

      // 删除题目
      await prisma.classroomQuestion.delete({
        where: { id: questionId },
      })

      // 重新排序题目序号
      const questions = await prisma.classroomQuestion.findMany({
        where: { classroomId },
        orderBy: { questionIndex: 'asc' },
      })

      for (let i = 0; i < questions.length; i++) {
        if (questions[i].questionIndex !== i + 1) {
          await prisma.classroomQuestion.update({
            where: { id: questions[i].id },
            data: { questionIndex: i + 1 },
          })
        }
      }

      logger.info('删除课堂题目', { classroomId, questionId })

      return success(res, null, '题目已删除')
    } catch (err) {
      logger.error('删除课堂题目错误', err)
      return error(res, '删除题目失败')
    }
  },

  /**
   * 复制课堂（复用题目）
   * POST /api/classrooms/:id/duplicate
   */
  async duplicate(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id } = req.params

      // 查找原课堂
      const originalClassroom = await prisma.classroom.findUnique({
        where: { id },
        include: {
          questions: {
            orderBy: { questionIndex: 'asc' },
          },
        },
      })

      if (!originalClassroom) {
        return notFound(res, '课堂不存在')
      }

      // 权限检查
      if (!(await userCanManageClassroom(id, userId, userRole))) {
        return forbidden(res, '无权限复制此课堂')
      }

      // 生成新的课堂码
      const code = await generateClassroomCode()

      // 创建新课堂
      const newClassroom = await prisma.classroom.create({
        data: {
          code,
          name: `${originalClassroom.name} (副本)`,
          courseId: originalClassroom.courseId,
          questionnaireId: originalClassroom.questionnaireId,
          creatorId: userId!,
          // 复制题目
          questions: {
            create: originalClassroom.questions.map((q) => ({
              questionIndex: q.questionIndex,
              questionContent: q.questionContent as any, // 类型转换
              timeLimit: q.timeLimit,
            })),
          },
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            },
          },
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          questions: true,
        },
      })

      logger.info('复制课堂', {
        originalClassroomId: id,
        newClassroomId: newClassroom.id,
      })

      return success(res, newClassroom, '课堂复制成功')
    } catch (err) {
      logger.error('复制课堂错误', err)
      return error(res, '复制课堂失败')
    }
  },

  /**
   * 获取题目列表
   * GET /api/classrooms/:id/questions
   */
  async listQuestions(req: Request, res: Response) {
    try {
      const { id: classroomId } = req.params

      const questions = await prisma.classroomQuestion.findMany({
        where: { classroomId },
        orderBy: { questionIndex: 'asc' },
        include: {
          _count: {
            select: { answers: true },
          },
        },
      })

      return success(res, questions)
    } catch (err) {
      logger.error('获取题目列表错误', err)
      return error(res, '获取题目列表失败')
    }
  },

  /**
   * 获取题目历史统计
   * GET /api/classrooms/:classroomId/questions/:questionId/stats
   */
  async getQuestionStats(req: Request, res: Response) {
    try {
      const { classroomId, questionId } = req.params

      // 获取题目信息
      const question = await prisma.classroomQuestion.findFirst({
        where: {
          id: questionId,
          classroomId,
        },
      })

      if (!question) {
        return notFound(res, '题目不存在')
      }

      // 统计答案数量
      const answerCount = await prisma.classroomAnswer.count({
        where: { questionId },
      })

      // 获取会话总数
      const totalSessions = await prisma.classroomSession.count({
        where: { classroomId },
      })

      // 统计每个选项的选择人数（单选题/多选题）
      let optionStats = null
      if (question.questionContent && typeof question.questionContent === 'object') {
        const content = question.questionContent as any
        
        if (content.type === 'single_choice' || content.type === 'multiple_choice') {
          const answers = await prisma.classroomAnswer.findMany({
            where: { questionId },
            select: { answer: true },
          })

          const optionCounts: Record<string, number> = {}
          answers.forEach((a) => {
            const answerValue = a.answer
            
            if (Array.isArray(answerValue)) {
              answerValue.forEach((option) => {
                if (typeof option === 'string') {
                  optionCounts[option] = (optionCounts[option] || 0) + 1
                }
              })
            } else if (typeof answerValue === 'string') {
              if (answerValue.includes(',')) {
                answerValue.split(',').forEach((option) => {
                  const trimmed = option.trim()
                  if (trimmed) {
                    optionCounts[trimmed] = (optionCounts[trimmed] || 0) + 1
                  }
                })
              } else {
                optionCounts[answerValue] = (optionCounts[answerValue] || 0) + 1
              }
            }
          })

          optionStats = optionCounts
        }
      }

      // 获取文本答案（填空题）
      let textAnswers = null
      let wordCloud = null
      if (question.questionContent && typeof question.questionContent === 'object') {
        const content = question.questionContent as any
        if (content.type === 'fill_blank' || content.type === 'text_input') {
          // 使用 StatsAggregator 生成词云数据
          const statsAggregator = new StatsAggregator()
          try {
            logger.info('开始生成词云数据', { questionId, questionType: content.type })
            const questionStats = await statsAggregator.getQuestionStats(questionId)
            logger.debug('词云数据生成结果', {
              hasStats: !!questionStats?.stats,
              hasTopWords: !!questionStats?.stats?.topWords,
              topWordsCount: questionStats?.stats?.topWords?.length || 0,
              hasWordFrequency: !!questionStats?.stats?.wordFrequency,
            })
            if (questionStats && questionStats.stats) {
              wordCloud = {
                topWords: questionStats.stats.topWords,
                wordFrequency: questionStats.stats.wordFrequency,
              }
              logger.debug('词云数据已设置', {
                topWordsCount: wordCloud.topWords?.length || 0,
                wordFrequencyCount: Object.keys(wordCloud.wordFrequency || {}).length,
              })
            }
          } catch (error) {
            logger.error('生成词云数据失败', error)
          }
          
          // 保留 textAnswers 用于向后兼容
          const answers = await prisma.classroomAnswer.findMany({
            where: { questionId },
            select: { answer: true, submittedAt: true },
            orderBy: { submittedAt: 'desc' },
            take: 100,
          })

          textAnswers = answers.map((a) => ({
            text: a.answer as string,
            timestamp: a.submittedAt.getTime(),
          }))
        }
      }

      const stats = {
        questionId,
        answerCount,
        totalSessions,
        submissionRate: totalSessions > 0 ? (answerCount / totalSessions) * 100 : 0,
        optionStats,
        textAnswers,
        wordCloud,
      }

      return success(res, {
        question,
        stats,
      })
    } catch (err) {
      logger.error('获取题目统计错误', err)
      return error(res, '获取题目统计失败')
    }
  },

  /**
   * 导出课堂答题数据
   * GET /api/classrooms/:id/export
   */
  async exportData(req: Request, res: Response) {
    try {
      const userId = req.user?.userId
      const userRole = req.user?.role
      const { id: classroomId } = req.params

      // 检查课堂
      const classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
        include: {
          course: {
            select: { title: true },
          },
          questions: {
            orderBy: { questionIndex: 'asc' },
          },
        },
      })

      if (!classroom) {
        return notFound(res, '课堂不存在')
      }

      // 权限检查
      if (!(await userCanManageClassroom(classroomId, userId, userRole))) {
        return forbidden(res, '无权限导出此课堂数据')
      }

      // 获取所有答案
      const answers = await prisma.classroomAnswer.findMany({
        where: { classroomId },
        orderBy: [
          { questionId: 'asc' },
          { submittedAt: 'asc' },
        ],
      })

      // 获取所有学生会话
      const sessions = await prisma.classroomSession.findMany({
        where: { classroomId },
      })

      // 获取所有学生信息
      const studentIds = [...new Set(sessions.map(s => s.studentId))]
      const students = await prisma.user.findMany({
        where: { id: { in: studentIds } },
        select: {
          id: true,
          username: true,
          nickname: true,
        },
      })

      // 创建映射
      const sessionMap = new Map(sessions.map(s => [s.id, s]))
      const studentMap = new Map(students.map(s => [s.id, s]))

      // 格式化导出数据
      const exportData = {
        classroom: {
          id: classroom.id,
          name: classroom.name,
          code: classroom.code,
          course: classroom.course.title,
          createdAt: classroom.createdAt,
          status: classroom.status,
        },
        questions: classroom.questions.map(q => ({
          id: q.id,
          index: q.questionIndex,
          content: q.questionContent,
          startedAt: q.startedAt,
          endedAt: q.endedAt,
        })),
        answers: answers.map(a => {
          const session = sessionMap.get(a.sessionId)
          const student = session ? studentMap.get(session.studentId) : null
          const question = classroom.questions.find(q => q.id === a.questionId)

          return {
            questionIndex: question?.questionIndex || 0,
            studentId: session?.studentId || '',
            studentName: student?.nickname || student?.username || '未知学生',
            answer: a.answer,
            submittedAt: a.submittedAt,
          }
        }),
        summary: {
          totalQuestions: classroom.questions.length,
          totalAnswers: answers.length,
          uniqueStudents: studentIds.length,
        },
      }

      logger.info('导出课堂数据', { classroomId })

      return success(res, exportData)
    } catch (err) {
      logger.error('导出课堂数据错误', err)
      return error(res, '导出数据失败')
    }
  },
}
