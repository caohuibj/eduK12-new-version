import type {ReactNode} from 'react'
import {RefreshCw} from 'lucide-react'
import {SchoolProfessionalClassScope} from './SchoolProfessionalWorkspace'
import {schoolClassApprovalReasons} from './school-activity-workflow'

type Summary=NonNullable<Parameters<typeof schoolClassApprovalReasons>[0]>&{rosterVersion:number}
const statusLabels:Record<string,string>={DRAFT:'准备中',OPEN:'注册中',CLOSED:'注册已关闭',APPROVED:'已审批'}

// Presentation only: SchoolApp retains the original requests and approval guard.
export function SchoolProfessionalAdmission({children,classSelected,summary,working,approvalDisabled,onRefresh,onApprove}:{children:ReactNode;classSelected:boolean;summary:Summary|null;working:boolean;approvalDisabled:boolean;onRefresh:()=>void;onApprove:()=>void}){
 const reasons=schoolClassApprovalReasons(summary)
 return <div className="hs-professional-admission">
  <SchoolProfessionalClassScope admission>{children}</SchoolProfessionalClassScope>
  <section className="hs-panel hs-professional-admission-review" aria-label="班级注册进度与审批">
   <header><div><h2>注册进度</h2>{summary&&<span className="hs-admission-status">{statusLabels[summary.status]??'状态待确认'}</span>}</div>{classSelected&&<button type="button" className="hs-admission-refresh" disabled={working} onClick={onRefresh}><RefreshCw size={16} aria-hidden="true"/>刷新班级状态</button>}</header>
   {!classSelected?<p className="hs-admission-empty">请先选择班级，查看注册进度与审批状态。</p>:<>
    {summary?<dl className="hs-admission-metrics">{[['名册预期',summary.rosterExpectedCount],['当前资格',summary.eligibleCount],['已注册',summary.registeredCount],['待处理异常',summary.unresolvedIncidents]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>:<p className="hs-admission-empty">请先刷新班级状态。</p>}
    {summary&&summary.status!=='APPROVED'&&reasons.length>0&&<div className="hs-admission-reasons"><h3>审批条件待满足</h3><ul aria-label="班级审批待办">{reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></div>}
    <footer><button type="button" className="hs-primary" disabled={approvalDisabled} onClick={onApprove}>心理教师 · 确认整班身份审批</button>{summary&&<span className="hs-admission-version">名册版本 {summary.rosterVersion}</span>}</footer>
   </>}
  </section>
 </div>
}
