import {Router,type Request,type Response,type NextFunction} from 'express'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {success,error} from '../../utils/response'
import {serveAssessmentImageContent} from '../assessment-media/assessment-image-delivery'
import {assessmentStaticImageAssetIdentitySchema} from '../assessment-media/assessment-image'
import {assessmentVideoAssetIdentitySchema} from '../assessment-media/assessment-video'
import {assessmentMediaCapabilityInternals} from '../assessment-media/assessment-media-capability'
import {assertAssessmentAssetReferencesReady} from '../assessment-media/assessment-asset'
import {libraryActor,libraryCapabilities} from './authority'
import {submissionSource,validateLibraryDependencies} from './source'
import {assertLibraryUseGrantCurrent} from './usage'
import {readSubmission,loadEntry} from './service'
import {fail,ScaleLibraryError,type LegacyLibraryProduct} from './contracts'
import {assertLibraryMediaManifest,buildLibraryMediaManifest,assertLibraryMediaReady,type LibraryMediaManifest} from './media'

const id=z.string().guid()
const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>)=>async(req:Request,res:Response,next:NextFunction)=>{
  try {res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');await fn(req,res)}
  catch(e){if(e instanceof ScaleLibraryError)return error(res,e.message,-1,e.statusCode)
    if(e instanceof z.ZodError)return error(res,'媒体身份参数不合法',-1,400)
    next(e)}
}
/** Mount only behind the parent's authenticated product-domain router. No download,
 * redistribution, arbitrary asset-ID lookup, or anonymous catalog route is exposed. */
export function libraryMediaRouter(product:LegacyLibraryProduct){
  const router=Router()
  const manifestFor=async(req:Request,kind:'sources'|'submissions'|'entries',metadataOnly=false):Promise<LibraryMediaManifest>=>{
    const principal=req.user?.userId
    if(!principal)fail('未登录',401)
    const target=id.parse(req.params.id)
    if(kind==='submissions') {
      const submission=await readSubmission(principal,target)
      return assertLibraryMediaManifest(submission.snapshot.mediaManifest)
    }
    return prisma.$transaction(async tx=>{
      await libraryActor(tx,principal)
      if(kind==='sources'){
        const source=await submissionSource(tx,principal,product,id.parse(req.query.releaseId))
        if(source.sourceId!==target)fail('媒体不属于该精确版本',404)
        const dependencyIds=req.query.dependencyReleaseIds===undefined?[]:z.array(id).max(20).parse(z.string().parse(req.query.dependencyReleaseIds).split(','))
        const dependencies=await validateLibraryDependencies(tx,principal,source.release,dependencyIds)
        return buildLibraryMediaManifest(tx,principal,source.snapshot,source.release,dependencies)
      }
      const {entry,submission}=await loadEntry(tx,target)
      const manifest=assertLibraryMediaManifest(submission.snapshot.mediaManifest)
      await assertLibraryMediaReady(tx,target,manifest)
      const caps=await libraryCapabilities(tx,principal)
      const reviewer=caps.systemAdmin||caps.reviewGrants.some(g=>g.releaseIds.includes(entry.release_id))
      const distributor=caps.distributionGrants.some(g=>g.releaseIds.includes(entry.release_id))
      const [grant]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM scale_library_use_grants
        WHERE entry_id=${target} AND user_id=${principal} AND product=${product} AND status='ACTIVE' FOR SHARE`)
      if(submission.author_id!==principal&&!reviewer&&!grant&&!(metadataOnly&&distributor))fail('没有此量表绑定媒体的读取权限',403)
      if(grant&&submission.author_id!==principal&&!reviewer)await assertLibraryUseGrantCurrent(tx,{entryId:target,userId:principal,product})
      // Ordinary withdrawal leaves historical task endpoints intact, but does not
      // create a new free-standing gallery playback entitlement.
      if(entry.status!=='ACTIVE'&&submission.author_id!==principal&&!reviewer)fail('媒体条目不再接受新的预览',403)
      return manifest
    })
  }
  router.get('/entries/:id/media',wrap(async(req,res)=>{
    const manifest=await manifestFor(req,'entries',true)
    return success(res,{scope:'SCALE_BOUND',releaseIds:manifest.releaseIds,manifestHash:manifest.manifestHash,
      items:manifest.items,permissions:{browseMetadata:true,independentReuse:false,download:false,redistribute:false}})
  }))
  for(const kind of ['sources','submissions','entries'] as const){
    router.get(`/${kind}/:id/media/:assetId/preview`,wrap(async(req,res)=>{
      const manifest=await manifestFor(req,kind)
      const item=manifest.items.find(a=>a.assetId===id.parse(req.params.assetId))
      if(!item)fail('媒体不属于该精确版本',404)
      if(!item.mimeType.startsWith('image/'))fail('此媒体请使用受控视频播放入口',400)
      return serveAssessmentImageContent({reference:assessmentStaticImageAssetIdentitySchema.parse({assetId:item.assetId,contentHash:item.contentHash,mimeType:item.mimeType}),res})
    }))
    router.get(`/${kind}/:id/media/:assetId/capability`,wrap(async(req,res)=>{
      const manifest=await manifestFor(req,kind)
      const item=manifest.items.find(a=>a.assetId===id.parse(req.params.assetId))
      if(!item)fail('媒体不属于该精确版本',404)
      const identity={assetId:item.assetId,contentHash:item.contentHash,mimeType:item.mimeType}
      const mediaKind=item.mimeType==='text/vtt'?'caption':'video'
      if(mediaKind==='video')assessmentVideoAssetIdentitySchema.parse(identity)
      await assertAssessmentAssetReferencesReady([identity])
      // Existing signed native-media protocol includes exact immutable identity,
      // kind and scope; it never changes StoredAsset to PUBLIC or signs a COS URL.
      const capability=assessmentMediaCapabilityInternals.createAssessmentMediaCapability({
        scopeId:`scale-library:${kind}:${req.params.id}:${req.user!.userId}`,audience:'authenticated',
        kind:mediaKind,asset:identity,ttlSeconds:60,
      })
      return success(res,{url:capability.url,expiresAt:new Date(capability.expiresAt*1000).toISOString()})
    }))
  }
  return router
}
