import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {authenticate} from '../../middleware/auth'
import {requireRecentAdminKey} from '../admin-permissions/guards'
import {AdminPermissionError} from '../admin-permissions/service'
import {CognitiveServiceError} from './cognitive.errors'
import {previewCognitiveProfileApproval,approveCognitiveProfile} from '../assessment-authorization/cognitive-profile-approval'
import {success,error} from '../../utils/response'
export const cognitiveProfileConfigurationsRouter=Router()
cognitiveProfileConfigurationsRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()},authenticate)
const handle=(work:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
 try{return success(res,await work(req))}catch(caught){
  if(caught instanceof z.ZodError)return error(res,'请求参数不合法',-1,400)
  if(caught instanceof AdminPermissionError||caught instanceof CognitiveServiceError)return error(res,caught.message,-1,caught.statusCode)
  next(caught)
 }
}
cognitiveProfileConfigurationsRouter.get('/system/:configId/:profile',handle(req=>previewCognitiveProfileApproval(req.user!.userId,req.params.configId,req.params.profile)))
cognitiveProfileConfigurationsRouter.post('/system/:configId/:profile/approve',requireRecentAdminKey,
 handle(req=>approveCognitiveProfile(req.user!.userId,req.params.configId,req.params.profile,req.body,req.user!)))
