import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import { syncAssetReferences, validateAssetReferencesForCourse } from './assetStorage'
import { dueCheckinSlot } from './checkinScheduleTiming'
import { logger } from '../utils/logger'

export type CheckinTemplate = {
  title: string; description?: string; content?: string; tags?: string[]; allowViewOthers?: boolean
  videos?: Prisma.InputJsonValue; images?: Prisma.InputJsonValue; documents?: Prisma.InputJsonValue
}

/** Row lock + occurrence unique key make retries and multiple API processes safe. */
export async function publishDueCheckinSchedule(tx: Prisma.TransactionClient, id: string, now: Date) {
  // Lock the parent before its child, matching course deletion/cascade order.
  // The initial lookup is only a locator; all mutable state is read again below.
  const target = await tx.checkinSchedule.findUnique({ where: { id }, select: { courseId: true, creatorId: true } })
  if (!target) return null
  await tx.$queryRaw`SELECT id FROM courses WHERE id = ${target.courseId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM checkin_schedules WHERE id = ${id} FOR UPDATE`
  // A completed account revocation must be visible before publishing. Keep the
  // eligibility row stable through the occurrence/reference/cursor commit.
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${target.creatorId} FOR SHARE`
  const schedule = await tx.checkinSchedule.findUnique({ where: { id }, include: { creator: { select: {
    id: true, role: true, accountDomain: true, isActive: true, isFrozen: true, teacherApproved: true, expiresAt: true,
  } } } })
  if (!schedule?.active || !schedule.nextPublishAt || schedule.nextPublishAt > now) return null
  const course = await tx.course.findUnique({ where: { id: schedule.courseId }, select: { id: true, creatorId: true, status: true, courseType: true } })
  const owner = schedule.creator
  if (!course || course.status !== 'PUBLISHED' || course.courseType === 'CAMPUS_ACTIVITY'
    || course.creatorId !== owner.id || !owner.isActive || owner.isFrozen || !owner.teacherApproved
    || owner.role !== 'TEACHER' || !['TRAINING', 'LEGACY'].includes(owner.accountDomain) || (owner.expiresAt && owner.expiresAt <= now)) {
    await tx.checkinSchedule.update({ where: { id }, data: { active: false, nextPublishAt: null } })
    return null
  }
  const slot = dueCheckinSlot(schedule.firstPublishAt, schedule.nextPublishAt, schedule.intervalDays, schedule.durationHours, schedule.endsAt, now)
  if (!slot) return null
  let created = null
  if (slot.publishAt) {
    const template = schedule.template as CheckinTemplate
    const assets = { videos: template.videos || [], images: template.images || [], documents: template.documents || [] }
    await validateAssetReferencesForCourse({ values: assets, courseId: course.id, ownerId: owner.id, db: tx })
    created = await tx.checkin.create({ data: {
      courseId: course.id, creatorId: owner.id, title: template.title, description: template.description,
      content: template.content, ...assets, tags: template.tags || [], allowViewOthers: template.allowViewOthers || false,
      endTime: new Date(slot.publishAt.getTime() + schedule.durationHours * 3600000),
      scheduleId: id, scheduledFor: slot.publishAt,
    } })
    await syncAssetReferences({ entityType: 'Checkin', entityId: created.id, values: assets, db: tx })
  }
  await tx.checkinSchedule.update({ where: { id }, data: {
    nextPublishAt: slot.nextPublishAt, active: Boolean(slot.nextPublishAt),
    publishedCount: { increment: created ? 1 : 0 },
  } })
  return created
}

let running = false
let dueCursor: { at: Date; id: string } | null = null
export async function runDueCheckinSchedules(now = new Date()) {
  if (running) return
  running = true
  try {
    const readBatch = () => prisma.checkinSchedule.findMany({
      where: { active: true, nextPublishAt: { lte: now }, ...(dueCursor ? { OR: [
        { nextPublishAt: { gt: dueCursor.at } }, { nextPublishAt: dueCursor.at, id: { gt: dueCursor.id } },
      ] } : {}) },
      select: { id: true, nextPublishAt: true }, orderBy: [{ nextPublishAt: 'asc' }, { id: 'asc' }], take: 50,
    })
    let rows = await readBatch()
    if (!rows.length && dueCursor) { dueCursor = null; rows = await readBatch() }
    // Move past failed rows as well, so a broken attachment cannot starve other courses.
    const last = rows[rows.length - 1]
    if (last?.nextPublishAt) dueCursor = { at: last.nextPublishAt, id: last.id }
    for (const row of rows) {
      try { await prisma.$transaction(tx => publishDueCheckinSchedule(tx, row.id, now)) }
      catch (cause) { logger.warn('周期打卡发布暂未完成，将在下次调度重试', { scheduleId: row.id, errorType: cause instanceof Error ? cause.name : 'unknown' }) }
    }
  } finally { running = false }
}

export function startCheckinScheduleScheduler() {
  const tick = () => { void runDueCheckinSchedules().catch(cause => logger.warn('周期打卡调度失败', { errorType: cause instanceof Error ? cause.name : 'unknown' })) }
  tick()
  const timer = setInterval(tick, 60_000)
  timer.unref()
  return () => clearInterval(timer)
}
