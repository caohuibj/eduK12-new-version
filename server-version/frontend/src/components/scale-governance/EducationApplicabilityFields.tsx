import {useEffect,useState} from 'react'
import type {EducationApplicability,EducationExpertApplicability} from '../../api/scaleLibraryGovernance'
type Administration=EducationApplicability['administrations'][number]
type Row={population:Administration['population']|'';responseMode:Administration['responseMode']|''}
const modes={STUDENT:[['SELF','学生自评'],['PARENT_REPORT','家长评学生'],['TEACHER_REPORT','教师评学生']],TEACHER:[['SELF','教师自评'],['STUDENT_REPORT','学生评教师']]} as const
export function useEducationApplicabilityDraft(scope:string){
 const [draft,setDraft]=useState<{scope:string;rows:Row[]}>({scope,rows:[]})
 const rows=draft.scope===scope?draft.rows:[]
 useEffect(()=>{setDraft({scope,rows:[]})},[scope])
 const valid=rows.length<=5&&rows.every(row=>row.population&&modes[row.population].some(([mode])=>mode===row.responseMode))&&new Set(rows.map(row=>`${row.population}:${row.responseMode}`)).size===rows.length
 useEffect(()=>{if(!rows.length)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[rows.length])
 return {rows,valid,value:rows.length&&valid?{schemaVersion:1 as const,administrations:[...rows as Administration[]].sort((a,b)=>`${a.population}:${a.responseMode}`.localeCompare(`${b.population}:${b.responseMode}`))}:undefined,setRows:(next:Row[])=>setDraft({scope,rows:next}),clear:()=>setDraft({scope,rows:[]}),confirmDiscard:()=>!rows.length||window.confirm('切换精确版本将清空尚未提交的适用方式，是否继续？')}
}
export function EducationApplicabilityFields({rows,onChange,disabled=false,valid,product}:{rows:Row[];onChange:(rows:Row[])=>void;disabled?:boolean;valid:boolean;product:'TRAINING'|'SURVEY'|'SCHOOL'|'TEACHER'}){
 return <fieldset disabled={disabled} className={product==='SCHOOL'?'hs-task-detail':product==='TEACHER'?'ht-task':product==='SURVEY'?'rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-3':'border rounded p-3 space-y-3'}>
  <legend>本次版本适用方式</legend><p>可选填写，每行是一种明确组合，不会自动组合。未声明学校/教师适用方式不影响原 Training / Survey 使用；School / Teacher 投放需要声明并另行通过授权与任务校验。此声明不授予报告读取权。</p>
  {rows.map((row,index)=><div key={index} className="space-y-2">
   <label>适用人群 {index+1}<select className="input" value={row.population} onChange={event=>onChange(rows.map((entry,i)=>i===index?{population:event.target.value as Row['population'],responseMode:''}:entry))}><option value="">请选择适用人群</option><option value="STUDENT">学生</option><option value="TEACHER">教师</option></select></label>
   <label>作答方式 {index+1}<select className="input" value={row.responseMode} disabled={!row.population} onChange={event=>onChange(rows.map((entry,i)=>i===index?{...entry,responseMode:event.target.value as Row['responseMode']}:entry))}><option value="">请选择作答方式</option>{row.population&&modes[row.population].map(([value,label])=><option key={value} value={value} disabled={rows.some((other,i)=>i!==index&&other.population===row.population&&other.responseMode===value)}>{label}</option>)}</select></label>
   <button type="button" onClick={()=>onChange(rows.filter((_,i)=>i!==index))}>移除组合 {index+1}</button>
  </div>)}
  <button type="button" disabled={rows.length>=5} onClick={()=>onChange([...rows,{population:'',responseMode:''}])}>增加适用方式</button>
  {!valid&&<p role="alert">请补齐每行的适用人群与作答方式，移除不需要或重复的组合后再提交。</p>}
 </fieldset>
}
export function EducationApplicabilitySummary({value,hash,expert,expertHash}:{value?:EducationApplicability|null;hash?:string|null;expert?:EducationExpertApplicability|null;expertHash?:string|null}){
 return <section aria-label="本次版本适用方式"><h4>本次版本适用方式</h4>{value?.administrations.length?<ul>{value.administrations.map(row=><li key={`${row.population}:${row.responseMode}`}>{row.population==='STUDENT'?'学生':'教师'} · {modes[row.population].find(([mode])=>mode===row.responseMode)?.[1]??row.responseMode}</li>)}</ul>:!expert?.administrations.length?<p>未声明学校/教师适用方式。原 Training / Survey 使用规则不变。</p>:null}
  {!!expert?.administrations.length&&<p>独立 V2 声明：受邀专家观察教师个人；仍须另行获得工具授权与活动邀请。</p>}
  {hash&&<p className="break-all text-xs">适用方式快照摘要：{hash}</p>}{expertHash&&<p className="break-all text-xs">专家适用方式快照摘要：{expertHash}</p>}</section>
}
