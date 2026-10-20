import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {authenticateSurvey} from '../../middleware/auth'
import {success,error} from '../../utils/response'
import {SurveyBuilderError} from './builder.service'
import {ContentReleaseError} from '../measurement-content/release'
import * as reports from './report-drafts.service'
export const surveyReportDraftsRouter=Router()
surveyReportDraftsRouter.use('/:pid/report-drafts',authenticateSurvey)
const id=z.string().uuid()
const handle=(run:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{res.setHeader('Cache-Control','no-store');return success(res,await run(req))}
  catch(e){if(e instanceof z.ZodError)return error(res,'报告输入不符合受控内容结构',-1,400)
    if(e instanceof SurveyBuilderError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof ContentReleaseError)return error(res,e.code,-1,409)
    next(e)}
}
surveyReportDraftsRouter.get('/:pid/report-drafts/measurements',handle(req=>reports.listSurveyReportMeasurements(req.user!.userId,id.parse(req.params.pid))))
surveyReportDraftsRouter.get('/:pid/report-drafts',handle(req=>reports.listSurveyReportDrafts(req.user!.userId,id.parse(req.params.pid),z.coerce.number().int().min(1).max(1000).default(1).parse(req.query.page))))
surveyReportDraftsRouter.post('/:pid/report-drafts',handle(req=>reports.createSurveyReportDraft(req.user!.userId,id.parse(req.params.pid),req.body)))
surveyReportDraftsRouter.get('/:pid/report-drafts/:rid',handle(req=>reports.getSurveyReportDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.rid))))
surveyReportDraftsRouter.patch('/:pid/report-drafts/:rid',handle(req=>reports.editSurveyReportDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.rid),req.body)))
surveyReportDraftsRouter.post('/:pid/report-drafts/:rid/preview',handle(req=>reports.previewSurveyReportDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.rid),z.object({scenario:z.enum(['INTERPRETABLE','NO_REFERENCE','INVALID'])}).strict().parse(req.body).scenario)))
surveyReportDraftsRouter.post('/:pid/report-drafts/:rid/publish',handle(req=>reports.publishSurveyReportDraft(req.user!.userId,id.parse(req.params.pid),id.parse(req.params.rid),req.body)))
