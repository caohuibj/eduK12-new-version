import { Prisma } from '@prisma/client'
import type { Request,Response,NextFunction } from 'express'
import { prisma } from '../../config/database'
import {
  boundedUpload,uploadPrincipalRateLimit,
} from '../../middleware/uploadAdmission'
import { authenticateSurvey } from '../../middleware/auth'
import { storeAsset } from '../../services/assetStorage'
import { serveAssessmentImageContent } from '../assessment-media/assessment-image-delivery'
import { Router } from 'express'
import { success,error } from '../../utils/response'
import { z } from 'zod'
import { surveyMimeTypes,surveyMaxImageBytes,SurveyMediaError } from './media.references'

type Tx=Prisma.TransactionClient
const limit=surveyMaxImageBytes
const types=surveyMimeTypes
const id=z.string().uuid()
const router=Router()
router.use(authenticateSurvey)
const handle=(fn:(req:Request,res:Response)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try{const result=await fn(req,res);if(!res.headersSent)success(res,result)}
  catch(e){
    if(e instanceof SurveyMediaError)error(res,e.message,-1,e.statusCode)
    else if(e instanceof z.ZodError)error(res,'素材参数不合法',-1,400)
    else next(e)
  }
}
async function owner(tx:Tx,userId:string,projectId:string){
  const rows=await tx.$queryRaw<Array<{id:string}>>`
    SELECT p.id FROM survey_projects p
      JOIN users u ON u.id=p.owner_user_id
      JOIN survey_researcher_grants g ON g.user_id=u.id
      JOIN survey_mfa_credentials m ON m.user_id=u.id
    WHERE p.id=${projectId} AND p.owner_user_id=${userId}
      AND p.status IN ('DRAFT','ACTIVE')
      AND u.account_domain='SURVEY' AND u.is_active=TRUE AND NOT u.is_frozen
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND g.status='ACTIVE' AND m.enabled=TRUE
    FOR SHARE OF p,u,g,m
  `
  if(!rows.length)fail(404,'研究素材库不可访问')
}
router.get('/:pid/assets',handle(async req=>{
  const pid=id.parse(req.params.pid),uid=req.user!.userId
  return prisma.$transaction(async tx=>{
    await owner(tx,uid,pid)
    const rows=await tx.storedAsset.findMany({where:{
      ownerId:uid,scopeId:pid,accessScope:'PRIVATE',mimeType:{in:types},
      deletedAt:null,sizeBytes:{lte:limit},
    },orderBy:[{createdAt:'desc'},{id:'desc'}],take:40,
    select:{id:true,sha256:true,mimeType:true,originalName:true,sizeBytes:true}})
    return {assets:rows.map(r=>({assetId:r.id,contentHash:r.sha256,
      mimeType:r.mimeType,originalName:r.originalName,sizeBytes:r.sizeBytes}))}
  })
}))
router.post('/:pid/assets',uploadPrincipalRateLimit,
  boundedUpload('image',limit,types,async(req,res)=>{
    const projectId=id.parse(req.params.pid),userId=req.user!.userId
    await prisma.$transaction(tx=>owner(tx,userId,projectId))
    const file=req.file
    if(!file||!file.buffer.length)return error(res,'请选择 PNG/JPEG/WebP 图片',-1,400)
    const stored=await storeAsset({
      buffer:file.buffer,originalName:file.originalname,
      mimeType:(file as typeof file & {detectedMimeType:string}).detectedMimeType,
      ownerId:userId,accessScope:'PRIVATE',scopeId:projectId,
      initialReference:{entityType:'SurveyProject',entityId:projectId,field:'image-library'},
    })
    return success(res,{assetId:stored.id,contentHash:stored.sha256,
      mimeType:stored.mimeType,originalName:stored.originalName,sizeBytes:stored.sizeBytes})
  }))
router.get('/:pid/assets/:assetId/preview',async(req,res,next)=>{
  try{
    const projectId=id.parse(req.params.pid),userId=req.user!.userId
    const asset=await prisma.$transaction(async tx=>{
      await owner(tx,userId,projectId)
      const item=await tx.storedAsset.findFirst({where:{id:id.parse(req.params.assetId),
        ownerId:userId,scopeId:projectId,accessScope:'PRIVATE',deletedAt:null,sizeBytes:{lte:limit}},
        select:{id:true,sha256:true,mimeType:true}})
      if(!item||!types.includes(item.mimeType as (typeof types)[number]))fail(404,'研究图片不可用')
      return item!
    })
    res.setHeader('Cache-Control','no-store')
    res.setHeader('Referrer-Policy','no-referrer')
    return await serveAssessmentImageContent({reference:{
      assetId:asset.id,contentHash:asset.sha256,mimeType:asset.mimeType as (typeof types)[number],
    },res})
  }catch(e){
    if(e instanceof SurveyMediaError)return error(res,e.message,-1,e.statusCode)
    next(e)
  }
})
export const surveyMediaRouter=router
