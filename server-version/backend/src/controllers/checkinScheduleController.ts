import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../config/database'
import { createCheckinSchema } from '../utils/checkinSchema'
import { publishDueCheckinSchedule } from '../services/checkinScheduleService'
import { AssetReferenceValidationError, syncAssetReferences, validateAssetReferencesForCourse } from '../services/assetStorage'
import { error, forbidden, success } from '../utils/response'
import { logger } from '../utils/logger'

export const createScheduleSchema = z.object({
  template: createCheckinSchema.omit({ endTime: true }),
  firstPublishAt: z.string().datetime(),
  intervalDays: z.number().int().min(1).max(365),
  durationHours: z.number().int().min(1).max(8760),
  endsAt: z.string().datetime().nullable().optional(),
  timezone: z.string().max(100).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
  }, '时区无效'),
}).strict()

const summary = (row: { id: string; template: Prisma.JsonValue; intervalDays: number; durationHours: number; firstPublishAt: Date; nextPublishAt: Date | null; endsAt: Date | null; timezone: string; active: boolean; publishedCount: number }) => ({
  id: row.id, title: (row.template as { title: string }).title, intervalDays: row.intervalDays,
  durationHours: row.durationHours, firstPublishAt: row.firstPublishAt, nextPublishAt: row.nextPublishAt,
  endsAt: row.endsAt, timezone: row.timezone, active: row.active, publishedCount: row.publishedCount,
})

const guarded = (action: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { return await action(req, res) }
  catch (cause) {
    logger.error('周期打卡管理失败', { errorType: cause instanceof Error ? cause.name : 'unknown' })
    return error(res, '操作未完成，请稍后重试', -1, 500)
  }
}

export const checkinScheduleController = {
  list: guarded(async (req, res) => {
    if (req.user?.role !== 'TEACHER') return forbidden(res, '仅课程创建者可管理周期打卡')
    const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : null
    if (!courseId) return error(res, '请选择课程', -1, 400)
    const course = await prisma.course.findUnique({ where: { id: courseId } })
    if (!course || course.creatorId !== req.user.userId || course.courseType === 'CAMPUS_ACTIVITY') return forbidden(res, '无法管理此课程')
    // Project only metadata in PostgreSQL; never load long content/attachments for a list.
    const list = await prisma.$queryRaw<Array<ReturnType<typeof summary>>>`
      SELECT id, template->>'title' AS title, interval_days AS "intervalDays",
        duration_hours AS "durationHours", first_publish_at AS "firstPublishAt",
        next_publish_at AS "nextPublishAt", ends_at AS "endsAt", timezone, active,
        published_count AS "publishedCount"
      FROM checkin_schedules WHERE course_id = ${courseId} AND creator_id = ${req.user.userId}
      ORDER BY active DESC, created_at DESC, id DESC LIMIT 100`
    return success(res, { list })
  }),

  async create(req: Request, res: Response) {
    if (req.user?.role !== 'TEACHER') return forbidden(res, '仅课程创建者可设置周期打卡')
    const parsed = createScheduleSchema.safeParse(req.body)
    if (!parsed.success) return error(res, parsed.error.errors[0].message, -1, 400)
    const input = parsed.data, now = new Date(), first = new Date(input.firstPublishAt)
    const end = input.endsAt ? new Date(input.endsAt) : null
    if (first.getTime() < now.getTime() - 5 * 60000 || first.getTime() > now.getTime() + 2 * 366 * 86400000 || (end && end < first)) {
      return error(res, '首次发布时间需在当前时间之后，结束日期不能早于首次发布（最多提前两年设置）', -1, 400)
    }
    const { courseId, ...template } = input.template
    const assets = { videos: template.videos || [], images: template.images || [], documents: template.documents || [] }
    try {
      const result = await prisma.$transaction(async tx => {
        // Serialize the per-course active limit with concurrent creations/end-course writes.
        await tx.$queryRaw`SELECT id FROM courses WHERE id = ${courseId} FOR UPDATE`
        const course = await tx.course.findUnique({ where: { id: courseId } })
        if (!course || course.creatorId !== req.user!.userId || course.courseType === 'CAMPUS_ACTIVITY') return null
        if (course.status !== 'PUBLISHED') throw new Error('仅已发布课程可设置周期打卡')
        if (await tx.checkinSchedule.count({ where: { courseId, active: true } }) >= 50) throw new Error('每门课程最多同时运行 50 个周期打卡任务')
        await validateAssetReferencesForCourse({ values: assets, courseId, ownerId: req.user!.userId, db: tx })
        const row = await tx.checkinSchedule.create({ data: {
          courseId, creatorId: req.user!.userId, template: { ...template, ...assets } as Prisma.InputJsonValue,
          intervalDays: input.intervalDays, durationHours: input.durationHours, firstPublishAt: first,
          nextPublishAt: first, endsAt: end, timezone: input.timezone,
        } })
        await syncAssetReferences({ entityType: 'CheckinSchedule', entityId: row.id, values: assets, db: tx })
        // The first occurrence may be due immediately. Same transaction, no partial schedule.
        await publishDueCheckinSchedule(tx, row.id, now)
        return tx.checkinSchedule.findUniqueOrThrow({ where: { id: row.id } })
      })
      return result ? success(res, summary(result), '周期打卡已设置') : forbidden(res, '无法管理此课程')
    } catch (cause) {
      if (cause instanceof AssetReferenceValidationError) return error(res, cause.message, -1, 400)
      if (cause instanceof Error && ['仅已发布课程可设置周期打卡', '每门课程最多同时运行 50 个周期打卡任务'].includes(cause.message)) return error(res, cause.message, -1, 400)
      logger.error('创建周期打卡失败', { errorType: cause instanceof Error ? cause.name : 'unknown' })
      return error(res, '设置未完成，请重试', -1, 500)
    }
  },

  stop: guarded(async (req, res) => {
    if (req.user?.role !== 'TEACHER') return forbidden(res, '仅课程创建者可停止周期打卡')
    const result = await prisma.checkinSchedule.updateMany({
      where: { id: req.params.scheduleId, creatorId: req.user.userId, course: { creatorId: req.user.userId, courseType: { not: 'CAMPUS_ACTIVITY' } } },
      data: { active: false, nextPublishAt: null },
    })
    return result.count ? success(res, null, '已停止后续发布，历史打卡与提交保留') : forbidden(res, '无法管理此周期打卡')
  }),
}
