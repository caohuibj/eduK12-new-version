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
import { success, error, notFound, unauthorized, completionBusy } from '../utils/response'
import { tokenService } from '../services/tokenService'
import { powService } from '../services/powService'
import { logger } from '../utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { buildQuestionnaireCollectionReport } from '../modules/reporting/questionnaire-collection-report'
import { questionnaireResumeTokenService } from '../services/questionnaireResumeTokenService'
import {
  questionnaireProgressSelect,
  refreshQuestionnaireProgress,
  withQuestionnaireAnswerTransaction,
  withQuestionnaireCompletionTransaction,
  withQuestionnaireSerializableTransaction,
  withScaleAnswerTransaction,
  withScaleCompletionTransaction,
  type QuestionnaireProgressSnapshot,
} from '../services/questionnaireProgressService'
import { getQuestionnaireResumeToken } from '../middleware/publicQuestionnaireAuth'
import { hashQuestionnaireResumeToken } from '../services/questionnaireResumeTokenService'
import {
  buildScaleResultForRecord,
  encryptScaleAnswers,
  encryptScaleResult,
  readScaleAnswers,
  scaleAssessmentForResponse,
  scaleDefinitionFromRecord,
  scaleRunnerFromRecord,
} from '../modules/scale/scale-workflow.service'
import { mergeScaleAnswersWithRevision } from '../modules/scale/scale-answer-concurrency'
import { missingRequiredScaleItemCodes, validateScaleAnswer } from '../modules/scale/scale-scoring'
import { readContextFormAnswer, writeContextFormAnswer } from '../modules/assessment-context'
import { normalizeQuestionnaireFormAnswer, validateQuestionnaireFormAnswer } from '../services/questionnaireFormAnswerValidation'
import { freezeQuestionnaireAssessmentContext, freezeQuestionnaireAssessmentContextFromSnapshot, isAssessmentContextServiceError } from '../services/assessmentContextService'
import { isFormAnswerComplete, isFormAnswerRequiredComplete } from '../services/questionnaireFormAnswerState'
import { applyQuestionnaireProgressDelta } from '../services/questionnaireProgressService'
import { prepareFormAnswerChanges } from '../services/questionnaire-form-answer-concurrency'
import { persistFormAnswerBatch, questionnaireFormItemAnswerSelect } from '../services/questionnaire-form-answer-batch'
import { measureRequestPhase, recordRequestPhase } from '../services/runtimeObservability'
import { cacheService } from '../services/cacheService'
import { isQuestionnaireCompletionAdmissionBusyError } from '../services/questionnaireCompletionAdmission'
import { z } from 'zod'

const publicScaleRunner = (scale: any) => {
  try {
    const { definition: _definition, ...metadata } = scale
    return { ...metadata, definition: scaleRunnerFromRecord(scale) }
  } catch {
    const { definition: _definition, ...metadata } = scale
    return { ...metadata, definition: null, definitionError: true }
  }
}

const assessmentContextState = (row: { contextSnapshotEncrypted?: string | null; contextSnapshotHash?: string | null; contextFrozenAt?: Date | null }) => ({
  status: row.contextSnapshotEncrypted && row.contextSnapshotHash ? 'frozen' as const : 'collecting' as const,
  frozenAt: row.contextFrozenAt?.toISOString() ?? null,
})

