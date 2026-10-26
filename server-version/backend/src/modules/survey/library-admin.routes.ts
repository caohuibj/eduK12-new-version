import {catalogDiscoveryQueryFields} from '../scale/library/catalog-discovery'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {authenticate} from '../../middleware/auth'
import {prisma} from '../../config/database'
import {success,error} from '../../utils/response'
import {requireRecentAdminKey} from '../admin-permissions/guards'
import {AdminPermissionError} from '../admin-permissions/service'
import {assertSurveyLibraryManager} from './admin-role'
import {grantUse,revokeUse,recipients} from '../scale-library-governance/distribution'
import {assertSurveyManager} from './admin-role'
import * as service from './library-admin.service'
export const surveyLibraryAdminRouter=Router()
surveyLibraryAdminRouter.use(createRedisRateLimiter({name:'survey-library-admin',limit:60,windowSeconds:300,key:req=>req.ip??'unknown'}))
surveyLibraryAdminRouter.use(authenticate,async(req,res,next)=>{try{await prisma.$transaction(tx=>assertSurveyLibraryManager(tx,req.user!.userId));res.setHeader('Cache-Control','no-store');next()}catch(e){if(e instanceof AdminPermissionError)return error(res,e.message,-1,e.statusCode);next(e)}})
const handle=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{try{return success(res,await fn(req))}catch(e){if(e instanceof z.ZodError)return error(res,'请求参数不合法',-1,400);if(e instanceof AdminPermissionError)return error(res,e.message,-1,e.statusCode);next(e)}}
const page=z.coerce.number().int().min(1).max(10000).default(1)
surveyLibraryAdminRouter.get('/catalog',handle(req=>{const input=z.object({page,...catalogDiscoveryQueryFields,origin:z.enum(['ALL','STANDARD_REGISTRY','AUTHORED']).default('ALL')}).parse(req.query);return service.surveyLibraryCatalog(req.user!.userId,input.page,input)}))
surveyLibraryAdminRouter.get('/submissions',handle(req=>service.surveyLibrarySubmissions(req.user!.userId,page.parse(req.query.page))))
surveyLibraryAdminRouter.get('/submissions/:id',handle(req=>service.surveySubmissionDetail(req.user!.userId,z.string().uuid().parse(req.params.id))))
surveyLibraryAdminRouter.post('/policies',requireRecentAdminKey,handle(req=>service.changeSurveyToolPolicy(req.user!.userId,z.object({resourceKey:z.string().min(1).max(300),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),expectedVersion:z.number().int().nonnegative(),decision:z.enum(['APPROVED','RETURNED','PENDING']),paused:z.boolean(),reason:z.string().trim().min(1).max(1000)}).strict().parse(req.body))))

const surveyOnly=async(req:Request,res:Response,next:NextFunction)=>{try{await prisma.$transaction(tx=>assertSurveyManager(tx,req.user!.userId));next()}catch(e){if(e instanceof AdminPermissionError)return error(res,e.message,-1,e.statusCode);next(e)}}
surveyLibraryAdminRouter.get('/entries/:id/recipients',surveyOnly,handle(req=>recipients(req.user!.userId,z.string().uuid().parse(req.params.id),{product:'SURVEY',...z.object({page,keyword:z.string().max(100).default('')}).strict().parse(req.query)})))
surveyLibraryAdminRouter.get('/entries/:id/grants',surveyOnly,handle(async req=>({list:await prisma.$queryRaw`SELECT id,user_id AS "userId",product,version,status FROM scale_library_use_grants WHERE entry_id=${z.string().uuid().parse(req.params.id)} AND product='SURVEY' ORDER BY created_at DESC,id LIMIT 100`})))
surveyLibraryAdminRouter.post('/entries/:id/grants',surveyOnly,requireRecentAdminKey,handle(req=>grantUse(req.user!.userId,z.string().uuid().parse(req.params.id),{product:'SURVEY',...z.object({userId:z.string().uuid(),requestId:z.string().uuid()}).strict().parse(req.body)})))
surveyLibraryAdminRouter.post('/grants/:id/revoke',surveyOnly,requireRecentAdminKey,handle(async req=>{
 const id=z.string().uuid().parse(req.params.id)
 const [row]=await prisma.$queryRaw<Array<{product:string}>>`SELECT product FROM scale_library_use_grants WHERE id=${id}`
 if(row?.product!=='SURVEY')throw new AdminPermissionError(403,'仅可操作 Survey 工具授权')
 return revokeUse(req.user!.userId,id,z.object({expectedVersion:z.number().int().positive(),reason:z.string().trim().min(1).max(1000)}).strict().parse(req.body))
}))
