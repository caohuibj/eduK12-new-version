import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {authenticateSurvey} from '../../middleware/auth'
import {success,error} from '../../utils/response'
import {SurveyBuilderError} from './builder.service'
import {SurveyDraftError} from './builder.definition'
import {BulkImportError,bulkInputSchema} from './builder.import'
import {SurveyMediaError} from './media.references'
import {SurveyGovernanceError} from './governance.service'
import {CatalogSourceError} from './catalog.sources'
import {SurveyFinalValidationError} from './final.compute'
import * as library from './tool-library.service'
import {publishToolMeasurement} from './tool-publication.service'
import {ContentReleaseError} from '../measurement-content/release'
export const surveyToolLibraryRouter=Router()
surveyToolLibraryRouter.use(authenticateSurvey)
const id=z.string().uuid(),revision=z.number().int().nonnegative(),title=z.string().trim().min(1).max(200)
const page=z.coerce.number().int().min(1).max(1000).default(1)
const handle=(fn:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await fn(req))}catch(cause){
    if(cause instanceof ContentReleaseError)return error(res,cause.code,-1,409)
    if(cause instanceof z.ZodError)return error(res,'工具字段不合法',-1,400)
    if(cause instanceof SurveyDraftError||cause instanceof BulkImportError)return res.status(400).json({code:'SURVEY_TOOL_INVALID',message:cause.message,data:{issues:cause.issues}})
    if(cause instanceof SurveyFinalValidationError)return error(res,cause.message,-1,400)
    if(cause instanceof SurveyBuilderError||cause instanceof SurveyMediaError||cause instanceof SurveyGovernanceError||cause instanceof CatalogSourceError)return error(res,cause.message,-1,cause.statusCode)
    next(cause)
  }
}
const uid=(req:Request)=>req.user!.userId
surveyToolLibraryRouter.get('/catalog',handle(req=>library.catalogTemplates(uid(req),page.parse(req.query.page))))
surveyToolLibraryRouter.get('/',handle(req=>library.listTemplates(uid(req),{page:page.parse(req.query.page),query:z.string().trim().max(200).default('').parse(req.query.query),kind:z.enum(['','FORM','SCALE','COMPOSITION']).default('').parse(req.query.kind)})))
surveyToolLibraryRouter.post('/',handle(req=>library.createTemplate(uid(req),z.object({requestId:id,kind:library.toolKind,title}).strict().parse(req.body))))
surveyToolLibraryRouter.get('/:tid',handle(req=>library.getTemplate(uid(req),id.parse(req.params.tid))))
surveyToolLibraryRouter.patch('/:tid',handle(req=>library.saveTemplate(uid(req),id.parse(req.params.tid),z.object({revision,title,definition:z.record(z.unknown())}).strict().parse(req.body))))
surveyToolLibraryRouter.post('/:tid/archive',handle(req=>library.archiveTemplate(uid(req),id.parse(req.params.tid),z.object({revision}).strict().parse(req.body).revision)))
surveyToolLibraryRouter.post('/:tid/measurement-release',handle(req=>publishToolMeasurement(uid(req),id.parse(req.params.tid),z.object({revision}).strict().parse(req.body).revision)))
surveyToolLibraryRouter.post('/:tid/validate',handle(req=>library.inspectTemplate(uid(req),id.parse(req.params.tid))))
surveyToolLibraryRouter.post('/:tid/preview',handle(req=>{
  const data=z.object({answers:z.record(z.union([z.string().max(2000),z.number().finite(),z.null(),z.object({_surveyRefusal:z.literal(true)}).strict(),z.array(z.string().max(80)).max(6)]))}).strict().parse(req.body)
  if(Object.keys(data.answers).length>240)throw new SurveyBuilderError(400,'预览作答数量超限')
  return library.inspectTemplate(uid(req),id.parse(req.params.tid),data.answers)
}))
surveyToolLibraryRouter.post('/:tid/form-dry-run',handle(req=>library.dryRunTemplate(uid(req),id.parse(req.params.tid),z.object({answers:z.record(z.unknown())}).strict().parse(req.body).answers)))
surveyToolLibraryRouter.post('/:tid/bulk-import/preview',handle(req=>library.bulkTemplate(uid(req),id.parse(req.params.tid),bulkInputSchema.parse(req.body))))
surveyToolLibraryRouter.post('/:tid/bulk-import/apply',handle(req=>{const data=z.object({revision,digest:z.string().regex(/^[a-f0-9]{64}$/),batch:bulkInputSchema}).strict().parse(req.body);return library.bulkTemplate(uid(req),id.parse(req.params.tid),data.batch,data)}))
surveyToolLibraryRouter.post('/select/:pid',handle(req=>library.selectTemplate(uid(req),id.parse(req.params.pid),z.object({requestId:id,tool:library.toolReference}).strict().parse(req.body))))

surveyToolLibraryRouter.post('/from-project/:pid/:iid',handle(req=>library.copyProjectTool(uid(req),id.parse(req.params.pid),id.parse(req.params.iid),z.object({requestId:id}).strict().parse(req.body).requestId)))
