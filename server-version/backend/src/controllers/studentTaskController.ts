import { Request, Response } from 'express'
import { z } from 'zod'
import { listStudentTasks, taskFilters } from '../services/studentTasks'
import { error, success } from '../utils/response'
import { logger } from '../utils/logger'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  state: z.enum(taskFilters).optional(),
})

export async function studentTaskList(req: Request, res: Response) {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) return error(res, '待办筛选或分页参数无效')
  try {
    return success(res, await listStudentTasks(req.user!.userId, parsed.data))
  } catch (cause) {
    logger.error('学生待办聚合失败', cause)
    return error(res, '待办加载失败，请重试', -1, 500)
  }
}
