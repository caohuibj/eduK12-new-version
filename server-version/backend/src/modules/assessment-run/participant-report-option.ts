import type {RunResourcePolicy} from './resourceAuthority'

type Track={resourcePolicy:RunResourcePolicy}
export const selfCompositionReportTracks=<T extends Track>(tracks:T[]):T[]=>tracks.filter(({resourcePolicy:policy})=>{
 const origin=policy.educationComposition?.origin
 return policy.runtimeLaunchTarget?.kind==='COMPOSITE'
  &&(origin?.entry==='SCHOOL'&&origin.variantKey==='STUDENT:SELF'
   ||origin?.entry==='TEACHER'&&origin.variantKey==='TEACHER:SELF')
})
export function hasConfiguredSelfCompositionReport(policy:RunResourcePolicy){
 const units=policy.educationComposition?.unitReports
 return !Array.isArray(units)||units.some(unit=>unit.respondent.mode==='INDIVIDUAL_SUMMARY')
}
/** Advisory UI option, using the same source-owned frozen policy gate as
 * publication. Direct/non-composition sources retain their existing behavior;
 * this never derives report rights from longitudinal metric choices. */
export function educationParticipantReportPublishOption(tracks:Track[]):{eligible:boolean;reason:string|null}{
 const candidates=selfCompositionReportTracks(tracks)
 return !candidates.length||candidates.some(track=>hasConfiguredSelfCompositionReport(track.resourcePolicy))
  ?{eligible:true,reason:null}
  :{eligible:false,reason:'当前测评所选工具均未配置受测者报告，仅用于数据采集，请使用仅回执模式发布'}
}
