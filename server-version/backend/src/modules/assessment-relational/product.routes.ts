import { Router, type Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { instrumentError, success, unauthorized } from '../../utils/response'
import { RelationalAssessmentError } from './errors'
import { relationalProductCatalogService } from './product-catalog.service'
import { relationalProductContextService } from './product-context.service'
import { relationalProductReportService } from './product-report.service'
import { relationalProductService } from './product.service'
import type { RelationalResourceKindV1 } from './types'

const router = Router()

const statusFor = (code: string): number => {
  if (code === 'RELATIONAL_ASSIGNMENT_NOT_FOUND' || code === 'RELATIONAL_COURSE_NOT_FOUND') return 404
  if (
    code === 'RELATIONAL_ASSIGNMENT_ACTOR'
    || code === 'RELATIONAL_PRODUCT_ROLE'
    || code === 'RELATIONAL_COURSE_TEACHER'
    || code === 'RELATIONAL_ANALYSIS_ACCESS'
  ) return 403
  if (code === 'RELATIONAL_PRODUCT_UNAVAILABLE' || code === 'RELATIONAL_REPORT_NOT_READY') return 409
  if (
    code.includes('CONSENT')
    || code.includes('CONFLICT')
    || code.includes('BINDING')
    || code.includes('CONTRACT')
    || code.includes('ROSTER')
    || code.includes('INACTIVE')
  ) return 409
  return 400
}

const relationalError = (res: Response, error: unknown) => {
  if (error instanceof RelationalAssessmentError) {
    return instrumentError(res, error.code, error.message, statusFor(error.code))
  }
  throw error
}

const requiredString = (body: unknown, key: string): string => {
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined
  if (typeof value !== 'string' || !value.trim()) {
    throw new RelationalAssessmentError('RELATIONAL_PRODUCT_REQUEST', `${key} is required`)
  }
  return value.trim()
}

const productRef = (body: unknown): {
  resourceKind: RelationalResourceKindV1
  resourceKey: string
  resourceVersion: string
} => {
  const resourceKind = requiredString(body, 'resourceKind')
  if (!['BUNDLE', 'SCALE', 'FORM', 'SITUATIONAL'].includes(resourceKind)) {
    throw new RelationalAssessmentError('RELATIONAL_PRODUCT_REQUEST', 'unsupported resourceKind')
  }
  return {
    resourceKind: resourceKind as RelationalResourceKindV1,
    resourceKey: requiredString(body, 'resourceKey'),
    resourceVersion: requiredString(body, 'resourceVersion'),
  }
}

router.get('/catalog', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, { list: relationalProductCatalogService.catalog(req.user.role) })
  } catch (error) {
    try { return relationalError(res, error) } catch (unexpected) { return next(unexpected) }
  }
})

router.get('/tasks', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, { list: await relationalProductService.tasks(req.user.userId, req.user.role) })
  } catch (error) {
    try { return relationalError(res, error) } catch (unexpected) { return next(unexpected) }
  }
})

router.get('/context/parent-children', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, {
      list: await relationalProductContextService.parentChildren({
        userId: req.user.userId,
        role: req.user.role,
      }),
    })
  } catch (error) {
    try { return relationalError(res, error) } catch (unexpected) { return next(unexpected) }
  }
})

router.get('/context/courses/:courseId/roster', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, await relationalProductContextService.teacherRoster({
      userId: req.user.userId,
      role: req.user.role,
      courseId: req.params.courseId,
    }))
  } catch (error) {
    try { return relationalError(res, error) } catch (unexpected) { return next(unexpected) }
  }
})

router.get('/context/student-courses', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, {
      list: await relationalProductContextService.studentCourses({
        userId: req.user.userId,
        role: req.user.role,
      }),
    })
  } catch (error) {
    try { return relationalError(res, error) } catch (unexpected) { return next(unexpected) }
  }
})

router.post('/assignments/teacher-parent', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, await relationalProductService.issueTeacherToParent({
      teacherUserId: req.user.userId,
      role: req.user.role,
      courseId: requiredString(req.body, 'courseId'),
      studentUserId: requiredString(req.body, 'studentUserId'),
      parentUserId: requiredString(req.body, 'parentUserId'),
      product: productRef(req.body),
    }))
  } catch (error) {
    try { return relationalError(res, error) } catch (unexpected) { return next(unexpected) }
  }
})

router.post('/assignments/teacher-observer', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, await relationalProductService.issueTeacherObserver({
      teacherUserId: req.user.userId,
      role: req.user.role,
      courseId: requiredString(req.body, 'courseId'),
      studentUserId: requiredString(req.body, 'studentUserId'),
      product: productRef(req.body),
    }))
  } catch (error) {
    try { return relationalError(res, error) } catch (unexpected) { return next(unexpected) }
  }
})

router.post('/assignments/parent-self-serve', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, await relationalProductService.issueParentSelfServe({
      parentUserId: req.user.userId,
      role: req.user.role,
      studentUserId: requiredString(req.body, 'studentUserId'),
      product: productRef(req.body),
    }))
  } catch (error) {
    try { return relationalError(res, error) } catch (unexpected) { return next(unexpected) }
  }
})

router.post('/assignments/student-experience', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, await relationalProductService.issueStudentExperience({
      studentUserId: req.user.userId,
      role: req.user.role,
      courseId: requiredString(req.body, 'courseId'),
      product: productRef(req.body),
    }))
  } catch (error) {
    try { return relationalError(res, error) } catch (unexpected) { return next(unexpected) }
  }
})

router.post('/assignments/:assignmentId/consent/accept', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, await relationalProductService.acceptConsent({
      assignmentId: req.params.assignmentId,
      userId: req.user.userId,
      role: req.user.role,
    }))
  } catch (error) {
    try { return relationalError(res, error) } catch (unexpected) { return next(unexpected) }
  }
})

router.get('/assignments/:assignmentId/report-target', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, await relationalProductReportService.respondentReportTarget({
      assignmentId: req.params.assignmentId,
      userId: req.user.userId,
      role: req.user.role,
    }))
  } catch (error) {
    try { return relationalError(res, error) } catch (unexpected) { return next(unexpected) }
  }
})

router.post('/assignments/:assignmentId/start', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, await relationalProductService.start({
      assignmentId: req.params.assignmentId,
      userId: req.user.userId,
      role: req.user.role,
    }))
  } catch (error) {
    try { return relationalError(res, error) } catch (unexpected) { return next(unexpected) }
  }
})

export default router