export const publicQuestionnaireController = {
  /**
   * 获取 POW 挑战
   * GET /api/public/pow/challenge
   */
  async getPOWChallenge(req: Request, res: Response) {
    try {
      const challenge = await powService.generateChallenge(4) // 难度4
      
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
                  code: true,
                  name: true,
                  description: true,
                  estimatedTime: true,
                  instruction: true,
                  status: true,
                  instrumentClass: true,
                  instrumentVersion: true,
                  definition: true,
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
      const storedChallenge = await powService.getChallenge(challenge)
      if (!storedChallenge) {
        return error(res, 'POW 挑战已过期，请刷新页面重试', -1, 400)
      }
      const powValid = await powService.verifyPOW(challenge, proof, storedChallenge.difficulty)
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
        const resumeAssessment = await measureRequestPhase('resume_auth', () => prisma.questionnaireAssessment.findUnique({
          where: { resumeTokenHash: hashQuestionnaireResumeToken(suppliedResumeToken) },
          select: {
            id: true,
            sessionId: true,
            questionnaireId: true,
            tokenId: true,
            status: true,
            resumeTokenExpiresAt: true,
          },
        }))

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
        // Read attempt state separately from the immutable questionnaire
        // content. The old nested include reloaded every form item and scale
        // definition for every resume request.
        const existingAssessmentRow = await measureRequestPhase('assessment_lookup', () => prisma.questionnaireAssessment.findFirst({
          where: {
            sessionId: sessionIdToUse,
            questionnaireId,
            tokenId,
          },
          select: {
            id: true,
            status: true,
            progress: true,
            contextSnapshotEncrypted: true,
            contextSnapshotHash: true,
            contextFrozenAt: true,
            questionnaire: { select: { id: true } },
            scaleAssessments: {
              select: {
                id: true,
                scaleId: true,
                userId: true,
                status: true,
                answers: true,
                answersRevision: true,
                result: true,
                progress: true,
                startedAt: true,
                completedAt: true,
                totalTime: true,
                questionnaireAssessmentId: true,
                compositeAttemptId: true,
                compositeItemId: true,
                scale: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    description: true,
                    status: true,
                    visibility: true,
                    instrumentClass: true,
                    instrumentVersion: true,
                    definitionHash: true,
                    itemCount: true,
                    dimensionCount: true,
                    estimatedTime: true,
                    instruction: true,
                    creatorId: true,
                    createdAt: true,
                    updatedAt: true,
                    tags: true,
                  },
                },
              },
              orderBy: { startedAt: 'asc' },
            },
            formAnswers: {
              select: {
                formItemId: true,
                value: true,
                status: true,
                revision: true,
              },
            },
          },
        }))
        const existingContent = existingAssessmentRow
          ? await measureRequestPhase('definition_lookup', () => (
              cacheService.getQuestionnaireStartContent(questionnaireId)
            ))
          : null
        const existingAssessment = existingAssessmentRow && existingContent
          ? {
              ...existingAssessmentRow,
              questionnaire: {
                id: questionnaireId,
                ...existingContent,
              },
            }
          : null

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
              if (!isFormAnswerComplete(item.data, answer)) {
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
            const completion = await withQuestionnaireCompletionTransaction(async (tx) => {
              // Re-read inside Serializable; the resume/start lookup above is
              // outside the mutation transaction and may be stale.
              const completionSnapshot = await tx.questionnaireAssessment.findUnique({
                where: { id: questionnaireAssessment!.id },
                select: questionnaireProgressSelect,
              }) as QuestionnaireProgressSnapshot | null
              if (!completionSnapshot) return null
              await freezeQuestionnaireAssessmentContextFromSnapshot(tx, completionSnapshot)
              return refreshQuestionnaireProgress(tx, questionnaireAssessment!.id, completionSnapshot)
            })
            if (!completion?.completed) return error(res, '测评状态已变化，请刷新后重试', -1, 409)

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
                context: assessmentContextState(questionnaireAssessment),
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
                context: assessmentContextState(questionnaireAssessment),
              },
              currentFormItem: currentItem.data,
              currentFormAnswerRevision: formAnswerMap.get(currentItem.data.id)?.revision ?? 0,
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
                context: assessmentContextState(questionnaireAssessment),
              },
              currentFormItem: null,
              currentScale: {
                ...publicScaleRunner(currentItem.data.scale),
                scaleAssessmentId: sa?.id,
                assessment: sa ? scaleAssessmentForResponse(sa) : sa,
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
        // Token validation already loaded and bound the parent questionnaire.
        // Only the immutable content graph is fetched here, through a
        // coalesced cache read, so a public start burst does not repeat the
        // same definition join for every anonymous session.
        const startContent = await measureRequestPhase('definition_lookup', () => (
          cacheService.getQuestionnaireStartContent(questionnaireId)
        ))

        // 名额占用、问卷记录、量表子记录和恢复凭据必须是同一事务。
        // 任一步失败都回滚名额，避免出现“已占用但没有测评记录”的孤儿状态。
        const transactionRequestedAt = process.hrtime.bigint()
        const created = await measureRequestPhase('transaction', () => prisma.$transaction(async (tx) => {
          const transactionAcquiredAt = process.hrtime.bigint()
          recordRequestPhase(
            'transaction_acquisition',
            Number(transactionAcquiredAt - transactionRequestedAt) / 1_000_000,
            transactionRequestedAt,
            transactionAcquiredAt,
          )
          const claimed = await tokenService.claimAccess(tokenId, tx, validation.token!.questionnaireId)
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
            data: startContent.questionnaireScales.map((qs) => ({
              scaleId: qs.scaleId,
              status: 'IN_PROGRESS',
              progress: 0,
              answers: encryptScaleAnswers([]),
              questionnaireAssessmentId: assessment.id,
            })),
          })

          await tx.questionnaireFormAnswer.createMany({
            data: startContent.formItems.map((item) => ({
              questionnaireAssessmentId: assessment.id,
              formItemId: item.id,
              value: null,
              status: 'PENDING' as const,
            })),
            skipDuplicates: true,
          })

          const issuedResumeToken = await questionnaireResumeTokenService.issue(
            assessment.id,
            validation.token!.expiresAt,
            tx,
          )

          return { assessment, resumeToken: issuedResumeToken }
        }))

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
          ...startContent.formItems.map(fi => ({ type: 'form' as const, position: fi.position, data: fi })),
          ...startContent.questionnaireScales.map(qs => ({ type: 'scale' as const, position: qs.position, data: qs })),
        ].sort((a, b) => a.position - b.position)

        // 返回第一个内容项
        const firstItem = contentItems[0]

        if (firstItem?.type === 'form') {
          return success(res, {
            questionnaireAssessment: {
              id: questionnaireAssessment.id,
              status: questionnaireAssessment.status,
              progress: questionnaireAssessment.progress,
              currentIndex: 0,
              context: assessmentContextState(questionnaireAssessment),
            },
            currentFormItem: firstItem.data,
            currentFormAnswerRevision: 0,
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
          const firstScale = startContent.questionnaireScales.find(qs => qs.scaleId === firstItem?.data.scaleId)
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
              currentIndex: 0,
              context: assessmentContextState(questionnaireAssessment),
            },
            currentFormItem: null,
            currentScale: firstScale ? {
              ...publicScaleRunner(firstScale.scale),
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
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
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
            contextSnapshotEncrypted: true,
            contextSnapshotHash: true,
            contextFrozenAt: true,
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
              answers: true,
              scale: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  instrumentVersion: true,
                  instrumentClass: true,
                  definition: true,
                },
              },
            },
            orderBy: { startedAt: 'asc' },
          },
          formAnswers: {
            select: {
              formItemId: true,
              value: true,
              status: true,
              revision: true,
            },
          },
        },
      })

      if (!questionnaireAssessment) {
        return notFound(res, '测评不存在')
      }

      // Reuse the same coalesced projection as start/resume. This keeps the
      // status endpoint from maintaining two independently stale cache keys
      // for the same questionnaire content.
      const startContent = await measureRequestPhase('definition_lookup', () => (
        cacheService.getQuestionnaireStartContent(questionnaireAssessment.questionnaire.id)
      ))
      const { questionnaireScales, formItems } = startContent

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
          if (!isFormAnswerComplete(item.data, answer)) {
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
          return isFormAnswerComplete(item.data, formAnswerMap.get(item.data.id))
        } else {
          const sa = saMap.get(item.data.scaleId)
          return sa && sa.status === 'COMPLETED'
        }
      }).length
      let progress = contentItems.length === 0
        ? 100
        : Math.round((completedCount / contentItems.length) * 100)
      let contextState = assessmentContextState(questionnaireAssessment)

      // 如果所有内容都完成了，保存单项报告集合并更新问卷测评状态
      if (allCompleted && questionnaireAssessment.status !== 'COMPLETED') {
        const completionResult = await withQuestionnaireCompletionTransaction(async (tx) => {
          // The outer GET is intentionally outside the mutation transaction.
          // Reload a minimal authoritative snapshot inside Serializable rather
          // than carrying a potentially stale cache/HTTP snapshot across the
          // transaction boundary.
          const completionSnapshot = await tx.questionnaireAssessment.findUnique({
            where: { id: questionnaireAssessment.id },
            select: questionnaireProgressSelect,
          }) as QuestionnaireProgressSnapshot | null
          if (!completionSnapshot) return { completion: null, contextState: assessmentContextState(questionnaireAssessment) }
          const frozen = await freezeQuestionnaireAssessmentContextFromSnapshot(tx, completionSnapshot)
          const completion = await refreshQuestionnaireProgress(tx, questionnaireAssessment.id, completionSnapshot)
          return { completion, contextState: { status: 'frozen' as const, frozenAt: frozen.context.frozenAt } }
        })
        if (completionResult.completion?.completed) {
          questionnaireAssessment.status = 'COMPLETED'
          questionnaireAssessment.progress = 100
          questionnaireAssessment.completedAt = completionResult.completion.completedAt
          questionnaireAssessment.totalTime = completionResult.completion.totalTime
          progress = 100
        } else if (completionResult.completion) {
          allCompleted = false
          questionnaireAssessment.status = 'IN_PROGRESS'
          questionnaireAssessment.progress = completionResult.completion.progress
          progress = completionResult.completion.progress
        }
        contextState = completionResult.contextState
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
          context: contextState,
        },
        currentFormItem: null,
        currentFormAnswerRevision: null,
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
          responseData.currentFormAnswerRevision = formAnswerMap.get(currentItem.data.id)?.revision ?? 0
        } else {
          const sa = saMap.get(currentItem.data.scaleId)
          responseData.currentScale = {
            ...publicScaleRunner(currentItem.data.scale),
            scaleAssessmentId: sa?.id,
            assessment: sa ? scaleAssessmentForResponse(sa) : sa,
          }
        }
      }

      return success(res, responseData)
    } catch (err) {
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
      logger.error('获取匿名测评状态错误', err)
      return error(res, '获取测评状态失败')
    }
  },

  async freezeContext(req: Request, res: Response) {
    try {
      const { sessionId } = req.params
      const result = await withQuestionnaireSerializableTransaction(async (tx) => {
        const assessment = await tx.questionnaireAssessment.findUnique({ where: { sessionId }, select: { id: true, status: true } })
        if (!assessment) return { kind: 'not-found' as const }
        if (assessment.status !== 'IN_PROGRESS') return { kind: 'closed' as const }
        const frozen = await freezeQuestionnaireAssessmentContext(tx, assessment.id)
        return { kind: 'frozen' as const, frozenAt: frozen.context.frozenAt }
      })
      if (result.kind === 'not-found') return notFound(res, '测评不存在')
      if (result.kind === 'closed') return error(res, '测评已关闭，不能冻结人口学上下文', -1, 409)
      return success(res, { status: 'frozen', frozenAt: result.frozenAt }, '人口学上下文已冻结')
    } catch (err) {
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
      logger.error('冻结匿名问卷人口学上下文错误', err)
      return error(res, '冻结人口学上下文失败')
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
          scale: true,
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
        ...scaleAssessmentForResponse(assessment),
        scale: publicScaleRunner(assessment.scale),
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
      const { scaleAssessmentId } = req.body
      const itemCode = req.body?.itemCode
      const responseValue = req.body?.responseValue
      const rawResponseTime = req.body?.responseTimeMs ?? req.body?.responseTime
      const responseTimeMs = rawResponseTime === undefined ? undefined : Number(rawResponseTime)
      const expectedRevisionResult = z.number().int().nonnegative().optional().safeParse(req.body?.expectedRevision)
      if (!expectedRevisionResult.success) return error(res, 'expectedRevision 必须是非负整数')
      const expectedRevision = expectedRevisionResult.data

      const result = await withScaleAnswerTransaction(scaleAssessmentId, async (tx) => {
        const assessment = await tx.assessment.findUnique({
          where: { id: scaleAssessmentId },
          include: {
            scale: {
              select: {
                id: true,
                code: true,
                name: true,
                instrumentVersion: true,
                instrumentClass: true,
                definition: true,
              },
            },
            questionnaireAssessment: {
              select: {
                id: true,
                sessionId: true,
                status: true,
                contextSnapshotEncrypted: true,
                contextSnapshotHash: true,
              },
            },
          },
        })

        if (!assessment) return { kind: 'not-found' as const }
        if (!assessment.questionnaireAssessment || assessment.questionnaireAssessment.sessionId !== sessionId) {
          return { kind: 'forbidden' as const }
        }
        if (assessment.status === 'COMPLETED' || assessment.questionnaireAssessment.status === 'COMPLETED') {
          return { kind: 'completed' as const }
        }
        if (assessment.status !== 'IN_PROGRESS' || assessment.questionnaireAssessment.status !== 'IN_PROGRESS') {
          return { kind: 'closed' as const }
        }
        if (typeof itemCode !== 'string' || (typeof responseValue !== 'string' && typeof responseValue !== 'number')) {
          return { kind: 'invalid-answer' as const }
        }

        const definition = scaleDefinitionFromRecord(assessment.scale)
        const answer = {
          itemCode,
          responseValue,
          ...(responseTimeMs === undefined ? {} : { responseTimeMs }),
          answeredAt: new Date().toISOString(),
        }
        try {
          validateScaleAnswer(definition, answer)
        } catch {
          return { kind: 'invalid-answer' as const }
        }

        if (!assessment.questionnaireAssessment.contextSnapshotEncrypted || !assessment.questionnaireAssessment.contextSnapshotHash) {
          await freezeQuestionnaireAssessmentContext(tx, assessment.questionnaireAssessment.id)
        }

        const stored = readScaleAnswers(assessment.answers)
        if (stored.decryptError) return { kind: 'decrypt-error' as const }
        const merged = mergeScaleAnswersWithRevision(stored.answers, [{ ...answer, expectedRevision }])
        if (merged.kind === 'stale') return { kind: 'stale-answer' as const }
        const answers = merged.answers
        const progress = definition.items.length === 0
          ? 100
          : Math.round((new Set(answers.map((candidate) => candidate.itemCode)).size / definition.items.length) * 100)
        const updated = await tx.assessment.updateMany({
          where: {
            id: scaleAssessmentId,
            status: 'IN_PROGRESS',
            questionnaireAssessmentId: assessment.questionnaireAssessmentId,
            answersRevision: assessment.answersRevision ?? 0,
          },
          data: {
            answers: encryptScaleAnswers(answers),
            progress,
            ...(merged.changedCount > 0 ? { answersRevision: { increment: merged.changedCount } } : {}),
          },
        })
        if (updated.count !== 1) return { kind: 'stale-answer' as const }
        return { kind: 'saved' as const }
      })

      if (result.kind === 'not-found') return notFound(res, '量表测评不存在')
      if (result.kind === 'forbidden') return error(res, '量表测评不属于当前会话', 403)
      if (result.kind === 'completed') return error(res, '测评已完成，不能继续修改答案', -1, 409)
      if (result.kind === 'closed') return error(res, '测评已关闭，不能继续修改答案', -1, 409)
      if (result.kind === 'stale-answer') return error(res, '答案已在其他设备更新，请刷新测评后重试', -1, 409)
      if (result.kind === 'invalid-answer') return error(res, '回答值不属于该题目的响应集', -1, 400)
      if (result.kind === 'decrypt-error') return error(res, '测评答案无法读取，请联系管理员', -1, 500)
      return success(res, { saved: true })
    } catch (err) {
      logger.error('提交答案错误', err)
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
      return error(res, '提交答案失败')
    }
  },

  /**
   * 批量提交量表答案。公开恢复凭据只绑定一个 session，批量写入
   * 仍在同一个按 assessment 串行化的 transaction 中完成，并返回显式 checkpoint ACK。
   */
  async submitAnswers(req: Request, res: Response) {
    try {
      const { sessionId } = req.params
      const schema = z.object({
        checkpointSequence: z.number().int().positive().optional(),
        answers: z.array(z.object({
          checkpointId: z.string().min(1).optional(),
          checkpointSequence: z.number().int().positive().optional(),
          scaleAssessmentId: z.string().min(1),
          itemCode: z.string().min(1),
          responseValue: z.union([z.string(), z.number().finite()]),
          responseTimeMs: z.number().finite().nonnegative().optional(),
          expectedRevision: z.number().int().nonnegative().optional(),
        })).min(1).max(10),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return error(res, parsed.error.errors[0].message)
      const { answers } = parsed.data
      const scaleAssessmentId = answers[0].scaleAssessmentId
      if (answers.some((answer) => answer.scaleAssessmentId !== scaleAssessmentId)) {
        return error(res, '一次批量请求只能包含同一量表测评的答案', -1, 400)
      }

      const result = await withScaleAnswerTransaction(scaleAssessmentId, async (tx) => {
        const assessment = await tx.assessment.findUnique({
          where: { id: scaleAssessmentId },
          include: {
            scale: {
              select: {
                id: true,
                code: true,
                name: true,
                instrumentVersion: true,
                instrumentClass: true,
                definition: true,
              },
            },
            questionnaireAssessment: {
              select: {
                id: true,
                sessionId: true,
                status: true,
                contextSnapshotEncrypted: true,
                contextSnapshotHash: true,
              },
            },
          },
        })

        if (!assessment) return { kind: 'not-found' as const }
        if (!assessment.questionnaireAssessment || assessment.questionnaireAssessment.sessionId !== sessionId) {
          return { kind: 'forbidden' as const }
        }
        if (assessment.status === 'COMPLETED' || assessment.questionnaireAssessment.status === 'COMPLETED') {
          return { kind: 'completed' as const }
        }
        if (assessment.status !== 'IN_PROGRESS' || assessment.questionnaireAssessment.status !== 'IN_PROGRESS') {
          return { kind: 'closed' as const }
        }

        const definition = scaleDefinitionFromRecord(assessment.scale)
        const normalizedAnswers = answers.map((answer) => ({
          itemCode: answer.itemCode,
          responseValue: answer.responseValue,
          ...(answer.responseTimeMs === undefined ? {} : { responseTimeMs: answer.responseTimeMs }),
          answeredAt: new Date().toISOString(),
          expectedRevision: answer.expectedRevision,
        }))
        for (const answer of normalizedAnswers) {
          try {
            validateScaleAnswer(definition, answer)
          } catch {
            return { kind: 'invalid-answer' as const }
          }
        }

        if (!assessment.questionnaireAssessment.contextSnapshotEncrypted || !assessment.questionnaireAssessment.contextSnapshotHash) {
          await freezeQuestionnaireAssessmentContext(tx, assessment.questionnaireAssessment.id)
        }

        const stored = readScaleAnswers(assessment.answers)
        if (stored.decryptError) return { kind: 'decrypt-error' as const }
        const mergedResult = mergeScaleAnswersWithRevision(stored.answers, normalizedAnswers)
        if (mergedResult.kind === 'stale') return { kind: 'stale-answer' as const }
        const nextAnswers = mergedResult.answers
        const progress = definition.items.length === 0
          ? 100
          : Math.round((new Set(nextAnswers.map((candidate) => candidate.itemCode)).size / definition.items.length) * 100)
        const updated = await tx.assessment.updateMany({
          where: {
            id: scaleAssessmentId,
            status: 'IN_PROGRESS',
            questionnaireAssessmentId: assessment.questionnaireAssessment.id,
            answersRevision: assessment.answersRevision ?? 0,
          },
          data: {
            answers: encryptScaleAnswers(nextAnswers),
            progress,
            ...(mergedResult.changedCount > 0 ? { answersRevision: { increment: mergedResult.changedCount } } : {}),
          },
        })
        if (updated.count !== 1) return { kind: 'stale-answer' as const }
        return {
          kind: 'saved' as const,
          acceptedIds: answers.flatMap((answer) => answer.checkpointId ? [answer.checkpointId] : []),
          acceptedSequences: answers.flatMap((answer) => answer.checkpointSequence ? [answer.checkpointSequence] : []),
          progress,
        }
      })

      if (result.kind === 'not-found') return notFound(res, '量表测评不存在')
      if (result.kind === 'forbidden') return error(res, '量表测评不属于当前会话', 403)
      if (result.kind === 'completed') return error(res, '测评已完成，不能继续修改答案', -1, 409)
      if (result.kind === 'closed') return error(res, '测评已关闭，不能继续修改答案', -1, 409)
      if (result.kind === 'stale-answer') return error(res, '答案已在其他设备更新，请刷新测评后重试', -1, 409)
      if (result.kind === 'invalid-answer') return error(res, '回答值不属于该题目的响应集', -1, 400)
      if (result.kind === 'decrypt-error') return error(res, '测评答案无法读取，请联系管理员', -1, 500)
      return success(res, {
        saved: answers.length,
        progress: result.progress,
        acceptedIds: result.acceptedIds,
        acceptedSequences: result.acceptedSequences,
      })
    } catch (err) {
      logger.error('批量提交公开量表答案错误', err)
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
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

      const result = await withScaleCompletionTransaction(async (tx) => {
        const assessment = await tx.assessment.findUnique({
          where: { id: scaleAssessmentId },
          include: {
            scale: {
              select: {
                id: true,
                code: true,
                name: true,
                instrumentVersion: true,
                instrumentClass: true,
                definition: true,
              },
            },
            questionnaireAssessment: {
              select: { id: true, sessionId: true, status: true },
            },
          },
        })

        if (!assessment) return { kind: 'not-found' as const }
        if (!assessment.questionnaireAssessment || assessment.questionnaireAssessment.sessionId !== sessionId) {
          return { kind: 'forbidden' as const }
        }
        if (assessment.status === 'COMPLETED' || assessment.questionnaireAssessment.status === 'COMPLETED') {
          return { kind: 'completed' as const }
        }
        if (assessment.status !== 'IN_PROGRESS' || assessment.questionnaireAssessment.status !== 'IN_PROGRESS') {
          return { kind: 'closed' as const }
        }

        const contextSnapshot = await freezeQuestionnaireAssessmentContext(tx, assessment.questionnaireAssessment.id)
        const stored = readScaleAnswers(assessment.answers)
        if (stored.decryptError) return { kind: 'decrypt-error' as const }
        const definition = scaleDefinitionFromRecord(assessment.scale)
        const missingRequiredItems = missingRequiredScaleItemCodes(definition, stored.answers)
        if (missingRequiredItems.length > 0) return { kind: 'missing-required' as const, count: missingRequiredItems.length }
        const scaleResult = await buildScaleResultForRecord({
          scale: assessment.scale,
          answers: stored.answers,
          participantContext: contextSnapshot.context.values,
          participantContextHash: contextSnapshot.hash,
        })
        const completedAt = new Date()
        const totalTime = completedAt.getTime() - assessment.startedAt.getTime()
        const updated = await tx.assessment.updateMany({
          where: {
            id: scaleAssessmentId,
            status: 'IN_PROGRESS',
            questionnaireAssessmentId: assessment.questionnaireAssessmentId,
          },
          data: {
            status: 'COMPLETED',
            answers: encryptScaleAnswers(stored.answers),
            result: encryptScaleResult(scaleResult),
            completedAt,
            totalTime,
            progress: 100,
          },
        })
        if (updated.count !== 1) return { kind: 'closed' as const }
        const progress = await refreshQuestionnaireProgress(tx, assessment.questionnaireAssessmentId!)
        return { kind: 'completed' as const, progress }
      })

      if (result.kind === 'not-found') return notFound(res, '量表测评不存在')
      if (result.kind === 'forbidden') return error(res, '量表测评不属于当前会话', 403)
      if (result.kind === 'decrypt-error') return error(res, '测评答案无法读取，请联系管理员', -1, 500)
      if (result.kind === 'missing-required') return error(res, `还有 ${result.count} 道必答题未作答`, -1, 409)
      if (result.kind === 'closed') return error(res, '测评已关闭，不能继续提交', -1, 409)
      return success(res, { completed: true, progress: result.progress ?? null })
    } catch (err) {
      logger.error('完成量表测评错误', err)
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
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

      const result = await withQuestionnaireCompletionTransaction(async (tx) => {
        const qa = await measureRequestPhase('assessment_lookup', () => tx.questionnaireAssessment.findUnique({
          where: { sessionId },
          select: questionnaireProgressSelect,
        })) as QuestionnaireProgressSnapshot | null

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

        await freezeQuestionnaireAssessmentContextFromSnapshot(tx, qa)

        const incompleteScales = qa.scaleAssessments.filter(
          (sa) => sa.status !== 'COMPLETED'
        )
        if (incompleteScales.length > 0) return { kind: 'incomplete-scales' as const }
        const formAnswerMap = new Map(qa.formAnswers.map((answer) => [answer.formItemId, answer]))
        const missingForms = qa.questionnaire.formItems.filter((item) => !isFormAnswerRequiredComplete(item, formAnswerMap.get(item.id)))
        if (missingForms.length > 0) return { kind: 'incomplete-forms' as const, count: missingForms.length }

        const progress = await measureRequestPhase('progress_mutation', () => refreshQuestionnaireProgress(tx, qa.id, qa))
        if (!progress?.completed) return { kind: 'incomplete-forms' as const, count: 0 }
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
      if (result.kind === 'incomplete-forms') return error(res, `还有 ${result.count} 道必答表单题未完成`, -1, 409)

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
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
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
      const { formItemId, action = 'answer', value, expectedRevision } = req.body

      if (!formItemId || !['answer', 'skip'].includes(action) || (action === 'answer' && value === undefined)) {
        return error(res, '缺少必要参数')
      }
      const expectedRevisionResult = z.number().int().nonnegative().optional().safeParse(expectedRevision)
      if (!expectedRevisionResult.success) return error(res, 'expectedRevision 必须是非负整数')

      const result = await withQuestionnaireAnswerTransaction(sessionId, async (tx) => {
        const questionnaireAssessment = await measureRequestPhase('assessment_lookup', () => tx.questionnaireAssessment.findUnique({
          where: { sessionId },
          include: {
            questionnaire: {
              include: {
                formItems: true,
                questionnaireScales: { select: { id: true } },
              },
            },
          },
        }))

        if (!questionnaireAssessment) return { kind: 'not-found' as const }
        if (questionnaireAssessment.status === 'COMPLETED') return { kind: 'completed' as const }
        if (questionnaireAssessment.status !== 'IN_PROGRESS') return { kind: 'closed' as const }

        const formItem = questionnaireAssessment.questionnaire.formItems.find(
          (fi: any) => fi.id === formItemId
        )

        if (!formItem) return { kind: 'form-not-found' as const }

        if (action === 'skip' && (formItem.required || formItem.contextKey)) {
          return { kind: 'skip-not-allowed' as const }
        }

        if (questionnaireAssessment.contextSnapshotEncrypted || questionnaireAssessment.contextSnapshotHash) {
          if (formItem.contextKey) return { kind: 'context-frozen' as const }
        }
        if (action === 'answer') {
          const validationMessage = validateQuestionnaireFormAnswer(formItem, value)
          if (validationMessage) return { kind: 'invalid-context-answer' as const, message: validationMessage }
        }
        const previousFormAnswer = await measureRequestPhase('existing_answer_lookup', () => tx.questionnaireFormAnswer.findUnique({
          where: {
            questionnaireAssessmentId_formItemId: {
              questionnaireAssessmentId: questionnaireAssessment.id,
              formItemId,
            },
          },
          select: { formItemId: true, status: true, value: true, revision: true },
        }))
        const normalizedValue = action === 'answer' && value !== undefined
          ? normalizeQuestionnaireFormAnswer(formItem, value)
          : value
        const valueToStore = action === 'skip'
          ? null
          : Array.isArray(normalizedValue)
            ? JSON.stringify(normalizedValue)
            : String(normalizedValue)
        const previousForRevision = previousFormAnswer
          ? {
              ...previousFormAnswer,
              value: previousFormAnswer.value === null
                ? null
                : readContextFormAnswer(formItem.contextKey, previousFormAnswer.value),
            }
          : undefined
        const answerStatus = action === 'skip' ? 'SKIPPED' as const : 'ANSWERED' as const
        const prepared = prepareFormAnswerChanges(
          previousForRevision ? [previousForRevision] : [],
          [{
            formItemId,
            value: valueToStore,
            status: answerStatus,
            expectedRevision: expectedRevisionResult.data,
          }],
        )
        if (prepared.kind === 'stale') return { kind: 'stale-answer' as const }
        const change = prepared.changes[0]
        const wasComplete = isFormAnswerComplete(formItem, change.previous)
        const storedValue = valueToStore === null ? null : writeContextFormAnswer(formItem.contextKey, valueToStore)
        const formAnswer = change.replay && previousFormAnswer
          ? previousFormAnswer
          : await measureRequestPhase('answer_mutation', () => tx.questionnaireFormAnswer.upsert({
              where: {
                questionnaireAssessmentId_formItemId: {
                  questionnaireAssessmentId: questionnaireAssessment.id,
                  formItemId,
                },
              },
              create: {
                questionnaireAssessmentId: questionnaireAssessment.id,
                formItemId,
                value: storedValue,
                status: answerStatus,
                revision: change.next.revision ?? 1,
              },
              update: {
                value: storedValue,
                status: answerStatus,
                revision: { increment: 1 },
              },
          }))

        const isComplete = isFormAnswerComplete(formItem, formAnswer)
        const progress = await measureRequestPhase('progress_mutation', () => applyQuestionnaireProgressDelta(
          tx,
          questionnaireAssessment,
          Number(isComplete) - Number(wasComplete),
          questionnaireAssessment.questionnaire.formItems.length + questionnaireAssessment.questionnaire.questionnaireScales.length,
        ))
        return { kind: 'saved' as const, progress }
      })

      if (result.kind === 'not-found') {
        return notFound(res, '测评不存在')
      }

      if (result.kind === 'form-not-found') {
        return error(res, '表单题目不存在')
      }

      if (result.kind === 'skip-not-allowed') return error(res, '必答题或人口学题目不能跳过', -1, 400)

      if (result.kind === 'completed') {
        return error(res, '测评已完成，不能继续修改答案', -1, 409)
      }

      if (result.kind === 'closed') {
        return error(res, '测评已关闭，不能继续修改答案', -1, 409)
      }
      if (result.kind === 'stale-answer') return error(res, '答案已在其他设备更新，请刷新测评后重试', -1, 409)
      if (result.kind === 'context-frozen') return error(res, '人口学表单已冻结，不能继续修改答案', -1, 409)
      if (result.kind === 'invalid-context-answer') return error(res, result.message)

      return success(res, {
        formItemId,
        value,
        progress: result.progress.progress,
        completedForms: result.progress.completedForms,
      }, '答案已保存')
    } catch (err) {
      logger.error('提交表单答案错误', err)
      if (isAssessmentContextServiceError(err)) return error(res, err.message, -1, err.statusCode)
      return error(res, '提交失败')
    }
  },

  /**
   * 批量提交表单题目答案。公开恢复凭据只绑定一个 session，批量写入
   * 仍在同一个按 assessment 串行化的 transaction 中完成，并返回显式 checkpoint ACK。
   */
  async submitFormAnswers(req: Request, res: Response) {
    try {
      const { sessionId } = req.params
      const schema = z.object({
        checkpointSequence: z.number().int().positive().optional(),
        answers: z.array(z.object({
          checkpointId: z.string().min(1).optional(),
          checkpointSequence: z.number().int().positive().optional(),
          formItemId: z.string().min(1),
          action: z.enum(['answer', 'skip']).optional(),
          value: z.union([z.string(), z.array(z.string())]).optional(),
          expectedRevision: z.number().int().nonnegative().optional(),
        }).superRefine((input, ctx) => {
          if ((input.action || 'answer') === 'answer' && input.value === undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: '回答值不能为空', path: ['value'] })
          }
        })).min(1).max(10),
      })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) return error(res, parsed.error.errors[0].message)
      const { answers } = parsed.data
      const requestedFormItemIds = [...new Set(answers.map((answer) => answer.formItemId))]

      // Public questionnaire content is immutable after publication. Resolve
      // only the requested answer fields before taking the assessment lock so
      // validation and normalization do not hold the write transaction open.
      const answerDefinitions = await measureRequestPhase('definition_lookup', () => prisma.questionnaireAssessment.findUnique({
        where: { sessionId },
        select: {
          questionnaire: {
            select: {
              formItems: {
                where: { id: { in: requestedFormItemIds } },
                select: questionnaireFormItemAnswerSelect,
              },
              _count: {
                select: {
                  formItems: true,
                  questionnaireScales: true,
                },
              },
            },
          },
        },
      }))

      if (!answerDefinitions) return notFound(res, '测评不存在')

      const formItemsById = new Map(answerDefinitions.questionnaire.formItems.map((item) => [item.id, item]))
      if (answers.some((answer) => !formItemsById.has(answer.formItemId))) {
        return error(res, '表单题目不存在')
      }

      let validationFailure:
        | { kind: 'skip-not-allowed' }
        | { kind: 'invalid-context-answer'; message: string }
        | null = null
      for (const answer of answers) {
        const item = formItemsById.get(answer.formItemId)!
        const action = answer.action || 'answer'
        if (action === 'skip' && (item.required || item.contextKey)) {
          validationFailure = { kind: 'skip-not-allowed' }
          break
        }
        if (action === 'answer') {
          const validationMessage = validateQuestionnaireFormAnswer(item, answer.value)
          if (validationMessage) {
            validationFailure = { kind: 'invalid-context-answer', message: validationMessage }
            break
          }
        }
      }

      const totalItems = answerDefinitions.questionnaire._count.formItems
        + answerDefinitions.questionnaire._count.questionnaireScales

      const result = await withQuestionnaireAnswerTransaction(sessionId, async (tx) => {
        const questionnaireAssessment = await measureRequestPhase('assessment_lookup', () => tx.questionnaireAssessment.findUnique({
          where: { sessionId },
          select: {
            id: true,
            status: true,
            progress: true,
            completedScales: true,
            completedForms: true,
            contextSnapshotEncrypted: true,
            contextSnapshotHash: true,
          },
        }))
        if (!questionnaireAssessment) return { kind: 'not-found' as const }
        if (questionnaireAssessment.status === 'COMPLETED') return { kind: 'completed' as const }
        if (questionnaireAssessment.status !== 'IN_PROGRESS') return { kind: 'closed' as const }

        if (questionnaireAssessment.contextSnapshotEncrypted || questionnaireAssessment.contextSnapshotHash) {
          if (answers.some((answer) => formItemsById.get(answer.formItemId)?.contextKey)) {
            return { kind: 'context-frozen' as const }
          }
        }
        if (validationFailure) return validationFailure

        const existingAnswers = await measureRequestPhase('existing_answer_lookup', () => tx.questionnaireFormAnswer.findMany({
          where: {
            questionnaireAssessmentId: questionnaireAssessment.id,
            formItemId: { in: [...new Set(answers.map((answer) => answer.formItemId))] },
          },
          select: { formItemId: true, status: true, value: true, revision: true },
        }))
        const revisionAnswers = existingAnswers.map((answer) => {
          const item = formItemsById.get(answer.formItemId)
          return {
            ...answer,
            value: answer.value === null
              ? null
              : readContextFormAnswer(item?.contextKey, answer.value),
          }
        })
        const preparedInputs = answers.map((answer) => {
          const item = formItemsById.get(answer.formItemId)!
          const action = answer.action || 'answer'
          const answerStatus = action === 'skip' ? 'SKIPPED' as const : 'ANSWERED' as const
          const normalizedValue = action === 'answer' && answer.value !== undefined
            ? normalizeQuestionnaireFormAnswer(item, answer.value)
            : answer.value
          const value = action === 'skip'
            ? null
            : (Array.isArray(normalizedValue) ? JSON.stringify(normalizedValue) : String(normalizedValue))
          return {
            formItemId: answer.formItemId,
            value,
            status: answerStatus,
            expectedRevision: answer.expectedRevision,
          }
        })
        const prepared = prepareFormAnswerChanges(revisionAnswers, preparedInputs)
        if (prepared.kind === 'stale') return { kind: 'stale-answer' as const }

        // Duplicate item IDs are legal at the wire level for compatibility.
        // OCC preparation processes them in order; persist only the final state
        // for each item so one SQL statement never targets the same unique key
        // twice. The final state still carries every revision increment.
        const finalChangeByItem = new Map(
          prepared.changes.map((change) => [change.input.formItemId, change]),
        )
        const mutationByItem = new Map(
          prepared.changes
            .filter((change) => !change.replay)
            .map((change) => [change.input.formItemId, change]),
        )
        let completedFormsDelta = 0
        for (const [formItemId, change] of finalChangeByItem) {
          const item = formItemsById.get(formItemId)!
          const firstChange = prepared.changes.find((candidate) => candidate.input.formItemId === formItemId)!
          const wasComplete = isFormAnswerComplete(item, firstChange.previous)
          const isComplete = isFormAnswerComplete(item, change.next)
          completedFormsDelta += Number(isComplete) - Number(wasComplete)
        }

        await measureRequestPhase('answer_mutation', () => persistFormAnswerBatch(
          tx,
          questionnaireAssessment.id,
          [...mutationByItem.values()].map((change) => {
            const item = formItemsById.get(change.input.formItemId)!
            return {
              formItemId: change.input.formItemId,
              value: change.next.value === null ? null : writeContextFormAnswer(item.contextKey, change.next.value),
              status: change.next.status === 'SKIPPED' ? 'SKIPPED' as const : 'ANSWERED' as const,
              revision: change.next.revision ?? 1,
            }
          }),
        ))

        const progress = await measureRequestPhase('progress_mutation', () => applyQuestionnaireProgressDelta(
          tx,
          questionnaireAssessment,
          completedFormsDelta,
          totalItems,
        ))
        return {
          kind: 'saved' as const,
          progress,
          acceptedIds: answers.flatMap((answer) => answer.checkpointId ? [answer.checkpointId] : []),
          acceptedSequences: answers.flatMap((answer) => answer.checkpointSequence ? [answer.checkpointSequence] : []),
        }
      })

      if (result.kind === 'not-found') return notFound(res, '测评不存在')
      if (result.kind === 'completed') return error(res, '测评已完成，不能继续修改答案', -1, 409)
      if (result.kind === 'closed') return error(res, '测评已关闭，不能继续修改答案', -1, 409)
      if (result.kind === 'stale-answer') return error(res, '答案已在其他设备更新，请刷新测评后重试', -1, 409)
      if (result.kind === 'skip-not-allowed') return error(res, '必答题或人口学题目不能跳过', -1, 400)
      if (result.kind === 'context-frozen') return error(res, '人口学表单已冻结，不能继续修改答案', -1, 409)
      if (result.kind === 'invalid-context-answer') return error(res, result.message)
      return success(res, {
        saved: answers.length,
        progress: result.progress.progress,
        completedForms: result.progress.completedForms,
        acceptedIds: result.acceptedIds,
        acceptedSequences: result.acceptedSequences,
      }, '答案已保存')
    } catch (err) {
      logger.error('批量提交表单答案错误', err)
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
                include: {
                  scale: {
                    select: {
                      id: true,
                      code: true,
                      name: true,
                      instrumentClass: true,
                      instrumentVersion: true,
                      definition: true,
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
                select: {
                  id: true,
                  code: true,
                  name: true,
                  instrumentClass: true,
                  instrumentVersion: true,
                  definition: true,
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
