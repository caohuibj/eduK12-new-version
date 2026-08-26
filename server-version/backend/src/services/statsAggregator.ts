/**
 * 实时统计聚合服务
 * 
 * 功能：
 * - 答案统计聚合
 * - 选择题统计
 * - 填空题统计
 * - 词频统计
 */

import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { wordSegmentation } from './wordSegmentation'

interface QuestionStats {
  questionId: string
  questionType: string
  totalAnswers: number
  totalSessions: number
  submissionRate: number
  stats: any
}

export class StatsAggregator {
  /**
   * 获取题目统计信息
   */
  async getQuestionStats(questionId: string): Promise<QuestionStats | null> {
    try {
      // 获取题目信息
      const question = await prisma.classroomQuestion.findUnique({
        where: { id: questionId },
        include: {
          classroom: {
            include: {
              sessions: true,
            },
          },
          answers: true,
        },
      })

      if (!question) {
        return null
      }

      const questionContent = question.questionContent as any
      const questionType = questionContent.type || 'unknown'
      const totalAnswers = question.answers.length
      const totalSessions = question.classroom.sessions.length
      const submissionRate = totalSessions > 0 ? (totalAnswers / totalSessions) * 100 : 0

      let stats: any = {}

      // 根据题目类型统计
      switch (questionType) {
        case 'single_choice':
          stats = await this.aggregateSingleChoice(question)
          break
        case 'fill_blank':
          stats = await this.aggregateFillBlank(question)
          break
        case 'text_input':
          stats = await this.aggregateTextInput(question)
          break
        default:
          logger.warn(`未知题目类型: ${questionType}`)
      }

      return {
        questionId,
        questionType,
        totalAnswers,
        totalSessions,
        submissionRate,
        stats,
      }
    } catch (error) {
      logger.error('获取题目统计信息错误', error)
      throw error
    }
  }

  /**
   * 聚合单选题统计
   */
  private async aggregateSingleChoice(question: any): Promise<any> {
    const answers = question.answers
    const questionContent = question.questionContent as any
    const options = questionContent.options || []

    // 统计各选项选择次数
    const optionCounts: Record<string, number> = {}
    options.forEach((opt: any) => {
      optionCounts[opt.value] = 0
    })

    answers.forEach((answer: any) => {
      const answerData = answer.answer as any
      const value = answerData.value
      if (value !== undefined) {
        optionCounts[value] = (optionCounts[value] || 0) + 1
      }
    })

    // 计算百分比
    const total = answers.length
    const optionStats = options.map((opt: any) => ({
      label: opt.label,
      value: opt.value,
      count: optionCounts[opt.value] || 0,
      percentage: total > 0 ? ((optionCounts[opt.value] || 0) / total) * 100 : 0,
    }))

    return {
      options: optionStats,
      total,
    }
  }

  /**
   * 聚合填空题统计
   */
  private async aggregateFillBlank(question: any): Promise<any> {
    const answers = question.answers

    logger.debug('填空题答案聚合开始', {
      answersCount: answers?.length || 0,
    })

    // 收集所有答案文本
    const answerTexts: string[] = []
    answers.forEach((answer: any) => {
      const answerData = answer.answer
      
      // 支持多种格式：
      // 1. 字符串格式：answer = "答案文本"
      // 2. 对象格式：answer = { value: "答案文本" }
      let text = null
      if (typeof answerData === 'string') {
        text = answerData.trim()
      } else if (answerData && typeof answerData === 'object' && answerData.value) {
        text = answerData.value.toString().trim()
      }
      
      if (text && text.length > 0) {
        answerTexts.push(text)
      }
    })

    logger.debug('填空题答案文本已收集', {
      totalAnswers: answers.length,
      collectedTexts: answerTexts.length,
    })

    // 词频统计
    const wordFrequency = await this.calculateWordFrequency(answerTexts)

    // 获取高频词（前 10 个）
    const topWords = Object.entries(wordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }))

    return {
      total: answerTexts.length,
      answers: answerTexts,
      topWords,
      wordFrequency,
    }
  }

  /**
   * 聚合文本题统计
   */
  private async aggregateTextInput(question: any): Promise<any> {
    const answers = question.answers

    // 收集所有文本答案
    const texts: string[] = []
    answers.forEach((answer: any) => {
      const answerData = answer.answer
      
      // 支持多种格式：
      // 1. 字符串格式：answer = "答案文本"
      // 2. 对象格式：answer = { value: "答案文本" }
      let text = null
      if (typeof answerData === 'string') {
        text = answerData.trim()
      } else if (answerData && typeof answerData === 'object' && answerData.value) {
        text = answerData.value.toString().trim()
      }
      
      if (text && text.length > 0) {
        texts.push(text)
      }
    })

    // 文本长度统计
    const lengths = texts.map((text) => text.length)
    const avgLength = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0

    // 词频统计
    const wordFrequency = await this.calculateWordFrequency(texts)

    // 获取高频词
    const topWords = Object.entries(wordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }))

    return {
      total: texts.length,
      avgLength,
      texts,
      topWords,
      wordFrequency,
    }
  }

  /**
   * 计算词频
   */
  private async calculateWordFrequency(texts: string[]): Promise<Record<string, number>> {
    try {
      logger.info('开始计算词频', { textCount: texts.length })
      // 使用分词服务
      const wordFrequency = await wordSegmentation.calculateWordFrequency(texts)
      logger.debug('词频计算完成', {
        wordCount: Object.keys(wordFrequency).length,
      })
      return wordFrequency
    } catch (error) {
      logger.error('分词服务调用失败', error)
      throw error
    }
  }

  /**
   * 获取课堂实时统计
   */
  async getClassroomRealtimeStats(classroomId: string): Promise<any> {
    try {
      // 获取课堂信息
      const classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
        include: {
          sessions: true,
          questions: {
            orderBy: { questionIndex: 'asc' },
          },
        },
      })

      if (!classroom) {
        return null
      }

      // 当前题目
      const currentQuestion = classroom.questions.find((q) => q.startedAt && !q.endedAt)

      // 在线学生数
      const onlineCount = classroom.sessions.length

      // 已完成题目数
      const completedQuestions = classroom.questions.filter((q) => q.endedAt).length

      return {
        classroomId,
        status: classroom.status,
        onlineCount,
        totalQuestions: classroom.questions.length,
        completedQuestions,
        currentQuestionId: currentQuestion?.id || null,
        currentQuestionIndex: currentQuestion?.questionIndex || null,
      }
    } catch (error) {
      logger.error('获取课堂实时统计错误', error)
      throw error
    }
  }
}

// 单例模式
export const statsAggregator = new StatsAggregator()
