import {useCallback} from 'react'
import {ParticipationSettings,type ParticipationSettingsInput,type ParticipationSettingsValue} from '../components/participation/ParticipationSettings'
type Transport=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
export function SurveyParticipationSettings({projectId,revision,request,onRevision}:{projectId:string;revision:number;request:Transport;onRevision:(revision:number)=>void}){
 const path='/projects/'+projectId+'/participation'
 const load=useCallback((page?:number)=>request<ParticipationSettingsValue>(path+(page?'?page='+page:'')),[request,path])
 const save=useCallback((input:ParticipationSettingsInput)=>request<ParticipationSettingsValue>(path,'PATCH',input),[request,path])
 const reset=useCallback((prefix:string)=>request<{resetCode:string;expiresAt:string}>(path+'/reset','POST',{prefix}),[request,path])
 return <ParticipationSettings key={projectId} scopeId={projectId} revision={revision} load={load} saveSettings={save} resetCode={reset} onRevision={onRevision}/>
}
