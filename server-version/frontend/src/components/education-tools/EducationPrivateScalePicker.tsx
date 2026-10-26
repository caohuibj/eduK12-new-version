import {useEffect,useRef,useState} from 'react'
import {privateToolBase,privateToolError,type PrivateToolApi} from './privateToolClient'
type Candidate={toolId:string;versionId:string;title:string;sourceRevision:number;contentHash:string;createdAt:string;compatibility?:{compatible:boolean;code?:string|null;issues?:{pageKey:string|null;itemKey:string|null;reason:string;message:string}[]}}
type Mode='SELF'|'PARENT_REPORT'|'TEACHER_REPORT'
export function EducationPrivateScalePicker({entry,organizationId,actorKey,scopeKey,api,endpoint,expectedVersion,disabled,homeroomOnly=false,onBusy,onRefresh,kind='SCALE'}:{
 entry:'SCHOOL'|'TEACHER';organizationId:string;actorKey:string;scopeKey:string;api:PrivateToolApi;kind?:'SCALE'|'FORM';
 endpoint:string;expectedVersion:number;disabled:boolean;homeroomOnly?:boolean;
 onBusy:(busy:boolean)=>void;onRefresh:()=>Promise<unknown>
}){
 const [rows,setRows]=useState<Candidate[]>([]),[cursor,setCursor]=useState<string|null>(null)
 const [loading,setLoading]=useState(false),[read,setRead]=useState(false),[writing,setWriting]=useState(false)
 const [choice,setChoice]=useState(''),[mode,setMode]=useState<Mode|''>(''),[target,setTarget]=useState('')
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[needsReview,setNeedsReview]=useState(false)
 const epoch=useRef(0),alive=useRef(true),locked=useRef(false)
 const busyCallback=useRef(onBusy);busyCallback.current=onBusy
 const scope=`${entry}:${organizationId}:${actorKey}:${scopeKey}:${endpoint}:${kind}`
 const current=useRef({scope,api});current.current={scope,api}
 useEffect(()=>{alive.current=true;epoch.current++
  setRows([]);setCursor(null);setWriting(false);setLoading(false);setRead(false);setChoice('');setMode('');setTarget('');setError('');setNotice('');setNeedsReview(false)
  return()=>{alive.current=false;epoch.current++;if(locked.current){locked.current=false;busyCallback.current(false)}}
 },[scope,api])
 useEffect(()=>{setTarget('')},[homeroomOnly])
 const load=async(next?:string)=>{
  if(disabled||locked.current)return
  const token=++epoch.current,context=current.current
  const valid=()=>alive.current&&token===epoch.current&&current.current.scope===context.scope&&current.current.api===context.api
  setLoading(true);setError('')
  try{
   const data=await api<{list:Candidate[];nextCursor:string|null}>(privateToolBase(organizationId)+'/runtime-candidates'+(kind==='FORM'?'?kind=FORM'+(next?'&cursor='+encodeURIComponent(next):''):(next?'?cursor='+encodeURIComponent(next):'')))
   if(!valid())return
   setRows(old=>Array.from(new Map([...(next?old:[]),...data.list].map(row=>[row.versionId,row])).values()))
   setCursor(data.nextCursor);setRead(true)
   if(!next){setChoice('');setMode('');setTarget('')}
  }catch(cause){if(valid())setError(privateToolError(cause))}
  finally{if(valid())setLoading(false)}
 }
 const selected=rows.find(row=>row.versionId===choice)
 const compatible=(row:Candidate)=>kind==='SCALE'||row.compatibility?.compatible===true
 const selectedCompatible=Boolean(selected&&compatible(selected))
 const label=kind==='FORM'?'表单':'量表'
 const targetValid=mode!=='TEACHER_REPORT'||(homeroomOnly?target==='HOMEROOM_TEACHER':['HOMEROOM_TEACHER','ALL_CLASS_TEACHERS'].includes(target))
 const add=async()=>{
  if(disabled||locked.current||loading||needsReview||!selected||!selectedCompatible||!mode||!targetValid||!actorKey)return
  if(!['SELF','PARENT_REPORT','TEACHER_REPORT'].includes(mode)||(entry==='TEACHER'&&mode!=='SELF'))return
  locked.current=true;setWriting(true);onBusy(true);setError('');setNotice('')
  const context=current.current,token=epoch.current
  const valid=()=>alive.current&&token===epoch.current&&current.current.scope===context.scope&&current.current.api===context.api
  let saved=false
  try{
   await api(endpoint,'POST',{expectedVersion,[kind==='FORM'?'privateForm':'privateScale']:{versionId:selected.versionId,contentHash:selected.contentHash,
    administration:{population:entry==='SCHOOL'?'STUDENT':'TEACHER',responseMode:mode}},
    subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:mode==='PARENT_REPORT'?'RELATED_PARENT':'ALL_CURRENT'},
    ...(mode==='TEACHER_REPORT'?{targetPolicy:{mode:target}}:{})})
   saved=true
   if(!valid())return
   setChoice('');setMode('');setTarget('');setNotice(kind==='FORM'?'已将本人固定表单版本加入活动草稿。请核对任务配置，再预览并发布；加入草稿不等于已发布。':'已加入本人固定版本。请核对任务配置，再按现有流程预览和发布；是否可发布以服务器检查为准。')
   await onRefresh()
  }catch(cause){if(valid()){
   setError((saved?'已添加，但任务配置刷新失败，请重新读取；不要重复添加。':'添加未确认，请先重新读取任务配置核对；不会自动重复提交。')+' '+privateToolError(cause))
   setNeedsReview(true)
  }}finally{if(valid()){locked.current=false;setWriting(false);onBusy(false)}}
 }
 const recover=async()=>{
  if(disabled||locked.current)return
  locked.current=true;setWriting(true);onBusy(true)
  const context=current.current,token=epoch.current
  const valid=()=>alive.current&&token===epoch.current&&current.current.scope===context.scope&&current.current.api===context.api
  try{await onRefresh();if(valid()){setChoice('');setMode('');setTarget('');setNeedsReview(false);setError('');setNotice('已重新读取配置，请先核对是否已加入；确需添加时重新选择。')}}
  catch(cause){if(valid())setError(privateToolError(cause))}
  finally{if(valid()){locked.current=false;setWriting(false);onBusy(false)}}
 }
 const prefix=entry==='SCHOOL'?'hs':'ht'
 return <section className={entry==='SCHOOL'?'hs-task-detail':'ht-task'} aria-label={`我的${label}固定版本`}>
  <h4>我的{label}</h4>{entry==='SCHOOL'?<details className="hs-private-picker-help"><summary>使用说明</summary><p>仅本人在当前入口和学校固定的{label}版本。编制权限不增加发布或个体报告读取权限；分享不在此处开放。</p>{kind==='FORM'&&<p>先加入活动草稿，再预览并发布。表单按分组逐步呈现；不兼容的图片或跨页条件会明确列出，不会自动删减。</p>}</details>:<><p>仅本人在当前入口和学校固定的{label}版本。编制权限不增加发布或个体报告读取权限；分享不在此处开放。</p>{kind==='FORM'&&<p>先加入活动草稿，再预览并发布。表单采用 Training 式分节、逐步呈现，不承诺保留 Survey 原分页视觉；不兼容的图片或跨页条件会明确列出，不会自动删减。</p>}</>}
  <button disabled={disabled||loading||writing} onClick={()=>void load()}>读取我的固定{label}</button>
  {loading&&<p role="status">正在读取我的{label}…</p>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {needsReview&&<button disabled={disabled||writing} onClick={()=>void recover()}>重新读取任务配置（不会重复添加）</button>}
  {read&&!loading&&rows.length===0&&<p>{cursor?`本页没有可选${label}，可继续加载。`:`暂无已固定的本人${label}，请先在我的工具中完成编制并固定版本。`}</p>}
  {cursor&&<button disabled={disabled||loading||writing} onClick={()=>void load(cursor)}>继续加载我的{label}</button>}
  {kind==='FORM'&&rows.filter(row=>!compatible(row)).map(row=><aside key={row.versionId} aria-label={`${row.title} 兼容性说明`}><strong>{row.title} · 此固定版本暂不能加入</strong>
   {row.compatibility?.issues?.length?<ul>{row.compatibility.issues.map((issue,index)=><li key={index}>{issue.pageKey?`页 ${issue.pageKey} `:''}{issue.itemKey?`题 ${issue.itemKey}：`:''}{issue.message}</li>)}</ul>:<p>尚未取得此版本可用于活动的兼容性确认，请重新读取或修订后固定新版本。</p>}
  </aside>)}
  {rows.length>0&&<>
   <label className={`${prefix}-field`}><span>我的{label} · 固定版本</span><select disabled={disabled||writing||needsReview} value={choice} onChange={event=>{setChoice(event.target.value);setMode('');setTarget('')}}>
    <option value="">请选择本人固定版本</option>{rows.map(row=><option key={row.versionId} value={row.versionId} disabled={!compatible(row)}>{row.title} · 修订 {row.sourceRevision} · {row.createdAt} · {row.contentHash.slice(0,8)}</option>)}
   </select></label>
   <label className={`${prefix}-field`}><span>本次作答方式</span><select disabled={disabled||writing||needsReview||!selectedCompatible} value={mode} onChange={event=>{setMode(event.target.value as Mode|'');setTarget('')}}>
    <option value="">请明确选择</option><option value="SELF">{entry==='SCHOOL'?'学生自评':'教师自评'}</option>
    {entry==='SCHOOL'&&<><option value="PARENT_REPORT">家长评学生</option><option value="TEACHER_REPORT">教师评学生</option></>}
   </select></label>
   {mode==='TEACHER_REPORT'&&<label className={`${prefix}-field`}><span>私有{label}教师作答目标</span><select disabled={disabled||writing||needsReview} value={target} onChange={event=>setTarget(event.target.value)}>
    <option value="">请明确选择</option><option value="HOMEROOM_TEACHER">班主任</option>{!homeroomOnly&&<option value="ALL_CLASS_TEACHERS">全部班级教师</option>}
   </select></label>}
   <button disabled={disabled||loading||writing||needsReview||!selectedCompatible||!mode||!targetValid} onClick={()=>void add()}>加入我的固定{label}</button>
  </>}
 </section>
}
