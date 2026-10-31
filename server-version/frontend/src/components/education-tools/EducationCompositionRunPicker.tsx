import {useEffect,useRef,useState} from 'react'
import {EducationPrivateVersionChooser,type PrivateVersionChoice} from './EducationPrivateVersionChooser'
import {privateToolError,type PrivateToolApi} from './privateToolClient'
import {compositionAdministrationForEntry,compositionAdministrationLabel} from './educationCompositionAdministration'

/** Fixed ordinary questionnaire attachment only. Server selects actual entry
 * scope, author, event link, sealed runtime and policy; this UI supplies
 * neither a BUNDLE editor nor source/participant/report authority. */
type Props={
 api:PrivateToolApi;entry:'SCHOOL'|'TEACHER';organizationId:string;actorKey:string;endpoint:string;expectedVersion:number;disabled:boolean;
 onBusy:(busy:boolean)=>void;onRefresh:()=>Promise<unknown>
}
export function EducationCompositionRunPicker(props:Props){
 const scope=useRef({...props,epoch:0})
 if(scope.current.api!==props.api||scope.current.entry!==props.entry||scope.current.organizationId!==props.organizationId||scope.current.actorKey!==props.actorKey||scope.current.endpoint!==props.endpoint)
  scope.current={...props,epoch:scope.current.epoch+1}
 return <RunPickerSession key={scope.current.epoch} {...props}/>
}
function RunPickerSession({api,entry,organizationId,actorKey,endpoint,expectedVersion,disabled,onBusy,onRefresh}:Props){
 const [choice,setChoice]=useState<PrivateVersionChoice|null>(null),[writing,setWriting]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [needsReview,setNeedsReview]=useState(false),[opened,setOpened]=useState(false)
 const [homeroom,setHomeroom]=useState(false)
 const alive=useRef(true),locked=useRef(false)
 const busyCallback=useRef(onBusy);busyCallback.current=onBusy
 useEffect(()=>{alive.current=true
  return()=>{alive.current=false;if(locked.current){locked.current=false;busyCallback.current(false)}}
 },[])
 const administration=compositionAdministrationForEntry(choice?.administration,entry)
 const needsHomeroom=administration?.responseMode==='TEACHER_REPORT'
 const add=async()=>{
  if(!choice||choice.kind!=='COMPOSITION'||!administration||(needsHomeroom&&!homeroom)||disabled||needsReview||locked.current)return
  const current=()=>alive.current
  locked.current=true;setWriting(true);busyCallback.current(true);setError('');setNotice('')
  try{
   await api(endpoint,'POST',{expectedVersion,privateComposition:{versionId:choice.id,contentHash:choice.contentHash},
    subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:administration.responseMode==='PARENT_REPORT'?'RELATED_PARENT':'ALL_CURRENT'},
    ...(needsHomeroom?{targetPolicy:{mode:'HOMEROOM_TEACHER'}}:{})})
   if(!current())return
   setChoice(null);setHomeroom(false);setNotice('固定普通问卷已加入任务草稿，请预览并发布任务。')
   await onRefresh()
  }catch(reason){if(current()){setError(privateToolError(reason));setNeedsReview(true)}}
  finally{if(current()){locked.current=false;setWriting(false);busyCallback.current(false)}}
 }
 const review=async()=>{
  if(locked.current)return
  const current=()=>alive.current
  setError('')
  try{await onRefresh();if(current()){setNeedsReview(false);setChoice(null);setHomeroom(false);setNotice('任务已重新读取，请先核对已配置项目，再选用问卷版本。')}}
  catch(reason){if(current())setError(privateToolError(reason))}
 }
 return <details className={'education-composition-studio education-composition-studio--'+entry.toLowerCase()} onToggle={event=>setOpened(event.currentTarget.open)}>
  <summary>选用本人普通问卷</summary><p>整份引用本人固定的普通问卷；问卷内部工具的顺序和说明以该版本为准。</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {opened&&<EducationPrivateVersionChooser key={`${entry}:${actorKey}:${organizationId}:${endpoint}`} api={api} organizationId={organizationId}
   kind="COMPOSITION" selectLabel="选择本版本" disabled={disabled||writing||needsReview} onSelect={value=>{
    setHomeroom(false);setNotice('')
    const mode=compositionAdministrationForEntry(value.administration,entry)
    if(!mode){setChoice(null);setError('该固定版本的作答方式缺失或不适用于当前入口，请重新读取版本。');return}
    if(mode.responseMode==='STUDENT_REPORT'){setChoice(null);setError('学生评教问卷请在“学生评教”中绑定学校核验的任教关系后使用。');return}
    if(mode.responseMode==='EXPERT_REPORT'){setChoice(null);setError('专家观察问卷请在现场活动中绑定观察目标，通过受邀任务使用。');return}
    setChoice(value);setError('')
   }}/>}
  {choice&&<p>{choice.title} · 修订 {choice.sourceRevision} · {compositionAdministrationLabel(administration??undefined)}</p>}
  {choice?.groupReporting&&<p>此固定新版本已明确配置群体披露，汇总最少 {choice.groupReporting.minimumRespondents} 人；本人报告仍遵守原有指标与开放时机。加入批次不会增加角色访问权限。</p>}
  {administration?.responseMode==='PARENT_REPORT'&&<p>受评对象为本批次学生，系统按当前有效亲子关系分配家长作答，并保留同意要求。作答不自动开放学生个人报告。</p>}
  {needsHomeroom&&<label><input type="checkbox" checked={homeroom} disabled={disabled||writing||needsReview} onChange={event=>setHomeroom(event.target.checked)}/>仅分配给受评学生的当前班主任</label>}
  {needsReview?<button type="button" disabled={writing} onClick={()=>void review()}>重新读取并核对任务</button>:
   <button type="button" disabled={disabled||writing||!choice||!administration||(needsHomeroom&&!homeroom)} onClick={()=>void add()}>{entry==='SCHOOL'?'加入测评批次':'加入评价任务'}</button>}
 </details>
}
