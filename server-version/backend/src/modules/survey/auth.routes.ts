import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { comparePassword, hashPassword, isValidPassword, PASSWORD_MAX_LENGTH } from '../../utils/password'
import { success, unauthorized, forbidden } from '../../utils/response'
import { authenticateSurvey } from '../../middleware/auth'
import { issueSurveyCsrfToken, clearSurveySessionCookie, setSurveySessionCookie } from '../../utils/authCookies'
import {
  loginRateLimit, withLoginAccountFailureThrottle, withLoginPasswordVerification,
  recordLoginFailure, clearLoginFailures,
} from '../../middleware/loginRateLimit'
import { passwordChangeRateLimit, withPasswordChangeAdmission } from '../../middleware/passwordChangeAdmission'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { generateToken } from '../../utils/jwt'
import { isActiveResearcher } from './authority'
import {
  beginSurveyMfaChallenge, getPendingChallenge, startSurveyMfaEnrollment,
  finishSurveyMfa, verifySurveyTotpStepUp,
} from './mfa.service'

import { redeemResearcherInvite, redeemPasswordReset, SurveyGovernanceError } from './governance.service'

export const surveyAuthRouter=Router()
surveyAuthRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const loginInput=z.object({
  username:z.string().trim().min(4).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password:z.string().min(1).max(PASSWORD_MAX_LENGTH),
}).strict()
const otpInput=z.object({code:z.string().min(6).max(80)}).strict()
const changeInput=z.object({
  oldPassword:z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword:z.string().min(8).max(PASSWORD_MAX_LENGTH).refine(isValidPassword),
  code:z.string().regex(/^[0-9]{6}$/),
}).strict()
const DUMMY_HASH='$2a$10$fuhNGsB2Z5/iwZtxlw1usOIb5sbX2OzkV/cccQJRbkSpHu2ZPql.a'
const mfaLimiter=createRedisRateLimiter({name:'survey-mfa-challenge',limit:20,windowSeconds:900})
const unavailable=(res:Response)=>res.status(503).json({code:-1,message:'Survey 身份服务暂不可用',data:null})
async function failedLogin(req:Request,res:Response) {
  const budget=await recordLoginFailure(req)
  if(!budget)return unavailable(res)
  if(!budget.accountIpAllowed||!budget.accountGlobalAllowed){
    res.setHeader('Retry-After',String(budget.retryAfterSeconds))
    return res.status(429).json({code:-1,message:'用户名或密码错误',data:null})
  }
  return unauthorized(res,'用户名或密码错误')
}

