/**
 * 课堂 Socket.IO 事件处理器
 * 
 * 功能：
 * - 教师端事件处理
 * - 学生端事件处理
 * - 大屏端事件处理
 * - 课堂房间管理
 */

import { Socket } from 'socket.io'
import { socketService } from './socketService'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { StatsAggregator } from './statsAggregator'

interface JoinClassroomData {
  classroomId: string
  role: 'teacher' | 'student' | 'bigscreen'
  userId?: string
  studentId?: string
}

interface SubmitAnswerData {
  classroomId: string
  questionId: string
  sessionId: string
  answer: any
}

export class ClassroomSocketHandler {
  // 存储活动的倒计时定时器
  private activeTimers: Map<string, NodeJS.Timeout> = new Map()

  /**
   * 初始化事件处理器
   */
  initialize(): void {
    const namespace = socketService.getClassroomNamespace()

    namespace.on('connection', (socket: Socket) => {
      logger.info(`新 Socket 连接: ${socket.id}`)

      // 教师端事件
      socket.on('teacher:join', (data: JoinClassroomData) => this.handleTeacherJoin(socket, data))
      socket.on('teacher:start', (data) => this.handleTeacherStart(socket, data))
      socket.on('teacher:next', (data) => this.handleTeacherNext(socket, data))
      socket.on('teacher:end', (data) => this.handleTeacherEnd(socket, data))
      socket.on('teacher:close', (data) => this.handleTeacherClose(socket, data))

      // 学生端事件
      socket.on('student:join', (data: JoinClassroomData) => this.handleStudentJoin(socket, data))
      socket.on('student:submit', (data: SubmitAnswerData) => this.handleStudentSubmit(socket, data))
      socket.on('student:leave', (data) => this.handleStudentLeave(socket, data))

      // 大屏端事件
      socket.on('bigscreen:join', (data: JoinClassroomData) => this.handleBigscreenJoin(socket, data))
      socket.on('bigscreen:close', (data: any) => this.handleBigscreenClose(socket, data))

      // 断开连接
      socket.on('disconnect', () => this.handleDisconnect(socket))
    })

    logger.info('课堂 Socket.IO 事件处理器已初始化')
  }

  /**
   * 处理教师加入课堂
   */
  private async handleTeacherJoin(socket: Socket, data: JoinClassroomData): Promise<void> {
    try {
      const { classroomId, role, userId } = data

      // 验证权限
      const classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
        include: { creator: true },
      })

      if (!classroom) {
        socket.emit('error', { message: '课堂不存在' })
        return
      }

      // 加入房间
      const room = `classroom:${classroomId}`
      socket.join(room)
      socket.join(`${room}:teacher`)

      // 存储会话信息
      socket.data.classroomId = classroomId
      socket.data.role = role
      socket.data.userId = userId

      logger.info(`教师加入课堂`, { classroomId, userId })

