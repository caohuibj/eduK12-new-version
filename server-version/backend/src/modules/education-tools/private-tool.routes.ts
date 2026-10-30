import {listEducationLibrarySources} from './library-source.catalog'
import {readEducationLibraryScalePreview} from './library-source.preview'
import {importPrivateForm} from './private-tool.form-import.service'
import {importPrivateToolCsv} from './private-tool.csv.service'
import {privateToolSharingRouter} from './private-tool.sharing.routes'
import {educationPrivateToolMediaRouter} from './private-tool.media.routes'
import {Router,type Request} from 'express'
import {z} from 'zod'
import {asyncHandler} from '../../middleware/asyncHandler'
import {success} from '../../utils/response'
import {FormAnswerValidationError} from '../assessment-core/form/answers'
import {ScaleAnswerValidationError} from '../scale/scale-scoring'
import type {EducationToolEntry} from './access'
import {EducationPrivateToolError,privateToolId,privateToolKind,type PrivateToolContext} from './private-tool.contracts'
import * as service from './private-tool.service'
import {listEducationPublicSources,educationPublicCatalogQuery} from './public-source.catalog'
import {readEducationPublicFormPreview,readEducationPublicStandardPreview} from './public-source.preview'
import {educationCompositionResponseModeSchema} from './private-tool.composition-contracts'
import {expertTargetKindSchema} from './expert-observation.contract'
import {readEducationNativePreview} from './native-source.preview'
import {educationCognitiveProfileSchema} from './native-source.contracts'
import {listEducationPackageSources} from './package-reference.catalog'
import {previewEducationWholePackage} from './package-reference.source'

const sourcePreviewQuery=z.object({contentHash:z.string().regex(/^[a-f0-9]{64}$/),responseMode:educationCompositionResponseModeSchema.optional(),targetKind:expertTargetKindSchema.optional()}).strict()

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
 router.use(privateToolSharingRouter(context))
 router.get('/',handle(req=>{
  const query=z.object({cursor:privateToolId.optional(),kind:privateToolKind.optional()}).strict().parse(req.query)
  return service.listPrivateTools(context(req),query.cursor,query.kind)
 }))
 router.post('/',handle(req=>service.createPrivateTool(context(req),req.body)))
 router.get('/package-sources',handle(req=>listEducationPackageSources(context(req),req.query)))
 router.post('/package-sources/preview',handle(req=>previewEducationWholePackage(context(req),req.body)))
 router.get('/library-sources',handle(req=>listEducationLibrarySources(context(req),req.query)))
 router.get('/library-sources/:versionId',handle(req=>{
  const query=sourcePreviewQuery.parse(req.query)
  return readEducationLibraryScalePreview(context(req),privateToolId.parse(req.params.versionId),query.contentHash,query.responseMode,query.targetKind)
 }))
 router.get('/public-sources',handle(req=>listEducationPublicSources(context(req),educationPublicCatalogQuery.parse(req.query))))
 router.get('/public-sources/native/:provider/:versionId',handle(req=>{
  const input=z.object({contentHash:z.string().regex(/^[a-f0-9]{64}$/),profile:educationCognitiveProfileSchema.optional(),artifactHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),responseMode:educationCompositionResponseModeSchema.optional()}).strict().parse(req.query)
  return readEducationNativePreview(context(req),{...input,provider:z.enum(['COGNITIVE_CONFIG','SJT_RELEASE']).parse(req.params.provider),versionId:privateToolId.parse(req.params.versionId)})
 }))
 router.get('/public-sources/form/:versionId',handle(req=>{
  const query=sourcePreviewQuery.parse(req.query)
  return readEducationPublicFormPreview(context(req),privateToolId.parse(req.params.versionId),query.contentHash,query.responseMode,query.targetKind)
 }))
 router.get('/public-sources/standard/:versionId',handle(req=>{
  const query=sourcePreviewQuery.parse(req.query)
  return readEducationPublicStandardPreview(context(req),privateToolId.parse(req.params.versionId),query.contentHash,query.responseMode,query.targetKind)
 }))
 router.get('/runtime-candidates',handle(req=>{
  const query=z.object({cursor:privateToolId.optional(),kind:z.enum(['SCALE','FORM']).default('SCALE')}).strict().parse(req.query)
  return (query.kind==='FORM'?service.listPrivateFormRuntimeCandidates:service.listPrivateScaleRuntimeCandidates)(context(req),query.cursor)
 }))
 router.get('/:toolId',handle(req=>service.readPrivateTool(context(req),toolId(req))))
 router.put('/:toolId',handle(req=>service.updatePrivateTool(context(req),toolId(req),req.body)))
 router.post('/:toolId/import/preview',handle(req=>importPrivateToolCsv(context(req),toolId(req),req.body)))
 router.post('/:toolId/import/apply',handle(req=>importPrivateToolCsv(context(req),toolId(req),req.body,true)))
 if(entry==='SCHOOL'){
  router.post('/:toolId/form-import/preview',handle(req=>importPrivateForm(context(req),toolId(req),req.body)))
  router.post('/:toolId/form-import/apply',handle(req=>importPrivateForm(context(req),toolId(req),req.body,true)))
 }
 router.post('/:toolId/validate',handle(req=>{z.object({}).strict().parse(req.body??{});return service.validatePrivateTool(context(req),toolId(req))}))
 router.post('/:toolId/preview',handle(req=>service.previewPrivateTool(context(req),toolId(req),req.body)))
 router.post('/:toolId/freeze',handle(req=>service.freezePrivateTool(context(req),toolId(req),req.body)))
 router.get('/:toolId/versions',handle(req=>service.listPrivateToolVersions(context(req),toolId(req),cursor(req))))
 router.get('/:toolId/versions/:versionId',handle(req=>service.readPrivateToolVersion(context(req),toolId(req),privateToolId.parse(req.params.versionId))))
 return router
}
