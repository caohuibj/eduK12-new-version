import apiClient from './client'
import { createPublicCapabilityClient } from './publicCapabilityClient'
import type { ApiResponse } from '../types'
const data=<T>(response:ApiResponse<T>):T=>{if(response.code!==0 || !response.data)throw new Error(response.message || '研究访问失败');return response.data}
export interface Study {id:string;title:string;status:string}
export interface StudyWave {id:string;title:string;ordinal:number;attemptId:string|null;state:string|null;completedAt:string|null;accepting:boolean}
export interface StudyHome {studyId:string;title:string;displayCode:string;waves:StudyWave[];limitations:string[]}
export interface WaveStatistics {id:string;title:string;ordinal:number;tokenId:string;participants:number;completedParticipants:number;attempts:number;completedAttempts:number;abandonedAttempts:number}
export const studyIdentityKey=(studyId:string)=>`anonymous-study:identity:${studyId}`
export const anonymousStudyApi={
  list:async()=>data(await apiClient.get<{list:Study[]}>('/anonymous-studies')),
  create:async(title:string)=>data(await apiClient.post<Study>('/anonymous-studies',{title})),
  addWave:async(studyId:string,compositeId:string,tokenId:string,title:string)=>data(await apiClient.post<{id:string;entryPath:string}>(`/anonymous-studies/${encodeURIComponent(studyId)}/waves`,{compositeId,tokenId,title})),
  statistics:async(studyId:string)=>data(await apiClient.get<{list:WaveStatistics[];countMeaning:string}>(`/anonymous-studies/${encodeURIComponent(studyId)}/statistics`)),
  close:async(studyId:string)=>data(await apiClient.post(`/anonymous-studies/${encodeURIComponent(studyId)}/close`,{})),
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
  }
}
