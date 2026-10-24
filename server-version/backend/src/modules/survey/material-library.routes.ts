import {serveSurveyMaterial} from './material.delivery'
import {Router,type Request,type Response,type NextFunction} from 'express'
import {z} from 'zod'
import {authenticateSurvey} from '../../middleware/auth'
import {boundedUpload,uploadPrincipalRateLimit} from '../../middleware/uploadAdmission'
import {prisma} from '../../config/database'
import {storeAsset} from '../../services/assetStorage'
import {success,error} from '../../utils/response'
import {authorizeToolOwner} from './tool-library.service'
import {SurveyBuilderError} from './builder.service'
import {SurveyMediaError} from './media.references'
import {ScaleLibraryError} from '../scale-library-governance/contracts'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {listSurveyMaterials,ownSurveyMaterial,renameSurveyMaterial,materialKinds,materialQuery} from './material-library.service'
export const surveyMaterialLibraryRouter=Router()
surveyMaterialLibraryRouter.use(authenticateSurvey,(_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');next()})
const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>,pass=false)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{const result=await fn(req,res);if(pass){next();return}if(result!==res&&!res.headersSent)success(res,result)}catch(cause){
    if(cause instanceof z.ZodError)return error(res,'素材参数不合法',-1,400)
    if(cause instanceof SurveyBuilderError||cause instanceof SurveyMediaError||cause instanceof ScaleLibraryError)return error(res,cause.message,-1,cause.statusCode)
    if(cause instanceof ContentAuthorityError)return error(res,'素材授权已失效，请联系管理员',-1,403)
    next(cause)
  }
}
const id=z.string().uuid()
surveyMaterialLibraryRouter.get('/',wrap(req=>listSurveyMaterials(req.user!.userId,materialQuery.parse(req.query))))
surveyMaterialLibraryRouter.patch('/:id/name',wrap(req=>renameSurveyMaterial(req.user!.userId,id.parse(req.params.id),z.object({name:z.string().trim().min(1).max(160).refine(value=>!/[\\/\0]/.test(value))}).strict().parse(req.body).name)))
surveyMaterialLibraryRouter.get('/:id/content',wrap(async(req,res)=>{
  const asset=await prisma.$transaction(tx=>ownSurveyMaterial(tx,req.user!.userId,id.parse(req.params.id)))
  return serveSurveyMaterial({assetId:asset.id,contentHash:asset.sha256,mimeType:asset.mimeType as keyof typeof import('../assessment-media/material').materialLimits},res)
}))
for(const [kind,policy] of Object.entries(materialKinds)){
  surveyMaterialLibraryRouter.post('/upload/'+kind,uploadPrincipalRateLimit,
    // Verify the live researcher before accepting the multipart body.
    wrap(async req=>{await prisma.$transaction(tx=>authorizeToolOwner(tx,req.user!.userId))},true),
    boundedUpload('file',policy.maxBytes,[...policy.types],async(req,res,next)=>{
      try{
        if(!req.file?.buffer.length)return error(res,'请选择要上传的素材',-1,400)
        await prisma.$transaction(tx=>authorizeToolOwner(tx,req.user!.userId))
        const asset=await storeAsset({buffer:req.file.buffer,originalName:req.file.originalname.slice(0,160),mimeType:(req.file as Express.Multer.File&{detectedMimeType:string}).detectedMimeType,
          ownerId:req.user!.userId,accessScope:'PRIVATE',scopeId:'survey-library:'+req.user!.userId,
          initialReference:{entityType:'SurveyResearcherMedia',entityId:req.user!.userId,field:'library'}})
        return success(res,{id:asset.id,name:asset.originalName})
      }catch(cause){next(cause)}
    }))
}
