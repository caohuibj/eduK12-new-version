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

/** Legacy SYSTEM_ADMIN console lives on the Training origin, not on Survey.
 * Keep this distinct from the SURVEY Researcher/public-origin policy.
 * CSRF, legacy cookie authentication and fresh admin password remain required.
 */
export function platformSurveyOriginGuard(req: Request,res: Response,next: NextFunction){
  const origin=req.get('Origin')
  const unsafe=!['GET','HEAD','OPTIONS'].includes(req.method)
  if(!origin){
    if(unsafe&&process.env.NODE_ENV==='production')
      return forbidden(res,'管理员操作需要可信的浏览器来源')
    return next()
  }
  try{
    const url=new URL(origin)
    const development=process.env.NODE_ENV!=='production'
      && ['localhost','127.0.0.1'].includes(url.hostname)
      && ['http:','https:'].includes(url.protocol)
    if(url.origin!=='https://training.eduk12.top'&&!development)
      return forbidden(res,'当前来源不能操作 Survey 管理')
  }catch{return forbidden(res,'当前来源不能操作 Survey 管理')}
  next()
}
