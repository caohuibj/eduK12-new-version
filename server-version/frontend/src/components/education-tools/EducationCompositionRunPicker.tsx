import {useEffect,useRef,useState} from 'react'
import {EducationPrivateVersionChooser,type PrivateVersionChoice} from './EducationPrivateVersionChooser'
import {privateToolError,type PrivateToolApi} from './privateToolClient'

/** Fixed ordinary questionnaire attachment only. Server selects actual Teacher
 * SELF scope, author, event link, sealed runtime and policy; this UI supplies
 * neither a BUNDLE editor nor source/participant/report authority. */
export function EducationCompositionRunPicker({api,organizationId,actorKey,endpoint,expectedVersion,disabled,onBusy,onRefresh}:{
 api:PrivateToolApi;organizationId:string;actorKey:string;endpoint:string;expectedVersion:number;disabled:boolean;
 onBusy:(busy:boolean)=>void;onRefresh:()=>Promise<unknown>
}){
 const [choice,setChoice]=useState<PrivateVersionChoice|null>(null),[writing,setWriting]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [needsReview,setNeedsReview]=useState(false),[opened,setOpened]=useState(false)
 const alive=useRef(true),locked=useRef(false),scope=useRef({api,organizationId,actorKey,endpoint})
 const busyCallback=useRef(onBusy);busyCallback.current=onBusy
 if(scope.current.api!==api||scope.current.organizationId!==organizationId||scope.current.actorKey!==actorKey||scope.current.endpoint!==endpoint)
  scope.current={api,organizationId,actorKey,endpoint}
 useEffect(()=>{alive.current=true;setChoice(null);setWriting(false);setError('');setNotice('');setNeedsReview(false);setOpened(false)
  return()=>{alive.current=false;if(locked.current){locked.current=false;busyCallback.current(false)}}
 },[api,organizationId,actorKey,endpoint])
 const add=async()=>{
  if(!choice||choice.kind!=='COMPOSITION'||disabled||needsReview||locked.current)return
  const context=scope.current,current=()=>alive.current&&scope.current===context
  locked.current=true;setWriting(true);busyCallback.current(true);setError('');setNotice('')
  try{
   await api(endpoint,'POST',{expectedVersion,privateComposition:{versionId:choice.id,contentHash:choice.contentHash},
    subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'}})
   if(!current())return
   setChoice(null);setNotice('固定普通问卷已加入任务草稿，请预览并发布任务。')
   await onRefresh()
  }catch(reason){if(current()){setError(privateToolError(reason));setNeedsReview(true)}}
  finally{if(current()){locked.current=false;setWriting(false);busyCallback.current(false)}}
 }
 const review=async()=>{
  if(locked.current)return
  const context=scope.current,current=()=>alive.current&&scope.current===context
  setError('')
  try{await onRefresh();if(current()){setNeedsReview(false);setChoice(null);setNotice('任务已重新读取，请先核对已配置项目，再选用问卷版本。')}}
  catch(reason){if(current())setError(privateToolError(reason))}
 }
 return <details className="education-composition-studio" onToggle={event=>setOpened(event.currentTarget.open)}>
  <summary>选用本人普通问卷</summary><p>整份引用本人固定的普通问卷；问卷内部工具的顺序和说明以该版本为准。</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {opened&&<EducationPrivateVersionChooser key={`${actorKey}:${organizationId}:${endpoint}`} api={api} organizationId={organizationId}
   kind="COMPOSITION" selectLabel="选择本版本" disabled={disabled||writing||needsReview} onSelect={value=>{setChoice(value);setNotice('')}}/>}
  {choice&&<p>{choice.title} · 修订 {choice.sourceRevision} · 教师自评</p>}
  {needsReview?<button type="button" disabled={writing} onClick={()=>void review()}>重新读取并核对任务</button>:
   <button type="button" disabled={disabled||writing||!choice} onClick={()=>void add()}>加入评价任务</button>}
 </details>
}
