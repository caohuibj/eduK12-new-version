import type { Request,Response,NextFunction } from 'express'
import { getHuiteacherSessionToken } from '../../utils/authCookies'
import { verifyToken } from '../../utils/jwt'
import { forbidden } from '../../utils/response'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'

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
    next()
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
