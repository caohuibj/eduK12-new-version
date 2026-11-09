import { readRespondentRunSummary } from '../reporting/respondentSummary'
import { listParticipantLongitudinal, readParticipantLongitudinal } from '../reporting/participantService'
import { assessmentDeliveryCatalog } from './catalog'
import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth'
import { error, success, unauthorized } from '../../utils/response'
import { listRespondentAssessments } from './inbox'
import { decodeRunTaskCursor, encodeRunTaskCursor } from '../assessment-run/productRead'
import { decodeStudentTaskCursor, encodeStudentTaskCursor } from '../../services/studentTasks'

const router = Router()
router.use(authenticate)
// Exported for the round-trip test: the handler is invoked directly with a
// stubbed req/res, bypassing only the authenticate middleware.
export async function listMyAssessments(req: any, res: any, next: any) {
  res.setHeader('Cache-Control', 'no-store')
  if (!req.user) return unauthorized(res)
  const parsed = z.object({
    runCursor: z.string().max(500).optional(),
    runLimit: z.coerce.number().int().min(1).max(100).optional(),
    courseCursor: z.string().max(500).optional(),
    courseLimit: z.coerce.number().int().min(1).max(100).optional(),
  }).strict().safeParse(req.query)
  if (!parsed.success) return error(res, parsed.error.issues[0].message, -1, 400)
  let runCursor
  let courseCursor
  try { runCursor = decodeRunTaskCursor(parsed.data.runCursor) }
  catch { return error(res, '任务游标无效', -1, 400) }
  try { courseCursor = decodeStudentTaskCursor(parsed.data.courseCursor) }
  catch { return error(res, '任务游标无效', -1, 400) }
  try {
    const data = await listRespondentAssessments(req.user.userId, req.user.role, {
      runCursor, runLimit: parsed.data.runLimit, courseCursor, courseLimit: parsed.data.courseLimit,
    })
    // The wire cursor is an opaque base64url string: the client sends back
    // exactly what the server returned. Never leak the internal cursor
    // object across the HTTP boundary.
    return success(res, {
      ...data,
      nextRunCursor: data.nextRunCursor ? encodeRunTaskCursor(data.nextRunCursor) : null,
      nextCourseCursor: data.nextCourseCursor ? encodeStudentTaskCursor(data.nextCourseCursor) : null,
    })
  }
  catch (error) { next(error) }
}
router.get('/', listMyAssessments)
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
