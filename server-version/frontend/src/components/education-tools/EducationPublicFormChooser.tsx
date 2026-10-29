import {assessmentContextLabels,type AssessmentContextKey} from '../../modules/assessment-context/options'
import {useEffect,useRef,useState} from 'react'
import {privateToolBase,privateToolError,type PrivateToolApi} from './privateToolClient'
import type {EducationPublicFormSummary} from './educationPublicFormClient'
import type {CompositionResponseMode,ExpertTargetKind} from './educationCompositionAdministration'

type Props={api:PrivateToolApi;entry:'SCHOOL'|'TEACHER';organizationId:string;actorId:string;kind?:'FORM'|'SCALE';catalog?:'PUBLIC'|'LIBRARY';responseMode?:CompositionResponseMode;targetKind?:ExpertTargetKind;disabled?:boolean;onChoose:(source:EducationPublicFormSummary)=>void}
export function EducationPublicFormChooser(props:Props){
 const scope=useRef({...props,epoch:0})
 if(scope.current.responseMode!==props.responseMode||scope.current.targetKind!==props.targetKind||scope.current.catalog!==props.catalog||scope.current.kind!==props.kind||scope.current.api!==props.api||scope.current.entry!==props.entry||scope.current.organizationId!==props.organizationId||scope.current.actorId!==props.actorId)scope.current={...props,epoch:scope.current.epoch+1}
 return <ChooserSession key={scope.current.epoch} {...props}/>
}
function ChooserSession({api,organizationId,disabled,onChoose,kind='FORM',catalog='PUBLIC',responseMode='SELF',targetKind}:Props){
 const label=catalog==='LIBRARY'?'共用量表':kind==='FORM'?'公共表单':'公共量表'
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[cursor,setCursor]=useState<string|null>(null),[next,setNext]=useState<string|null>(null)
 const [rows,setRows]=useState<EducationPublicFormSummary[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{
  let current=true;setBusy(true);setError('')
  const params=new URLSearchParams({q:search});if(catalog==='PUBLIC')params.set('kind',kind);if(cursor)params.set('cursor',cursor)
  if(responseMode!=='SELF')params.set('responseMode',responseMode)
  if(responseMode==='EXPERT_REPORT'&&targetKind)params.set('targetKind',targetKind)
  void api<{list:EducationPublicFormSummary[];nextCursor:string|null}>(`${privateToolBase(organizationId)}/${catalog==='LIBRARY'?'library-sources':'public-sources'}?${params}`)
   .then(value=>{if(current){setRows(old=>cursor?Array.from(new Map([...old,...value.list].map(row=>[row.catalogKey,row])).values()):value.list);setNext(value.nextCursor)}})
   .catch(reason=>{if(current)setError(privateToolError(reason))}).finally(()=>{if(current)setBusy(false)})
  return()=>{current=false}
 },[api,organizationId,search,cursor,kind,catalog,responseMode,targetKind])
 return <section aria-label={'获授权'+label}><h4>获授权{label}</h4><p>引用原有固定版本；公共原版保持只读。</p>
  {kind==='FORM'&&<p>保留原始页面与题目。同页条件已支持；跨页条件和表单全局素材暂未接入，固定时会明确拒绝，不会删减原版内容。</p>}
  <form onSubmit={event=>{event.preventDefault();const q=query.trim();if(q===search&&!cursor)return;setCursor(null);setRows([]);setSearch(q)}}><label>搜索{label}<input value={query} onChange={event=>setQuery(event.target.value)}/></label><button disabled={busy||disabled}>搜索</button></form>
  {error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在读取{label}…</p>}
  {!busy&&!rows.length&&!error&&<p>当前没有获授权的{label}。</p>}
  {rows.map(row=><article key={row.catalogKey}><strong>{row.title}</strong><span> · 固定版本 {row.versions.content}{row.language?' · '+row.language:''}{kind==='SCALE'?' · P '+(row.versions.parameters??'未配置')+' · R '+(row.versions.report??'未配置'):''}</span>{!!row.requiredContextKeys?.length&&<p>原版要求背景字段：{row.requiredContextKeys.map(key=>assessmentContextLabels[key as AssessmentContextKey]??key).join('、')}。请在问卷背景信息中显式配置。</p>}
   {!!row.referenceContextKeys?.length&&<p>参考参数匹配所需信息：{row.referenceContextKeys.map(key=>assessmentContextLabels[key as AssessmentContextKey]??key).join('、')}。未提供或不匹配时不套用该参考。</p>}{row.unavailableReason&&<p>{row.unavailableReason}</p>}<button disabled={disabled||busy||!row.allowedActions.includes('REFERENCE_FIXED_VERSION')} onClick={()=>onChoose(row)}>加入{label}</button></article>)}
  {next&&<button disabled={busy||disabled} onClick={()=>setCursor(next)}>加载更多{label}</button>}
 </section>
}
