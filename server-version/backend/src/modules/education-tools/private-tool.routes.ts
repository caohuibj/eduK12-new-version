import {educationPrivateToolMediaRouter} from './private-tool.media.routes'
import {Router,type Request} from 'express'
import {z} from 'zod'
import {asyncHandler} from '../../middleware/asyncHandler'
import {success} from '../../utils/response'
import {FormAnswerValidationError} from '../assessment-core/form/answers'
import {ScaleAnswerValidationError} from '../scale/scale-scoring'
import type {EducationToolEntry} from './access'
import {EducationPrivateToolError,privateToolId,type PrivateToolContext} from './private-tool.contracts'
import * as service from './private-tool.service'

/** Mounted under the matching product authentication middleware only. */
export function educationPrivateToolRouter(entry:EducationToolEntry){
 const router=Router({mergeParams:true})
 const context=(req:Request):PrivateToolContext=>{
  if(!req.user)throw new EducationPrivateToolError('UNAUTHENTICATED',401)
  return {principal:req.user,entry,organizationId:privateToolId.parse(req.params.organizationId)}
 }
 const cursor=(req:Request)=>z.object({cursor:privateToolId.optional()}).strict().parse(req.query).cursor
 const toolId=(req:Request)=>privateToolId.parse(req.params.toolId)
 const handle=(fn:(req:Request)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  try{return success(res,await fn(req))}
  catch(error){
   if(error instanceof z.ZodError)return res.status(400).json({code:'PRIVATE_TOOL_INPUT_INVALID',message:'私有工具参数无效',data:null})
   if(error instanceof EducationPrivateToolError)return res.status(error.statusCode).json({code:error.code,message:error.code,data:{issues:error.issues}})
   if(error instanceof ScaleAnswerValidationError)return res.status(400).json({code:'PRIVATE_TOOL_PREVIEW_INPUT_INVALID',message:'预览回答无效',data:{issues:error.issues}})
   if(error instanceof FormAnswerValidationError)return res.status(400).json({code:'PRIVATE_TOOL_PREVIEW_INPUT_INVALID',message:'预览回答无效',data:{path:error.path}})
   throw error
  }
 })
 router.use(educationPrivateToolMediaRouter(context))
 router.get('/',handle(req=>service.listPrivateTools(context(req),cursor(req))))
 router.post('/',handle(req=>service.createPrivateTool(context(req),req.body)))
 router.get('/runtime-candidates',handle(req=>service.listPrivateScaleRuntimeCandidates(context(req),cursor(req))))
 router.get('/:toolId',handle(req=>service.readPrivateTool(context(req),toolId(req))))
 router.put('/:toolId',handle(req=>service.updatePrivateTool(context(req),toolId(req),req.body)))
 router.post('/:toolId/validate',handle(req=>{z.object({}).strict().parse(req.body??{});return service.validatePrivateTool(context(req),toolId(req))}))
 router.post('/:toolId/preview',handle(req=>service.previewPrivateTool(context(req),toolId(req),req.body)))
 router.post('/:toolId/freeze',handle(req=>service.freezePrivateTool(context(req),toolId(req),req.body)))
 router.get('/:toolId/versions',handle(req=>service.listPrivateToolVersions(context(req),toolId(req),cursor(req))))
 router.get('/:toolId/versions/:versionId',handle(req=>service.readPrivateToolVersion(context(req),toolId(req),privateToolId.parse(req.params.versionId))))
 return router
}
