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
      prisma.course.findUnique({ where: { courseCode: code }, select: {
        id: true, title: true, status: true, endedAt: true, isRecruiting: true, isLibrary: true,
      } }),
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
