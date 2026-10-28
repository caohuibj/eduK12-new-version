import {Router,type Request,type Response} from 'express'
import {z} from 'zod'
import sharp from 'sharp'
import {boundedUpload,uploadPrincipalRateLimit} from '../../middleware/uploadAdmission'
import {asyncHandler} from '../../middleware/asyncHandler'
import {success} from '../../utils/response'
import {serveAssessmentMaterial} from '../assessment-media/material-delivery'
import {materialSchema} from '../assessment-media/material'
import {EducationPrivateToolError,privateToolId,type PrivateToolContext} from './private-tool.contracts'
import {privateToolImageMaxBytes,privateToolImageMimeTypes,privateToolMaterialMimeTypes} from './private-tool.media-definition'
import * as media from './private-tool.media'
import {readEducationPublicFormPreviewAsset,readEducationPublicStandardPreviewAsset} from './public-source.preview'

/** Parent owns product authentication; never mount on a generic asset router. */
export function educationPrivateToolMediaRouter(context:(req:Request)=>PrivateToolContext){
 const router=Router({mergeParams:true})
 const toolId=(req:Request)=>privateToolId.parse(req.params.toolId)
 const handle=async(res:Response,action:()=>Promise<unknown>)=>{
  res.setHeader('Cache-Control','private, no-store, max-age=0')
  res.setHeader('Referrer-Policy','no-referrer')
  try{return await action()}
  catch(error){
   if(error instanceof EducationPrivateToolError)return res.status(error.statusCode).json({code:error.code,message:error.code,data:null})
   if(error instanceof z.ZodError)return res.status(400).json({code:'PRIVATE_TOOL_INPUT_INVALID',message:'素材参数无效',data:null})
   throw error
  }
 }
 router.get('/public-sources/form/:versionId/assets/:assetId/content',asyncHandler((req,res)=>handle(res,async()=>{
  const query=z.object({contentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.query)
  const ref=await readEducationPublicFormPreviewAsset(context(req),privateToolId.parse(req.params.versionId),query.contentHash,privateToolId.parse(req.params.assetId))
  return serveAssessmentMaterial(ref,res)
 })))
 router.get('/public-sources/standard/:versionId/assets/:assetId/content',asyncHandler((req,res)=>handle(res,async()=>{
  const query=z.object({contentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.query)
  const ref=await readEducationPublicStandardPreviewAsset(context(req),privateToolId.parse(req.params.versionId),query.contentHash,privateToolId.parse(req.params.assetId))
  return serveAssessmentMaterial(ref,res)
 })))
 router.get('/:toolId/materials',asyncHandler((req,res)=>handle(res,async()=>success(res,await media.listPrivateToolMaterials(context(req),toolId(req),req.query)))))
 router.post('/:toolId/materials/register',asyncHandler((req,res)=>handle(res,async()=>success(res,await media.registerOwnedPrivateToolMaterial(context(req),toolId(req),req.body)))))
 router.post('/:toolId/materials',uploadPrincipalRateLimit,
  (req,res,next)=>{void handle(res,async()=>{await media.assertPrivateToolMediaAdmission(context(req),toolId(req));next()}).catch(next)},
  boundedUpload('material',50*1024*1024,privateToolMaterialMimeTypes,async(req,res)=>{
   await handle(res,async()=>{
    const file=req.file as (Express.Multer.File & {detectedMimeType:string})|undefined
    if(!file)throw new EducationPrivateToolError('PRIVATE_TOOL_MATERIAL_REQUIRED',400)
    if(file.detectedMimeType.startsWith('image/')&&((await sharp(file.buffer,{animated:true}).metadata()).pages??1)>1)
     throw new EducationPrivateToolError('PRIVATE_TOOL_STATIC_IMAGE_REQUIRED',400)
    return success(res,await media.uploadPrivateToolMaterial(context(req),toolId(req),file))
   })
  }))
 router.get('/:toolId/assets',asyncHandler((req,res)=>handle(res,async()=>success(res,await media.listPrivateToolImages(context(req),toolId(req))))))
 router.post('/:toolId/assets/images',uploadPrincipalRateLimit,
  (req,res,next)=>{void handle(res,async()=>{await media.assertPrivateToolMediaAdmission(context(req),toolId(req));next()}).catch(next)},
  boundedUpload('image',privateToolImageMaxBytes,privateToolImageMimeTypes,async(req,res)=>{
   await handle(res,async()=>{
    const file=req.file as (Express.Multer.File & {detectedMimeType:string})|undefined
    if(!file)throw new EducationPrivateToolError('PRIVATE_TOOL_IMAGE_REQUIRED',400)
    // boundedUpload already verified magic and fully decoded bounded pixels.
    // Reject animated PNG/WebP without decoding the image a second time.
    if(((await sharp(file.buffer,{animated:true}).metadata()).pages??1)>1)throw new EducationPrivateToolError('PRIVATE_TOOL_STATIC_IMAGE_REQUIRED',400)
    return success(res,await media.uploadPrivateToolImage(context(req),toolId(req),file))
   })
  }))
 router.get('/:toolId/assets/:assetId/content',asyncHandler((req,res)=>handle(res,async()=>{
  const reference=await media.readPrivateToolImage(context(req),toolId(req),privateToolId.parse(req.params.assetId))
  return serveAssessmentMaterial(materialSchema.shape.asset.parse(reference),res)
 })))
 return router
}
