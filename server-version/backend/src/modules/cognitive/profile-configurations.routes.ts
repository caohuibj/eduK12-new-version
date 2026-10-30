import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {authenticate} from '../../middleware/auth'
import {requireRecentAdminKey} from '../admin-permissions/guards'
import {AdminPermissionError} from '../admin-permissions/service'
import {CognitiveServiceError} from './cognitive.errors'
import {previewCognitiveProfileApproval,approveCognitiveProfile} from '../assessment-authorization/cognitive-profile-approval'
import {success,error} from '../../utils/response'
import {grantTrainingCognitiveProfileUse,revokeTrainingCognitiveProfileUse,readTrainingCognitiveProfileOperation,listTrainingCognitiveProfileConfigurations,listTrainingCognitiveProfileUses,previewTrainingCognitiveProfile} from '../assessment-authorization/training-cognitive-profile-use'
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
cognitiveProfileConfigurationsRouter.post('/training/:configId/:profile/use-grants',requireRecentAdminKey,
 handle(req=>grantTrainingCognitiveProfileUse(req.user!.userId,req.params.configId,req.params.profile,req.body)))
cognitiveProfileConfigurationsRouter.post('/training/:configId/use-grants/:grantId/revoke',requireRecentAdminKey,
 handle(req=>revokeTrainingCognitiveProfileUse(req.user!.userId,req.params.configId,req.params.grantId,req.body)))
cognitiveProfileConfigurationsRouter.get('/training/:configId/use-requests/:requestId',
 handle(req=>readTrainingCognitiveProfileOperation(req.user!.userId,req.params.configId,req.params.requestId)))
cognitiveProfileConfigurationsRouter.get('/training/catalog',handle(req=>listTrainingCognitiveProfileConfigurations(req.user!.userId,req.query)))
cognitiveProfileConfigurationsRouter.get('/training/:configId/use-grants',handle(req=>listTrainingCognitiveProfileUses(req.user!.userId,req.params.configId,req.query)))
cognitiveProfileConfigurationsRouter.get('/training/:configId/:profile/preview',handle(req=>previewTrainingCognitiveProfile(req.user!.userId,req.params.configId,req.params.profile,req.query)))
