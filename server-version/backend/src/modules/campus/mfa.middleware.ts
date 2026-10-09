import type { Request, Response, NextFunction } from 'express'
import { getSchoolSessionToken } from '../../utils/authCookies'
import { verifyToken } from '../../utils/jwt'
import { forbidden } from '../../utils/response'

// Use only AFTER authenticateSchool; only governance/recovery/disclosure writes
// require a recent second factor. Old password-only sessions never qualify.
export const requireRecentSchoolMfa = (req:Request,res:Response,next:NextFunction) => {
  if(!req.user || req.user.accountDomain!=='SCHOOL')return forbidden(res,'校园身份不合法')
  const token=getSchoolSessionToken(req)
  const claims=token?verifyToken(token):null
  const age=claims?.mfaVerifiedAt ? Date.now()/1000-claims.mfaVerifiedAt : Infinity
  if(claims?.accountDomain!=='SCHOOL' || age<0 || age>5*60) {
    return forbidden(res,'敏感操作需要重新验证动态验证码')
  }
  next()
}
