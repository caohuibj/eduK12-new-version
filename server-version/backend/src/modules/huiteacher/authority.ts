import type { Request,Response,NextFunction } from 'express'
import { getHuiteacherSessionToken } from '../../utils/authCookies'
import { verifyToken } from '../../utils/jwt'
import { forbidden } from '../../utils/response'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'

/** Session proof only: callers resolve current product authority in their own
 * transaction. Do not add a second membership query or a five-minute step-up
 * to routine private-tool reads/writes. */
export function requireTeacherAdminSession(req:Request,res:Response,next:NextFunction){
  const token=getHuiteacherSessionToken(req)
  const claims=token?verifyToken(token):null
  if(!req.user||req.user.accountDomain!=='SCHOOL'
    ||claims?.sessionProduct!=='HUITEACHER'||claims.accountDomain!=='SCHOOL'
    ||claims.userId!==req.user.userId||!claims.mfaVerifiedAt
    ||claims.mfaVerifiedAt>Date.now()/1000)
    return forbidden(res,'管理权限需要先完成双因素登录，请重新登录')
  next()
}

/** Read-only Teacher pages still require active enrollment in this product. */
export async function requireTeacherProductMember(req:Request,res:Response,next:NextFunction){
  if(!req.user||req.user.accountDomain!=='SCHOOL')return forbidden(res,'教育账号不可用')
  const organizationId=req.params.organizationId
  if(!organizationId)return forbidden(res,'必须指定学校')
  try{
    const scope=await resolveEducationProductMemberScope({
      actorUserId:req.user.userId,organizationId,product:'HUITEACHER',
    })
    if(!scope)return forbidden(res,'学校尚未授权此账号使用 Huiteacher')
    next()
  }catch(e){next(e)}
}

/** Only current product administrators may mutate Teacher school structure. */
export async function requireTeacherProductAdmin(req:Request,res:Response,next:NextFunction){
  if(!req.user||req.user.accountDomain!=='SCHOOL')return forbidden(res,'教育账号不可用')
  const organizationId=req.params.organizationId
  if(!organizationId)return forbidden(res,'必须指定学校')
  try{
    const scope=await resolveEducationProductMemberScope({
      actorUserId:req.user.userId,organizationId,product:'HUITEACHER',
    })
    if(!scope?.productAdmin)return forbidden(res,'缺少本校 Teacher 管理授权')
    // A product-admin grant may be added after an ordinary session was issued.
    // Routine writes no longer require a fresh 5-minute TOTP, but they must
    // never turn a password-only session into an administrative session.
    return requireTeacherAdminSession(req,res,next)
  }catch(e){next(e)}
}

/** Authenticated Teacher session + current signed, non-replayed MFA event. */
export function requireRecentTeacherMfa(req:Request,res:Response,next:NextFunction){
  if(!req.user||req.user.accountDomain!=='SCHOOL')return forbidden(res,'教育账号不可用')
  const token=getHuiteacherSessionToken(req)
  const claims=token?verifyToken(token):null
  const age=claims?.mfaVerifiedAt?Date.now()/1000-claims.mfaVerifiedAt:Infinity
  if(claims?.accountDomain!=='SCHOOL'||claims.sessionProduct!=='HUITEACHER'
    ||claims.userId!==req.user.userId||age<0||age>300)
    return forbidden(res,'敏感操作需要重新验证动态验证码')
  next()
}
