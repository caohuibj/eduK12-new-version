import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {success,error} from '../../utils/response'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {ContentReleaseError} from '../measurement-content/release'
import * as service from './reference-candidates.service'
const uuid=z.string().guid()
/** Mounted behind the existing authenticated Training teacher route. */
export const trainingReferencesRouter=Router({mergeParams:true})
const context=(req:Request)=>({actorId:req.user!.userId,courseId:uuid.parse(req.params.courseId),
 compositeId:uuid.parse(req.params.id),grantId:uuid.parse(req.query.grantId)})
const handle=(run:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
 try{res.setHeader('Cache-Control','no-store');return success(res,await run(req))}
 catch(e){
  if(e instanceof z.ZodError)return error(res,'参考候选输入不符合受控结构',-1,400)
  if(e instanceof ContentAuthorityError)return error(res,'当前参考能力或课程数据权限无效',-1,403)
  if(e instanceof ContentReleaseError)return error(res,e.code,-1,409)
  const known=e as {statusCode?:number;message?:string}
  if(known.statusCode&&known.statusCode>=400&&known.statusCode<500)return error(res,known.message??'参考请求被拒绝',-1,known.statusCode)
  return next(e)
 }
}
trainingReferencesRouter.post('/',handle(req=>service.createTrainingReferenceCandidate(context(req),service.trainingReferenceCreateSchema.parse(req.body))))
trainingReferencesRouter.post('/request-status/:operation',handle(req=>service.readTrainingReferenceRequest(context(req),z.enum(['CREATE','REVIEW','PUBLISH']).parse(req.params.operation),req.body)))
trainingReferencesRouter.get('/:candidateId',handle(req=>service.readTrainingReferenceCandidate(context(req),{candidateId:uuid.parse(req.params.candidateId)})))
trainingReferencesRouter.post('/:candidateId/review',handle(req=>service.reviewTrainingReferenceCandidate(context(req),
 {...service.trainingReferenceReviewSchema.omit({candidateId:true}).strict().parse(req.body),candidateId:uuid.parse(req.params.candidateId)})))
trainingReferencesRouter.post('/:candidateId/publish',handle(req=>service.publishTrainingReferenceCandidate(context(req),
 {...service.trainingReferencePublishSchema.omit({candidateId:true}).strict().parse(req.body),candidateId:uuid.parse(req.params.candidateId)})))
