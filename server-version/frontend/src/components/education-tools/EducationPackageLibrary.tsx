import {useCallback,useEffect,useRef,useState} from 'react'
import {privateToolBase,privateToolError,type PrivateToolApi,type PrivateDraftState} from './privateToolClient'
import type {EducationPackageSummary,EducationPackagePreview} from './packageReferenceClient'

type Props={api:PrivateToolApi;organizationId:string;entry:'SCHOOL'|'TEACHER';actorId:string;onDraftStateChange?:(state:PrivateDraftState)=>void}
/** Author-only product parents own navigation; the backend independently
 * requires the current author and exact whole-package U on every preview. */
export function EducationPackageLibrary(props:Props){
 const scope=useRef({...props,epoch:0})
 if(scope.current.api!==props.api||scope.current.organizationId!==props.organizationId||scope.current.entry!==props.entry||scope.current.actorId!==props.actorId)
  scope.current={...props,epoch:scope.current.epoch+1}
 const {onDraftStateChange}=props
 useEffect(()=>{onDraftStateChange?.({dirty:false,writing:false})},[onDraftStateChange])
 return <PackageLibrarySession key={scope.current.epoch} {...props}/>
}
function PackageLibrarySession({api,organizationId}:Props){
 const base=privateToolBase(organizationId)+'/package-sources'
 const [list,setList]=useState<EducationPackageSummary[]|null>(null),[cursor,setCursor]=useState<string|null>(null)
 const [query,setQuery]=useState(''),[filter,setFilter]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [preview,setPreview]=useState<EducationPackagePreview|null>(null)
 const session=useRef({generation:0,pending:false}).current
 const refresh=useCallback(async(q:string,next?:string)=>{
  if(session.pending)return
  session.pending=true;const token=++session.generation;setBusy(true);setError('');setPreview(null)
  if(!next){setList(null);setCursor(null)}
  const params=new URLSearchParams();if(q)params.set('q',q);if(next)params.set('cursor',next)
  try{
   const result=await api<{list:EducationPackageSummary[];nextCursor:string|null}>(base+(params.size?'?'+params:''))
   if(token===session.generation){setList(old=>next?[...new Map([...(old??[]),...result.list].map(row=>[row.catalogKey,row])).values()]:result.list);setCursor(result.nextCursor)}
  }catch(cause){if(token===session.generation)setError(privateToolError(cause))}
  finally{if(token===session.generation){session.pending=false;setBusy(false)}}
 },[api,base,session])
 useEffect(()=>{void refresh('');return()=>{session.generation++;session.pending=false}},[refresh,session])
 async function open(row:EducationPackageSummary){
  if(session.pending)return
  session.pending=true;const token=++session.generation;setBusy(true);setError('');setPreview(null)
  try{
   const result=await api<EducationPackagePreview>(base+'/preview','POST',{sourceRef:row.sourceRef})
   if(token===session.generation)setPreview(result)
  }catch(cause){if(token===session.generation)setError(privateToolError(cause))}
  finally{if(token===session.generation){session.pending=false;setBusy(false)}}
 }
 const kindLabel=(kind:string)=>({SCALE:'量表',FORM:'表单',COGNITIVE:'认知任务',SJT:'情境测验',SITUATIONAL:'情境测验'} as Record<string,string>)[kind]??kind
 return <section className="education-private-studio education-package-library">
  <header><h2>正式整包 · 整体引用</h2><p>查看获授权固定包的完整成员、原顺序和整体报告说明。</p></header>
  <form className="education-private-toolbar" onSubmit={event=>{event.preventDefault();if(!busy){setFilter(query.trim());void refresh(query.trim())}}}>
   <label>搜索整包<input value={query} maxLength={160} onChange={event=>setQuery(event.target.value)}/></label>
   <button type="submit" disabled={busy}>搜索</button><button type="button" disabled={busy} onClick={()=>void refresh(filter)}>重新读取</button>
  </form>
  {busy&&<p role="status">正在读取整包…</p>}{error&&<p role="alert">{error}</p>}
  {list?.length===0&&!busy&&<p>当前学校下暂无获授权的正式固定包。</p>}
  <div className="education-private-list" role="list" aria-label="获授权正式整包">{list?.map(row=><article role="listitem" key={row.catalogKey}>
   <div><h3>{row.title}</h3><p>内容版本 {row.contentVersion} · {row.memberCount} 个固定成员 · 整体报告版本 {row.reportVersion??'原版未配置'}</p>
    {row.unavailableReason&&<p>{row.unavailableReason}</p>}</div>
   <button type="button" disabled={busy||!row.allowedActions.includes('PREVIEW_WHOLE_PACKAGE')} onClick={()=>void open(row)}>查看完整包</button>
  </article>)}</div>
  {cursor&&<button type="button" disabled={busy} onClick={()=>void refresh(filter,cursor)}>加载更多整包</button>}
  {preview&&<section className="education-private-preview" aria-label="固定整包只读预览"><header><h3>{preview.title}</h3>
   <button type="button" onClick={()=>setPreview(null)}>关闭预览</button></header>
   <p>固定版本 {preview.contentVersion} · 整体报告版本 {preview.reportVersion??'原版未配置'}</p>
   {preview.protocol==='NATIVE_BUNDLE_V3'&&<p>{preview.description}</p>}
   {preview.protocol==='NATIVE_BUNDLE_V3'&&preview.context&&<section aria-label="原包背景信息要求"><h4>原包背景信息 · 版本 {preview.context.contextDefinitionVersion}</h4>
    <ul>{preview.context.fields.map(field=><li key={field.contextKey}>{field.contextKey==='subject_age_years'?'年龄（周岁）':field.contextKey} · {field.required?'必填':'选填'}{field.enumValues?' · '+field.enumValues.join('／'):''}</li>)}</ul>
   </section>}
   <ol>{preview.members.map(member=><li key={member.slotKey}>{'title' in member?member.title:member.instrumentKey} · {kindLabel(member.kind)} · 版本 {'sourceVersion' in member?member.sourceVersion:member.instrumentVersion}</li>)}</ol>
   {preview.report&&<section aria-label="原包整体报告说明"><h4>{preview.report.title}</h4>
    {preview.protocol==='NATIVE_BUNDLE_V3'?<ul>{Object.entries(preview.report.sections).map(([key,title])=><li key={key}>{title}</li>)}</ul>:
     <><p>{preview.report?.introduction}</p><ul>{preview.report?.blocks.map((block,index)=><li key={index}>{block.type==='TEXT'?block.text:block.label}</li>)}</ul><p>{preview.report?.disclaimer}</p></>}
   </section>}
   {preview.protocol==='NATIVE_BUNDLE_V3'&&preview.limitations.map((text,index)=><p key={index}>{text}</p>)}
  </section>}
 </section>
}
