import { assessmentDeliveryCatalog } from './catalog'
import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { success, unauthorized } from '../../utils/response'
import { listRespondentAssessments } from './inbox'

const router = Router()
router.use(authenticate)
router.get('/', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!req.user) return unauthorized(res)
  try { return success(res, await listRespondentAssessments(req.user.userId, req.user.role)) }
  catch (error) { next(error) }
})
router.get('/catalog', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!req.user) return unauthorized(res)
  try { return success(res, { list: await assessmentDeliveryCatalog.listForRespondent(req.user.userId) }) }
  catch (error) { next(error) }
})
export default router
