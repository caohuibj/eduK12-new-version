import * as catalog from './catalog.service'
import {CatalogSourceError} from './catalog.sources'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth'
import { requireRecentAdminKey } from '../admin-permissions/guards'
import { success, error } from '../../utils/response'
import * as governance from './governance.service'

import {requireSurveyManager} from './admin-role'
export const surveyPlatformRouter=Router()
const password=z.object({currentPassword:z.string().min(1).max(128)}).strict()
const inviteId=z.string().guid()
const handler=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await fn(req))}
  catch(e){if(e instanceof z.ZodError)return error(res,'输入格式不合法',-1,400)
    if(e instanceof CatalogSourceError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof governance.SurveyGovernanceError){
      if(e.retryAfterSeconds)res.setHeader('Retry-After',String(e.retryAfterSeconds))
      return error(res,e.message,-1,e.statusCode)
    }
    next(e)
  }
}
async function administrator(req:Request) {
  const parsed=password.parse(req.body)
  await governance.authorizeAdmin(req.user!.userId,parsed.currentPassword)
}
surveyPlatformRouter.use(authenticate, requireSurveyManager)
surveyPlatformRouter.use((req,res,next)=>['GET','HEAD','OPTIONS'].includes(req.method)?next():requireRecentAdminKey(req,res,next))
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
surveyPlatformRouter.post('/researchers/:id/revoke',handler(async req=>{
  await administrator(req)
  return governance.revokeResearcherPermanently(req.user!.userId,inviteId.parse(req.params.id))
}))
surveyPlatformRouter.post('/researchers/:id/mfa-reset',handler(async req=>{
  await administrator(req);return governance.resetResearcherMfa(req.user!.userId,inviteId.parse(req.params.id))
}))
surveyPlatformRouter.post('/researchers/:id/password-reset-invitations',handler(async req=>{
  await administrator(req);return governance.invitePasswordReset(req.user!.userId,inviteId.parse(req.params.id))
}))

const sourceRef=z.object({kind:z.enum(['SCALE','SJT','COGNITIVE','FORM']),sourceId:z.string().min(1).max(200),
  sourceVersion:z.string().min(1).max(100),organizationId:z.string().guid().optional()}).strict()
const page=(raw:unknown)=>z.coerce.number().int().min(1).max(1000).default(1).parse(raw)
surveyPlatformRouter.get('/source-catalog',handler(req=>catalog.sourceCatalog(req.user!.userId,{
  page:page(req.query.page),kind:sourceRef.shape.kind.optional().parse(req.query.kind),
  organizationId:sourceRef.shape.organizationId.parse(req.query.organizationId)})))
surveyPlatformRouter.get('/researchers/:id/tool-grants',handler(req=>catalog.listToolGrants(req.user!.userId,inviteId.parse(req.params.id),page(req.query.page))))
surveyPlatformRouter.post('/researchers/:id/tool-grants',handler(async req=>{
  const body=z.object({currentPassword:z.string().min(1).max(128),source:sourceRef}).strict().parse(req.body)
  await governance.authorizeAdmin(req.user!.userId,body.currentPassword)
  return catalog.grantCatalogSource(req.user!.userId,inviteId.parse(req.params.id),body.source)
}))
surveyPlatformRouter.post('/tool-grants/:id/revoke',handler(async req=>{
  await administrator(req);return catalog.revokeToolGrant(req.user!.userId,inviteId.parse(req.params.id))
}))
