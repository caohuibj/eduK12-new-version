import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { config } from '../../config'
import { authenticate } from '../../middleware/auth'
import { createRedisRateLimiter } from '../../middleware/redisRateLimit'
import { success } from '../../utils/response'
import { parentPublisher } from './publisher'
import { ReportingError } from '../reporting/types'
import { parentPortalService } from './service'
import { ParentPortalError, fail } from './contracts'

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
const commandKey=z.string().min(16).max(128).regex(/^[a-zA-Z0-9_-]+$/)
const pagination=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),pageSize:z.coerce.number().int().min(1).max(20).default(20)})
const params=z.object({relationshipId:id,artifactId:id.optional()})
const childParams=z.object({childId:id,artifactId:id.optional()})
const mutationBudget=createRedisRateLimiter({name:'parent-portal-write',limit:30,windowSeconds:15*60,key:req=>req.user?.userId??'anonymous'})
function handle(operation:(req:Request)=>Promise<unknown>) {
  return (req:Request,res:Response,next:NextFunction)=>{void Promise.resolve().then(()=>operation(req)).then(data=>success(res,data)).catch(error=>{
    if(error instanceof ReportingError)return res.status(error.statusCode).json({code:error.code,message:error.message,data:null})
    if(error instanceof ParentPortalError)return res.status(error.status).json({code:error.code,message:error.message,data:null})
    if(error instanceof z.ZodError)return res.status(400).json({code:'PARENT_INPUT_INVALID',message:'输入信息无效',data:null})
    // A serialization loser must refresh; writes are not blindly replayed.
    if(error?.code==='P2034'||error?.code==='P2002'||(error?.code==='P2010'&&['40001','40P01'].includes(error?.meta?.code)))return res.status(409).json({code:'PARENT_STATE_CONFLICT',message:'状态已变化，请刷新后重试',data:null})
    if(error?.name==='AssessmentIdentityError')return res.status(409).json({code:'PARENT_STATE_CONFLICT',message:'邀请码或关联状态已变化，请刷新',data:null})
    return next(error)
  })}
}
function guard(req:Request,res:Response,next:NextFunction) {
  res.setHeader('Cache-Control','no-store')
  if(!config.parentPortalEnabled)return res.status(404).json({code:'PARENT_PORTAL_DISABLED',message:'入口尚未开放',data:null})
  return next()
}
export const parentLinksRouter=Router()
parentLinksRouter.use(authenticate,guard)
parentLinksRouter.get('/consent',handle(async()=>parentPortalService.consentText()))
parentLinksRouter.get('/',handle(req=>parentPortalService.links(req.user!)))
parentLinksRouter.get('/invitation-sources',handle(req=>parentPortalService.invitationSources(req.user!)))
parentLinksRouter.post('/invitations',mutationBudget,handle(req=>parentPortalService.invitations(req.user!,z.union([z.object({courseId:id}).strict(),z.object({organizationId:id}).strict()]).parse(req.body))))
parentLinksRouter.post('/claims',mutationBudget,handle(req=>parentPortalService.claim(req.user!,z.object({inviteCode:z.string().regex(/^[A-Za-z0-9_-]{24}$/)}).strict().parse(req.body).inviteCode)))
parentLinksRouter.post('/:relationshipId/approve',mutationBudget,handle(req=>parentPortalService.approve(req.user!,params.parse(req.params).relationshipId,z.object({consentVersion:z.string().max(128)}).strict().parse(req.body).consentVersion)))
parentLinksRouter.post('/:relationshipId/revoke',mutationBudget,handle(req=>parentPortalService.revoke(req.user!,params.parse(req.params).relationshipId,z.object({reason:z.string().min(1).max(200)}).strict().parse(req.body).reason)))
parentLinksRouter.get('/:relationshipId/report-options',handle(req=>parentPortalService.studentReportOptions(req.user!,id.parse(req.params.relationshipId))))
parentLinksRouter.get('/:relationshipId/reports/:artifactId/consent',handle(req=>{
  const p=params.parse(req.params);return parentPortalService.reportConsentPreview(req.user!,p.relationshipId,p.artifactId??fail())
}))
parentLinksRouter.post('/:relationshipId/reports/:artifactId/consent',mutationBudget,handle(req=>{
  const p=params.parse(req.params);const b=z.object({commandKey,consentVersion:z.string().max(128),publicationHash:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().parse(req.body)
  return parentPortalService.acceptReportConsent(req.user!,p.relationshipId,p.artifactId??fail(),b.commandKey,b.consentVersion,b.publicationHash)
}))
parentLinksRouter.post('/:relationshipId/reports/:artifactId/grants',mutationBudget,handle(req=>{
  const p=params.parse(req.params);const b=z.object({commandKey,consentId:id}).strict().parse(req.body)
  return parentPortalService.grantReport(req.user!,p.relationshipId,p.artifactId??fail(),b.consentId,b.commandKey)
}))
parentLinksRouter.post('/:relationshipId/reports/:artifactId/revoke',mutationBudget,handle(req=>{
  const p=params.parse(req.params);const b=z.object({reason:z.string().min(1).max(200)}).strict().parse(req.body)
  return parentPortalService.revokeReport(req.user!,p.relationshipId,p.artifactId??fail(),b.reason)
}))
export const parentsRouter=Router()
parentsRouter.use(authenticate,guard)
parentsRouter.get('/me/children',handle(req=>{const q=pagination.parse(req.query);return parentPortalService.children(req.user!,q.page,q.pageSize)}))
parentsRouter.get('/me/children/:childId/overview',handle(req=>parentPortalService.overview(req.user!,childParams.parse(req.params).childId)))
parentsRouter.get('/me/children/:childId/reports',handle(req=>{const q=pagination.parse(req.query);return parentPortalService.reports(req.user!,childParams.parse(req.params).childId,q.page,q.pageSize)}))
parentsRouter.get('/me/children/:childId/reports/:artifactId',handle(req=>{const p=childParams.parse(req.params);return parentPortalService.readReport(req.user!,p.childId,p.artifactId??fail())}))

export const parentPublicationRouter=Router()
parentPublicationRouter.use(authenticate,guard)
parentPublicationRouter.get('/',handle(req=>{const q=pagination.parse(req.query);return parentPublisher.list(req.user!,id.parse(req.query.organizationId),q.page,q.pageSize)}))
parentPublicationRouter.get('/:artifactId/templates',handle(req=>parentPublisher.templates(req.user!,id.parse(req.params.artifactId))))
parentPublicationRouter.get('/:artifactId/consents',handle(req=>parentPortalService.disclosureConsents(req.user!,id.parse(req.params.artifactId))))
parentPublicationRouter.post('/:artifactId/preview',mutationBudget,handle(req=>{const b=z.object({templateKey:z.string().min(1).max(128).default('parent-report-availability'),templateVersion:z.string().min(1).max(128).default('1.0.0')}).strict().parse(req.body);return parentPublisher.preview(req.user!,id.parse(req.params.artifactId),b.templateKey,b.templateVersion)}))
parentPublicationRouter.post('/:artifactId/publish',mutationBudget,handle(req=>{const b=z.object({templateKey:z.string().min(1).max(128),templateVersion:z.string().min(1).max(128),previewHash:z.string().regex(/^[a-f0-9]{64}$/),expectedVersion:z.number().int().min(0),commandKey}).strict().parse(req.body);return parentPublisher.publish(req.user!,id.parse(req.params.artifactId),b)}))
