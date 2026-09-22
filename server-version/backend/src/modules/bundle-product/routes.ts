import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { authenticate, requireTeacher } from '../../middleware/auth'
import { success, error } from '../../utils/response'
import { bundleProductService, bundleDefinitionProvider } from './service'
import * as analysis from './analysis'
const router = Router()
const handle = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await fn(req)) } catch (e: any) {
    if (e instanceof z.ZodError) return error(res, e.issues.map(v => v.message).join('; '), -1, 400)
    if (e.statusCode >= 400 && e.statusCode < 500) return error(res, e.message, -1, e.statusCode)
    return next(e)
  }
}
router.use(authenticate, requireTeacher)
router.get('/catalog', handle(req => bundleProductService.catalog(req.user!)))
router.get('/', handle(req => bundleProductService.list(req.user!)))
router.post('/', handle(req => bundleProductService.create(req.user!, req.body)))
router.get('/attempts/:attemptId/history', handle(req => analysis.history(req.user!, req.params.attemptId)))
router.get('/attempts/:attemptId/report', handle(async req => {
  await analysis.authorizeStaff(req.user!, req.params.attemptId)
  const query = z.object({ analysisId: z.string().uuid().optional() }).strict().parse(req.query)
  return analysis.readReport(req.params.attemptId, req.user!.role === 'ADMIN' ? 'admin' : 'teacher', query.analysisId)
}))
router.post('/attempts/:attemptId/reanalyze', handle(req => analysis.reanalyze(req.user!, req.params.attemptId, req.body,
  bundleDefinitionProvider, bundleProductService.eligible)))
router.post('/attempts/:attemptId/retry', handle(async req => {
  await analysis.authorizeStaff(req.user!, req.params.attemptId)
  const { analysisId } = z.object({ analysisId: z.string().uuid() }).strict().parse(req.body)
  const previous = await analysis.readReport(req.params.attemptId, req.user!.role === 'ADMIN' ? 'admin' : 'teacher', analysisId)
  await analysis.processAnalysis(previous.analysisId)
  return analysis.readReport(req.params.attemptId, req.user!.role === 'ADMIN' ? 'admin' : 'teacher', analysisId)
}))
router.get('/:id', handle(req => bundleProductService.detail(req.user!, req.params.id)))
router.post('/:id/publish', handle(req => bundleProductService.publish(req.user!, req.params.id,
  z.object({ revision: z.number().int().nonnegative() }).strict().parse(req.body).revision)))
router.post('/:id/archive', handle(req => bundleProductService.archive(req.user!, req.params.id,
  z.object({ revision: z.number().int().nonnegative() }).strict().parse(req.body).revision)))
export default router
