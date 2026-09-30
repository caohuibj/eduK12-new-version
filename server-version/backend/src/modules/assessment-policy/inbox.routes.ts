import { readRespondentRunSummary } from '../reporting/respondentSummary'
import { listParticipantLongitudinal, readParticipantLongitudinal } from '../reporting/participantService'
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
router.get('/longitudinal', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!req.user) return unauthorized(res)
  try { return success(res, await listParticipantLongitudinal(req.user.userId)) } catch (err) { next(err) }
})
router.get('/longitudinal/:artifactId', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!req.user) return unauthorized(res)
  try { return success(res, await readParticipantLongitudinal(req.user.userId, req.params.artifactId)) } catch (err) { next(err) }
})
router.get('/results/:executionId', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!req.user) return unauthorized(res)
  try { return success(res, await readRespondentRunSummary(req.user.userId, req.params.executionId)) } catch (err) { next(err) }
})
export default router
