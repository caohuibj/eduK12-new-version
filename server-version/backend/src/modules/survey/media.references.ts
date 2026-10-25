import {authorizedCatalogSjtMedia} from './catalog-sjt-media.authorization'
import {authorizedGovernedUnitMedia} from './governed-tool.media'
import {ownedScope} from './material-scope'
import {materialListSchema,materialLimits,stimulusMaterials,type AssessmentMaterial} from '../assessment-media/material'
import {authorizedLibraryUnitMedia,type LibraryBoundMediaUnit} from '../scale-library-governance/media.authorization'
import { rawScoreFeedbackImages } from '../scale/scale-image-retention'
import type { RawScoreFeedback } from '../scale/raw-score-feedback'
import type { AssessmentImagePresentationV1 } from '../assessment-media/assessment-image-presentation'
import { surveySjtScenes } from './sjt-structure'
import { Prisma } from '@prisma/client'
import { retainAssessmentAssetReferences } from '../assessment-media/assessment-asset'
import { ASSESSMENT_STATIC_IMAGE_MIME_TYPES } from '../assessment-media/assessment-image'
import type { SurveyKind,FormDraft,AnySjtDraft } from './builder.definition'

// Project/tool imports stay scoped. Independent library images are reusable only
// with the same ownerId and PRIVATE filters enforced by every caller.
export const assetScope=(scopeId:string,toolLibrary=false)=>({OR:[{scopeId},{references:{some:{entityType:toolLibrary?'SurveyToolTemplate':'SurveyProject',entityId:scopeId,field:'tool-library'}}},{references:{some:{entityType:'SurveyResearcherMedia',field:'library'}}}]})
type Tx=Prisma.TransactionClient
export const surveyMaxImageBytes=2*1024*1024
export const surveyMimeTypes=[...ASSESSMENT_STATIC_IMAGE_MIME_TYPES]
export class SurveyMediaError extends Error{
  constructor(readonly statusCode:number,message:string){super(message)}
}
const fail=(statusCode:number,message:string):never=>{throw new SurveyMediaError(statusCode,message)}
type ImageIdentity={asset:{assetId:string;contentHash:string;mimeType:string};altText:string;caption?:string;
  rightsStatus:'self_authored'|'authorized'|'unknown';rightsNote:string}
type UnitDef=LibraryBoundMediaUnit & {kind:SurveyKind}
export const surveyImageRefs=(units:readonly UnitDef[]):ImageIdentity[]=>units.flatMap(({kind,definition})=>{
  if(kind==='FORM'){
    const d=definition as FormDraft
    return (d.pages||[]).flatMap(p=>(p.questions||[]).map(q=>q.image).filter(Boolean)) as ImageIdentity[]
  }
  if(kind==='SJT'){
    const d=definition as AnySjtDraft
    return surveySjtScenes(d).flatMap(scene=>scene.image?[scene.image as ImageIdentity]:[])
  }
  return []
})

export async function assertSurveyMediaOwned(tx:Tx,userId:string,projectId:string,units:readonly UnitDef[],toolLibrary=false){
  const nativeUnits:UnitDef[]=[]
  const libraryRefs:Array<{assetId:string;contentHash:string;mimeType:string}>=[]
  for(const unit of units){
    const governed=await authorizedGovernedUnitMedia(tx,userId,unit)
    const sjt=governed===null?await authorizedCatalogSjtMedia(tx,userId,unit):null
    const authorized=governed??sjt??await authorizedLibraryUnitMedia(tx,userId,unit)
    if(authorized===null)nativeUnits.push(unit)
    else libraryRefs.push(...authorized)
  }
  const stimuli=surveyImageRefs(nativeUnits)
  const reportImages=nativeUnits.flatMap(unit=>unit.kind==='SCALE'
    ?rawScoreFeedbackImages((unit.definition as {rawScoreFeedback?:RawScoreFeedback}).rawScoreFeedback):[])
  const refs:Array<ImageIdentity|AssessmentImagePresentationV1>=[...stimuli,...reportImages]
  const ids=[...new Set(refs.map(r=>r.asset.assetId))]
  const materials=nativeUnits.flatMap(unit=>{
    if(!['FORM','SCALE'].includes(unit.kind))return []
    const d=unit.definition as {materials?:AssessmentMaterial[];rawScoreFeedback?:{rules:Array<{ranges:Array<{materials?:AssessmentMaterial[]}>;fallback?:{materials?:AssessmentMaterial[]}}>}}
    return [...stimulusMaterials(d),...(d.rawScoreFeedback?.rules.flatMap(rule=>[...rule.ranges,...(rule.fallback?[rule.fallback]:[])].flatMap(range=>range.materials??[]))??[])]
  })
  for(const material of materials){
    const checked=materialListSchema.parse([material])[0]
    if(checked.rightsStatus==='unknown'||!checked.rightsNote.trim())fail(403,'展示素材必须确认原创或授权依据')
  }
  const allIds=[...new Set([...ids,...materials.map(item=>item.asset.assetId)])]
  if(!allIds.length)return libraryRefs
  const allowed=await tx.$queryRaw<Array<{id:string}>>`SELECT a.id FROM stored_assets a WHERE a.id=ANY(${allIds}::text[]) AND ${ownedScope(userId)}`
  const allowedIds=allowed.map(row=>row.id)
  if(allIds.length>30)fail(400,'单次研究发布最多引用 30 个图片或展示素材')
  const assets=await tx.storedAsset.findMany({where:{id:{in:allowedIds},ownerId:userId,
    accessScope:'PRIVATE',deletedAt:null},select:{
    id:true,mimeType:true,sha256:true,sizeBytes:true,
  }})
  const byId=new Map(assets.map(a=>[a.id,a]))
  for(const image of refs){
    if(!image.altText?.trim())fail(400,'研究图片必须提供可阅读替代文字')
    if('rightsStatus' in image&&(!['self_authored','authorized'].includes(image.rightsStatus)||!image.rightsNote?.trim()))
      fail(403,'研究图片必须提供明确的原创或授权依据')
    const a=byId.get(image.asset.assetId)
    if(!a||a.sizeBytes<=0||a.sizeBytes>surveyMaxImageBytes
      ||a.sha256!==image.asset.contentHash||a.mimeType!==image.asset.mimeType
      ||!surveyMimeTypes.includes(a.mimeType as (typeof surveyMimeTypes)[number]))
      fail(403,'研究图片缺少本项目授权或与上传时的文件摘要不一致')
  }
  for(const material of materials){
    const a=byId.get(material.asset.assetId)
    if(!a||a.sha256!==material.asset.contentHash||a.mimeType!==material.asset.mimeType||a.sizeBytes<=0||a.sizeBytes>materialLimits[material.asset.mimeType])
      fail(403,'展示素材不存在、无权使用或与保存的文件摘要不一致')
  }
  return [...libraryRefs,...refs.map(r=>r.asset),...materials.map(r=>r.asset)]
}
export async function retainSurveyMedia(tx:Tx,userId:string,projectId:string,publicationId:string,
  units:readonly UnitDef[]){
  const refs=await assertSurveyMediaOwned(tx,userId,projectId,units)
  if(!refs.length)return
  await retainAssessmentAssetReferences({
    owner:{entityType:'SurveyResearchPublication',entityId:publicationId,field:'media'},
    references:refs,db:tx,
  })
}

