import { Router, type RequestHandler } from 'express'
import { authenticate } from '../../middleware/auth'
import { success, error, forbidden, notFound } from '../../utils/response'
import { getArchiveService, type ArchiveKind, type ArchiveFilter } from './service'

export const requireArchiveAdmin: RequestHandler = (req, res, next) => {
  if (req.user?.role !== 'ADMIN' || req.user.platformRole !== 'SYSTEM_ADMIN') {
    forbidden(res, '历史归档仅限系统管理员读取')
    return
  }
  next()
}
export function parseArchiveFilter(input: Record<string, unknown>): ArchiveFilter {
  const rawPage = input.page ?? '1'
  if (typeof rawPage !== 'string' || !/^[1-9]\d{0,5}$/.test(rawPage)) throw new Error('Invalid archive page')
  const result: ArchiveFilter = { page: Number(rawPage) }
  for (const key of ['studentId', 'instrumentId', 'status'] as const) {
    const value = input[key]
    if (value === undefined || value === '') continue
    if (typeof value !== 'string' || value.length > 100 || /[\x00-\x1f]/.test(value)) throw new Error('Invalid archive filter')
    result[key] = value
  }
  return result
}
export function createArchiveRouter(service = getArchiveService) {
  const router = Router()
  router.use(authenticate, requireArchiveAdmin)
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  router.get('/overview', async (_req, res) => {
    try { success(res, await service().overview()) }
    catch { error(res, '历史归档暂时不可用', -1, 503) }
  })
  for (const kind of ['assessments', 'questionnaire-assessments'] as ArchiveKind[]) {
    router.get('/' + kind, async (req, res) => {
      let filter: ArchiveFilter
      try { filter = parseArchiveFilter(req.query) }
      catch { error(res, '查询条件无效'); return }
      try { success(res, await service().list(kind, filter)) }
      catch { error(res, '历史归档暂时不可用', -1, 503) }
    })
    router.get('/' + kind + '/:id', async (req, res) => {
      if (req.params.id.length > 100) { error(res, '记录标识无效'); return }
      try {
        const result = await service().detail(kind, req.params.id)
        if (!result) { notFound(res, '历史记录不存在'); return }
        success(res, result)
      } catch { error(res, '历史记录暂时无法读取', -1, 503) }
    })
  }
  return router
}
export default createArchiveRouter()
