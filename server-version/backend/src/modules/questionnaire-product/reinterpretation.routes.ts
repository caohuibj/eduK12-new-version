import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {success,error} from '../../utils/response'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {ContentReleaseError} from '../measurement-content/release'
import {createTrainingReinterpretation,readTrainingReinterpretation,exportTrainingReinterpretation,trainingReinterpretationBodySchema} from './reinterpretation.service'
const uuid=z.string().uuid()
/** Mounted behind authenticate + requireTeacher. Current business identity and
 * exact course/FINAL capability are checked again inside every transaction. */
export const trainingReinterpretationsRouter=Router({mergeParams:true})
const context=(req:Request)=>({actorId:req.user!.userId,compositeId:uuid.parse(req.params.id),courseId:uuid.parse(req.params.courseId),
 attemptId:uuid.parse(req.params.attemptId),grantId:z.object({grantId:uuid}).strict().parse(req.query).grantId})
const handle=(run:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
 try{res.setHeader('Cache-Control','no-store');return success(res,await run(req))}
 catch(e){
  if(e instanceof z.ZodError)return error(res,'解释输入不符合受控结构',-1,400)
  if(e instanceof ContentAuthorityError)return error(res,'当前课程数据或解释权限无效',-1,403)
  if(e instanceof ContentReleaseError)return error(res,e.code,-1,409)
  return next(e)
 }
}
trainingReinterpretationsRouter.post('/',handle(req=>createTrainingReinterpretation(context(req),trainingReinterpretationBodySchema.parse(req.body))))
trainingReinterpretationsRouter.get('/:artifactId',handle(req=>readTrainingReinterpretation(context(req),uuid.parse(req.params.artifactId))))
trainingReinterpretationsRouter.get('/:artifactId/export',handle(req=>exportTrainingReinterpretation(context(req),uuid.parse(req.params.artifactId))))
