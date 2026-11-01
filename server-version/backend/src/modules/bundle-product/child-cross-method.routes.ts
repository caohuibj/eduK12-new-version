import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth'
import { success, error } from '../../utils/response'
import { childCrossMethodService as service } from './child-cross-method'

const router = Router()
router.use(authenticate)
const route = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await fn(req)) }
  catch (e: any) {
    if (e instanceof z.ZodError) return error(res, '评估请求格式无效', -1, 400)
    if (e.statusCode >= 400 && e.statusCode < 500) return error(res, e.message, -1, e.statusCode)
    if (typeof e.code === 'string' && e.code.startsWith('RELATIONAL_')) return error(res, e.message, -1, e.code.includes('ACTOR') ? 403 : 409)
    return next(e)
  }
}
router.get('/options', route(req => service.options(req.user!)))
router.get('/rounds', route(req => service.rounds(req.user!)))
router.post('/rounds', route(req => service.issue(req.user!, req.body)))
router.get('/tasks', route(req => service.tasks(req.user!)))
router.post('/assignments/:id/consent', route(req => service.accept(req.user!, req.params.id)))
router.post('/assignments/:id/start', route(req => service.start(req.user!, req.params.id)))
router.get('/assignments/:id/report', route(req => service.sourceReport(req.user!, req.params.id)))
router.post('/rounds/:id/report', route(req => service.collect(req.user!, req.params.id, z.object({ requestId: z.string().uuid() }).strict().parse(req.body).requestId)))
router.get('/reports/:id', route(req => service.read(req.user!, req.params.id)))
export default router
