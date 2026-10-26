import {useRef,useState} from 'react'
import {EducationPersonnelImport} from './EducationPersonnelImport'
import {EducationStructureImport} from './EducationStructureImport'
import type {EducationRosterApi,RosterKind,RosterUnit} from './types'
import {rosterLabels} from './preparation'
import './education-roster.css'
type Props={api:EducationRosterApi;organizationId:string;units:RosterUnit[];onUnits?:(units:RosterUnit[])=>void;onChanged?:()=>void;disabled?:boolean;initialKind?:RosterKind;personnel?:boolean;entry?:'SCHOOL'|'TEACHER'}
export function EducationRosterWorkbench(props:Props){return <Workbench key={props.organizationId} {...props}/>}
function Workbench({api,organizationId,units,onUnits,onChanged,disabled,initialKind='STUDENT',personnel=true,entry='SCHOOL'}:Props){
 const first=personnel?initialKind:initialKind==='CLASS'?'CLASS':'GRADE'
 const [kind,setKind]=useState<RosterKind>(first),[visited,setVisited]=useState<RosterKind[]>([first]),[busy,setBusy]=useState(false)
 const [currentUnits,setUnits]=useState(units),previousUnits=useRef(units)
 // New structure from the host wins; local writes also update the host via its adapter.
 if(previousUnits.current!==units){previousUnits.current=units;setUnits(units)}
 const changeUnits=(values:RosterUnit[])=>{setUnits(values);onUnits?.(values)}
 return <div className="education-roster er-workbench" data-entry={entry} aria-label="统一批量导入">
  <div className="er-workbench-heading"><label className="hs-field"><span>导入内容</span><select value={kind} disabled={busy||disabled} onChange={e=>{const next=e.target.value as RosterKind;setKind(next);setVisited(old=>old.includes(next)?old:[...old,next])}}>{(Object.keys(rosterLabels) as RosterKind[]).filter(k=>personnel||k==='GRADE'||k==='CLASS').map(k=><option key={k} value={k}>{rosterLabels[k]}</option>)}</select></label><span>准备名单 → 核对预览 → 确认新增</span></div>
  {visited.map(k=><div key={k} hidden={kind!==k} className="er-pane">{k==='GRADE'||k==='CLASS'?<EducationStructureImport api={api} organizationId={organizationId} units={currentUnits} onUnits={changeUnits} onBusy={setBusy} disabled={!!disabled} fixedKind={k} embedded/>:<EducationPersonnelImport api={api} organizationId={organizationId} mode="import" fixedKind={k} embedded onBusy={setBusy} disabled={disabled} onChanged={onChanged}/>}</div>)}
  <details className="er-rules"><summary>导入与账号规则</summary><p>只新增，不覆盖、不删除。请先准备年级和班级，再导入人员与任教关系。名单导入不会直接创建账号；本人激活、班级审批、产品授权和报告权限继续分别处理。</p><p>结构逐条保存，失败即停止；人员按当前批次校验和保存。每批最多 100 行，暂不自动分批。</p></details>
 </div>
}
