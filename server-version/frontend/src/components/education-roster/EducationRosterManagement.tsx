import {useEffect,useRef,useState} from 'react'
import {EducationPersonnelDirectory} from './EducationPersonnelDirectory'
import {EducationRosterWorkbench} from './EducationRosterWorkbench'
import type {EducationRosterApi,RosterUnit} from './types'
import './education-roster.css'
type Props={api:EducationRosterApi;organizationId:string;units:RosterUnit[];onUnits:(units:RosterUnit[])=>void;disabled?:boolean;entry:'SCHOOL'|'TEACHER'}
export function EducationRosterManagement(props:Props){return <Management key={props.organizationId} {...props}/>}
function Management({api,organizationId,units,onUnits,disabled,entry}:Props){
 const [batchImport,setBatchImport]=useState(false)
 const [personnel,setPersonnel]=useState<boolean|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0),request=useRef(0)
 useEffect(()=>{const id=++request.current;let active=true;setPersonnel(null);setError('');void api<{structure:boolean;personnel:boolean;batchImport?:boolean}>(`/organizations/${organizationId}/roster-files/capabilities`).then(result=>{if(active&&id===request.current){setPersonnel(result.personnel);setBatchImport(!!result.batchImport)}}).catch(cause=>{if(active&&id===request.current)setError(cause instanceof Error?cause.message:'导入权限暂不可用。')});return()=>{active=false}},[api,organizationId,version])
 return <div className="education-roster" data-entry={entry}>
  {error&&<div role="alert"><p>{error}</p><button type="button" onClick={()=>setVersion(v=>v+1)}>重新读取导入权限</button></div>}
  {personnel===null&&!error&&<p role="status">正在核对导入权限…</p>}
  {personnel===true&&<EducationPersonnelDirectory api={api} organizationId={organizationId} units={units} onUnits={onUnits} disabled={disabled} entry={entry}/>}
  {personnel===false&&<><details><summary>年级与班级批量导入</summary><EducationRosterWorkbench batchImport={batchImport} api={api} organizationId={organizationId} units={units} onUnits={onUnits} disabled={disabled} initialKind="GRADE" personnel={false} entry={entry}/></details><p>当前仅有 Teacher 管理权限，可维护共用年级和班级。学生、教师名单须另有本校 School 人员管理授权；不会自动开通。</p></>}
 </div>
}
