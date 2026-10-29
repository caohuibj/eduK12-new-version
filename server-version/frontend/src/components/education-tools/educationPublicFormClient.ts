import type {ImageAuthoringAdapter} from '../../modules/assessment-media/AssessmentImageField'
import type {PublicMaterial} from '../../modules/assessment-media/material'
import {privateToolBase,type PrivateToolApi} from './privateToolClient'

export type EducationPublicSourceSummary={catalogKey:string;kind:'FORM'|'SCALE';sourceProvider:'FORM'|'STANDARD_SCALE'|'LIBRARY_SCALE';sourceId:string;contentHash:string;title:string;language:string|null;
 versions:{content:string;parameters:string|null;report:string|null};requiredContextKeys?:string[];referenceContextKeys?:string[];allowedActions:string[];canEditOriginal:false;canDistribute:false;unavailableReason?:string}
export type EducationPublicFormSummary=EducationPublicSourceSummary
export const publicStandardPreviewPath=(organizationId:string,versionId:string,contentHash:string)=>
 `${privateToolBase(organizationId)}/public-sources/standard/${encodeURIComponent(versionId)}?contentHash=${encodeURIComponent(contentHash)}`
export const publicFormPreviewPath=(organizationId:string,versionId:string,contentHash:string)=>
 `${privateToolBase(organizationId)}/public-sources/form/${encodeURIComponent(versionId)}?contentHash=${encodeURIComponent(contentHash)}`
export const libraryScalePreviewPath=(organizationId:string,versionId:string,contentHash:string)=>
 `${privateToolBase(organizationId)}/library-sources/${encodeURIComponent(versionId)}?contentHash=${encodeURIComponent(contentHash)}`
export function educationPublicFormPreviewMedia({api,organizationId,versionId,contentHash,entry,actorId,provider='PUBLIC_FORM'}:{api:PrivateToolApi;organizationId:string;versionId:string;contentHash:string;entry:'SCHOOL'|'TEACHER';actorId:string;provider?:'PUBLIC_FORM'|'STANDARD_SCALE'|'LIBRARY_SCALE'}){
 const loadContent=async(asset:PublicMaterial['asset'])=>{
  const sourcePath=provider==='LIBRARY_SCALE'?'library-sources':`public-sources/${provider==='STANDARD_SCALE'?'standard':'form'}`
  const path=`${privateToolBase(organizationId)}/${sourcePath}/${encodeURIComponent(versionId)}/assets/${encodeURIComponent(asset.assetId)}/content?contentHash=${encodeURIComponent(contentHash)}`
  const blob=await api<Blob>(path,'GET',undefined,{responseType:'blob'})
  if(!(blob instanceof Blob)||blob.type!==asset.mimeType||!blob.size)throw Error('固定公共版本的素材暂不可读取。')
  return blob
 }
 const imageAdapter:ImageAuthoringAdapter={scopeKey:JSON.stringify([entry,organizationId,actorId,provider,versionId,contentHash]),
  async upload(){throw Error('公共原版仅供预览和引用。')},loadPreview:loadContent}
 return {loadContent,imageAdapter}
}
