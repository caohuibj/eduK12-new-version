import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { authenticateSurvey } from '../../middleware/auth'
import { success, error } from '../../utils/response'
import { SurveyDraftError, surveyKindSchema, surveyKeySchema } from './builder.definition'
import * as service from './builder.service'
import { bulkInputSchema, BulkImportError } from './builder.import'

export const surveyBuilderRouter=Router()
surveyBuilderRouter.use(authenticateSurvey)
const id=z.string().uuid()
const create=z.object({
  requestId:id,kind:surveyKindSchema,instrumentKey:surveyKeySchema,
  title:z.string().trim().min(1).max(200),
}).strict()
const update=z.object({
  revision:z.number().int().nonnegative(),
  title:z.string().trim().min(1).max(200),
  definition:z.unknown(),
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
  answers:z.record(z.union([z.string().max(2000),z.number().finite()])),
}).strict()
surveyBuilderRouter.post('/:pid/instruments/:iid/preview',handle(req=>{
  const data=simulation.parse(req.body)
  if(Object.keys(data.answers).length>240)throw new BulkImportError([{line:1,message:'预览作答超过题目数量上限'}])
  return service.simulateSurveyDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid),data.answers)
}))
surveyBuilderRouter.post('/:pid/instruments/:iid/bulk-import/preview',handle(req=>
  service.previewSurveyImport(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid),bulkInputSchema.parse(req.body))))
const applyInput=z.object({
  revision:z.number().int().nonnegative(),digest:z.string().regex(/^[a-f0-9]{64}$/),
  batch:bulkInputSchema,
}).strict()
surveyBuilderRouter.post('/:pid/instruments/:iid/bulk-import/apply',handle(req=>
  service.applySurveyImport(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.iid),applyInput.parse(req.body))))
