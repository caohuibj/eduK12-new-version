import {useCallback} from 'react'
import {GroupLongitudinalPanel} from '../modules/reporting/GroupLongitudinalPanel'
import type {SchoolApi} from './SchoolRecovery'
type Selection={kind:'ALL'}|{kind:'CLASSES'|'LABELS';ids:string[]}
/** Reuse the existing School group's selected published spec/subgroup.
 * Wire beside the chosen source in SchoolGroupReports at DOT's natural merge. */
export function SchoolPlanGroupLongitudinal({api,organizationId,runId,specId,selection={kind:'ALL'}}:{api:SchoolApi;organizationId:string;runId:string;specId:string;selection?:Selection}){
 const selected=JSON.stringify(selection.kind==='ALL'?selection:{...selection,ids:[...selection.ids].sort()})
 const request=useCallback(<T,>(path:string,method='GET',body?:unknown)=>{
  if(method==='POST'&&!specId)return Promise.reject(new Error('请先选择已有的已发布群体报告方案'))
  return api<T>(path,method,method==='POST'?{...(body as Record<string,unknown>),specId,selection:JSON.parse(selected)}:body)
 },[api,specId,selected])
 return <div>
  <p>沿用单轮群体报告的方案与分组；各轮遵守任务冻结的披露范围、发布延迟和小差集保护。历史报告显示其冻结人群，当前选择用于生成更新版。</p>
  <GroupLongitudinalPanel key={organizationId+':'+runId+':'+specId+':'+selected} base={'/reports/groups/plans/'+encodeURIComponent(organizationId)+'/'+encodeURIComponent(runId)} request={request}/>
 </div>
}
