import type { Request, Response } from 'express'
import { prisma } from '../../config/database'
import { success, error, forbidden } from '../../utils/response'
import { parseCatalogFilters, metadataWhere } from './filters'

/** Explicit teacher summary view. Legacy/student DTOs keep their existing contract. */
export async function managementTaskList(req: Request, res: Response, kind: 'assignment' | 'checkin') {
  if (!req.user || !['TEACHER','ADMIN'].includes(req.user.role)) return forbidden(res, '无权管理课程内容')
  const parsed = (() => { try { return parseCatalogFilters(req.query) } catch { return null } })()
  if (!parsed || (req.query.courseId !== undefined && typeof req.query.courseId !== 'string')) return error(res, '筛选条件无效；每页最多 50 条，最多 500 页，请缩小时间范围', -1, 400)
  const where = {
    ...metadataWhere(parsed, 'title', kind === 'assignment' ? 'deadline' : 'endTime'),
    ...(req.query.courseId ? { courseId: req.query.courseId as string } : {}),
    course: { courseType: { not: 'CAMPUS_ACTIVITY' as const }, ...(req.user.role === 'TEACHER' ? { creatorId: req.user.userId } : {}) },
  }
  const common = { id: true, title: true, courseId: true, tags: true, createdAt: true,
    course: { select: { id: true, title: true, creatorId: true } }, _count: { select: { submissions: true } } } as const
  const [list,total] = kind === 'assignment'
    ? await Promise.all([prisma.assignment.findMany({ where, select: { ...common, deadline: true, status: true }, orderBy: [{createdAt:'desc'},{id:'desc'}], skip: (parsed.page-1)*parsed.pageSize, take: parsed.pageSize }), prisma.assignment.count({where})])
    : await Promise.all([prisma.checkin.findMany({ where, select: { ...common, endTime: true, allowAnonymous: true, scheduleId: true, scheduledFor: true }, orderBy: [{createdAt:'desc'},{id:'desc'}], skip: (parsed.page-1)*parsed.pageSize, take: parsed.pageSize }), prisma.checkin.count({where})])
  return success(res, { list: list.map(row => ({...row, summary:true})), total, page: parsed.page, pageSize: parsed.pageSize })
}