      // 发送当前课堂状态
      socket.emit('teacher:joined', {
        classroomId,
        status: classroom.status,
      })
    } catch (error) {
      logger.error('处理教师加入课堂错误', error)
      socket.emit('error', { message: '加入课堂失败' })
    }
  }

  /**
   * 处理学生加入课堂
   */
  private async handleStudentJoin(socket: Socket, data: JoinClassroomData): Promise<void> {
    try {
      const { classroomId, role, studentId } = data

      // 验证课堂
      const classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
        include: { course: true },
      })

      if (!classroom) {
        socket.emit('error', { message: '课堂不存在' })
        return
      }

      if (classroom.status === 'ENDED') {
        socket.emit('error', { message: '课堂已结束' })
        return
      }

      // 临时课堂模式：允许任何人加入
      let session
      let actualStudentId: string

      if (studentId) {
        // 正式学生模式
        actualStudentId = studentId
        
        // 创建或获取会话
        session = await prisma.classroomSession.findUnique({
          where: {
            classroomId_studentId: {
              classroomId,
              studentId: actualStudentId,
            },
          },
        })

        if (!session) {
          session = await prisma.classroomSession.create({
            data: {
              classroomId,
              studentId: actualStudentId,
              isTemporary: false,
            },
          })
        }
      } else {
        // 临时学生模式：使用socket ID作为临时标识
        actualStudentId = `temp_${socket.id}`
        
        // 检查是否已有临时会话
        session = await prisma.classroomSession.findUnique({
          where: {
            classroomId_studentId: {
              classroomId,
              studentId: actualStudentId,
            },
          },
        })

        if (!session) {
          session = await prisma.classroomSession.create({
            data: {
              classroomId,
              studentId: actualStudentId,
              isTemporary: true,
            },
          })
        }
      }

      // 加入房间
      const room = `classroom:${classroomId}`
      socket.join(room)
      socket.join(`${room}:students`)

      // 存储会话信息
      socket.data.classroomId = classroomId
      socket.data.role = role
      socket.data.studentId = actualStudentId
      socket.data.sessionId = session.id

      logger.info(`学生加入课堂`, { 
        classroomId, 
        studentId: studentId || `临时学生(${actualStudentId})`, 
        sessionId: session.id,
        isTemporary: !studentId
      })

      // 发送当前课堂状态
      socket.emit('student:joined', {
        classroomId,
        sessionId: session.id,
        status: classroom.status,
      })

      // 检查是否有正在进行的题目，如果有则推送给新加入的学生
      const activeQuestion = await prisma.classroomQuestion.findFirst({
        where: {
          classroomId,
          startedAt: { not: null },
          endedAt: null,
        },
      })

      if (activeQuestion) {
        const startedAt = activeQuestion.startedAt!.getTime()
        const now = Date.now()
        const elapsedTime = Math.floor((now - startedAt) / 1000)
        const remainingTime = (activeQuestion.timeLimit || 60) - elapsedTime

        logger.info(`学生加入时检测到正在进行的题目，推送题目`, {
          classroomId,
          studentId: actualStudentId,
          questionId: activeQuestion.id,
          remainingTime,
        })

        // 推送当前题目给学生
        socket.emit('broadcast:question', {
          questionId: activeQuestion.id,
          questionContent: activeQuestion.questionContent,
          timeLimit: activeQuestion.timeLimit,
          questionIndex: activeQuestion.questionIndex,
          remainingTime: Math.max(0, remainingTime), // 剩余时间
        })
      }

      // 更新在线人数
      await this.broadcastOnlineCount(classroomId)
    } catch (error) {
      logger.error('处理学生加入课堂错误', error)
      socket.emit('error', { message: '加入课堂失败' })
    }
  }

  /**
   * 处理大屏加入课堂
   */
  private async handleBigscreenJoin(socket: Socket, data: JoinClassroomData): Promise<void> {
    try {
      const { classroomId, role } = data

      // 验证课堂
      const classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
      })

      if (!classroom) {
        socket.emit('error', { message: '课堂不存在' })
        return
      }

      // 加入房间
      const room = `classroom:${classroomId}`
      socket.join(room)
      socket.join(`${room}:bigscreen`)

      // 存储会话信息
      socket.data.classroomId = classroomId
      socket.data.role = role

      logger.info(`大屏加入课堂`, { classroomId })

      // 查询当前活跃题目
      const activeQuestion = await prisma.classroomQuestion.findFirst({
        where: {
          classroomId,
          startedAt: { not: null },
          endedAt: null,
        },
      })

      // 准备返回数据
      const response: any = {
        classroomId,
        status: classroom.status,
      }

      // 如果有活跃题目，返回题目信息和剩余时间
      if (activeQuestion) {
        const startedAt = activeQuestion.startedAt!.getTime()
        const now = Date.now()
        const elapsedTime = Math.floor((now - startedAt) / 1000)
        const remainingTime = (activeQuestion.timeLimit || 60) - elapsedTime

        response.currentQuestion = {
          questionId: activeQuestion.id,
          questionContent: activeQuestion.questionContent,
          questionIndex: activeQuestion.questionIndex,
          timeLimit: activeQuestion.timeLimit,
          remainingTime: Math.max(0, remainingTime),
        }

        // 获取当前统计
        const answerCount = await prisma.classroomAnswer.count({
          where: { questionId: activeQuestion.id },
        })

        const totalSessions = await prisma.classroomSession.count({
          where: { classroomId },
        })

        // 基础统计数据
        response.stats = {
          questionId: activeQuestion.id,
          answerCount,
          totalSessions,
          submissionRate: totalSessions > 0 ? (answerCount / totalSessions) * 100 : 0,
        }

        // 如果是填空题，补充完整数据（textAnswers 和 wordCloud）
        if (activeQuestion.questionContent && 
            typeof activeQuestion.questionContent === 'object') {
          const content = activeQuestion.questionContent as any
          
          logger.info(`大屏加入：检查题目类型`, {
            questionId: activeQuestion.id,
            type: content.type,
            isFillBlank: content.type === 'fill_blank',
            isTextInput: content.type === 'text_input',
          })
          
          if (content.type === 'fill_blank' || content.type === 'text_input') {
            logger.info(`大屏加入：开始处理填空题数据`, { questionId: activeQuestion.id })
            
            try {
              // 使用 StatsAggregator 生成词云数据
              const statsAggregator = new StatsAggregator()
              const questionStats = await statsAggregator.getQuestionStats(activeQuestion.id)
              
              if (questionStats && questionStats.stats) {
                response.stats.wordCloud = {
                  topWords: questionStats.stats.topWords,
                  wordFrequency: questionStats.stats.wordFrequency,
                }
                logger.info(`大屏加入：词云数据生成成功`, {
                  questionId: activeQuestion.id,
                  hasWordCloud: !!response.stats.wordCloud,
                })
              }
            } catch (error) {
              logger.error('大屏加入：生成词云数据失败', error)
            }
            
            // 获取文本答案
            const answers = await prisma.classroomAnswer.findMany({
              where: { questionId: activeQuestion.id },
              select: { answer: true, submittedAt: true },
              orderBy: { submittedAt: 'desc' },
              take: 50,
            })

            response.stats.textAnswers = answers.map((a) => ({
              text: a.answer as string,
              timestamp: a.submittedAt.getTime(),
            }))
            
            logger.info(`大屏加入：填空题处理完成`, {
              questionId: activeQuestion.id,
              textAnswersCount: response.stats.textAnswers.length,
              hasWordCloud: !!response.stats.wordCloud,
            })
          }
        }
      }

      // 获取在线人数
      const onlineCount = await socketService.getRoomConnectionCount(`classroom:${classroomId}:students`)
      response.onlineCount = onlineCount

      // 发送当前课堂状态
      socket.emit('bigscreen:joined', response)
    } catch (error) {
      logger.error('处理大屏加入课堂错误', error)
      socket.emit('error', { message: '加入课堂失败' })
    }
  }

  /**
   * 处理教师开始答题
   */
  private async handleTeacherStart(socket: Socket, data: any): Promise<void> {
    try {
      logger.info(`=== 教师开始答题 ===`)
      logger.info(`接收到的数据`, { data })
      logger.info(`Socket ID: ${socket.id}`)
      logger.info(`Socket rooms: ${Array.from(socket.rooms).join(', ')}`)
      
      const { classroomId, questionId, questionContent, timeLimit } = data

      let question

      if (questionId) {
        // 使用已存在的题目
        logger.info(`查找已存在的题目`, { questionId })
        question = await prisma.classroomQuestion.findUnique({
          where: { id: questionId },
        })

        if (!question) {
          logger.error(`题目不存在`, { questionId })
          socket.emit('error', { message: '题目不存在' })
          return
        }

        logger.info(`找到题目`, { 
          questionId: question.id,
          questionContent: question.questionContent,
          questionIndex: question.questionIndex,
          hasEnded: !!question.endedAt
        })

        // 如果题目已经结束，说明是重新开始
        if (question.endedAt) {
          logger.info(`重新开始已完成的题目，清除旧数据`)
          
          // 清除旧的倒计时定时器
          const oldTimerKey = `${classroomId}:${questionId}`
          const oldTimer = this.activeTimers.get(oldTimerKey)
          if (oldTimer) {
            clearTimeout(oldTimer)
            this.activeTimers.delete(oldTimerKey)
            logger.info(`清除旧的倒计时定时器`)
          }
          
          // 删除之前的答案
          const deleteResult = await prisma.classroomAnswer.deleteMany({
            where: { questionId },
          })
          logger.info(`删除旧答案`, { count: deleteResult.count })
        }

        // 更新题目开始时间（重新开始时清除 endedAt）
        question = await prisma.classroomQuestion.update({
          where: { id: questionId },
          data: {
            startedAt: new Date(),
            endedAt: null, // 清除结束时间
            timeLimit: timeLimit || question.timeLimit,
          },
        })
        logger.info(`已更新题目开始时间`)
      } else {
        // 创建新题目（兼容旧逻辑）
        logger.info(`创建新题目`)
        question = await prisma.classroomQuestion.create({
          data: {
            classroomId,
            questionContent,
            timeLimit,
            questionIndex: await this.getNextQuestionIndex(classroomId),
            startedAt: new Date(),
          },
        })
        logger.info(`新题目已创建`, { questionId: question.id })
      }

      // 更新课堂状态
      logger.info(`更新课堂状态为 ACTIVE`)
      await prisma.classroom.update({
        where: { id: classroomId },
        data: {
          status: 'ACTIVE',
          startedAt: new Date(),
        },
      })

      // 广播题目到学生端和大屏
      const broadcastData = {
        questionId: question.id,
        questionContent: question.questionContent,
        timeLimit: question.timeLimit,
        questionIndex: question.questionIndex,
      }
      
      logger.info(`广播题目到房间`, { 
        room: `classroom:${classroomId}`,
        broadcastData: JSON.stringify(broadcastData)
      })
      
      // 检查房间内有多少个 socket
      const socketsInRoom = await socketService.getSocketsInRoom(`classroom:${classroomId}`)
      logger.info(`房间内 socket 数量: ${socketsInRoom.length}`, { socketIds: socketsInRoom })
      
      socketService.broadcastToRoom(`classroom:${classroomId}`, 'broadcast:question', broadcastData)
      
      logger.info(`题目已广播`)

      logger.info(`教师开始答题成功`, { classroomId, questionId: question.id })

      // 设置倒计时定时器，自动结束答题
      const actualTimeLimit = (question.timeLimit || 60) * 1000 // 转换为毫秒
      const timerKey = `${classroomId}:${question.id}`
      
      // 清除可能存在的旧定时器
      const existingTimer = this.activeTimers.get(timerKey)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      // 设置新定时器
      const timer = setTimeout(async () => {
        try {
          logger.info(`倒计时结束，自动结束答题`, { classroomId, questionId: question.id })
          
          // 检查题目是否已经结束
          const currentQuestion = await prisma.classroomQuestion.findUnique({
            where: { id: question.id },
          })
          
          if (currentQuestion && !currentQuestion.endedAt) {
            // 更新题目结束时间
            await prisma.classroomQuestion.update({
              where: { id: question.id },
              data: { endedAt: new Date() },
            })

            // 广播答题结束
            socketService.broadcastToRoom(`classroom:${classroomId}`, 'broadcast:finished', {
              questionId: question.id,
            })

            // 发送最终统计
            await this.broadcastStats(classroomId, question.id)
          }
          
          // 清除定时器记录
          this.activeTimers.delete(timerKey)
        } catch (error) {
          logger.error('自动结束答题错误', error)
        }
      }, actualTimeLimit)

      // 存储定时器
      this.activeTimers.set(timerKey, timer)
    } catch (error) {
      logger.error('处理教师开始答题错误', error)
      socket.emit('error', { message: '开始答题失败' })
    }
  }

  /**
   * 处理学生提交答案
   */
  private async handleStudentSubmit(socket: Socket, data: SubmitAnswerData): Promise<void> {
    try {
      const { classroomId, questionId, sessionId, answer } = data

      // 检查题目是否已结束
      const question = await prisma.classroomQuestion.findUnique({
        where: { id: questionId },
      })

      if (!question) {
        socket.emit('error', { message: '题目不存在' })
        return
      }

      if (question.endedAt) {
        socket.emit('error', { message: '答题已结束，无法提交答案' })
        return
      }

      // 检查是否已提交
      const existingAnswer = await prisma.classroomAnswer.findUnique({
        where: {
          questionId_sessionId: {
            questionId,
            sessionId,
          },
        },
      })

      if (existingAnswer) {
        socket.emit('error', { message: '您已提交过答案' })
        return
      }

      // 保存答案
      await prisma.classroomAnswer.create({
        data: {
          classroomId,
          questionId,
          sessionId,
          answer,
        },
      })

      logger.info(`学生提交答案`, { classroomId, questionId, sessionId })

      // 发送确认
      socket.emit('student:submitted', { questionId, success: true })

      // 广播实时统计
      await this.broadcastStats(classroomId, questionId)
    } catch (error) {
      logger.error('处理学生提交答案错误', error)
      socket.emit('error', { message: '提交答案失败' })
    }
  }

  /**
   * 处理教师结束答题
   */
  private async handleTeacherEnd(socket: Socket, data: any): Promise<void> {
    try {
      const { classroomId, questionId } = data

      // 清除可能存在的倒计时定时器
      const timerKey = `${classroomId}:${questionId}`
      const existingTimer = this.activeTimers.get(timerKey)
      if (existingTimer) {
        clearTimeout(existingTimer)
        this.activeTimers.delete(timerKey)
        logger.info(`清除倒计时定时器`, { classroomId, questionId })
      }

      // 更新题目结束时间
      await prisma.classroomQuestion.update({
        where: { id: questionId },
        data: { endedAt: new Date() },
      })

      // 广播答题结束
      socketService.broadcastToRoom(`classroom:${classroomId}`, 'broadcast:finished', {
        questionId,
      })

      // 发送最终统计
      await this.broadcastStats(classroomId, questionId)

      logger.info(`教师结束答题`, { classroomId, questionId })
    } catch (error) {
      logger.error('处理教师结束答题错误', error)
      socket.emit('error', { message: '结束答题失败' })
    }
  }

  /**
   * 处理大屏关闭
   */
  private async handleBigscreenClose(socket: Socket, data: any): Promise<void> {
    try {
      const { classroomId, questionId } = data
      
      logger.info(`大屏关闭，自动结束题目`, { classroomId, questionId })

      // 清除可能存在的倒计时定时器
      const timerKey = `${classroomId}:${questionId}`
      const existingTimer = this.activeTimers.get(timerKey)
      if (existingTimer) {
        clearTimeout(existingTimer)
        this.activeTimers.delete(timerKey)
        logger.info(`清除倒计时定时器`, { classroomId, questionId })
      }

      // 检查题目是否已经结束
      const question = await prisma.classroomQuestion.findUnique({
        where: { id: questionId },
      })

      if (!question || question.endedAt) {
        logger.info(`题目已经结束，跳过`, { questionId })
        return
      }

      // 更新题目结束时间
      await prisma.classroomQuestion.update({
        where: { id: questionId },
        data: { endedAt: new Date() },
      })

      // 广播答题结束
      socketService.broadcastToRoom(`classroom:${classroomId}`, 'broadcast:finished', {
        questionId,
      })

      // 发送最终统计
      await this.broadcastStats(classroomId, questionId)

      logger.info(`大屏关闭，题目已结束`, { classroomId, questionId })
    } catch (error) {
      logger.error('处理大屏关闭错误', error)
    }
  }

  /**
   * 处理教师下一题
   */
  private async handleTeacherNext(socket: Socket, data: any): Promise<void> {
    try {
      const { classroomId } = data

      // 通知学生和大屏准备下一题
      socketService.broadcastToRoom(`classroom:${classroomId}`, 'broadcast:next', {
        classroomId,
      })

      logger.info(`教师切换下一题`, { classroomId })
    } catch (error) {
      logger.error('处理教师下一题错误', error)
      socket.emit('error', { message: '切换题目失败' })
    }
  }

  /**
   * 处理教师关闭课堂
   */
  private async handleTeacherClose(socket: Socket, data: any): Promise<void> {
    try {
      const { classroomId } = data

      // 更新课堂状态
      await prisma.classroom.update({
        where: { id: classroomId },
        data: {
          status: 'ENDED',
          endedAt: new Date(),
        },
      })

      // 广播课堂关闭
      socketService.broadcastToRoom(`classroom:${classroomId}`, 'broadcast:closed', {
        classroomId,
      })

      logger.info(`教师关闭课堂`, { classroomId })
    } catch (error) {
      logger.error('处理教师关闭课堂错误', error)
      socket.emit('error', { message: '关闭课堂失败' })
    }
  }

  /**
   * 处理学生离开课堂
   */
  private async handleStudentLeave(socket: Socket, data: any): Promise<void> {
    try {
      const { classroomId } = data

      // 从 socket.data 获取 sessionId（优先使用 socket.data，前端传递的作为备用）
      const sessionId = socket.data.sessionId || data.sessionId

      // 参数验证：检查 sessionId 是否存在
      if (!sessionId) {
        logger.warn('学生离开课堂失败：缺少 sessionId', {
          classroomId,
          socketData: socket.data,
          receivedData: data,
        })
        return
      }

      // 更新会话离开时间
      await prisma.classroomSession.update({
        where: { id: sessionId },
        data: { leftAt: new Date() },
      })

      // 离开房间
      socket.leave(`classroom:${classroomId}`)
      socket.leave(`classroom:${classroomId}:students`)

      // 更新在线人数
      await this.broadcastOnlineCount(classroomId)

      logger.info(`学生离开课堂`, { classroomId, sessionId })
    } catch (error) {
      logger.error('处理学生离开课堂错误', error)
      // 不抛出错误，避免进程崩溃
    }
  }

  /**
   * 处理断开连接
   */
  private handleDisconnect(socket: Socket): void {
    logger.info(`Socket 断开连接: ${socket.id}`, {
      classroomId: socket.data.classroomId,
      role: socket.data.role,
      userId: socket.data.userId,
      studentId: socket.data.studentId,
    })
  }

  /**
   * 获取下一个题目序号
   */
  private async getNextQuestionIndex(classroomId: string): Promise<number> {
    const count = await prisma.classroomQuestion.count({
      where: { classroomId },
    })
    return count + 1
  }

  /**
   * 广播实时统计
   */
  private async broadcastStats(classroomId: string, questionId: string): Promise<void> {
    // 统计答案数量
    const answerCount = await prisma.classroomAnswer.count({
      where: { questionId },
    })

    // 获取会话总数
    const totalSessions = await prisma.classroomSession.count({
      where: { classroomId },
    })

    // 获取题目信息
    const question = await prisma.classroomQuestion.findUnique({
      where: { id: questionId },
    })

    // 统计每个选项的选择人数（单选题/多选题）
    let optionStats = null
    if (question && question.questionContent && 
        typeof question.questionContent === 'object') {
      const content = question.questionContent as any
      logger.info(`题目类型检查`, { 
        questionId, 
        type: content.type,
        hasOptions: !!content.options 
      })
      
      if (content.type === 'single_choice' || content.type === 'multiple_choice') {
        const answers = await prisma.classroomAnswer.findMany({
          where: { questionId },
          select: { answer: true },
        })

        logger.info(`获取答案数据`, { 
          questionId, 
          answerCount: answers.length,
          answers: answers.map(a => a.answer)
        })

        // 统计每个选项的选择次数
        const optionCounts: Record<string, number> = {}
        answers.forEach((a) => {
          const answerValue = a.answer
          logger.info(`处理答案`, { 
            answerValue, 
            type: typeof answerValue,
            isString: typeof answerValue === 'string',
            isArray: Array.isArray(answerValue),
            constructor: answerValue?.constructor?.name
          })
          
          // 处理不同格式的答案
          if (Array.isArray(answerValue)) {
            // 多选题：数组格式 ["A", "B"]
            logger.info(`数组格式答案`, { answerValue })
            answerValue.forEach((option) => {
              if (typeof option === 'string') {
                optionCounts[option] = (optionCounts[option] || 0) + 1
              }
            })
          } else if (typeof answerValue === 'string') {
            // 字符串格式，需要判断是单选还是多选
            logger.info(`字符串格式答案`, { answerValue, length: answerValue.length })
            
            // 检查是否包含逗号
            if (answerValue.includes(',')) {
              // 多选题：逗号分隔格式 "A,B"
              logger.info(`逗号分隔格式答案，开始分割`, { answerValue })
              const parts = answerValue.split(',')
              logger.info(`分割结果`, { parts })
              parts.forEach((option) => {
                const trimmed = option.trim()
                logger.info(`处理分割项`, { option, trimmed })
                if (trimmed) {
                  optionCounts[trimmed] = (optionCounts[trimmed] || 0) + 1
                }
              })
            } else {
              // 单选题：单个字符串 "A"
              logger.info(`单选题答案`, { answerValue })
              optionCounts[answerValue] = (optionCounts[answerValue] || 0) + 1
            }
          } else {
            logger.warn(`未知答案格式`, { answerValue, type: typeof answerValue })
          }
        })

        logger.info(`统计结果`, { optionCounts })
        optionStats = optionCounts
      }
    }

    // 获取文本答案（填空题）
    let textAnswers = null
    let wordCloud = null
    
    logger.info(`填空题处理检查`, {
      questionId,
      hasQuestion: !!question,
      hasQuestionContent: !!question?.questionContent,
      questionContentType: typeof question?.questionContent,
    })
    
    if (question && question.questionContent && 
        typeof question.questionContent === 'object') {
      const content = question.questionContent as any
      
      logger.info(`填空题类型检查`, {
        questionId,
        type: content.type,
        isFillBlank: content.type === 'fill_blank',
        isTextInput: content.type === 'text_input',
      })
      
      if (content.type === 'fill_blank' || content.type === 'text_input') {
        logger.info(`开始处理填空题数据`, { questionId })
        
        // 使用 StatsAggregator 生成词云数据
        const statsAggregator = new StatsAggregator()
        try {
          const questionStats = await statsAggregator.getQuestionStats(questionId)
          logger.info(`StatsAggregator 返回结果`, {
            questionId,
            hasStats: !!questionStats,
            hasStatsData: !!questionStats?.stats,
          })
          
          if (questionStats && questionStats.stats) {
            wordCloud = {
              topWords: questionStats.stats.topWords,
              wordFrequency: questionStats.stats.wordFrequency,
            }
            logger.info(`词云数据生成成功`, { questionId, wordCloud })
          }
        } catch (error) {
          logger.error('生成词云数据失败', error)
        }
        
        // 保留 textAnswers 用于向后兼容
        const answers = await prisma.classroomAnswer.findMany({
          where: { questionId },
          select: { answer: true, submittedAt: true },
          orderBy: { submittedAt: 'desc' },
          take: 50,
        })

        logger.info(`查询填空题答案`, {
          questionId,
          answerCount: answers.length,
          answers: answers.map(a => a.answer),
        })

        textAnswers = answers.map((a) => ({
          text: a.answer as string,
          timestamp: a.submittedAt.getTime(),
        }))
        
        logger.info(`填空题处理完成`, {
          questionId,
          textAnswersCount: textAnswers.length,
          hasWordCloud: !!wordCloud,
        })
      } else {
        logger.warn(`题目类型不匹配填空题`, {
          questionId,
          type: content.type,
        })
      }
    } else {
      logger.warn(`跳过填空题处理：题目或题目内容不存在`, {
        questionId,
        hasQuestion: !!question,
        hasQuestionContent: !!question?.questionContent,
      })
    }

    // 广播统计信息
    const statsData = {
      questionId,
      answerCount,
      totalSessions,
      submissionRate: totalSessions > 0 ? (answerCount / totalSessions) * 100 : 0,
      optionStats,
      textAnswers,
      wordCloud,
    }
    
    logger.info(`广播统计数据`, { 
      classroomId, 
      questionId,
      statsData: JSON.stringify(statsData)
    })
    
    socketService.broadcastToRoom(`classroom:${classroomId}`, 'broadcast:stats', statsData)
  }

  /**
   * 广播在线人数
   */
  private async broadcastOnlineCount(classroomId: string): Promise<void> {
    const onlineCount = await socketService.getRoomConnectionCount(`classroom:${classroomId}:students`)

    socketService.broadcastToRoom(`classroom:${classroomId}`, 'broadcast:online', {
      onlineCount,
    })
  }
}

// 单例模式
export const classroomSocketHandler = new ClassroomSocketHandler()
