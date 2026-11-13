import type { RequestHandler } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { authController } from '../../controllers/authController'
import { registrationRateLimit } from '../../middleware/registrationAdmission'
import { isCourseJoinable } from '../../utils/courseEnrollment'
import { error, success } from '../../utils/response'

export const trainingLogin: RequestHandler = (req, res) => {
  res.locals.trainingEntrance = true
  return authController.login(req, res)
}

// Reuse both existing resource budgets, including their aliases. Restore the
// original strict request before discovery; no code is consumed by this step.
export const trainingCodeRateLimit: RequestHandler = async (req, res, next) => {
  const original = req.body
  req.body = { ...original, courseCode: original?.code, teacherCode: original?.code }
  try {
    await registrationRateLimit(req, res, err => {
      req.body = original
      next(err)
    })
  } finally {
    req.body = original
  }
}

interface CachedCourse {
  data: {
    id: string
    title: string
    status: any
    endedAt: Date | null
    isRecruiting: boolean
    isLibrary: boolean
  } | null
  expiresAt: number
}

const courseCache = new Map<string, CachedCourse>()
const inFlightCourseQueries = new Map<string, Promise<CachedCourse['data']>>()
let courseCacheGeneration = 0

export const getCourseLookupCacheSize = (): number => courseCache.size

export const invalidateCourseLookupCache = (courseCode?: string): void => {
  courseCacheGeneration++
  if (courseCode) {
    courseCache.delete(courseCode)
    inFlightCourseQueries.delete(courseCode)
  } else {
    courseCache.clear()
    inFlightCourseQueries.clear()
  }
}

const getCourseCacheTtlMs = (): number => {
  const envVal = process.env.TRAINING_COURSE_CACHE_TTL_MS
  if (envVal !== undefined) {
    const parsed = Number(envVal)
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 30_000
  }
  return process.env.NODE_ENV === 'test' ? 0 : 30_000
}

export const findCachedCourse = async (code: string) => {
  const ttl = getCourseCacheTtlMs()
  const now = Date.now()

  if (ttl > 0) {
    const cached = courseCache.get(code)
    if (cached) {
      if (now < cached.expiresAt) return cached.data
      courseCache.delete(code)
    }
  }

  // Use the exact persisted code as the key; this lookup is case sensitive.
  // Coalesce cold-start requests but never retain a failed query or a null result.
  if (ttl > 0) {
    const pending = inFlightCourseQueries.get(code)
    if (pending) return pending
  }
  const generation = courseCacheGeneration
  const query = async (): Promise<CachedCourse['data']> => {
    const course = await prisma.course.findUnique({
      where: { courseCode: code },
      select: {
        id: true,
        title: true,
        status: true,
        endedAt: true,
        isRecruiting: true,
        isLibrary: true,
      },
    })
    if (ttl > 0 && course && generation === courseCacheGeneration) {
      if (courseCache.size >= 1000) {
        const oldest = courseCache.keys().next().value
        if (oldest) courseCache.delete(oldest)
      }
      courseCache.set(code, { data: course, expiresAt: Date.now() + ttl })
    }
    return course
  }
  // Bound untrusted distinct-code concurrency; overflow performs the original read.
  if (ttl === 0 || inFlightCourseQueries.size >= 1000) return query()
  const pending = query()
  inFlightCourseQueries.set(code, pending)
  try {
    return await pending
  } finally {
    if (inFlightCourseQueries.get(code) === pending) inFlightCourseQueries.delete(code)
  }
}

const codeSchema = z.object({ code: z.string().trim().min(1).max(128) }).strict()
export const resolveTrainingCode: RequestHandler = async (req, res, next) => {
  const parsed = codeSchema.safeParse(req.body)
  const unavailable = () => error(res, '注册码暂不可用，请核实或联系提供者', -1, 404)
  if (!parsed.success) return unavailable()
  const code = parsed.data.code
  try {
    // Old course codes remain exact lookup keys. Teacher codes use their
    // original uppercase normalization. Never infer a role from length/prefix.
    const [course, teacher] = await Promise.all([
      findCachedCourse(code),
      prisma.teacherCode.findUnique({ where: { code: code.toUpperCase() }, select: {
        isActive: true, expiresAt: true, usedCount: true, maxUses: true,
      } }),
    ])
    // A collision never silently selects the privileged registration path.
    if (course && teacher) return unavailable()
    if (course && isCourseJoinable(course)) return success(res, {
      kind: 'STUDENT', code, course: { courseId: course.id, courseName: course.title },
    })
    if (teacher && teacher.isActive && (!teacher.expiresAt || teacher.expiresAt > new Date())
      && teacher.usedCount < teacher.maxUses) return success(res, { kind: 'TEACHER', code: code.toUpperCase() })
    return unavailable()
  } catch (err) { return next(err) }
}