surveyAuthRouter.get('/csrf',(req,res)=>success(res,{csrfToken:issueSurveyCsrfToken(req,res)}))
surveyAuthRouter.post('/login',loginRateLimit,withLoginAccountFailureThrottle(async(req,res)=>{
  try{
    const parsed=loginInput.safeParse(req.body)
    if(!parsed.success)return failedLogin(req,res)
    const name=parsed.data.username.toLowerCase()
    const principal=await withLoginPasswordVerification(async()=>{
      const account=await prisma.surveyAccount.findUnique({where:{normalizedLogin:name}})
      const user=account?await prisma.user.findUnique({where:{id:account.userId}}):null
      const grant=user?await prisma.surveyResearcherGrant.findUnique({where:{userId:user.id}}):null
      const usable=!!user && user.accountDomain==='SURVEY' && user.isActive && !user.isFrozen
        && (!user.expiresAt||user.expiresAt>new Date())
        && (grant?.status==='PENDING_MFA'||grant?.status==='ACTIVE')
      const match=await comparePassword(parsed.data.password,usable?user!.passwordHash:DUMMY_HASH)
      return usable&&match?user:null
    })
    if(!principal)return failedLogin(req,res)
    const state=await beginSurveyMfaChallenge(req,res,principal.id,principal.tokenVersion)
    await clearLoginFailures(req)
    return success(res,state,'请输入动态验证码')
  }catch{return unavailable(res)}
}))
for(const [route,kind] of [['setup','SETUP'],['confirm','ENROLL'],['verify','VERIFY'],['recovery','RECOVERY']] as const){
  surveyAuthRouter.post('/mfa/'+route,mfaLimiter,async(req,res)=>{
    try{
      const raw=getPendingChallenge(req)
      if(!raw)return unauthorized(res,'二次验证已失效')
      if(kind==='SETUP'){
        const result=await startSurveyMfaEnrollment(raw)
        return result?success(res,result):unauthorized(res,'无法绑定验证器')
      }
      const parsed=otpInput.safeParse(req.body)
      if(!parsed.success)return unauthorized(res,'验证码格式无效')
      const result=await finishSurveyMfa(req,res,raw,parsed.data.code,kind)
      return result?success(res,result):unauthorized(res,'验证码无效或已使用')
    }catch{return unavailable(res)}
  })
}
surveyAuthRouter.get('/me',authenticateSurvey,async(req,res)=>{
  const account=await prisma.surveyAccount.findUnique({where:{userId:req.user!.userId}})
  return account?success(res,{id:account.userId,username:account.loginName,accountDomain:'SURVEY',role:'RESEARCHER'}):unauthorized(res)
})
surveyAuthRouter.post('/logout',authenticateSurvey,(req,res)=>{
  clearSurveySessionCookie(req,res)
  return success(res,null,'退出成功')
})
surveyAuthRouter.post('/mfa/step-up',authenticateSurvey,mfaLimiter,async(req,res)=>{
  try{
    const parsed=otpInput.safeParse(req.body)
    if(!parsed.success||!await verifySurveyTotpStepUp(req.user!.userId,parsed.data.code))return unauthorized(res,'验证码错误或已使用')
    const u=await prisma.user.findUnique({where:{id:req.user!.userId}})
    if(!u||!await isActiveResearcher(u.id))return forbidden(res)
    setSurveySessionCookie(req,res,generateToken({
      userId:u.id,username:u.username,role:u.role,accountDomain:'SURVEY',
      tokenVersion:u.tokenVersion,mustChangePassword:u.mustChangePassword,
      mfaVerifiedAt:Math.floor(Date.now()/1000),
    }))
    return success(res,{stepUp:true},'已完成二次验证')
  }catch{return unavailable(res)}
})
surveyAuthRouter.post('/change-password',authenticateSurvey,passwordChangeRateLimit,withPasswordChangeAdmission(async(req,res)=>{
  try{
    const parsed=changeInput.safeParse(req.body)
    if(!parsed.success||parsed.data.oldPassword===parsed.data.newPassword)return forbidden(res,'新密码格式不合法')
    if(!await verifySurveyTotpStepUp(req.user!.userId,parsed.data.code))return unauthorized(res,'动态验证码错误或已使用')
    const u=await prisma.user.findUnique({where:{id:req.user!.userId}})
    if(!u||!await comparePassword(parsed.data.oldPassword,u.passwordHash))return unauthorized(res,'旧密码错误')
    const passwordHash=await hashPassword(parsed.data.newPassword)
    const changed=await prisma.user.updateMany({
      where:{id:u.id,accountDomain:'SURVEY',tokenVersion:u.tokenVersion},
      data:{passwordHash,tokenVersion:{increment:1},mustChangePassword:false},
    })
    if(changed.count!==1)return unauthorized(res,'请重新登录')
    clearSurveySessionCookie(req,res)
    return success(res,{changed:true},'密码已修改，请重新登录')
  }catch{return unavailable(res)}
}))

const claimInput=z.object({
  token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  username:z.string().trim().min(4).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password:z.string().min(8).max(PASSWORD_MAX_LENGTH).refine(isValidPassword),
}).strict()
const resetInput=z.object({
  token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password:z.string().min(8).max(PASSWORD_MAX_LENGTH).refine(isValidPassword),
}).strict()
const claimLimit=createRedisRateLimiter({name:'survey-invitation-claim',limit:12,windowSeconds:900})
surveyAuthRouter.post('/claim',claimLimit,async(req,res)=>{
  const parsed=claimInput.safeParse(req.body)
  if(!parsed.success)return forbidden(res,'邀请不可用或输入不合法')
  try{return success(res,await redeemResearcherInvite(req,res,parsed.data.token,parsed.data.username,parsed.data.password))}
  catch(e){if(e instanceof SurveyGovernanceError)return forbidden(res,'邀请已失效')
    if((e as {code?:string}).code==='P2002')return forbidden(res,'此登录名不可用')
    return unavailable(res)
  }
})
surveyAuthRouter.post('/reset-password',claimLimit,async(req,res)=>{
  const parsed=resetInput.safeParse(req.body)
  if(!parsed.success)return forbidden(res,'恢复邀请不可用')
  try{return success(res,await redeemPasswordReset(req,res,parsed.data.token,parsed.data.password))}
  catch(e){if(e instanceof SurveyGovernanceError)return forbidden(res,'恢复邀请已失效')
    return unavailable(res)
  }
})
