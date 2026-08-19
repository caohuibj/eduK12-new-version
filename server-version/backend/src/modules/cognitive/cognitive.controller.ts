import { Request, Response } from 'express'
import { success, error, unauthorized } from '../../utils/response'
import { UserRole } from '../../types'
import * as assignmentService from './assignment.service'
import * as sessionService from './session.service'
import * as trialService from './trial.service'
import * as completionService from './completion.service'
import { CognitiveServiceError } from './cognitive.errors'
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  listAssignmentsQuerySchema,
  createSessionSchema,
  restartSessionSchema,
  appendTrialSchema,
  completeSessionSchema,
} from './cognitive.schema'
import { z } from 'zod'

/**
 * Cognitive 控制器（D3 起逐步扩展；D4 createSession/getSession/restartSession，D5 appendTrial，D6 completeSession）。
 * 模式：controller 只做 参数解析/鉴权调用/响应映射，业务在 service。
 */
export const cognitiveController = {
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
      const query = listAssignmentsQuerySchema.parse(req.query)
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
    return error(res, err.message, -1, err.statusCode)
  }
  // 兼容带 statusCode 的服务错误（如被 mock 的 plain object）
  const maybe = err as { statusCode?: unknown; message?: unknown }
  if (typeof maybe.statusCode === 'number') {
    return error(res, typeof maybe.message === 'string' ? maybe.message : 'Request failed', -1, maybe.statusCode)
  }
  return error(res, err instanceof Error ? err.message : 'Internal server error', -1, 500)
}
