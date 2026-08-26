/**
 * 公开访问控制器
 * 
 * 功能：
 * - 通过令牌访问问卷
 * - 匿名测评管理
 * - POW 验证
 * 
 * 注意：所有接口不需要登录认证
 */

import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { success, error, notFound } from '../utils/response'
import { tokenService } from '../services/tokenService'
import { powService } from '../services/powService'
import { logger } from '../utils/logger'
import { encryptField, safeDecrypt } from '../utils/encryption'
import { v4 as uuidv4 } from 'uuid'
import { buildQuestionnaireCollectionReport, collectionReportForStorage } from '../modules/reporting/questionnaire-collection-report'

export const publicQuestionnaireController = {
  /**
   * 获取 POW 挑战
   * GET /api/public/pow/challenge
   */
  async getPOWChallenge(req: Request, res: Response) {
    try {
      const challenge = powService.generateChallenge(4) // 难度4
      
      return success(res, {
        challenge: challenge.challenge,
        difficulty: challenge.difficulty,
        timestamp: challenge.timestamp,
      })
    } catch (err) {
      logger.error('获取 POW 挑战错误', err)
      return error(res, '获取挑战失败')
    }
  },

  /**
   * 通过令牌获取问卷信息
   * GET /api/public/questionnaires/:token
   */
  async getQuestionnaireByToken(req: Request, res: Response) {
    try {
      const { token } = req.params

      // 验证令牌
      const validation = await tokenService.validateToken(token)
      
      if (!validation.valid) {
        if (validation.expired) {
          return error(res, '链接已过期', 410)
        }
        if (validation.disabled) {
          return error(res, '链接已禁用', 403)
        }
        if (validation.overLimit) {
          return error(res, '链接访问次数已达上限', 403)
        }
        return notFound(res, '链接无效')
      }

      // 获取问卷详情（包含表单题目和量表）
      const questionnaire = await prisma.questionnaire.findUnique({
        where: { id: validation.questionnaire!.id },
        include: {
          formItems: {
            orderBy: { position: 'asc' },
          },
          questionnaireScales: {
            include: {
              scale: {
                select: {
                  id: true,
                  name: true,
                  estimatedTime: true,
                  config: true,
                  _count: {
                    select: { items: true },
                  },
                },
              },
            },
            orderBy: { position: 'asc' },
          },
        },
      })

      if (!questionnaire) {
        return notFound(res, '问卷不存在')
      }

      logger.info('公开访问问卷', {
        token: token.substring(0, 10) + '...',
        questionnaireId: questionnaire.id,
        questionnaireName: questionnaire.name,
      })

      // 混合排序表单题目和量表
      const contentItems = [
        ...(questionnaire.formItems || []).map((fi: any) => ({
          type: 'form' as const,
          position: fi.position,
          id: fi.id,
          label: fi.label,
          completed: false,
        })),
        ...(questionnaire.questionnaireScales || []).map((qs: any) => ({
          type: 'scale' as const,
          position: qs.position,
          id: qs.scale.id,
          label: qs.scale.name,
          completed: false,
        })),
      ].sort((a, b) => a.position - b.position)

      return success(res, {
        questionnaire: {
          id: questionnaire.id,
          name: questionnaire.name,
          description: questionnaire.description,
          instruction: questionnaire.instruction,
          estimatedTime: questionnaire.estimatedTime,
          contentItems,
          totalItems: contentItems.length,
        },
        tokenId: validation.token!.id,
      })
    } catch (err) {
      logger.error('获取公开问卷错误', err)
      return error(res, '获取问卷失败')
    }
  },

  /**
   * 开始匿名测评
   * POST /api/public/questionnaires/:token/start
   */
  async startAssessment(req: Request, res: Response) {
    try {
      const { token } = req.params
      const { challenge, proof, sessionId } = req.body

      if (typeof challenge !== 'string' || typeof proof !== 'string' || !challenge || !proof) {
        return error(res, '缺少 POW 验证信息', -1, 400)
      }
      const storedChallenge = powService.getChallenge(challenge)
      if (!storedChallenge) {
        return error(res, 'POW 挑战已过期，请刷新页面重试', -1, 400)
      }
      const powValid = powService.verifyPOW(challenge, proof, storedChallenge.difficulty)
      if (!powValid) {
        return error(res, 'POW 验证失败', -1, 400)
      }

      // 验证令牌
      const validation = await tokenService.validateToken(token)
      if (!validation.valid) {
        return error(res, '链接无效或已过期', 403)
      }

      const questionnaireId = validation.questionnaire!.id
      const tokenId = validation.token!.id

      // 检查是否有进行中的测评（断点续答）
      let questionnaireAssessment = null
      let sessionIdToUse = sessionId || uuidv4()

      if (sessionId) {
        // 优化：一次查询获取完整数据，避免重复查询
        const existingAssessment = await prisma.questionnaireAssessment.findFirst({
          where: { sessionId },
          include: {
            questionnaire: {
              include: {
                formItems: {
                  orderBy: { position: 'asc' },
                },
                questionnaireScales: {
                  include: {
                    scale: {
                      include: {
                        items: {
                          orderBy: { sortOrder: 'asc' },
                        },
                        dimensions: true,
                      },
                    },
                  },
                  orderBy: { position: 'asc' },
                },
              },
            },
            scaleAssessments: {
              include: {
                scale: true,
              },
            },
            formAnswers: true,
          },
        })

        // 如果测评已完成，直接返回提示
        if (existingAssessment && existingAssessment.status === 'COMPLETED') {
          return error(res, '您已完成该问卷测评，无需重复作答', 400)
        }

        // 如果测评进行中且属于当前 token，恢复测评
        if (existingAssessment && existingAssessment.status === 'IN_PROGRESS' && existingAssessment.tokenId === tokenId) {
          questionnaireAssessment = existingAssessment
        } else {
          // sessionId 不存在或不匹配，生成新的
          sessionIdToUse = uuidv4()
        }

        // 断点续答：找到当前应该进行的内容项
        if (questionnaireAssessment) {
          const saMap = new Map(
            questionnaireAssessment.scaleAssessments.map(sa => [sa.scaleId, sa])
          )
          const formAnswerMap = new Map(
            questionnaireAssessment.formAnswers.map(fa => [fa.formItemId, fa])
          )

          // 合并表单题目和量表，按 position 排序
          const contentItems = [
            ...questionnaireAssessment.questionnaire.formItems.map(fi => ({ type: 'form' as const, position: fi.position, data: fi })),
            ...questionnaireAssessment.questionnaire.questionnaireScales.map(qs => ({ type: 'scale' as const, position: qs.position, data: qs })),
          ].sort((a, b) => a.position - b.position)

          // 找到第一个未完成的内容项
          let currentIndex = -1
          let currentItem: any = null

          for (let i = 0; i < contentItems.length; i++) {
            const item = contentItems[i]
            if (item.type === 'form') {
              const answer = formAnswerMap.get(item.data.id)
              if (!answer) {
                currentIndex = i
                currentItem = item
                break
              }
            } else {
              const sa = saMap.get(item.data.scaleId)
              if (!sa || sa.status !== 'COMPLETED') {
                currentIndex = i
                currentItem = item
                break
              }
            }
          }

          // 检查是否所有内容都已完成
          if (currentIndex === -1 || !currentItem) {
            // 所有内容已完成，保存单项报告集合并更新状态
            const collectionReport = buildQuestionnaireCollectionReport(questionnaireAssessment)
            const totalTime = Date.now() - new Date(questionnaireAssessment.startedAt).getTime()

            await prisma.questionnaireAssessment.update({
              where: { id: questionnaireAssessment.id },
              data: {
                status: 'COMPLETED',
                progress: 100,
                completedAt: new Date(),
                totalTime,
                aggregateReport: collectionReportForStorage(collectionReport) as any,
              },
            })

            logger.info('问卷测评在startAssessment中自动完成', {
              questionnaireAssessmentId: questionnaireAssessment.id,
              totalItems: contentItems.length,
              totalDimensions: collectionReport.totalDimensions,
            })

            return success(res, {
              questionnaireAssessment: {
                id: questionnaireAssessment.id,
                status: 'COMPLETED',
                progress: 100,
                currentIndex: contentItems.length,
              },
              currentFormItem: null,
              currentScale: null,
              contentItems: contentItems.map((item, idx) => ({
                type: item.type,
                position: item.position,
                id: item.type === 'form' ? item.data.id : item.data.id,
                label: item.type === 'form' ? item.data.label : item.data.scale?.name,
                completed: true,
              })),
              totalItems: contentItems.length,
              sessionId: sessionIdToUse,
            }, '测评已完成')
          }

          // 返回当前应进行的内容项
          if (currentItem.type === 'form') {
            return success(res, {
              questionnaireAssessment: {
                id: questionnaireAssessment.id,
                status: questionnaireAssessment.status,
                progress: questionnaireAssessment.progress,
                currentIndex,
              },
              currentFormItem: currentItem.data,
              currentScale: null,
              contentItems: contentItems.map((item, idx) => ({
                type: item.type,
                position: item.position,
                id: item.type === 'form' ? item.data.id : item.data.id,
                label: item.type === 'form' ? item.data.label : item.data.scale?.name,
                completed: idx < currentIndex,
              })),
              totalItems: contentItems.length,
              sessionId: sessionIdToUse,
            }, '继续测评')
          } else {
            const sa = saMap.get(currentItem.data.scaleId)
            return success(res, {
              questionnaireAssessment: {
                id: questionnaireAssessment.id,
                status: questionnaireAssessment.status,
                progress: questionnaireAssessment.progress,
                currentIndex,
              },
              currentFormItem: null,
              currentScale: {
                ...currentItem.data.scale,
                scaleAssessmentId: sa?.id,
                assessment: sa,
              },
              contentItems: contentItems.map((item, idx) => ({
                type: item.type,
                position: item.position,
                id: item.type === 'form' ? item.data.id : item.data.id,
                label: item.type === 'form' ? item.data.label : item.data.scale?.name,
                completed: idx < currentIndex,
              })),
              totalItems: contentItems.length,
              sessionId: sessionIdToUse,
            }, '继续测评')
          }
        }
      }

      // 如果没有进行中的测评，创建新的
      if (!questionnaireAssessment) {
        // 获取问卷及其量表和表单题目
        const questionnaire = await prisma.questionnaire.findUnique({
          where: { id: questionnaireId },
          include: {
            formItems: {
              orderBy: { position: 'asc' },
            },
            questionnaireScales: {
              include: {
                scale: {
                  include: {
                    items: {
                      orderBy: { sortOrder: 'asc' },
                    },
                    dimensions: true,
                  },
                },
              },
              orderBy: { position: 'asc' },
            },
          },
        })

        if (!questionnaire) {
          return notFound(res, '问卷不存在')
        }

        const claimed = await tokenService.claimAccess(tokenId)
        if (!claimed) {
          return error(res, '链接访问次数已达上限', 403)
        }

        // 创建问卷测评记录（匿名）
        questionnaireAssessment = await prisma.questionnaireAssessment.create({
          data: {
            questionnaireId,
            tokenId,
            sessionId: sessionIdToUse,
            userId: null, // 匿名
            status: 'IN_PROGRESS',
            progress: 0,
          },
          include: {
            scaleAssessments: true,
            formAnswers: true,
          },
        })

        // 为每个量表创建 Assessment（批量创建优化）
        await prisma.assessment.createMany({
          data: questionnaire.questionnaireScales.map((qs) => ({
            scaleId: qs.scaleId,
            status: 'IN_PROGRESS',
            progress: 0,
            answers: [],
            questionnaireAssessmentId: questionnaireAssessment!.id,
          })),
        })

        logger.info('创建匿名测评', {
          questionnaireAssessmentId: questionnaireAssessment.id,
          sessionId: sessionIdToUse,
          questionnaireId,
        })

        // 合并表单题目和量表，按 position 排序
        const contentItems = [
          ...questionnaire.formItems.map(fi => ({ type: 'form' as const, position: fi.position, data: fi })),
          ...questionnaire.questionnaireScales.map(qs => ({ type: 'scale' as const, position: qs.position, data: qs })),
        ].sort((a, b) => a.position - b.position)

        // 返回第一个内容项
        const firstItem = contentItems[0]

        if (firstItem?.type === 'form') {
          return success(res, {
            questionnaireAssessment: {
              id: questionnaireAssessment.id,
              status: questionnaireAssessment.status,
              progress: questionnaireAssessment.progress,
              currentScaleIndex: 0,
            },
            currentFormItem: firstItem.data,
            currentScale: null,
            contentItems: contentItems.map((item, idx) => ({
              type: item.type,
              position: item.position,
              id: item.type === 'form' ? item.data.id : item.data.id,
              label: item.type === 'form' ? item.data.label : item.data.scale?.name,
              completed: idx < 0,
            })),
            totalItems: contentItems.length,
            sessionId: sessionIdToUse,
          }, '开始测评')
        } else {
          // 第一个是量表
          const firstScale = questionnaire.questionnaireScales.find(qs => qs.scaleId === firstItem?.data.scaleId)
          const firstAssessment = await prisma.assessment.findFirst({
            where: {
              questionnaireAssessmentId: questionnaireAssessment.id,
              scaleId: firstScale?.scaleId,
            },
          })

          return success(res, {
            questionnaireAssessment: {
              id: questionnaireAssessment.id,
              status: questionnaireAssessment.status,
              progress: questionnaireAssessment.progress,
              currentScaleIndex: 0,
            },
            currentFormItem: null,
            currentScale: firstScale ? {
              ...firstScale.scale,
              scaleAssessmentId: firstAssessment?.id,
            } : null,
            contentItems: contentItems.map((item, idx) => ({
              type: item.type,
              position: item.position,
              id: item.type === 'form' ? item.data.id : item.data.id,
              label: item.type === 'form' ? item.data.label : item.data.scale?.name,
              completed: idx < 0,
            })),
            totalItems: contentItems.length,
            sessionId: sessionIdToUse,
          }, '开始测评')
        }
      }
    } catch (err) {
      logger.error('开始匿名测评错误', err)
      return error(res, '开始测评失败')
    }
  },

  /**
   * 获取测评状态
   * GET /api/public/assessments/:sessionId
   */
  async getAssessment(req: Request, res: Response) {
    try {
      const { sessionId } = req.params

      // 优化：只查询必要的数据，不加载题目详情
      const questionnaireAssessment = await prisma.questionnaireAssessment.findUnique({
        where: { sessionId },
        select: {
          id: true,
          status: true,
          progress: true,
          startedAt: true,
          completedAt: true,
          totalTime: true,
          questionnaire: {
            select: {
              id: true,
              name: true,
              instruction: true,
            },
          },
          scaleAssessments: {
            select: {
              id: true,
              scaleId: true,
              status: true,
              progress: true,
              startedAt: true,
              completedAt: true,
              totalTime: true,
              scale: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: { startedAt: 'asc' },
          },
          formAnswers: {
            select: {
              formItemId: true,
              value: true,
            },
          },
        },
      })

      if (!questionnaireAssessment) {
        return notFound(res, '测评不存在')
      }

      // 使用缓存获取问卷的量表和表单题目列表
      const { cacheService } = await import('../services/cacheService')
      const [questionnaireScales, formItems] = await Promise.all([
        cacheService.getQuestionnaireScales(questionnaireAssessment.questionnaire.id),
        cacheService.getQuestionnaireFormItems(questionnaireAssessment.questionnaire.id),
      ])

      // 建立 scaleId -> scaleAssessment 的映射
      const saMap = new Map(
        questionnaireAssessment.scaleAssessments.map(sa => [sa.scaleId, sa])
      )

      // 建立 formItemId -> formAnswer 的映射
      const formAnswerMap = new Map(
        questionnaireAssessment.formAnswers.map(fa => [fa.formItemId, fa])
      )

      // 合并表单题目和量表，按 position 排序
      const contentItems = [
        ...formItems.map(fi => ({ 
          type: 'form' as const, 
          position: fi.position, 
          data: fi 
        })),
        ...questionnaireScales.map(qs => ({ 
          type: 'scale' as const, 
          position: qs.position, 
          data: qs 
        })),
      ].sort((a, b) => a.position - b.position)

      // 找到第一个未完成的内容项
      let currentIndex = -1
      let currentItem: any = null

      for (let i = 0; i < contentItems.length; i++) {
        const item = contentItems[i]
        if (item.type === 'form') {
          const answer = formAnswerMap.get(item.data.id)
          if (!answer) {
            currentIndex = i
            currentItem = item
            break
          }
        } else {
          const sa = saMap.get(item.data.scaleId)
          if (!sa || sa.status !== 'COMPLETED') {
            currentIndex = i
            currentItem = item
            break
          }
        }
      }

      // 检查是否所有内容都已完成
      const allCompleted = currentIndex === -1 || !currentItem

      logger.info('DEBUG getAssessment result', {
        sessionId,
        allCompleted,
        currentIndex,
        totalItems: contentItems.length,
        qaStatus: questionnaireAssessment.status,
      })

      // 计算进度
      const completedCount = contentItems.filter((item) => {
        if (item.type === 'form') {
          return formAnswerMap.has(item.data.id)
        } else {
          const sa = saMap.get(item.data.scaleId)
          return sa && sa.status === 'COMPLETED'
        }
      }).length
      const progress = Math.round((completedCount / contentItems.length) * 100)

      // 如果所有内容都完成了，保存单项报告集合并更新问卷测评状态
      if (allCompleted && questionnaireAssessment.status !== 'COMPLETED') {
        // 需要查询完整数据来生成报告
        const fullQA = await prisma.questionnaireAssessment.findUnique({
          where: { id: questionnaireAssessment.id },
          include: {
            questionnaire: {
              include: {
                formItems: {
                  orderBy: { position: 'asc' },
                },
                questionnaireScales: {
                  include: { scale: { include: { dimensions: true } } },
                },
              },
            },
            scaleAssessments: {
              include: { scale: { include: { dimensions: true } } },
            },
            formAnswers: true,
          },
        })
        
        const collectionReport = buildQuestionnaireCollectionReport(fullQA)
        const totalTime = Date.now() - new Date(questionnaireAssessment.startedAt).getTime()

        await prisma.questionnaireAssessment.update({
          where: { id: questionnaireAssessment.id },
          data: {
            status: 'COMPLETED',
            progress: 100,
            completedAt: new Date(),
            totalTime,
            aggregateReport: collectionReportForStorage(collectionReport) as any,
          },
        })
        questionnaireAssessment.status = 'COMPLETED'
        questionnaireAssessment.progress = 100

        logger.info('问卷测评在getAssessment中自动完成', {
          questionnaireAssessmentId: questionnaireAssessment.id,
          totalItems: contentItems.length,
          totalDimensions: collectionReport.totalDimensions,
        })
      }

      // 准备返回数据
      const responseData: any = {
        questionnaireAssessment: {
          id: questionnaireAssessment.id,
          status: questionnaireAssessment.status,
          progress,
          currentIndex: allCompleted ? contentItems.length : currentIndex,
          startedAt: questionnaireAssessment.startedAt,
          completedAt: questionnaireAssessment.completedAt,
          totalTime: questionnaireAssessment.totalTime,
        },
        currentFormItem: null,
        currentScale: null,
        contentItems: contentItems.map((item, idx) => ({
          type: item.type,
          position: item.position,
          id: item.type === 'form' ? item.data.id : item.data.id,
          label: item.type === 'form' ? item.data.label : item.data.scale?.name,
          completed: idx < currentIndex || allCompleted,
        })),
        totalItems: contentItems.length,
        sessionId,
      }

      // 设置当前内容项
      if (!allCompleted && currentItem) {
        if (currentItem.type === 'form') {
          responseData.currentFormItem = currentItem.data
        } else {
          const sa = saMap.get(currentItem.data.scaleId)
          responseData.currentScale = {
            ...currentItem.data.scale,
            scaleAssessmentId: sa?.id,
            assessment: sa,
          }
        }
      }

      return success(res, responseData)
    } catch (err) {
      logger.error('获取匿名测评状态错误', err)
      return error(res, '获取测评状态失败')
    }
  },

  /**
   * 获取量表测评详情（包括已有答案）
   * GET /api/public/assessments/:sessionId/scale/:scaleAssessmentId
   */
  async getScaleAssessment(req: Request, res: Response) {
    try {
      const { sessionId, scaleAssessmentId } = req.params

      // 验证量表测评是否存在且属于当前 session
      const assessment = await prisma.assessment.findUnique({
        where: { id: scaleAssessmentId },
        include: {
          questionnaireAssessment: {
            select: { id: true, sessionId: true }
          }
        }
      })

      if (!assessment) {
        return notFound(res, '量表测评不存在')
      }

      if (!assessment.questionnaireAssessment || 
          assessment.questionnaireAssessment.sessionId !== sessionId) {
        return error(res, '量表测评不属于当前会话', 403)
      }

      return success(res, {
        id: assessment.id,
        answers: assessment.answers,
        status: assessment.status,
        progress: assessment.progress,
      })
    } catch (err) {
      logger.error('获取量表测评详情错误', err)
      return error(res, '获取量表测评详情失败')
    }
  },

  /**
   * 提交答案
   * PATCH /api/public/assessments/:sessionId/answers
   */
  async submitAnswer(req: Request, res: Response) {
    try {
      const { sessionId } = req.params
      const { scaleAssessmentId, itemId, value, responseTime } = req.body

      // 优化：合并验证查询，一次查询完成验证和数据获取
      const assessment = await prisma.assessment.findUnique({
        where: { id: scaleAssessmentId },
        include: {
          questionnaireAssessment: {
            select: { id: true, sessionId: true, status: true }
          }
        }
      })

      // 验证量表测评是否存在且属于当前 session
      if (!assessment) {
        return notFound(res, '量表测评不存在')
      }

      if (!assessment.questionnaireAssessment || 
          assessment.questionnaireAssessment.sessionId !== sessionId) {
        return error(res, '量表测评不属于当前会话', 403)
      }

      // 更新答案（包含作答时间）
      const answers = (assessment.answers as any[]) || []
      const existingIndex = answers.findIndex((a) => a.itemId === itemId)
      
      const answerData: any = { itemId, value }
      if (responseTime !== undefined) {
        answerData.responseTime = responseTime
      }
      
      if (existingIndex >= 0) {
        answers[existingIndex] = answerData
      } else {
        answers.push(answerData)
      }

      await prisma.assessment.update({
        where: { id: scaleAssessmentId },
        data: { answers },
      })

      return success(res, { saved: true })
    } catch (err) {
      logger.error('提交答案错误', err)
      return error(res, '提交答案失败')
    }
  },

  /**
   * 完成量表测评
   * POST /api/public/assessments/:sessionId/scale/complete
   */
  async completeScaleAssessment(req: Request, res: Response) {
    try {
      const { sessionId } = req.params
      const { scaleAssessmentId } = req.body

      // 优化：使用缓存获取量表配置
      const { cacheService } = await import('../services/cacheService')
      
      // 查询问卷测评基本信息（优化：一次查询获取问卷和量表信息）
      const assessment = await prisma.assessment.findUnique({
        where: { id: scaleAssessmentId },
        select: {
          id: true,
          scaleId: true,
          answers: true,
          questionnaireAssessmentId: true,
          questionnaireAssessment: {
            select: {
              id: true,
              sessionId: true,
              status: true,
              startedAt: true,
              completedScales: true,
              completedForms: true,
              questionnaire: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      })

      if (!assessment) {
        return notFound(res, '量表测评不存在')
      }

      // 验证 sessionId 是否匹配
      if (!assessment.questionnaireAssessment || 
          assessment.questionnaireAssessment.sessionId !== sessionId) {
        return error(res, '量表测评不属于当前会话', 403)
      }

      // 使用缓存获取量表配置（包含题目和维度）
      const scale = await cacheService.getScaleConfig(assessment.scaleId)
      
      if (!scale) {
        return notFound(res, '量表不存在')
      }

      // 计算分数
      const { calculateScores, generateFeedbackWithLevels } = await import('../services/scoringService')
      
      const answers = assessment.answers as any[]
      
      // DEBUG: 打印计分信息
      logger.info('DEBUG completeScaleAssessment', {
        scaleAssessmentId,
        scaleId: assessment.scaleId,
        scaleName: scale.name,
        answerCount: answers?.length || 0,
        answers: answers?.map((a: any) => ({ itemId: a.itemId, value: a.value })),
        itemCount: scale.items?.length || 0,
        dimensionCount: scale.dimensions?.length || 0,
      })

      // DEBUG: 打印 items 和 itemDimensions
      logger.info('DEBUG items with itemDimensions', {
        scaleAssessmentId,
        items: scale.items?.map((item: any) => ({
          id: item.id,
          content: item.content?.substring(0, 30),
          itemDimensionsCount: item.itemDimensions?.length || 0,
          itemDimensions: item.itemDimensions?.map((id: any) => ({
            dimensionId: id.dimensionId,
            dimensionName: id.dimension?.name,
            reverse: id.reverse,
          })),
        })),
      })

      const scores = calculateScores(
        answers,
        scale.items,
        scale.dimensions,
        scale.config as any
      )

      // DEBUG: 打印计算结果
      logger.info('DEBUG calculateScores result', {
        scaleAssessmentId,
        scoresCount: scores.length,
        scores: scores.map(s => ({
          dimensionId: s.dimensionId,
          dimensionName: s.dimensionName,
          rawScore: s.rawScore,
          normalizedScore: s.normalizedScore,
          itemCount: s.itemCount,
        })),
      })

      // 生成反馈
      const feedback = generateFeedbackWithLevels(
        scores,
        scale.dimensions,
        scale.name
      )

      await prisma.assessment.update({
        where: { id: scaleAssessmentId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          scores: encryptField(scores) as any,
          feedback: encryptField(feedback) as any,
          progress: 100,
        },
      })

      // 使用进度缓存优化：递增已完成量表数量
      await prisma.questionnaireAssessment.update({
        where: { id: assessment.questionnaireAssessmentId! },
        data: {
          completedScales: { increment: 1 },
        },
      })

      // 使用已查询的数据，避免重复查询
      const questionnaireAssessment = assessment.questionnaireAssessment
      const completedScalesUpdated = questionnaireAssessment.completedScales + 1

      if (questionnaireAssessment) {
        // 使用缓存获取量表和表单列表
        const [questionnaireScales, formItems] = await Promise.all([
          cacheService.getQuestionnaireScales(questionnaireAssessment.questionnaire.id),
          cacheService.getQuestionnaireFormItems(questionnaireAssessment.questionnaire.id),
        ])

        // 使用缓存字段检查是否全部完成
        const allScalesCompleted = completedScalesUpdated === questionnaireScales.length
        const allFormsAnswered = questionnaireAssessment.completedForms === formItems.length
        const allCompleted = allFormsAnswered && allScalesCompleted

        if (allCompleted && questionnaireAssessment.status !== 'COMPLETED') {
          // 生成单项报告集合（需要查询完整的量表测评数据）
          const allScaleAssessments = await prisma.assessment.findMany({
            where: { questionnaireAssessmentId: questionnaireAssessment.id },
            select: {
              id: true,
              scaleId: true,
              scores: true,
              feedback: true,
              completedAt: true,
              totalTime: true,
            },
          })

          const collectionReport = buildQuestionnaireCollectionReport({
            ...questionnaireAssessment,
            questionnaire: {
              ...questionnaireAssessment.questionnaire,
              questionnaireScales,
              formItems,
            },
            scaleAssessments: allScaleAssessments,
          })

          const totalTime = Date.now() - new Date(questionnaireAssessment.startedAt).getTime()

          await prisma.questionnaireAssessment.update({
            where: { id: questionnaireAssessment.id },
            data: {
              status: 'COMPLETED',
              progress: 100,
              completedAt: new Date(),
              totalTime,
              aggregateReport: collectionReportForStorage(collectionReport) as any,
            },
          })

          logger.info('问卷测评自动完成', {
            questionnaireAssessmentId: questionnaireAssessment.id,
            totalScales: collectionReport.unitReports.length,
            totalDimensions: collectionReport.totalDimensions,
          })
        }
      }

      return success(res, { completed: true })
    } catch (err) {
      logger.error('完成量表测评错误', err)
      return error(res, '完成量表测评失败')
    }
  },

  /**
   * 完成问卷测评
   * POST /api/public/assessments/:sessionId/complete
   */
  async completeAssessment(req: Request, res: Response) {
    try {
      const { sessionId } = req.params

      const qa = await prisma.questionnaireAssessment.findUnique({
        where: { sessionId },
        include: {
          questionnaire: {
            include: {
              formItems: {
                orderBy: { position: 'asc' },
              },
              questionnaireScales: {
                include: {
                  scale: {
                    include: {
                      dimensions: true,
                    },
                  },
                },
                orderBy: { position: 'asc' },
              },
            },
          },
          scaleAssessments: {
            include: {
              scale: {
                include: {
                  items: {
                    include: {
                      itemDimensions: {
                        include: { dimension: true },
                      },
                    },
                  },
                  dimensions: true,
                },
              },
            },
          },
          formAnswers: true,
        },
      })

      if (!qa) {
        return notFound(res, '测评不存在')
      }

      if (qa.status === 'COMPLETED') {
        return success(res, {
          questionnaireId: qa.questionnaireId,
          completedAt: qa.completedAt,
          totalTime: qa.totalTime,
          ...buildQuestionnaireCollectionReport(qa),
        }, '问卷测评已完成')
      }

      // 检查所有量表是否完成
      const incompleteScales = qa.scaleAssessments.filter(
        (sa) => sa.status !== 'COMPLETED'
      )
      if (incompleteScales.length > 0) {
        return error(res, '还有量表未完成')
      }

      const collectionReport = buildQuestionnaireCollectionReport(qa)

      // 计算总时间
      const totalTime = Date.now() - new Date(qa.startedAt).getTime()

      // 更新问卷测评
      const updated = await prisma.questionnaireAssessment.update({
        where: { id: qa.id },
        data: {
          status: 'COMPLETED',
          progress: 100,
          completedAt: new Date(),
          totalTime,
          aggregateReport: collectionReportForStorage(collectionReport) as any,
        },
      })

      logger.info('匿名问卷测评完成', {
        questionnaireAssessmentId: qa.id,
        sessionId,
        totalTime,
      })

      const { aggregateReport: _legacyAggregateReport, ...safeUpdated } = updated as any
      return success(res, {
        ...safeUpdated,
        ...collectionReport,
      }, '问卷测评已完成')
    } catch (err) {
      logger.error('完成问卷测评错误', err)
      return error(res, '完成问卷测评失败')
    }
  },

  /**
   * 提交表单题目答案
   * POST /api/public/assessments/:sessionId/form-answer
   */
  async submitFormAnswer(req: Request, res: Response) {
    try {
      const { sessionId } = req.params
      const { formItemId, value } = req.body

      if (!formItemId || value === undefined) {
        return error(res, '缺少必要参数')
      }

      // 处理多选题答案格式：数组转JSON字符串
      const valueToStore = Array.isArray(value) 
        ? JSON.stringify(value)  // 多选：数组转字符串
        : value;                  // 单选、填空：直接存储

      // 查找测评
      const questionnaireAssessment = await prisma.questionnaireAssessment.findUnique({
        where: { sessionId },
        include: {
          questionnaire: {
            include: {
              formItems: true,
            },
          },
        },
      })

      if (!questionnaireAssessment) {
        return notFound(res, '测评不存在')
      }

      // 检查表单题目是否属于该问卷
      const formItem = questionnaireAssessment.questionnaire.formItems.find(
        (fi: any) => fi.id === formItemId
      )

      if (!formItem) {
        return error(res, '表单题目不存在')
      }

      // 优化：先查询是否存在，避免重复查询
      const existingAnswer = await prisma.questionnaireFormAnswer.findUnique({
        where: {
          questionnaireAssessmentId_formItemId: {
            questionnaireAssessmentId: questionnaireAssessment.id,
            formItemId,
          },
        },
        select: { id: true },
      })

      // 保存或更新答案
      await prisma.questionnaireFormAnswer.upsert({
        where: {
          questionnaireAssessmentId_formItemId: {
            questionnaireAssessmentId: questionnaireAssessment.id,
            formItemId,
          },
        },
        create: {
          questionnaireAssessmentId: questionnaireAssessment.id,
          formItemId,
          value: String(valueToStore),
        },
        update: {
          value: String(valueToStore),
        },
      })

      // 如果是新答案，递增已完成表单数量
      if (!existingAnswer) {
        await prisma.questionnaireAssessment.update({
          where: { id: questionnaireAssessment.id },
          data: {
            completedForms: { increment: 1 },
          },
        })
      }

      return success(res, { formItemId, value }, '答案已保存')
    } catch (err) {
      logger.error('提交表单答案错误', err)
      return error(res, '提交失败')
    }
  },

  /**
   * 获取报告
   * GET /api/public/assessments/:sessionId/report
   */
  async getReport(req: Request, res: Response) {
    try {
      const { sessionId } = req.params

      const qa = await prisma.questionnaireAssessment.findUnique({
        where: { sessionId },
        include: {
          questionnaire: {
            include: {
              formItems: {
                orderBy: { position: 'asc' },
              },
              questionnaireScales: {
                include: { scale: { include: { dimensions: true } } },
                orderBy: { position: 'asc' },
              },
            },
          },
          scaleAssessments: { include: { scale: { include: { dimensions: true } } } },
          formAnswers: true,
        },
      })

      if (!qa) {
        return notFound(res, '测评不存在')
      }

      if (qa.status !== 'COMPLETED') {
        return error(res, '测评未完成')
      }

      const collectionReport = buildQuestionnaireCollectionReport(qa)

      return success(res, {
        questionnaireId: qa.questionnaireId,
        completedAt: qa.completedAt,
        totalTime: qa.totalTime,
        ...collectionReport,
      })
    } catch (err) {
      logger.error('获取报告错误', err)
      return error(res, '获取报告失败')
    }
  },
}
