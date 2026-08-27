import { Request, Response } from 'express'
import { MaterialResourceType } from '@prisma/client'
import { z } from 'zod'
import { success, error, unauthorized } from '../utils/response'
import {
  MaterialGrantError,
  batchCreateGrants,
  createGrant,
  deleteGrant,
  listGrants,
  setGrants,
} from '../services/materialGrant'

const resourceTypeSchema = z.nativeEnum(MaterialResourceType)

const createSchema = z.object({
  teacherId: z.string().min(1),
  resourceType: resourceTypeSchema,
  resourceId: z.string().min(1),
}).strict()

const batchSchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: z.string().min(1),
  teacherIds: z.array(z.string().min(1)).min(1),
}).strict()

const setSchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: z.string().min(1),
  teacherIds: z.array(z.string().min(1)),
}).strict()

const handleError = (res: Response, err: unknown) => {
  if (err instanceof z.ZodError) {
    return error(res, err.issues.map((issue) => issue.message).join('; '), -1, 400)
  }
  if (err instanceof MaterialGrantError) {
    return err.statusCode < 500
      ? error(res, err.message, -1, err.statusCode)
      : error(res, '服务器内部错误', -1, 500)
  }
  return error(res, '服务器内部错误', -1, 500)
}

export const materialGrantController = {
  async list(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const resourceType = typeof req.query.resourceType === 'string'
        ? resourceTypeSchema.parse(req.query.resourceType)
        : undefined
      const resourceId = typeof req.query.resourceId === 'string' ? req.query.resourceId : undefined
      const teacherId = typeof req.query.teacherId === 'string' ? req.query.teacherId : undefined
      const list = await listGrants({ resourceType, resourceId, teacherId })
      return success(res, { list })
    } catch (err) {
      return handleError(res, err)
    }
  },

  async create(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = createSchema.parse(req.body)
      const data = await createGrant({ ...input, grantedBy: req.user.userId })
      return success(res, data, '已授权')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async batch(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = batchSchema.parse(req.body)
      const list = await batchCreateGrants({ ...input, grantedBy: req.user.userId })
      return success(res, { list }, '已批量授权')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async set(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const input = setSchema.parse(req.body)
      const list = await setGrants({ ...input, grantedBy: req.user.userId })
      return success(res, { list }, '已保存授权')
    } catch (err) {
      return handleError(res, err)
    }
  },

  async remove(req: Request, res: Response) {
    try {
      if (!req.user) return unauthorized(res)
      const data = await deleteGrant(req.params.id)
      return success(res, data, '已撤销授权')
    } catch (err) {
      return handleError(res, err)
    }
  },
}
