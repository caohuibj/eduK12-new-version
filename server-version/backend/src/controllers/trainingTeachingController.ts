import type { Request, Response } from 'express'
import { z } from 'zod'
import { listTrainingTeachingOverview } from '../services/trainingTeachingOverview'
import { success, error } from '../utils/response'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(5),
  includeCourseCounts: z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
}).strict()

export async function trainingTeachingOverview(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const query = querySchema.safeParse(req.query)
  if (!query.success) return error(res, '请检查批阅列表页码', -1, 400)
  try {
    return success(res, await listTrainingTeachingOverview(req.user!.userId, query.data))
  } catch {
    return error(res, '批阅概览暂时无法读取，请重试', -1, 503)
  }
}
