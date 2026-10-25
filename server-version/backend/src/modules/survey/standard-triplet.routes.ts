import {catalogDiscoveryQueryFields} from '../scale/library/catalog-discovery'
import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {authenticate} from '../../middleware/auth'
import {requireRecentAdminKey} from '../admin-permissions/guards'
import {AdminPermissionError} from '../admin-permissions/service'
import {success,error} from '../../utils/response'
import {prisma} from '../../config/database'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import * as service from './standard-triplet.service'
import {MANAGEMENT_DESIGN} from './tool-management-policy'
import {libraryPreflight,libraryPreflightBatch} from './library-preflight.service'
export const surveyStandardTripletRouter=Router()
surveyStandardTripletRouter.use(authenticate,createRedisRateLimiter({name:'survey-standard-triplet',limit:90,windowSeconds:300,key:req=>req.user?.userId??req.ip??'unknown'}))
surveyStandardTripletRouter.use(async(req,res,next)=>{try{await service.assertStandardSystem(prisma,req.user!.userId);res.setHeader('Cache-Control','no-store');next()}catch(e){if(e instanceof AdminPermissionError)return error(res,e.message,-1,e.statusCode);next(e)}})
const handle=(work:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{try{return success(res,await work(req))}catch(e){if(e instanceof z.ZodError)return error(res,'请求参数不合法',-1,400);if(e instanceof AdminPermissionError)return error(res,e.message,-1,e.statusCode);next(e)}}
surveyStandardTripletRouter.get('/management-design',handle(async()=>MANAGEMENT_DESIGN))
const hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().trim().min(1).max(300),reason=z.string().trim().min(1).max(1000)
const selection=z.object({toolKey:text,CONTENT:hash,PARAMETERS:hash,REPORT:hash}).strict()
surveyStandardTripletRouter.get('/catalog',handle(req=>{const {page,...filters}=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),...catalogDiscoveryQueryFields}).parse(req.query);return service.standardTripletCatalog(req.user!.userId,page,filters)}))
surveyStandardTripletRouter.get('/candidate/:key/:version',handle(req=>service.standardTripletDetail(req.user!.userId,text.parse(req.params.key),text.parse(req.params.version))))
surveyStandardTripletRouter.get('/preflight/:key/:version',handle(req=>libraryPreflight(req.user!.userId,text.parse(req.params.key),text.parse(req.params.version))))
surveyStandardTripletRouter.post('/preflight',handle(req=>libraryPreflightBatch(req.user!.userId,z.object({identities:z.array(z.object({instrumentKey:text,instrumentVersion:text}).strict()).min(1).max(10)}).strict().parse(req.body).identities)))
surveyStandardTripletRouter.post('/preview',handle(req=>service.previewStandardTriplet(prisma,req.user!.userId,selection.parse(req.body))))
surveyStandardTripletRouter.post('/approve',requireRecentAdminKey,handle(req=>service.approveStandardTriplet(req.user!.userId,selection.extend({requestId:z.string().uuid(),expectedCombinationHash:hash,reason}).strict().parse(req.body),req.user!)))
surveyStandardTripletRouter.post('/:id/retry',requireRecentAdminKey,handle(req=>service.runStandardTrial(req.user!.userId,z.string().uuid().parse(req.params.id),z.object({expectedVersion:z.number().int().positive()}).strict().parse(req.body).expectedVersion,req.user!)))
surveyStandardTripletRouter.post('/:id/withdraw',requireRecentAdminKey,handle(req=>{const input=z.object({expectedVersion:z.number().int().positive(),reason}).strict().parse(req.body);return service.withdrawStandardTriplet(req.user!.userId,z.string().uuid().parse(req.params.id),input.expectedVersion,input.reason,req.user!)}))
