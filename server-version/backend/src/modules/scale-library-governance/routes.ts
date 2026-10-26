import {catalogDiscoveryQueryFields} from '../scale/library/catalog-discovery'
import {readUnifiedCatalog,readUnifiedStandardCatalogEntry,readUnifiedAuthoredCatalogEntry} from './unified-catalog'
import {libraryMediaRouter} from './media.routes'
import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {authenticate,authenticateSurvey} from '../../middleware/auth'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {success,error} from '../../utils/response'
import {platformSurveyOriginGuard} from '../survey/originGuard'
import {requireRecentAdminKey} from '../admin-permissions/guards'
import {AdminPermissionError} from '../admin-permissions/service'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {ContentReleaseError} from '../measurement-content/release'
import {ScaleLibraryError} from './contracts'
import * as service from './service'
import {grantUse,listUses,revokeUse,recipients} from './distribution'
const uuid=z.string().guid()
const handle=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
 try{return success(res,await fn(req))}catch(e){
  if(e instanceof z.ZodError)return error(res,'共用库请求参数不合法',-1,400)
  if(e instanceof ScaleLibraryError||e instanceof AdminPermissionError)return error(res,e.message,-1,e.statusCode)
  if(e instanceof ContentAuthorityError)return error(res,'缺少精确版本的平台内容权限',-1,403)
  if(e instanceof ContentReleaseError)return error(res,e.code,-1,409)
  if((e as {code?:string})?.code==='P2002'||(e as {meta?:{code?:string}})?.meta?.code==='23505')return error(res,'该版本已存在待审申请、条目或有效授权',-1,409)
  next(e)
 }
}
const limiter=createRedisRateLimiter({name:'scale-library-governance',limit:60,windowSeconds:300,key:req=>req.user?.userId??req.ip??'unknown'})
function router(product:'TRAINING'|'SURVEY'){
 const result=Router()
 result.use(product==='TRAINING'?authenticate:authenticateSurvey)
 if(product==='TRAINING')result.use(platformSurveyOriginGuard)
 result.use(limiter,(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
 result.use(libraryMediaRouter(product))
 result.get('/catalog',handle(req=>readUnifiedCatalog(req.user!.userId,product,z.object({page:z.coerce.number().int().min(1).max(Math.floor(Number.MAX_SAFE_INTEGER/100)).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25),...catalogDiscoveryQueryFields,origin:z.enum(['ALL','STANDARD_REGISTRY','AUTHORED']).default('ALL')}).parse(req.query))))
 result.get('/catalog/standard/:instrumentKey/:instrumentVersion',handle(req=>readUnifiedStandardCatalogEntry(req.user!.userId,product,z.string().min(1).max(200).parse(req.params.instrumentKey),z.string().min(1).max(100).parse(req.params.instrumentVersion))))
 result.get('/catalog/authored/:id',handle(req=>readUnifiedAuthoredCatalogEntry(req.user!.userId,product,uuid.parse(req.params.id))))
 result.get('/capabilities',handle(req=>service.readCapabilities(req.user!.userId)))
 result.get('/sources/:id',handle(req=>service.readSources(req.user!.userId,product,uuid.parse(req.params.id))))
 result.get('/submissions',handle(req=>service.listSubmissions(req.user!.userId,req.query.sourceId===undefined?undefined:uuid.parse(req.query.sourceId))))
 result.get('/submissions/:id',handle(req=>service.readSubmission(req.user!.userId,uuid.parse(req.params.id))))
 result.post('/media-manifest',handle(req=>service.prepareMediaManifest(req.user!.userId,product,z.object({releaseId:uuid,dependencyReleaseIds:z.array(uuid).max(20).default([])}).strict().parse(req.body))))
 result.post('/submissions',handle(req=>service.submit(req.user!.userId,product,req.body)))
 result.post('/submissions/:id/withdraw',handle(req=>service.withdraw(req.user!.userId,uuid.parse(req.params.id),req.body)))
 result.get('/entries',handle(req=>service.listEntries(req.user!.userId)))
 if(product==='TRAINING'){
  result.post('/submissions/:id/review',handle(req=>service.review(req.user!.userId,uuid.parse(req.params.id),req.body)))
  result.post('/entries/:id/entrypoints',requireRecentAdminKey,handle(req=>service.changeEntryProducts(req.user!.userId,uuid.parse(req.params.id),req.body)))
  result.post('/entries/:id/status',handle(req=>service.changeEntryStatus(req.user!.userId,uuid.parse(req.params.id),req.body)))
  result.get('/entries/:id/recipients',handle(req=>recipients(req.user!.userId,uuid.parse(req.params.id),req.query)))
  result.get('/entries/:id/grants',handle(req=>listUses(req.user!.userId,uuid.parse(req.params.id))))
  result.post('/entries/:id/grants',handle(req=>grantUse(req.user!.userId,uuid.parse(req.params.id),req.body)))
  result.post('/grants/:id/revoke',handle(req=>revokeUse(req.user!.userId,uuid.parse(req.params.id),req.body)))
  const emergency=z.object({targetKind:z.enum(['RELEASE','TRAINING_SCALE','SURVEY_INSTRUMENT']),targetId:uuid,reason:z.string().trim().min(1).max(1000),grantId:uuid.optional()}).strict()
  result.post('/emergency-stops',handle(req=>{const input=emergency.parse(req.body);return prisma.$transaction(tx=>service.stopCollection(tx,req.user!.userId,input.targetKind,input.targetId,input.reason,input.grantId))}))
 }
 return result
}
export const trainingScaleLibraryGovernanceRouter=router('TRAINING')
export const surveyScaleLibraryGovernanceRouter=router('SURVEY')
