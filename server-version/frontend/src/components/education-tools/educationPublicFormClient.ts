import type {ImageAuthoringAdapter} from '../../modules/assessment-media/AssessmentImageField'
import type {PublicMaterial} from '../../modules/assessment-media/material'
import {privateToolBase,type PrivateToolApi} from './privateToolClient'

export type EducationPublicFormSummary={catalogKey:string;kind:'FORM';sourceProvider:'FORM';sourceId:string;contentHash:string;title:string;language:string|null;
 versions:{content:string;parameters:null;report:null};allowedActions:string[];canEditOriginal:false;canDistribute:false;unavailableReason?:string}
export const publicFormPreviewPath=(organizationId:string,versionId:string,contentHash:string)=>
 `${privateToolBase(organizationId)}/public-sources/form/${encodeURIComponent(versionId)}?contentHash=${encodeURIComponent(contentHash)}`
export function educationPublicFormPreviewMedia({api,organizationId,versionId,contentHash,entry,actorId}:{api:PrivateToolApi;organizationId:string;versionId:string;contentHash:string;entry:'SCHOOL'|'TEACHER';actorId:string}){
 const loadContent=async(asset:PublicMaterial['asset'])=>{
  const path=`${privateToolBase(organizationId)}/public-sources/form/${encodeURIComponent(versionId)}/assets/${encodeURIComponent(asset.assetId)}/content?contentHash=${encodeURIComponent(contentHash)}`
  const blob=await api<Blob>(path,'GET',undefined,{responseType:'blob'})
  if(!(blob instanceof Blob)||blob.type!==asset.mimeType||!blob.size)throw Error('固定公共版本的素材暂不可读取。')
  return blob
 }
 const imageAdapter:ImageAuthoringAdapter={scopeKey:JSON.stringify([entry,organizationId,actorId,'PUBLIC_FORM',versionId,contentHash]),
  async upload(){throw Error('公共原版仅供预览和引用。')},loadPreview:loadContent}
 return {loadContent,imageAdapter}
}
