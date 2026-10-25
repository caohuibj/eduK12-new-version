import api from './client'
export async function surveyManagementRequest<T>(scope:'survey-library'|'survey-system',path:string,body?:unknown):Promise<T>{
 const response=body===undefined?await api.get<T>(`/platform/${scope}${path}`):await api.post<T>(`/platform/${scope}${path}`,body)
 if(response.code!==0||response.data==null)throw new Error(response.message||'管理操作未完成')
 return response.data
}
export type SurveyToolPolicy={decision:'APPROVED'|'RETURNED'|'PENDING';paused:boolean;version:number;reason:string}
export type SurveyPolicyIdentity={resourceKey:string;fingerprint:string}
export type SurveyReadiness={ready:boolean;reasons:string[]}
