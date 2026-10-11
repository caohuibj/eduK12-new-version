import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { success, error } from '../../utils/response'
import * as governance from './governance.service'

export const surveyPlatformRouter=Router()
const limiter=createRedisRateLimiter({name:'survey-platform-governance',limit:15,windowSeconds:900,key:req=>req.user?.userId||req.ip||'unknown'})
const password=z.object({currentPassword:z.string().min(1).max(128)}).strict()
const inviteId=z.string().uuid()
const handler=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await fn(req))}
  catch(e){if(e instanceof z.ZodError)return error(res,'输入格式不合法',-1,400)
    if(e instanceof governance.SurveyGovernanceError)return error(res,e.message,-1,e.statusCode)
    next(e)
  }
}
async function administrator(req:Request) {
  const parsed=password.parse(req.body)
  await governance.authorizeAdmin(req.user!.userId,parsed.currentPassword)
}
surveyPlatformRouter.use(authenticate,limiter)
surveyPlatformRouter.get('/researchers',handler(req=>governance.researcherList(req.user!.userId,Math.min(1000,Math.max(1,Number(req.query.page)||1)))))
surveyPlatformRouter.get('/researcher-invitations',handler(req=>
  governance.unclaimedResearcherInvitations(req.user!.userId,
    Math.min(1000,Math.max(1,Number(req.query.page)||1)))))
surveyPlatformRouter.post('/researcher-invitations',handler(async req=>{
  await administrator(req)
  return governance.inviteResearcher(req.user!.userId)
}))
surveyPlatformRouter.post('/researcher-invitations/:id/revoke',handler(async req=>{
  await administrator(req);return governance.revokeInvite(req.user!.userId,inviteId.parse(req.params.id))
}))
surveyPlatformRouter.post('/researchers/:id/suspend',handler(async req=>{
  await administrator(req);return governance.updateResearcherStatus(req.user!.userId,inviteId.parse(req.params.id),'SUSPENDED')
}))
surveyPlatformRouter.post('/researchers/:id/restore',handler(async req=>{
  await administrator(req);return governance.updateResearcherStatus(req.user!.userId,inviteId.parse(req.params.id),'ACTIVE')
}))
surveyPlatformRouter.post('/researchers/:id/mfa-reset',handler(async req=>{
  await administrator(req);return governance.resetResearcherMfa(req.user!.userId,inviteId.parse(req.params.id))
}))
surveyPlatformRouter.post('/researchers/:id/password-reset-invitations',handler(async req=>{
  await administrator(req);return governance.invitePasswordReset(req.user!.userId,inviteId.parse(req.params.id))
}))
