import type { Request, Response, NextFunction } from 'express'
import { forbidden } from '../../utils/response'

/** Origin is a browser-write defense, never a replacement for DB realm and project ACL. */
export function surveyOriginGuard(req: Request, res: Response, next: NextFunction) {
  const unsafe = !['GET','HEAD','OPTIONS'].includes(req.method)
  const origin = req.get('Origin')
  if (origin) {
    try {
      const url = new URL(origin)
      const production = process.env.NODE_ENV === 'production'
      const canonical = url.protocol === 'https:' && url.host === 'survey.eduk12.top'
      const development = !production && ['survey.localhost','localhost','127.0.0.1'].includes(url.hostname)
      if (!canonical && !development) return forbidden(res, '当前来源不能操作 Survey')
    } catch { return forbidden(res, '当前来源不能操作 Survey') }
  } else if (unsafe && process.env.NODE_ENV === 'production') {
    return forbidden(res, 'Survey 修改操作需要合法来源')
  }
  next()
}
