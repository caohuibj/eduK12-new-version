import apiClient from './client'
import { createPublicCapabilityClient } from './publicCapabilityClient'
import type { ApiResponse } from '../types'
const data=<T>(response:ApiResponse<T>):T=>{if(response.code!==0 || !response.data)throw new Error(response.message || '研究访问失败');return response.data}
export interface Study {id:string;title:string;status:string}
export interface StudyWave {id:string;title:string;ordinal:number;attemptId:string|null;state:string|null;completedAt:string|null;accepting:boolean}
export interface StudyHome {studyId:string;title:string;displayCode:string;waves:StudyWave[];limitations:string[]}
export interface WaveStatistics {id:string;title:string;ordinal:number;tokenId:string;participants:number;completedParticipants:number;attempts:number;completedAttempts:number;abandonedAttempts:number;researchEligibleParticipants?:number;researchWithdrawnParticipants?:number;researchUnknownParticipants?:number}
export type ResearchDataCategory='FORM'|'SCALE'|'COGNITIVE'|'SJT'
export interface ResearchConsentScope {purpose:string;dataCategories:ResearchDataCategory[];waveCoverage:'EXISTING_AND_FUTURE'}
export interface ResearchConsentVersion {id:string;studyId:string;version:number;body:string;bodyHash:string;publishedAt:string;scope:ResearchConsentScope;scopeId:string;scopeHash:string}
export interface ResearchParticipation {
  version:ResearchConsentVersion|null
  acceptedVersion:ResearchConsentVersion|null
  acceptance:{id:string;versionId:string;bodyHash:string;acceptedAt:string}|null
  state:'UNKNOWN'|'CONSENTED'|'WITHDRAWAL_PENDING'|'EXCLUDED'
  revision:number
  eligible:boolean
  reason:string|null
}
export interface PublishResearchConsent {requestId:string;expectedVersionId:string|null;body:string;scope:Pick<ResearchConsentScope,'purpose'|'dataCategories'>}
export interface AcceptResearchConsent {requestId:string;versionId:string;bodyHash:string}
export interface RequestResearchWithdrawal {requestId:string;expectedRevision:number}
export interface ResearchWithdrawal {participantId:string;displayCode:string;state:'WITHDRAWAL_PENDING'|'EXCLUDED';revision:number}
export interface ReviewResearchWithdrawal {requestId:string;expectedRevision:number;reason:string}
export const studyIdentityKey=(studyId:string)=>`anonymous-study:identity:${studyId}`
export const anonymousStudyApi={
  list:async()=>data(await apiClient.get<{list:Study[]}>('/anonymous-studies')),
  create:async(title:string)=>data(await apiClient.post<Study>('/anonymous-studies',{title})),
  addWave:async(studyId:string,compositeId:string,tokenId:string,title:string)=>data(await apiClient.post<{id:string;entryPath:string}>(`/anonymous-studies/${encodeURIComponent(studyId)}/waves`,{compositeId,tokenId,title})),
  createWave:async(studyId:string,input:{requestId:string;compositeId:string;title:string;expiresAt:string;maxUses:number})=>data(await apiClient.post<{id:string;tokenId:string;entryPath:string}>(`/anonymous-studies/${encodeURIComponent(studyId)}/waves/create-with-link`,input)),
  statistics:async(studyId:string)=>data(await apiClient.get<{list:WaveStatistics[];countMeaning:string}>(`/anonymous-studies/${encodeURIComponent(studyId)}/statistics`)),
  close:async(studyId:string)=>data(await apiClient.post(`/anonymous-studies/${encodeURIComponent(studyId)}/close`,{})),
  researchConsent:async(studyId:string)=>data(await apiClient.get<{version:ResearchConsentVersion|null}>(`/anonymous-studies/${encodeURIComponent(studyId)}/research-consent`)),
  publishResearchConsent:async(studyId:string,input:PublishResearchConsent)=>data(await apiClient.post<ResearchConsentVersion>(`/anonymous-studies/${encodeURIComponent(studyId)}/research-consent`,input)),
  researchWithdrawals:async(studyId:string,page=1)=>data(await apiClient.get<{list:ResearchWithdrawal[];page:number;pageSize:number}>(`/anonymous-studies/${encodeURIComponent(studyId)}/research-withdrawals?page=${page}`)),
  reviewResearchWithdrawal:async(studyId:string,participantId:string,input:ReviewResearchWithdrawal)=>data(await apiClient.post<{state:'EXCLUDED';revision:number}>(`/anonymous-studies/${encodeURIComponent(studyId)}/participants/${encodeURIComponent(participantId)}/research-withdrawal/review`,input)),
}
export function publicStudyApi(credential='') {
  const client=createPublicCapabilityClient(credential,{baseUrl:'/api/public/anonymous-studies'})
  return {
    info:async(waveId:string,token:string)=>data(await client.post<{id:string;studyId:string;studyTitle:string;title:string;accepting:boolean}>(`/waves/${encodeURIComponent(waveId)}/info`,{token})),
    join:async(waveId:string,token:string)=>data(await client.post<{studyId:string;credential:string;displayCode:string}>(`/waves/${encodeURIComponent(waveId)}/join`,{token,consent:true})),
    home:async(studyId:string)=>data(await client.get<StudyHome>(`/${encodeURIComponent(studyId)}`)),
    recover:async(studyId:string,waveId:string)=>data(await client.post<{attemptId:string;state:string;recoveryToken:string}>(`/${encodeURIComponent(studyId)}/waves/${encodeURIComponent(waveId)}/recover`,{})),
    start:async(studyId:string,waveId:string)=>data(await client.post<{attemptId:string;state:string;recoveryToken:string}>(`/${encodeURIComponent(studyId)}/waves/${encodeURIComponent(waveId)}/start`,{})),
    revoke:async(studyId:string)=>data(await client.post(`/${encodeURIComponent(studyId)}/revoke`,{})),
    researchConsent:async(studyId:string)=>data(await client.get<ResearchParticipation>(`/${encodeURIComponent(studyId)}/research-consent`)),
    acceptResearchConsent:async(studyId:string,input:AcceptResearchConsent)=>data(await client.post<ResearchParticipation>(`/${encodeURIComponent(studyId)}/research-consent/accept`,input)),
    requestResearchWithdrawal:async(studyId:string,input:RequestResearchWithdrawal)=>data(await client.post<ResearchParticipation>(`/${encodeURIComponent(studyId)}/research-withdrawal`,input)),
  }
}
