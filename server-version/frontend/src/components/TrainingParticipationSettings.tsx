import {useCallback} from 'react'
import {anonymousStudyApi} from '../api/anonymousStudy'
import {ParticipationSettings,type ParticipationSettingsInput} from './participation/ParticipationSettings'

/** Training owns study permissions; the common editor never imports Survey authority. */
export function TrainingParticipationSettings({studyId}:{studyId:string}){
 const load=useCallback((page?:number)=>anonymousStudyApi.participation(studyId,page),[studyId])
 const save=useCallback((input:ParticipationSettingsInput)=>anonymousStudyApi.configureParticipation(studyId,input),[studyId])
 const reset=useCallback((prefix:string)=>anonymousStudyApi.resetParticipationCode(studyId,prefix),[studyId])
 return <ParticipationSettings key={studyId} scopeId={studyId} revision={0} load={load} saveSettings={save} resetCode={reset} training/>
}
