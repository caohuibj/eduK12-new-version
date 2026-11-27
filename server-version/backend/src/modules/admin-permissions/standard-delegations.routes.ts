import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {success,error} from '../../utils/response'
import {AdminPermissionError} from './service'
import {requireRecentAdminKey} from './guards'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {ContentReleaseError} from '../measurement-content/release'
import {readStandardDelegations,issueStandardDelegation,revokeStandardDelegation} from '../measurement-content/standard-delegations.service'
const handle=(work:(req:Request)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
 res.setHeader('Cache-Control','no-store')
 try{return success(res,await work(req))}
 catch(cause){
  if(cause instanceof z.ZodError)return error(res,'输入格式不合法',-1,400)
  if(cause instanceof AdminPermissionError)return error(res,cause.message,-1,cause.statusCode)
  if(cause instanceof ContentAuthorityError)return error(res,cause.code,-1,403)
  if(cause instanceof ContentReleaseError)return error(res,cause.code,-1,409)
  next(cause)
 }
}
/** Mounted after the existing authenticate/origin/system/limiter boundary. */
export const standardDelegationsRouter=Router()
standardDelegationsRouter.use(requireRecentAdminKey)
standardDelegationsRouter.get('/:releaseId',handle(req=>readStandardDelegations(req.user!.userId,req.user!,req.params.releaseId,req.query)))
standardDelegationsRouter.post('/:releaseId',handle(req=>issueStandardDelegation(req.user!.userId,req.user!,req.params.releaseId,req.body)))
standardDelegationsRouter.post('/:releaseId/:grantId/revoke',handle(req=>revokeStandardDelegation(req.user!.userId,req.user!,req.params.releaseId,req.params.grantId,req.body)))
