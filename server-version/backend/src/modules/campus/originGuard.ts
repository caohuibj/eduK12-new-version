import type { Request, Response, NextFunction } from 'express'
import { forbidden } from '../../utils/response'

/** Defense against authenticated writes initiated from another product origin.
 * Cookie isolation alone is not sufficient when multiple subdomains may proxy
 * the same /api hostname. Browser origins are treated as an extra boundary,
 * never as authority for account/organization access.
 */
export function schoolOriginGuard(req:Request,res:Response,next:NextFunction) {
  const origin=req.headers.origin
  const unsafe=!['GET','HEAD','OPTIONS'].includes(req.method)
  const production=process.env.NODE_ENV==='production'
  if(origin) {
    try {
      const url=new URL(origin)
      const allowed=url.protocol==='https:' && url.host==='school.eduk12.top'
      const devAllowed=!production && ['school.localhost','localhost','127.0.0.1'].includes(url.hostname)
      if(!allowed&&!devAllowed)return forbidden(res,'当前入口不允许校园操作')
    } catch {return forbidden(res,'当前入口不允许校园操作')}
  } else if(production && unsafe) {
    // An originless privileged browser POST is not a trusted campus origin.
    return forbidden(res,'校园修改请求需要合法的来源标识')
  }
  next()
}
