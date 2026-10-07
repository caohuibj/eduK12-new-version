import { Router, type Request, type Response, type NextFunction } from 'express'
import { authenticate, requireTeacher, requireRole } from '../../middleware/auth'
import { UserRole } from '../../types'
import { success, error } from '../../utils/response'
import { z } from 'zod'
import * as service from './service'
const router = Router()
const handle = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { return success(res, await fn(req)) } catch (e: any) {
    if (e instanceof z.ZodError) return error(res, e.issues.map(v => v.message).join('; '), -1, 400)
    if (e.statusCode >= 400 && e.statusCode < 500) return error(res, e.message, -1, e.statusCode)
    return next(e)
  }
}
const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) })
router.get('/available', authenticate, requireRole(UserRole.STUDENT), handle(req => service.available(req.user!.userId)))
router.use(authenticate, requireTeacher)
router.get('/resources', handle(req => service.resources(req.user!)))
router.get('/', handle(req => { const p = pagination.parse(req.query); return service.list(req.user!, p.page, p.pageSize) }))
router.post('/', handle(req => service.create(req.user!, req.body)))
router.get('/:id/reports', handle(req => service.exportReports(req.user!, req.params.id, req.query)))
router.get('/:id', handle(req => service.detail(req.user!, req.params.id)))
router.put('/:id', handle(req => service.update(req.user!, req.params.id, req.body)))
router.post('/:id/items', handle(req => service.addItem(req.user!, req.params.id, req.body)))
router.post('/:id/items/:itemId/remove', handle(req => service.removeItem(req.user!, req.params.id, req.params.itemId, req.body)))
router.post('/:id/form-sections/:sectionId/remove', handle(req => service.removeEmptySection(req.user!, req.params.id, req.params.sectionId, req.body)))
router.post('/:id/reorder', handle(req => service.reorder(req.user!, req.params.id, req.body)))
router.post('/:id/publish', handle(req => service.publish(req.user!, req.params.id, req.body)))
router.post('/:id/preflight', handle(req => service.preflight(req.user!, req.params.id, req.body)))
router.post('/:id/archive', handle(req => service.archive(req.user!, req.params.id, req.body)))
router.post('/:id/remove', handle(req => service.remove(req.user!, req.params.id, req.body).then(() => ({ removed: true }))))
router.post('/:id/copy', handle(req => service.copy(req.user!, req.params.id, req.body)))
export default router
