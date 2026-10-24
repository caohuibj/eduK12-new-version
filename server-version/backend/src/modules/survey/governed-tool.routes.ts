import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {authenticate,authenticateSurvey} from '../../middleware/auth'
import {success,error} from '../../utils/response'
import {prisma} from '../../config/database'
import {AdminPermissionError} from '../admin-permissions/service'
import {requireRecentAdminKey} from '../admin-permissions/guards'
import {createRedisRateLimiter} from '../../middleware/redisRateLimit'
import {reportTemplateSchema} from '../measurement-content/report-template'
import {assertStandardSystem} from './standard-triplet.service'
import {assertSurveyLibraryManager} from './admin-role'
import {authorizeAdmin} from './governance.service'
import {CatalogSourceError} from './catalog.sources'
import {SurveyBuilderError} from './builder.service'
import {SurveyDraftError} from './builder.definition'
import {governedFamily,packageReportSchema} from './governed-tool.model'
import * as service from './governed-tool.service'
import * as packages from './governed-package.service'
import {readGovernedPackageReports,listGovernedPackageReports} from './governed-package.reports'
const uuid=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().trim().min(1).max(200),version=z.string().trim().min(1).max(120),reason=z.string().trim().min(1).max(2000),page=z.coerce.number().int().min(1).max(10000).default(1)
const ref=z.object({kind:z.enum(['SCALE','COGNITIVE','SJT','FORM']),sourceId:z.string().min(1).max(200),sourceVersion:z.string().min(1).max(120),organizationId:uuid.optional()}).strict()
const metadata=z.record(z.unknown()).refine(v=>Buffer.byteLength(JSON.stringify(v),'utf8')<=65536,'Reference 超过保存预算')
const handle=(work:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{try{return success(res,await work(req))}catch(e){if(e instanceof z.ZodError)return error(res,'请检查版本、组件与报告字段',-1,400);if(e instanceof AdminPermissionError||e instanceof CatalogSourceError||e instanceof SurveyBuilderError)return error(res,e.message,-1,e.statusCode);if(e instanceof SurveyDraftError)return error(res,'内容无法由当前 Survey 播放器运行：'+e.issues.map(i=>i.message).join('；'),-1,409);next(e)}}
export const surveyGovernedToolsRouter=Router()
surveyGovernedToolsRouter.use(authenticate,createRedisRateLimiter({name:'survey-governed-tools',limit:120,windowSeconds:300,key:req=>req.user?.userId??req.ip??'unknown'}),async(req,res,next)=>{try{await serviceCheck(req,'SYSTEM');res.setHeader('Cache-Control','no-store');next()}catch(e){next(e)}})
async function serviceCheck(req:Request,kind:'SYSTEM'|'LIBRARY'){if(kind==='SYSTEM')await assertStandardSystem(prisma,req.user!.userId);else await prisma.$transaction(tx=>assertSurveyLibraryManager(tx,req.user!.userId))}
surveyGovernedToolsRouter.get('/sources',handle(req=>service.governedSources(req.user!.userId,ref.shape.kind.parse(req.query.kind),page.parse(req.query.page))))
surveyGovernedToolsRouter.get('/source-preview',handle(req=>service.governedSourcePreview(req.user!.userId,ref.parse(req.query))))
surveyGovernedToolsRouter.get('/catalog',handle(req=>service.governedCatalog(req.user!.userId,{family:governedFamily.optional().parse(req.query.family),page:page.parse(req.query.page)})))
surveyGovernedToolsRouter.get('/components',handle(req=>service.governedComponentOptions(req.user!.userId)))
surveyGovernedToolsRouter.get('/versions/:id',handle(req=>service.governedDetail(req.user!.userId,uuid.parse(req.params.id))))
surveyGovernedToolsRouter.use(requireRecentAdminKey)
const originalSjt=z.object({requestId:uuid,toolKey:z.string().regex(/^[a-z][a-z0-9_-]{0,100}$/),version,title:text,definition:z.record(z.unknown()),statement:reason,parameterReleaseId:uuid.nullable().optional(),report:z.object({version,template:reportTemplateSchema}).strict().nullable(),reference:metadata}).strict()
surveyGovernedToolsRouter.post('/original-sjt/preview',handle(req=>service.previewOriginalSjt(req.user!.userId,originalSjt.parse(req.body),req.user!)))
surveyGovernedToolsRouter.post('/submissions/original-sjt',handle(req=>service.submitOriginalSjt(req.user!.userId,originalSjt.parse(req.body),req.user!)))
surveyGovernedToolsRouter.post('/submissions/source',handle(req=>service.submitGovernedSource(req.user!.userId,z.object({requestId:uuid,source:ref,version,title:text,parameterReleaseId:uuid.nullable().optional(),report:z.object({version,template:reportTemplateSchema}).strict().nullable(),reference:metadata}).strict().parse(req.body),req.user!)))
surveyGovernedToolsRouter.post('/submissions/package',handle(req=>service.submitGovernedPackage(req.user!.userId,z.object({requestId:uuid,family:z.enum(['COMBINATION','BUNDLE']),toolKey:z.string().regex(/^[a-z][a-z0-9_-]{0,100}$/),version,title:text,components:z.array(z.object({slotKey:z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/),source:z.object({type:z.enum(['STANDARD','GOVERNED']),id:uuid,hash}).strict()}).strict()).min(1).max(30),report:packageReportSchema.nullable(),reference:metadata}).strict().parse(req.body),req.user!)))
surveyGovernedToolsRouter.post('/versions/:id/review',handle(req=>service.approveGovernedTool(req.user!.userId,uuid.parse(req.params.id),z.object({expectedVersion:z.number().int().positive(),hash,reason,decision:z.enum(['APPROVE','RETURN'])}).strict().parse(req.body),req.user!)))
surveyGovernedToolsRouter.post('/versions/:id/retry',handle(req=>service.runGovernedTrial(req.user!.userId,uuid.parse(req.params.id),z.object({expectedVersion:z.number().int().positive()}).strict().parse(req.body).expectedVersion,req.user!)))
surveyGovernedToolsRouter.post('/versions/:id/withdraw',handle(req=>{const b=z.object({expectedVersion:z.number().int().positive(),reason}).strict().parse(req.body);return service.withdrawGovernedTool(req.user!.userId,uuid.parse(req.params.id),b.expectedVersion,b.reason,req.user!)}))
export const surveyGovernedUseRouter=Router()
surveyGovernedUseRouter.use(authenticate,async(req,res,next)=>{try{await serviceCheck(req,'LIBRARY');res.setHeader('Cache-Control','no-store');next()}catch(e){next(e)}})
surveyGovernedUseRouter.get('/catalog',handle(req=>service.governedCatalog(req.user!.userId,{family:governedFamily.optional().parse(req.query.family),page:page.parse(req.query.page)},false)))
surveyGovernedUseRouter.get('/researchers/:id/package-grants',handle(req=>packages.packageGrantsForManager(req.user!.userId,uuid.parse(req.params.id),page.parse(req.query.page))))
surveyGovernedUseRouter.use(requireRecentAdminKey)
surveyGovernedUseRouter.post('/package-grants',handle(async req=>{const b=z.object({currentPassword:z.string().min(1).max(128),requestId:uuid,toolId:uuid,hash,userId:uuid,reason,expiresAt:z.string().datetime().nullable().optional()}).strict().parse(req.body);await authorizeAdmin(req.user!.userId,b.currentPassword);return packages.grantSurveyPackage(req.user!.userId,b)}))
surveyGovernedUseRouter.post('/package-grants/:id/revoke',handle(async req=>{const b=z.object({currentPassword:z.string().min(1).max(128),expectedVersion:z.number().int().positive(),reason}).strict().parse(req.body);await authorizeAdmin(req.user!.userId,b.currentPassword);return packages.revokeSurveyPackage(req.user!.userId,uuid.parse(req.params.id),b.expectedVersion,b.reason)}))
export const surveyGovernedResearcherRouter=Router()
surveyGovernedResearcherRouter.use(authenticateSurvey)
surveyGovernedResearcherRouter.get('/:pid/package-grants',handle(req=>packages.packageGrantsForResearcher(req.user!.userId,uuid.parse(req.params.pid),page.parse(req.query.page))))
surveyGovernedResearcherRouter.post('/:pid/package-grants/:gid/import',handle(req=>packages.importSurveyPackage(req.user!.userId,uuid.parse(req.params.pid),uuid.parse(req.params.gid),z.object({requestId:uuid}).strict().parse(req.body).requestId)))
surveyGovernedResearcherRouter.post('/:pid/instruments/:iid/submit-library',handle(req=>service.submitOwnedSurveyTool(req.user!.userId,uuid.parse(req.params.pid),uuid.parse(req.params.iid),z.object({requestId:uuid,revision:z.number().int().nonnegative(),version,statement:reason,reference:metadata}).strict().parse(req.body))))
surveyGovernedResearcherRouter.get('/:pid/waves/:wid/finals/:fid/package-reports',handle(req=>readGovernedPackageReports(req.user!.userId,{projectId:uuid.parse(req.params.pid),waveId:uuid.parse(req.params.wid),finalId:uuid.parse(req.params.fid)})))

surveyGovernedResearcherRouter.get('/:pid/package-imports',handle(req=>packages.listProjectPackageImports(req.user!.userId,uuid.parse(req.params.pid),page.parse(req.query.page))))
surveyGovernedResearcherRouter.get('/:pid/waves/:wid/package-reports',handle(req=>listGovernedPackageReports(req.user!.userId,uuid.parse(req.params.pid),uuid.parse(req.params.wid),page.parse(req.query.page))))
