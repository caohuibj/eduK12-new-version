import {Router,type Request,type Response} from 'express'
import {z} from 'zod'
import {asyncHandler} from '../../middleware/asyncHandler'
import {success} from '../../utils/response'
import {ContentReleaseError} from '../measurement-content/release'
import {ScaleLibraryError} from '../scale-library-governance/contracts'
import {EducationPrivateToolError,privateToolId,type PrivateToolContext} from './private-tool.contracts'
import {servePrivateScaleSharingImage} from './private-tool.sharing.media'
import * as service from './private-tool.sharing.service'

/** Parent owns matching product authentication, origin/CSRF and organization
 * context. Deliberately no review, grant, catalog mutation or entry status route. */
export function privateToolSharingRouter(context:(req:Request)=>PrivateToolContext){
 const router=Router({mergeParams:true})
 const tool=(req:Request)=>privateToolId.parse(req.params.toolId)
 const version=(req:Request)=>privateToolId.parse(req.params.versionId)
 const submission=(req:Request)=>privateToolId.parse(req.params.submissionId)
 const handle=(fn:(req:Request,res:Response)=>Promise<unknown>,media=false)=>asyncHandler(async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  try{const result=await fn(req,res);if(!media)return success(res,result)}
  catch(error){
   if(error instanceof z.ZodError)return res.status(400).json({code:'PRIVATE_TOOL_SHARING_INPUT_INVALID',message:'共享申请参数无效',data:null})
   if(error instanceof EducationPrivateToolError)return res.status(error.statusCode).json({code:error.code,message:error.code,data:null})
   if(error instanceof ScaleLibraryError)return res.status(error.statusCode).json({code:error.message,message:error.message,data:null})
   if(error instanceof ContentReleaseError)return res.status(409).json({code:error.code,message:error.code,data:null})
   const conflict=error as {code?:string;meta?:{code?:string}}
   if(conflict.code==='P2002'||conflict.meta?.code==='23505')return res.status(409).json({code:'PRIVATE_TOOL_SHARING_CONFLICT',message:'此精确版本已有待审申请或已批准入库',data:null})
   throw error
  }
 })
 router.get('/:toolId/sharing/submissions',handle(req=>service.listPrivateScaleSharing(context(req),tool(req))))
 router.post('/:toolId/versions/:versionId/sharing/prepare',handle(req=>service.preparePrivateScaleSharing(context(req),tool(req),version(req),req.body)))
 router.post('/:toolId/versions/:versionId/sharing/submissions',handle(req=>service.submitPrivateScaleSharing(context(req),tool(req),version(req),req.body)))
 router.get('/:toolId/sharing/submissions/:submissionId',handle(req=>service.readPrivateScaleSharing(context(req),tool(req),submission(req))))
 router.post('/:toolId/sharing/submissions/:submissionId/withdraw',handle(req=>service.withdrawPrivateScaleSharing(context(req),tool(req),submission(req),req.body)))
 router.get('/:toolId/versions/:versionId/sharing/media/:assetId/preview',handle(async(req,res)=>{
  const query=z.object({releaseId:privateToolId}).strict().parse(req.query)
  const manifest=await service.readPrivateScaleSharingMedia(context(req),tool(req),version(req),query.releaseId)
  return servePrivateScaleSharingImage(res,manifest,privateToolId.parse(req.params.assetId))
 },true))
 router.get('/:toolId/sharing/submissions/:submissionId/media/:assetId/preview',handle(async(req,res)=>{
  const detail=await service.readPrivateScaleSharing(context(req),tool(req),submission(req))
  return servePrivateScaleSharingImage(res,detail.mediaManifest,privateToolId.parse(req.params.assetId))
 },true))
 return router
}
