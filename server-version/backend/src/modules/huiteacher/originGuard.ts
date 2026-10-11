import type { Request, Response, NextFunction } from 'express'
import { forbidden } from '../../utils/response'

/** Strict browser-origin guard. A shared education account never implies cross-site write authority. */
export function huiteacherOriginGuard(req: Request, res: Response, next: NextFunction) {
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
  const origin = req.get('Origin')
  if (origin) {
    try {
      const url = new URL(origin)
      const canonical = url.protocol === 'https:' && url.host === 'teacher.eduk12.top'
      const development = process.env.NODE_ENV !== 'production'
        && ['teacher.localhost', 'localhost', '127.0.0.1'].includes(url.hostname)
        && ['http:', 'https:'].includes(url.protocol)
      if (!canonical && !development) return forbidden(res, '当前入口不能操作 Huiteacher')
    } catch { return forbidden(res, '当前入口不能操作 Huiteacher') }
  } else if (unsafe && process.env.NODE_ENV === 'production') {
    return forbidden(res, 'Huiteacher 修改请求必须具有合法来源')
  }
  next()
}
