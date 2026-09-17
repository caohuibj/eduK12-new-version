import { Router, type Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { instrumentError, success, unauthorized } from '../../utils/response'
import { RelationalAssessmentError } from './errors'
import { relationalProductService } from './product.service'

const router = Router()

const statusFor = (code: string): number => {
  if (code === 'RELATIONAL_ASSIGNMENT_NOT_FOUND') return 404
  if (code === 'RELATIONAL_ASSIGNMENT_ACTOR' || code === 'RELATIONAL_PRODUCT_ROLE') return 403
  if (code === 'RELATIONAL_PRODUCT_UNAVAILABLE') return 409
  if (code.includes('CONSENT') || code.includes('CONFLICT') || code.includes('BINDING') || code.includes('CONTRACT')) return 409
  return 400
}

const relationalError = (res: Response, error: unknown) => {
  if (error instanceof RelationalAssessmentError) {
    return instrumentError(res, error.code, error.message, statusFor(error.code))
  }
  throw error
}

router.get('/catalog', authenticate, async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res)
    return success(res, { list: relationalProductService.catalog(req.user.role) })
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
