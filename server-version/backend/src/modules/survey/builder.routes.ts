import {catalogDiscoveryQueryFields} from '../scale/library/catalog-discovery'
import {publishSurveyMeasurementDraft} from './measurement-publication.service'
import {ContentReleaseError} from '../measurement-content/release'
import {SurveyMediaError} from './media.references'
import {SurveyWaveError} from './waves.service'
import {SurveyGovernanceError} from './governance.service'
import {CatalogSourceError} from './catalog.sources'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { authenticateSurvey } from '../../middleware/auth'
import { success, error } from '../../utils/response'
import { SurveyDraftError, surveyKindSchema, surveyKeySchema } from './builder.definition'
import * as service from './builder.service'
import { bulkInputSchema, BulkImportError } from './builder.import'

export const surveyBuilderRouter=Router()
surveyBuilderRouter.use('/:pid/instruments',authenticateSurvey)
surveyBuilderRouter.use('/:pid/catalog',authenticateSurvey)
const id=z.string().guid()
const create=z.object({
  requestId:id,kind:surveyKindSchema,instrumentKey:surveyKeySchema,
  title:z.string().trim().min(1).max(200),
}).strict()
const update=z.object({
  revision:z.number().int().nonnegative(),
  title:z.string().trim().min(1).max(200),
  definition:z.custom<Record<string,unknown>>(v=>v!==null&&typeof v==='object'&&!Array.isArray(v)),
}).strict()
const copy=z.object({
  requestId:id,instrumentKey:surveyKeySchema,
  title:z.string().trim().min(1).max(200),
}).strict()
const archive=z.object({revision:z.number().int().nonnegative()}).strict()
const handle=(action:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{return success(res,await action(req))}
  catch(e){
    if(e instanceof z.ZodError)return error(res,'输入不符合研究工具结构规范',-1,400)
    if(e instanceof SurveyDraftError)return res.status(400).json({code:'SURVEY_DRAFT_INVALID',
      message:'研究工具包含待修正字段',data:{issues:e.issues}})
    if(e instanceof BulkImportError)return res.status(400).json({code:'SURVEY_IMPORT_INVALID',
      message:'批量导入包含错误',data:{issues:e.issues}})
    if(e instanceof SurveyGovernanceError||e instanceof CatalogSourceError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof ContentReleaseError)return error(res,e.code,-1,409)
    if(e instanceof SurveyMediaError||e instanceof SurveyWaveError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof service.SurveyBuilderError)return error(res,e.message,-1,e.statusCode)
    next(e)
  }
}
surveyBuilderRouter.get('/:pid/instruments',handle(req=>
  service.listDrafts(req.user!.userId,id.parse(req.params.pid),Math.min(1000,Math.max(1,Number(req.query.page)||1)))))
surveyBuilderRouter.post('/:pid/instruments',handle(req=>
  service.createDraft(req.user!.userId,id.parse(req.params.pid),create.parse(req.body))))
surveyBuilderRouter.get('/:pid/instruments/:iid',handle(req=>
  service.getDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid))))
surveyBuilderRouter.patch('/:pid/instruments/:iid',handle(req=>
  service.updateDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid),update.parse(req.body))))
surveyBuilderRouter.post('/:pid/instruments/:iid/copy',handle(req=>
  service.copyDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid),copy.parse(req.body))))
surveyBuilderRouter.post('/:pid/instruments/:iid/archive',handle(req=>
  service.archiveDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid),archive.parse(req.body).revision)))
surveyBuilderRouter.post('/:pid/instruments/:iid/validate',handle(req=>
  service.validateDraftForPreview(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid))))

const simulation=z.object({
  rawScores:z.record(z.string(), z.number().finite()).optional(),
  answers:z.record(z.string(), z.union([
    z.string().max(2000),z.number().finite(),z.null(),
    z.object({_surveyRefusal:z.literal(true)}).strict(),
    z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)).max(6),
  ])).optional(),
}).strict().refine(value=>(value.answers!==undefined)!==(value.rawScores!==undefined))
surveyBuilderRouter.post('/:pid/instruments/:iid/preview',handle(req=>{
  const data=simulation.parse(req.body)
  if(Object.keys(data.answers??{}).length>240)throw new BulkImportError([{line:1,message:'预览作答超过题目数量上限'}])
  return service.simulateSurveyDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid),data.answers,data.rawScores)
}))
const formDryRun=z.object({answers:z.record(z.string(), z.unknown())}).strict()
surveyBuilderRouter.post('/:pid/instruments/:iid/form-dry-run',handle(req=>
  service.dryRunFormDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid),
    formDryRun.parse(req.body).answers)))
surveyBuilderRouter.post('/:pid/instruments/:iid/bulk-import/preview',handle(req=>
  service.previewSurveyImport(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid),bulkInputSchema.parse(req.body))))
const applyInput=z.object({
  revision:z.number().int().nonnegative(),digest:z.string().regex(/^[a-f0-9]{64}$/),
  batch:bulkInputSchema,
}).strict()
surveyBuilderRouter.post('/:pid/instruments/:iid/bulk-import/apply',handle(req=>
  service.applySurveyImport(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid),applyInput.parse(req.body))))

surveyBuilderRouter.get('/:pid/catalog',handle(req=>service.listResearcherCatalog(req.user!.userId,id.parse(req.params.pid),
  z.coerce.number().int().min(1).max(1000).default(1).parse(req.query.page),z.object(catalogDiscoveryQueryFields).parse(req.query))))
surveyBuilderRouter.post('/:pid/catalog/:gid/import',handle(req=>service.importCatalogDraft(req.user!.userId,
  id.parse(req.params.pid),id.parse(req.params.gid),copy.parse(req.body))))

surveyBuilderRouter.post('/:pid/instruments/:iid/measurement-release',handle(req=>
  publishSurveyMeasurementDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid),archive.parse(req.body).revision)))

surveyBuilderRouter.post('/:pid/instruments/:iid/revise',handle(req=>
  service.reviseDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid),archive.parse(req.body).revision)))

surveyBuilderRouter.get('/:pid/instruments/:iid/versions',handle(req=>
  service.listInstrumentVersions(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid))))
