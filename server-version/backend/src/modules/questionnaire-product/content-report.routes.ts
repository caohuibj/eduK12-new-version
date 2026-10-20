import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {success,error} from '../../utils/response'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {ContentReleaseError} from '../measurement-content/release'
import {ReportTemplateBindingError} from '../measurement-content/report-template'
import * as reports from './content-report.service'
/** Mounted behind the existing authenticated Training teacher route. Services
 * recheck the actual business identity, course relation and exact capability. */
export const trainingContentReportsRouter=Router({mergeParams:true})
const uuid=z.string().uuid()
const context=(req:Request)=>({actorId:req.user!.userId,compositeId:uuid.parse(req.params.id),
 courseId:uuid.parse(req.params.courseId),grantId:uuid.parse(req.query.grantId)})
const handle=(run:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
 try{res.setHeader('Cache-Control','no-store');return success(res,await run(req))}
 catch(e){
  if(e instanceof z.ZodError||e instanceof ReportTemplateBindingError)return error(res,'报告输入不符合受控结构',-1,400)
  if(e instanceof ContentAuthorityError)return error(res,'当前报告内容权限无效',-1,403)
  if(e instanceof ContentReleaseError)return error(res,e.code,-1,409)
  const known=e as {statusCode?:number;message?:string}
  if(known.statusCode&&known.statusCode>=400&&known.statusCode<500)return error(res,known.message??'报告请求被拒绝',-1,known.statusCode)
  return next(e)
 }
}
trainingContentReportsRouter.get('/measurements',handle(req=>reports.listTrainingReportMeasurements(context(req))))
trainingContentReportsRouter.get('/',handle(req=>reports.listTrainingReportDrafts(context(req),z.coerce.number().int().min(1).max(1000).default(1).parse(req.query.page))))
trainingContentReportsRouter.post('/',handle(req=>reports.createTrainingReportDraft(context(req),req.body)))
trainingContentReportsRouter.get('/:draftId',handle(req=>reports.getTrainingReportDraft(context(req),uuid.parse(req.params.draftId))))
trainingContentReportsRouter.patch('/:draftId',handle(req=>reports.editTrainingReportDraft(context(req),uuid.parse(req.params.draftId),req.body)))
trainingContentReportsRouter.post('/:draftId/preview',handle(req=>reports.previewTrainingReportDraft(context(req),uuid.parse(req.params.draftId),
 z.object({scenario:z.enum(['INTERPRETABLE','NO_REFERENCE','INVALID'])}).strict().parse(req.body).scenario)))
trainingContentReportsRouter.post('/:draftId/publish',handle(req=>reports.publishTrainingReportDraft(context(req),uuid.parse(req.params.draftId),req.body)))
