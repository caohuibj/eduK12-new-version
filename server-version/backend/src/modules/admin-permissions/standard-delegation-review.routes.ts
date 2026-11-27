import {Router,type NextFunction,type Request,type Response} from 'express'
import {ZodError} from 'zod'
import {error,success} from '../../utils/response'
import {requireRecentAdminKey} from './guards'
import {AdminPermissionError} from './service'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {ContentReleaseError} from '../measurement-content/release'
import {ScaleLibraryError} from '../scale-library-governance/contracts'
import {issueStandardDelegationSuccessor,listStandardDelegationReview,readStandardDelegationReview,
 withdrawStandardDelegationReview} from '../measurement-content/standard-delegation-review'

const handle=(action:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
 res.setHeader('Cache-Control','no-store')
 try{return success(res,await action(req))}
 catch(cause){
  if(cause instanceof ZodError)return error(res,'委托查看或交接参数无效',-1,400)
  if(cause instanceof AdminPermissionError||cause instanceof ScaleLibraryError)return error(res,cause.message,-1,cause.statusCode)
  if(cause instanceof ContentAuthorityError)return error(res,cause.code,-1,403)
  if(cause instanceof ContentReleaseError)return error(res,cause.code,-1,409)
  next(cause)
 }
}
export const standardDelegationReviewRouter=Router()
standardDelegationReviewRouter.use(requireRecentAdminKey)
const account='/accounts/:accountId'
const grant=account+'/grants/:grantId'
standardDelegationReviewRouter.get(account,handle(req=>listStandardDelegationReview(req.user!.userId,req.user!,req.params.accountId,req.query)))
standardDelegationReviewRouter.get(grant,handle(req=>readStandardDelegationReview(req.user!.userId,req.user!,req.params.accountId,req.params.grantId,req.query)))
standardDelegationReviewRouter.post(grant+'/successor',handle(req=>issueStandardDelegationSuccessor(req.user!.userId,req.user!,req.params.accountId,req.params.grantId,req.body)))
standardDelegationReviewRouter.post(grant+'/revoke',handle(req=>withdrawStandardDelegationReview(req.user!.userId,req.user!,req.params.accountId,req.params.grantId,req.body)))
