import {useEffect,useRef,useState} from 'react'
import {privateToolBase,privateToolError,type PrivateToolApi} from './privateToolClient'
import type {EducationPublicFormSummary} from './educationPublicFormClient'

type Props={api:PrivateToolApi;entry:'SCHOOL'|'TEACHER';organizationId:string;actorId:string;disabled?:boolean;onChoose:(source:EducationPublicFormSummary)=>void}
export function EducationPublicFormChooser(props:Props){
 const scope=useRef({...props,epoch:0})
 if(scope.current.api!==props.api||scope.current.entry!==props.entry||scope.current.organizationId!==props.organizationId||scope.current.actorId!==props.actorId)scope.current={...props,epoch:scope.current.epoch+1}
 return <ChooserSession key={scope.current.epoch} {...props}/>
}
function ChooserSession({api,organizationId,disabled,onChoose}:Props){
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[cursor,setCursor]=useState<string|null>(null),[next,setNext]=useState<string|null>(null)
 const [rows,setRows]=useState<EducationPublicFormSummary[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{
  let current=true;setBusy(true);setError('')
  const params=new URLSearchParams({kind:'FORM',q:search});if(cursor)params.set('cursor',cursor)
  void api<{list:EducationPublicFormSummary[];nextCursor:string|null}>(`${privateToolBase(organizationId)}/public-sources?${params}`)
   .then(value=>{if(current){setRows(old=>cursor?Array.from(new Map([...old,...value.list].map(row=>[row.catalogKey,row])).values()):value.list);setNext(value.nextCursor)}})
   .catch(reason=>{if(current)setError(privateToolError(reason))}).finally(()=>{if(current)setBusy(false)})
  return()=>{current=false}
 },[api,organizationId,search,cursor])
 return <section aria-label="获授权公共表单"><h4>获授权公共表单</h4><p>引用原有固定版本；公共原版保持只读。</p>
  <form onSubmit={event=>{event.preventDefault();const q=query.trim();if(q===search&&!cursor)return;setCursor(null);setRows([]);setSearch(q)}}><label>搜索公共表单<input value={query} onChange={event=>setQuery(event.target.value)}/></label><button disabled={busy||disabled}>搜索</button></form>
  {error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在读取公共表单…</p>}
  {!busy&&!rows.length&&!error&&<p>当前没有获授权的公共表单。</p>}
  {rows.map(row=><article key={row.catalogKey}><strong>{row.title}</strong><span> · 固定版本 {row.versions.content}{row.language?' · '+row.language:''}</span>
   {row.unavailableReason&&<p>{row.unavailableReason}</p>}<button disabled={disabled||busy||!row.allowedActions.includes('REFERENCE_FIXED_VERSION')} onClick={()=>onChoose(row)}>加入公共表单</button></article>)}
  {next&&<button disabled={busy||disabled} onClick={()=>setCursor(next)}>加载更多公共表单</button>}
 </section>
}
