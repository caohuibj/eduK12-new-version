import { enqueueExportJob } from '../../services/exportJobService'
import { registerAssessmentExport, resolveAssessmentExport } from '../../services/assessmentExportArtifact'
import { Request, Response } from 'express'
import { success, error, unauthorized, notFound, completionBusy, assessmentSubmitBusy, instrumentError } from '../../utils/response'
import { UserRole } from '../../types'
import * as assignmentService from './assignment.service'
import * as catalogService from './catalog.service'
import * as sessionService from './session.service'
import * as trialService from './trial.service'
import * as completionService from './completion.service'
import * as finalSubmitService from './final-submit.service'
import * as historyService from './history.service'
import * as publicCognitiveService from './public.service'
import { CognitiveServiceError } from './cognitive.errors'
import { rejectWrapperForStandaloneUse } from './assignment.access'
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  updateAccessPolicySchema,
  listAssignmentsQuerySchema,
  createSessionSchema,
  restartSessionSchema,
  appendTrialSchema,
  appendTrialsSchema,
  completeSessionSchema,
  cognitiveExportQuerySchema,
  cognitiveExportRequestSchema,
  cognitiveProfessionalReportsQuerySchema,
  cognitivePublicTokenSchema,
  cognitivePublicStartSchema,
  cognitivePublicTrialSchema,
  cognitivePublicTrialsSchema,
  cognitivePublicRecoverySchema,
  finalCognitiveSubmitSchema,
  finalCognitivePublicSubmitSchema,
} from './cognitive.schema'
import { z } from 'zod'
import { getPaginationParams, buildPaginatedResult } from '../../utils/pagination'
import * as path from 'path'
import { isAllowedCognitiveExportFileName } from './export.service'
import { isInstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import {
  isQuestionnaireCompletionAdmissionBusyError,
  isTransientCompletionDatabaseError,
} from '../../services/questionnaireCompletionAdmission'
import { isUnitSubmitAdmissionBusyError } from '../../services/unitSubmitAdmission'
import { projectRelationalUnitFinalResponse } from '../assessment-relational/result-authority'

/**
 * Cognitive 控制器（D3 起逐步扩展；D4 createSession/getSession/restartSession，D5 appendTrial，D6 completeSession）。
 * 模式：controller 只做 参数解析/鉴权调用/响应映射，业务在 service。
 */
export const cognitiveController = {
  async listTests(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const testType = typeof req.query.testType === 'string' ? req.query.testType : undefined
      return success(res, catalogService.listCognitiveTestsCatalog(testType))
    } catch (err) {
      return handleError(res, err)
    }
  },

  async getTest(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const engineVersion = typeof req.query.engineVersion === 'string' ? req.query.engineVersion : undefined
      const scoringVersion = typeof req.query.scoringVersion === 'string' ? req.query.scoringVersion : undefined
      return success(res, catalogService.getCognitiveTestCatalog(req.params.testType, engineVersion, scoringVersion))
    } catch (err) {
      return handleError(res, err)
    }
  },

  async listConfigs(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await assignmentService.listPublishedConfigs(req.user.userId, req.user.role)
      return success(res, { list: data })
    } catch (err) {
      return handleError(res, err)
    }
  },

  async updateAccessPolicy(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = updateAccessPolicySchema.parse(req.body)
      const data = await assignmentService.updateConfigAccessPolicy(
        req.user.userId,
        req.user.role,
        req.params.id,
        input.accessPolicy,
      )
      return success(res, data, '已更新访问策略')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async createAssignment(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = createAssignmentSchema.parse(req.body)
      const data = await assignmentService.createAssignment(req.user.userId, req.user.role, input)
      return success(res, data, '创建成功')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async listAssignments(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const query = listAssignmentsQuerySchema.parse({
        courseId: typeof req.query.courseId === 'string' ? req.query.courseId : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        listedStandalone: typeof req.query.listedStandalone === 'string' ? req.query.listedStandalone : undefined,
      })
      const data = await assignmentService.listTeacherAssignments(req.user.userId, req.user.role, query)
      return success(res, data)
    } catch (err) {
      return handleError(res, err)
    }
  },

  async myAssignments(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await assignmentService.listStudentAssignments(req.user.userId)
      return success(res, data)
    } catch (err) {
      return handleError(res, err)
    }
  },

  async myHistory(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const pagination = getPaginationParams(req)
      const data = await historyService.listMyHistory(req.user.userId, pagination)
      return success(res, buildPaginatedResult(data.list, data.total, pagination))
    } catch (err) {
      return handleError(res, err)
    }
  },

  async getAssignment(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const id = req.params.id
      const data =
        req.user.role === UserRole.STUDENT
          ? await assignmentService.getAssignmentForStudent(req.user.userId, id)
          : await assignmentService.getAssignmentForTeacher(req.user.userId, req.user.role, id)
      return success(res, data)
    } catch (err) {
      return handleError(res, err)
    }
  },

  async updateAssignment(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = updateAssignmentSchema.parse(req.body)
      const data = await assignmentService.updateDraftAssignment(req.user.userId, req.user.role, req.params.id, input)
      return success(res, data, '更新成功')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async publishAssignment(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await assignmentService.publishAssignment(req.user.userId, req.user.role, req.params.id)
      return success(res, data, '发布成功')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async archiveAssignment(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await assignmentService.archiveAssignment(req.user.userId, req.user.role, req.params.id)
      return success(res, data, '归档成功')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async createPublicToken(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = cognitivePublicTokenSchema.parse(req.body)
      const data = await publicCognitiveService.createAccessTokenForAssignment(req.user.userId, req.user.role, req.params.id, input.expiresAt, input.maxUses)
      return success(res, data, '公开链接创建成功')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async listPublicTokens(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await publicCognitiveService.listAccessTokens(req.user.userId, req.user.role, req.params.id)
      return success(res, { list: data, total: data.length })
    } catch (err) {
      return handleError(res, err)
    }
  },

  async revealPublicToken(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await publicCognitiveService.revealAccessToken(req.user.userId, req.user.role, req.params.id, req.params.tokenId)
      res.setHeader('Cache-Control', 'no-store')
      return success(res, data)
    } catch (err) {
      return handleError(res, err)
    }
  },

  async disablePublicToken(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      await publicCognitiveService.disableAccessToken(req.user.userId, req.user.role, req.params.id, req.params.tokenId)
      return success(res, null, '公开链接已停用')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async getPublicAssignment(req: Request, res: Response) {
    try {
      const data = await publicCognitiveService.getPublicAssignmentInfo(req.params.token)
      return success(res, data)
    } catch (err) {
      return handleError(res, err)
    }
  },

  async startPublicSession(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const input = cognitivePublicStartSchema.parse(req.body || {})
      const data = await publicCognitiveService.startPublicSession(req.params.token, input.recoveryToken, input.startIntent)
      return success(res, data, data.recoveryToken ? '匿名测评已开始，请保存恢复凭证' : '已恢复匿名测评')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async getPublicSession(req: Request, res: Response) {
    try {
      const input = cognitivePublicRecoverySchema.parse({ recoveryToken: req.headers['x-recovery-token'] })
      const data = await publicCognitiveService.getSession(req.params.id, input.recoveryToken)
      return success(res, data)
    } catch (err) {
      return handleError(res, err)
    }
  },

  async submitPublicSession(req: Request, res: Response) {
    try {
      const input = finalCognitivePublicSubmitSchema.parse(req.body)
      const data = await publicCognitiveService.submitSessionFinal(
        req.params.id,
        input.recoveryToken,
        {
          submissionId: input.submissionId,
          attemptEpoch: input.attemptEpoch,
          definitionHash: input.definitionHash,
          contextSnapshotHash: input.contextSnapshotHash,
          trials: input.trials,
          ...(input.administrationProvenance ? { administrationProvenance: input.administrationProvenance } : {}),
        },
      )
      return success(res, data, data.replayed ? '匿名认知测评提交已确认' : '匿名认知测评已完成')
    } catch (err) {
      if (isUnitSubmitAdmissionBusyError(err)) return assessmentSubmitBusy(res, err.retryAfterSeconds)
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
      if (isTransientCompletionDatabaseError(err)) return completionBusy(res, 1)
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async restartPublicSession(req: Request, res: Response) {
    try {
      const input = cognitivePublicRecoverySchema.parse(req.body)
      const data = await publicCognitiveService.restartPublicSession(req.params.id, input.recoveryToken)
      return success(res, data, '匿名认知测评已重启，请保存新的恢复凭证')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async appendPublicTrial(req: Request, res: Response) {
    try {
      const input = cognitivePublicTrialSchema.parse(req.body)
      const data = await publicCognitiveService.appendTrial(req.params.id, input.recoveryToken, { trialIndex: input.trialIndex, payload: input.payload })
      return success(res, data, '试次已记录')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async appendPublicTrials(req: Request, res: Response) {
    try {
      const input = cognitivePublicTrialsSchema.parse(req.body)
      const trials = await publicCognitiveService.appendTrials(req.params.id, input.recoveryToken, input.trials)
      return success(res, { saved: trials.length, trials }, '试次已记录')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async completePublicSession(req: Request, res: Response) {
    try {
      const input = cognitivePublicRecoverySchema.parse(req.body)
      const data = await publicCognitiveService.completeSession(req.params.id, input.recoveryToken)
      return success(res, data, '匿名测评已完成')
    } catch (err) {
      return handleError(res, err)
    }
  },

  // Cognitive export
  async collections(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const { listCognitiveCollections } = await import('./collection-data.service')
      return success(res, await listCognitiveCollections({ userId: req.user.userId, role: req.user.role, assignmentId: req.params.id }))
    } catch (err) { return handleError(res, err) }
  },

  async professionalReports(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const query = cognitiveProfessionalReportsQuerySchema.parse(req.query)
      const { listProfessionalReports } = await import('./professional-report.service')
      return success(res, await listProfessionalReports({ userId: req.user.userId, role: req.user.role,
        assignmentId: req.params.id, offset: query.offset,
        collectionId: query.collectionId }))
    } catch (err) {
      return handleError(res, err)
    }
  },

  async getExportPreview(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const query = cognitiveExportQuerySchema.parse(req.query)

      // 复用教师端 Assignment 权限校验，避免导出接口绕过创建者隔离。
      await assignmentService.getAssignmentForTeacher(req.user.userId, req.user.role, req.params.id)

      const { cognitiveExportService } = await import('./export.service')
      const data = await cognitiveExportService.getCognitiveExportData(req.params.id, {
        detail: query.detail,
        anonymize: true, previewLimit: 1,
      })

      return success(res, {
        sampled: true, sampleSize: data.rows.length,
        assignmentId: data.assignmentId,
        assignmentTitle: data.assignmentTitle,
        testType: data.testType,
        detail: data.detail,
        completedCount: data.completedCount,
        trialCount: null,
        fieldsAreSampled: true,
        fieldCount: data.fields.length,
        fields: data.fields,
      })
    } catch (err) {
      return handleError(res, err)
    }
  },

  async exportData(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = cognitiveExportRequestSchema.parse(req.body || {})

      // 复用教师端 Assignment 权限校验，管理员可导出所有任务。
      await assignmentService.getAssignmentForTeacher(req.user.userId, req.user.role, req.params.id)

      const anonymize = req.user.role === UserRole.ADMIN ? input.anonymize : true
      const result = await enqueueExportJob({ resourceType: 'COGNITIVE', resourceId: req.params.id,
        createdBy: req.user.userId, anonymized: anonymize, format: input.format, recordCount: 0,
        requestKey: req.get('X-Export-Request-Key'),
        options: { detail: input.detail, anonymize, dateRange: input.dateRange,
          creatorRole: req.user.role as 'ADMIN' | 'TEACHER', projectionFingerprint: 'cognitive-frozen-export-v1' } })
      return success(res, result, '导出已排队')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async downloadExportFile(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const { id: assignmentId, fileName } = req.params

      // 下载也必须重新执行 Assignment 归属校验，不能只依赖不可预测的文件名。
      const assignment = await assignmentService.getAssignmentForTeacher(req.user.userId, req.user.role, assignmentId)
      rejectWrapperForStandaloneUse(assignment, '请从综合测评导出')

      // 文件名来自服务端生成结果，仍显式拒绝路径穿越和非导出文件名。
      if (
        path.basename(fileName) !== fileName ||
        !fileName.startsWith(`cognitive_${assignmentId.substring(0, 8)}_`) ||
        !isAllowedCognitiveExportFileName(fileName)
      ) {
        return notFound(res, '文件不存在')
      }

      const filePath = await resolveAssessmentExport({
        resourceType: 'COGNITIVE', resourceId: assignmentId, fileName,
        actor: { userId: req.user.userId, role: req.user.role },
        projectionFingerprint: 'cognitive-frozen-export-v1',
      })
      if (!filePath) return notFound(res, '文件不存在')

      return res.download(filePath)
    } catch (err) {
      return handleError(res, err)
    }
  },

  // D4 — Session / Attempt
  async createSession(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = createSessionSchema.parse(req.body)
      const data = await sessionService.createSession(req.user.userId, input.assignmentId)
      return success(res, data, '会话创建成功')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async getSession(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await sessionService.getSession(req.user.userId, req.params.id)
      return success(res, data)
    } catch (err) {
      return handleError(res, err)
    }
  },

  async submitSessionFinal(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = finalCognitiveSubmitSchema.parse(req.body)
      const { data, internalContext } = await finalSubmitService.submitCognitiveSessionFinalWithContext(req.user.userId, {
        sessionId: req.params.id,
        ...input,
      })
      const responseData = await projectRelationalUnitFinalResponse(internalContext.compositeAttemptId, data)
      return success(res, responseData, data.replayed ? '认知测评提交已确认' : '认知测评已完成')
    } catch (err) {
      if (isUnitSubmitAdmissionBusyError(err)) return assessmentSubmitBusy(res, err.retryAfterSeconds)
      if (isQuestionnaireCompletionAdmissionBusyError(err)) return completionBusy(res, err.retryAfterSeconds)
      if (isTransientCompletionDatabaseError(err)) return completionBusy(res, 1)
      if (isInstrumentFinalSubmitError(err)) return instrumentError(res, err.code, err.message, err.statusCode)
      return handleError(res, err)
    }
  },

  async restartSession(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      restartSessionSchema.parse(req.body)
      const data = await sessionService.restartSession(req.user.userId, req.params.id)
      return success(res, data, '重启成功')
    } catch (err) {
      return handleError(res, err)
    }
  },

  // D5 — Append-only Trial
  async appendTrial(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = appendTrialSchema.parse(req.body)
      const data = await trialService.appendTrial(req.user.userId, req.params.id, input)
      return success(res, data, '试次已记录')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async appendTrials(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = appendTrialsSchema.parse(req.body)
      const trials = await trialService.appendTrials(req.user.userId, req.params.id, input.trials)
      return success(res, { saved: trials.length, trials }, '试次已记录')
    } catch (err) {
      return handleError(res, err)
    }
  },

  // D6 — Completion / Scoring
  async completeSession(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      completeSessionSchema.parse(req.body) // strict {}：score/metrics/rawData 一律拒绝
      const data = await completionService.completeSession(req.user.userId, req.params.id)
      return success(res, data, '已完成')
    } catch (err) {
      return handleError(res, err)
    }
  },
}

const handleError = (res: Response, err: unknown): Response => {
  if (err instanceof z.ZodError) {
    return error(res, err.issues.map((i) => i.message).join('; '), -1, 400)
  }
  if (err instanceof CognitiveServiceError) {
    return err.statusCode < 500
      ? error(res, err.message, -1, err.statusCode)
      : error(res, '服务器内部错误', -1, 500)
  }
  // 兼容带 statusCode 的服务错误（如被 mock 的 plain object）
  const maybe = err as { statusCode?: unknown; message?: unknown }
  if (typeof maybe.statusCode === 'number' && maybe.statusCode >= 400 && maybe.statusCode < 500) {
    return error(res, typeof maybe.message === 'string' ? maybe.message : 'Request failed', -1, maybe.statusCode)
  }
  return error(res, '服务器内部错误', -1, 500)
}
