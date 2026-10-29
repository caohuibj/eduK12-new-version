import type {EducationExpertApplicability,EducationApplicability,GovernanceSubmission,GovernanceMediaManifest,GovernanceMediaConsent,SubmissionMetadata} from '../../api/scaleLibraryGovernance'
import {privateToolBase,type PrivateToolApi} from './privateToolClient'
export type PrivateSharingRow=GovernanceSubmission&{versionId:string;privateContentHash:string}
export type PrivateSharingPrepared={sourceId:string;versionId:string;privateContentHash:string;product:'SCHOOL'|'TEACHER';releaseId:string;contentHash:string;defaults:SubmissionMetadata;mediaManifest:GovernanceMediaManifest;canRequestLibraryShare:boolean}
export type PrivateSharingBody={contentHash:string;releaseId:string;requestId:string;metadata:SubmissionMetadata;dependencyReleaseIds:[];mediaConsent?:GovernanceMediaConsent;educationApplicability?:EducationApplicability;educationExpertApplicability?:EducationExpertApplicability}
export type PrivateSharingDetail=PrivateSharingRow&{snapshot:unknown;mediaManifest:GovernanceMediaManifest}
export const sharingManifestValid=(manifest:GovernanceMediaManifest)=>Boolean(manifest?.schemaVersion===1&&manifest.manifestHash&&Array.isArray(manifest.items)&&manifest.items.every(item=>item&&item.assetId&&item.contentHash&&typeof item.sizeBytes==='number'&&Array.isArray(item.usages)&&item.usages.every(usage=>typeof usage==='string')&&['image/png','image/jpeg','image/webp','video/mp4','video/webm','application/pdf'].includes(item.mimeType)))
export function createPrivateScaleSharingClient(api:PrivateToolApi,organizationId:string,toolId:string,entry:'SCHOOL'|'TEACHER'){
 const base=privateToolBase(organizationId)+'/'+encodeURIComponent(toolId)
 const version=(id:string)=>base+'/versions/'+encodeURIComponent(id)+'/sharing'
 const row=(value:PrivateSharingRow)=>{
  if(!value||value.sourceId!==toolId||value.product!==entry||!value.versionId||!value.privateContentHash||!value.releaseId||!value.metadata||!Object.values(value.metadata).every(item=>typeof item==='string')||!['SUBMITTED','WITHDRAWN','RETURNED','APPROVED'].includes(value.status))throw Error('申请身份与当前量表不一致，请重新读取。')
  return value
 }
 return {
  prepare:async(versionId:string,contentHash:string)=>{
   const data=await api<PrivateSharingPrepared>(version(versionId)+'/prepare','POST',{contentHash})
   if(!data||data.sourceId!==toolId||data.versionId!==versionId||data.privateContentHash!==contentHash||data.product!==entry||!data.releaseId||!data.contentHash||data.canRequestLibraryShare!==true||!sharingManifestValid(data.mediaManifest))throw Error('申请准备信息与固定版本不一致，已停止提交。')
   return data
  },
  submit:async(versionId:string,body:PrivateSharingBody)=>{
   const data=row(await api<PrivateSharingRow>(version(versionId)+'/submissions','POST',body))
   if(data.versionId!==versionId||data.privateContentHash!==body.contentHash||data.releaseId!==body.releaseId)throw Error('提交结果身份不一致，请读取申请记录核对。')
   return data
  },
  list:async()=>{
   const data=await api<{list:PrivateSharingRow[];hasMore:boolean}>(base+'/sharing/submissions')
   if(!Array.isArray(data.list)||typeof data.hasMore!=='boolean')throw Error('申请列表响应无效。')
   return {...data,list:data.list.map(row)}
  },
  detail:async(id:string)=>{
   const data=await api<PrivateSharingDetail>(base+'/sharing/submissions/'+encodeURIComponent(id))
   row(data);if(data.id!==id||!sharingManifestValid(data.mediaManifest))throw Error('申请详情与附件清单不一致。')
   return data
  },
  withdraw:async(id:string,expectedVersion:number,reason:string)=>{
   const data=row(await api<PrivateSharingRow>(base+'/sharing/submissions/'+encodeURIComponent(id)+'/withdraw','POST',{expectedVersion,reason}))
   if(data.id!==id)throw Error('撤回结果身份不一致，请重新读取申请记录核对。')
   return data
  },
  preview:async(context:{versionId:string;releaseId:string}|{submissionId:string},assetId:string,mimeType:string)=>{
   const path='submissionId' in context?base+'/sharing/submissions/'+encodeURIComponent(context.submissionId)+'/media/'+encodeURIComponent(assetId)+'/preview'
    :version(context.versionId)+'/media/'+encodeURIComponent(assetId)+'/preview?releaseId='+encodeURIComponent(context.releaseId)
   const blob=await api<Blob>(path,'GET',undefined,{responseType:'blob'})
   if(!(blob instanceof Blob)||blob.type!==mimeType||!['image/png','image/jpeg','image/webp','video/mp4','video/webm','application/pdf'].includes(blob.type))throw Error('服务器未返回该附件的有效素材预览。')
   return blob
  },
 }
}
