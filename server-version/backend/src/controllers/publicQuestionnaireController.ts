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
import { success, error, notFound, unauthorized } from '../utils/response'
import { tokenService } from '../services/tokenService'
import { powService } from '../services/powService'
import { logger } from '../utils/logger'
import { encryptField, safeDecrypt } from '../utils/encryption'
import { v4 as uuidv4 } from 'uuid'
import { buildQuestionnaireCollectionReport } from '../modules/reporting/questionnaire-collection-report'
import { questionnaireResumeTokenService } from '../services/questionnaireResumeTokenService'
import { refreshQuestionnaireProgress, withSerializableQuestionnaireTransaction } from '../services/questionnaireProgressService'
import { getQuestionnaireResumeToken } from '../middleware/publicQuestionnaireAuth'
import { hashQuestionnaireResumeToken } from '../services/questionnaireResumeTokenService'

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

      // A consumed maxUses quota blocks new sessions, but an existing
      // in-progress session may still read its questionnaire with its
      // server-issued resume capability. The binding is checked below.
      const suppliedResumeToken = getQuestionnaireResumeToken(req)
      const validation = await tokenService.validateToken(token, {
        allowOverLimit: Boolean(suppliedResumeToken),
      })
      
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

      if (validation.overLimit) {
        const resumeAssessment = suppliedResumeToken
          ? await prisma.questionnaireAssessment.findUnique({
              where: { resumeTokenHash: hashQuestionnaireResumeToken(suppliedResumeToken) },
              select: {
                questionnaireId: true,
                tokenId: true,
                status: true,
                resumeTokenExpiresAt: true,
              },
            })
          : null

        if (
          !resumeAssessment ||
          resumeAssessment.questionnaireId !== validation.questionnaire!.id ||
          resumeAssessment.tokenId !== validation.token!.id ||
          resumeAssessment.status !== 'IN_PROGRESS' ||
          questionnaireResumeTokenService.isExpired(resumeAssessment.resumeTokenExpiresAt)
        ) {
          return error(res, '链接访问次数已达上限', -1, 403)
        }
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
      const suppliedResumeToken = getQuestionnaireResumeToken(req)
      const validation = await tokenService.validateToken(token, {
        allowOverLimit: Boolean(suppliedResumeToken),
      })
      if (!validation.valid) {
        return error(res, '链接无效或已过期', 403)
      }

      const questionnaireId = validation.questionnaire!.id
      const tokenId = validation.token!.id

      // sessionId is only a locator. A resume capability is required before
      // it can identify an existing assessment; otherwise always create a new
      // session and never re-issue a capability for an attacker-supplied ID.
      let questionnaireAssessment = null
      let resumeToken: string | null = null
      let sessionIdToUse = uuidv4()
      if (suppliedResumeToken) {
        const resumeAssessment = await prisma.questionnaireAssessment.findUnique({
          where: { resumeTokenHash: hashQuestionnaireResumeToken(suppliedResumeToken) },
          select: {
            id: true,
            sessionId: true,
            questionnaireId: true,
            tokenId: true,
            status: true,
            resumeTokenExpiresAt: true,
          },
        })

        if (
          !resumeAssessment ||
          resumeAssessment.questionnaireId !== questionnaireId ||
          resumeAssessment.tokenId !== tokenId ||
          resumeAssessment.status !== 'IN_PROGRESS' ||
          questionnaireResumeTokenService.isExpired(resumeAssessment.resumeTokenExpiresAt) ||
          (sessionId && resumeAssessment.sessionId !== sessionId)
        ) {
          return unauthorized(res, '测评恢复凭据无效或已过期')
        }

        sessionIdToUse = resumeAssessment.sessionId || uuidv4()
      }

      if (suppliedResumeToken) {
        // 优化：一次查询获取完整数据，避免重复查询
        const existingAssessment = await prisma.questionnaireAssessment.findFirst({
          where: {
            sessionId: sessionIdToUse,
            questionnaireId,
            tokenId,
          },
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

        // The capability lookup above already bound this row to the public
        // token and session. Rotate the opaque capability on every resume.
        if (existingAssessment && existingAssessment.status === 'IN_PROGRESS') {
          questionnaireAssessment = existingAssessment
          resumeToken = await questionnaireResumeTokenService.rotate(
            existingAssessment.id,
            suppliedResumeToken,
            validation.token!.expiresAt,
          )
          if (!resumeToken) return unauthorized(res, '测评恢复凭据无效或已过期')
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
            // 所有内容已完成，使用条件状态转换避免重复生成报告。
            await withSerializableQuestionnaireTransaction((tx) =>
              refreshQuestionnaireProgress(tx, questionnaireAssessment!.id)
            )

            logger.info('问卷测评在startAssessment中自动完成', {
              questionnaireAssessmentId: questionnaireAssessment.id,
              totalItems: contentItems.length,
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
              resumeToken,
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
              resumeToken,
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
              resumeToken,
            }, '继续测评')
          }
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

        // 名额占用、问卷记录、量表子记录和恢复凭据必须是同一事务。
        // 任一步失败都回滚名额，避免出现“已占用但没有测评记录”的孤儿状态。
        const created = await prisma.$transaction(async (tx) => {
          const claimed = await tokenService.claimAccess(tokenId, tx)
          if (!claimed) return null

          const assessment = await tx.questionnaireAssessment.create({
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

          await tx.assessment.createMany({
            data: questionnaire.questionnaireScales.map((qs) => ({
              scaleId: qs.scaleId,
              status: 'IN_PROGRESS',
              progress: 0,
              answers: [],
              questionnaireAssessmentId: assessment.id,
            })),
          })

          const issuedResumeToken = await questionnaireResumeTokenService.issue(
            assessment.id,
            validation.token!.expiresAt,
            tx,
          )

          return { assessment, resumeToken: issuedResumeToken }
        })

        if (!created) {
          return error(res, '链接访问次数已达上限', 403)
        }

        questionnaireAssessment = created.assessment
        resumeToken = created.resumeToken

        logger.info('创建匿名测评', {
          questionnaireAssessmentId: questionnaireAssessment.id,
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
            resumeToken,
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
            resumeToken,
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
      let allCompleted = currentIndex === -1 || !currentItem

      // 计算进度
      const completedCount = contentItems.filter((item) => {
        if (item.type === 'form') {
          return formAnswerMap.has(item.data.id)
        } else {
          const sa = saMap.get(item.data.scaleId)
          return sa && sa.status === 'COMPLETED'
        }
      }).length
      let progress = contentItems.length === 0
        ? 100
        : Math.round((completedCount / contentItems.length) * 100)

      // 如果所有内容都完成了，保存单项报告集合并更新问卷测评状态
      if (allCompleted && questionnaireAssessment.status !== 'COMPLETED') {
        const completion = await withSerializableQuestionnaireTransaction((tx) =>
          refreshQuestionnaireProgress(tx, questionnaireAssessment.id)
        )
        if (completion?.completed) {
          questionnaireAssessment.status = 'COMPLETED'
          questionnaireAssessment.progress = 100
          questionnaireAssessment.completedAt = completion.completedAt
          questionnaireAssessment.totalTime = completion.totalTime
          progress = 100
        } else if (completion) {
          allCompleted = false
          questionnaireAssessment.status = 'IN_PROGRESS'
          questionnaireAssessment.progress = completion.progress
          progress = completion.progress
        }
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

      const result = await withSerializableQuestionnaireTransaction(async (tx) => {
        const assessment = await tx.assessment.findUnique({
          where: { id: scaleAssessmentId },
          include: {
            questionnaireAssessment: {
              select: { id: true, sessionId: true, status: true }
            }
          }
        })

        if (!assessment) return { kind: 'not-found' as const }

        if (!assessment.questionnaireAssessment ||
            assessment.questionnaireAssessment.sessionId !== sessionId) {
          return { kind: 'forbidden' as const }
        }

        if (
          assessment.status === 'COMPLETED' ||
          assessment.questionnaireAssessment.status === 'COMPLETED'
        ) {
          return { kind: 'completed' as const }
        }

        if (
          assessment.status !== 'IN_PROGRESS' ||
          assessment.questionnaireAssessment.status !== 'IN_PROGRESS'
        ) {
          return { kind: 'closed' as const }
        }

        const answers = (assessment.answers as any[]) || []
        const existingIndex = answers.findIndex((a) => a.itemId === itemId)
        const answerData: any = { itemId, value }
        if (responseTime !== undefined) answerData.responseTime = responseTime

        if (existingIndex >= 0) {
          answers[existingIndex] = answerData
        } else {
          answers.push(answerData)
        }

        const updated = await tx.assessment.updateMany({
          where: { id: scaleAssessmentId, status: 'IN_PROGRESS' },
          data: { answers },
        })

        // A concurrent scale completion may win after the row was read. Do
        // not report a successful answer write when the conditional update
        // did not change an in-progress row.
        if (updated.count !== 1) {
          const current = await tx.assessment.findUnique({
            where: { id: scaleAssessmentId },
            select: {
              status: true,
              questionnaireAssessment: { select: { sessionId: true, status: true } },
            },
          })

          if (
            current?.questionnaireAssessment?.sessionId === sessionId &&
            (current.status === 'COMPLETED' || current.questionnaireAssessment.status === 'COMPLETED')
          ) {
            return { kind: 'completed' as const }
          }
          return { kind: 'closed' as const }
        }

        return { kind: 'saved' as const }
      })

      if (result.kind === 'not-found') {
        return notFound(res, '量表测评不存在')
      }

      if (result.kind === 'forbidden') {
        return error(res, '量表测评不属于当前会话', 403)
      }

      if (result.kind === 'completed') {
        return error(res, '测评已完成，不能继续修改答案', -1, 409)
      }

      if (result.kind === 'closed') {
        return error(res, '测评已关闭，不能继续修改答案', -1, 409)
      }

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

      const { cacheService } = await import('../services/cacheService')

      const initialAssessment = await prisma.assessment.findUnique({
        where: { id: scaleAssessmentId },
        select: {
          id: true,
          scaleId: true,
          questionnaireAssessmentId: true,
          questionnaireAssessment: {
            select: {
              id: true,
              sessionId: true,
            },
          },
        },
      })

      if (!initialAssessment) {
        return notFound(res, '量表测评不存在')
      }

      if (!initialAssessment.questionnaireAssessment ||
          initialAssessment.questionnaireAssessment.sessionId !== sessionId) {
        return error(res, '量表测评不属于当前会话', 403)
      }

      const scale = await cacheService.getScaleConfig(initialAssessment.scaleId)
      if (!scale) {
        return notFound(res, '量表不存在')
      }

      const { calculateScores, generateFeedbackWithLevels } = await import('../services/scoringService')
      const result = await withSerializableQuestionnaireTransaction(async (tx) => {
        const assessment = await tx.assessment.findUnique({
          where: { id: scaleAssessmentId },
          select: {
            id: true,
            answers: true,
            status: true,
            questionnaireAssessmentId: true,
            questionnaireAssessment: {
              select: {
                id: true,
                sessionId: true,
                status: true,
              },
            },
          },
        })

        if (!assessment) return { kind: 'not-found' as const }
        if (
          !assessment.questionnaireAssessment ||
          assessment.questionnaireAssessment.sessionId !== sessionId
        ) {
          return { kind: 'forbidden' as const }
        }
        if (
          assessment.status === 'COMPLETED' ||
          assessment.questionnaireAssessment.status === 'COMPLETED'
        ) {
          return { kind: 'completed' as const }
        }

        if (
          assessment.status !== 'IN_PROGRESS' ||
          assessment.questionnaireAssessment.status !== 'IN_PROGRESS'
        ) {
          return { kind: 'closed' as const }
        }

        const answers = (assessment.answers as any[]) || []
        const scores = calculateScores(
          answers,
          scale.items,
          scale.dimensions,
          scale.config as any,
        )
        const feedback = generateFeedbackWithLevels(
          scores,
          scale.dimensions,
          scale.name,
        )

        const updated = await tx.assessment.updateMany({
          where: {
            id: scaleAssessmentId,
            status: 'IN_PROGRESS',
            questionnaireAssessmentId: assessment.questionnaireAssessmentId,
          },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            scores: encryptField(scores) as any,
            feedback: encryptField(feedback) as any,
            progress: 100,
          },
        })

        if (updated.count !== 1) {
          const current = await tx.assessment.findUnique({
            where: { id: scaleAssessmentId },
            select: {
              status: true,
              questionnaireAssessment: { select: { sessionId: true, status: true } },
            },
          })

          if (
            current?.questionnaireAssessment?.sessionId === sessionId &&
            (current.status === 'COMPLETED' || current.questionnaireAssessment.status === 'COMPLETED')
          ) {
            return { kind: 'completed' as const }
          }
          return { kind: 'closed' as const }
        }

        const progress = await refreshQuestionnaireProgress(
          tx,
          assessment.questionnaireAssessmentId!,
        )
        return { kind: 'completed' as const, progress }
      })

      if (result.kind === 'not-found') return notFound(res, '量表测评不存在')
      if (result.kind === 'forbidden') return error(res, '量表测评不属于当前会话', 403)
      if (result.kind === 'closed') return error(res, '测评已关闭，不能继续提交', -1, 409)

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

      const result = await withSerializableQuestionnaireTransaction(async (tx) => {
        const qa = await tx.questionnaireAssessment.findUnique({
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

        if (!qa) return { kind: 'not-found' as const }

        if (qa.status === 'COMPLETED') {
          return {
            kind: 'completed' as const,
            questionnaireId: qa.questionnaireId,
            completedAt: qa.completedAt,
            totalTime: qa.totalTime,
            collectionReport: buildQuestionnaireCollectionReport(qa),
          }
        }

        if (qa.status !== 'IN_PROGRESS') return { kind: 'closed' as const }

        const incompleteScales = qa.scaleAssessments.filter(
          (sa) => sa.status !== 'COMPLETED'
        )
        if (incompleteScales.length > 0) return { kind: 'incomplete-scales' as const }
        const answeredFormItemIds = new Set(qa.formAnswers.map((answer) => answer.formItemId))
        if (qa.questionnaire.formItems.some((item) => !answeredFormItemIds.has(item.id))) {
          return { kind: 'incomplete-forms' as const }
        }

        const progress = await refreshQuestionnaireProgress(tx, qa.id)
        if (!progress?.completed) return { kind: 'incomplete-forms' as const }
        return {
          kind: 'completed' as const,
          questionnaireId: qa.questionnaireId,
          completedAt: progress.completedAt || new Date(),
          totalTime: progress.totalTime ?? (Date.now() - new Date(qa.startedAt).getTime()),
          collectionReport: progress?.collectionReport || buildQuestionnaireCollectionReport(qa),
        }
      })

      if (result.kind === 'not-found') return notFound(res, '测评不存在')
      if (result.kind === 'closed') return error(res, '测评已关闭，不能继续提交', -1, 409)
      if (result.kind === 'incomplete-scales') return error(res, '还有量表未完成')
      if (result.kind === 'incomplete-forms') return error(res, '还有表单题目未完成')

      logger.info('匿名问卷测评完成', {
        questionnaireAssessmentId: result.questionnaireId,
        totalTime: result.totalTime,
      })

      return success(res, {
        questionnaireId: result.questionnaireId,
        completedAt: result.completedAt,
        totalTime: result.totalTime,
        ...result.collectionReport,
      }, result.kind === 'completed' ? '问卷测评已完成' : '问卷测评已完成')
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

      const result = await withSerializableQuestionnaireTransaction(async (tx) => {
        const questionnaireAssessment = await tx.questionnaireAssessment.findUnique({
          where: { sessionId },
          include: {
            questionnaire: {
              include: {
                formItems: true,
              },
            },
          },
        })

        if (!questionnaireAssessment) return { kind: 'not-found' as const }
        if (questionnaireAssessment.status === 'COMPLETED') return { kind: 'completed' as const }
        if (questionnaireAssessment.status !== 'IN_PROGRESS') return { kind: 'closed' as const }

        const formItem = questionnaireAssessment.questionnaire.formItems.find(
          (fi: any) => fi.id === formItemId
        )

        if (!formItem) return { kind: 'form-not-found' as const }

        await tx.questionnaireFormAnswer.upsert({
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

        await refreshQuestionnaireProgress(tx, questionnaireAssessment.id)
        return { kind: 'saved' as const }
      })

      if (result.kind === 'not-found') {
        return notFound(res, '测评不存在')
      }

      if (result.kind === 'form-not-found') {
        return error(res, '表单题目不存在')
      }

      if (result.kind === 'completed') {
        return error(res, '测评已完成，不能继续修改答案', -1, 409)
      }

      if (result.kind === 'closed') {
        return error(res, '测评已关闭，不能继续修改答案', -1, 409)
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
