import {createEducationPrivateImageAdapter} from './educationPrivateImageAdapter'
import {EducationQuestionImageField} from './EducationQuestionImageField'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {ScaleDefinitionEditor} from '../../pages/ScaleDefinitionEditor'
import {type ScaleDefinition,updateReportContract} from '../../pages/scaleDefinitionEditorModel'
import {ResearchFormEditor} from '../../survey/ResearchFormEditor'
import type {FormDraft} from '../../survey/builder.types'
import type {ProfessionalAnswer} from '../../modules/assessment-core/form/types'
import {sanitizeFormAnswers} from '../../modules/assessment-core/form/form-visibility'
import {PrivateToolPreview} from './PrivateToolPreview'
import {privateToolBase,privateToolError,type PrivateToolApi,type PrivateTool,type PrivateToolSummary,type PrivateToolKind,type PrivateToolValidation,type PrivateToolVersion,type PrivateDraftState,type PrivateToolIssue} from './privateToolClient'
import './education-private-tools.css'

type Props={api:PrivateToolApi;organizationId:string;entry:'SCHOOL'|'TEACHER';actorId?:string;onDraftStateChange?:(state:PrivateDraftState)=>void}
const mergeById=<T extends {id:string}>(current:T[],next:T[]):T[]=>Array.from(new Map([...current,...next].map(item=>[item.id,item])).values())
const fingerprint=(tool:PrivateTool)=>JSON.stringify({title:tool.title,definition:tool.definition})
/** A keyed session prevents responses from one school from entering another editor. */
export function EducationPrivateToolStudio(props:Props){return <PrivateToolSession key={`${props.entry}:${props.actorId??'session'}:${props.organizationId}`} {...props}/>}
function PrivateToolSession({api,organizationId,entry,actorId='session',onDraftStateChange}:Props){
 const base=privateToolBase(organizationId)
 const [list,setList]=useState<PrivateToolSummary[]>([])
 const [cursor,setCursor]=useState<string|null>(null)
 const [tool,setTool]=useState<PrivateTool|null>(null)
 const [saved,setSaved]=useState('')
 const [kind,setKind]=useState<PrivateToolKind>('SCALE')
 const [title,setTitle]=useState('')
 const [busy,setBusy]=useState(false)
 const [mediaCount,setMediaCount]=useState(0)
 const mediaPending=useRef(0)
 const [notice,setNotice]=useState('')
 const [error,setError]=useState('')
 const [issues,setIssues]=useState<PrivateToolIssue[]>([])
 const [uncertainCreate,setUncertainCreate]=useState(false)
 const [validation,setValidation]=useState<PrivateToolValidation|null>(null)
 const [versions,setVersions]=useState<PrivateToolVersion[]>([])
 const [versionsCursor,setVersionsCursor]=useState<string|null>(null)
 const [tab,setTab]=useState<'responses'|'items'|'scores'|'report'>('responses')
 const [previewing,setPreviewing]=useState(false)
 const [answers,setAnswers]=useState<Record<string,ProfessionalAnswer>>({})
 const [previewResult,setPreviewResult]=useState<unknown>(null)
 const alive=useRef(true),epoch=useRef(0),locked=useRef(false)
 const toolId=tool?.id
 const imageAdapter=useMemo(()=>toolId?createEducationPrivateImageAdapter({api,entry,actorId,organizationId,toolId}):undefined,[api,entry,actorId,organizationId,toolId])
 const onUploadBusy=useCallback((uploading:boolean)=>{if(!alive.current)return;mediaPending.current=Math.max(0,mediaPending.current+(uploading?1:-1));setMediaCount(mediaPending.current)},[])
 const dirty=tool?fingerprint(tool)!==saved:Boolean(title.trim())
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current+=1;locked.current=false}},[])
 useEffect(()=>{onDraftStateChange?.({dirty,writing:busy||mediaCount>0})},[dirty,busy,mediaCount,onDraftStateChange])
 useEffect(()=>()=>{onDraftStateChange?.({dirty:false,writing:false})},[onDraftStateChange])
 useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(dirtyRef.current||locked.current||mediaPending.current>0){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[])
 const operate=useCallback(async(work:(current:()=>boolean)=>Promise<void>)=>{
  if(locked.current||mediaPending.current>0)return
  locked.current=true;setBusy(true);setError('');setNotice('');setIssues([])
  const generation=epoch.current
  const current=()=>alive.current&&generation===epoch.current
  try{await work(current)}catch(cause){if(current()){setError(privateToolError(cause));setIssues((cause as {data?:{issues?:PrivateToolIssue[]}}).data?.issues??[])}}
  finally{if(current()){locked.current=false;setBusy(false)}}
 },[])
 const refreshList=useCallback((next?:string)=>operate(async current=>{
  const result=await api<{list:PrivateToolSummary[];nextCursor:string|null}>(base+(next?`?cursor=${encodeURIComponent(next)}`:''))
  if(!current())return
  setList(old=>mergeById(next?old:[],result.list));setCursor(result.nextCursor);setUncertainCreate(false)
 }),[api,base,operate])
 useEffect(()=>{void refreshList()},[refreshList])
 const mayLeave=()=>!locked.current&&mediaPending.current===0&&(!dirtyRef.current||window.confirm('当前草稿尚未保存，确定放弃修改吗？'))
 const apply=(value:PrivateTool)=>{setTool(value);setSaved(fingerprint(value));setValidation(null);setPreviewing(false);setAnswers({});setPreviewResult(null);setTab('responses')}
 const open=(id:string)=>{
  if(!mayLeave())return
  void operate(async current=>{
   const value=await api<PrivateTool>(`${base}/${id}`)
   if(!current())return
   apply(value);setVersions([]);setVersionsCursor(null)
   const history=await api<{list:PrivateToolVersion[];nextCursor?:string|null}>(`${base}/${id}/versions`)
   if(current()){setVersions(mergeById([],history.list));setVersionsCursor(history.nextCursor??null)}
  })
 }
 const loadMoreVersions=()=>{
  if(!tool||!versionsCursor)return
  const cursor=versionsCursor
  void operate(async current=>{
   const history=await api<{list:PrivateToolVersion[];nextCursor?:string|null}>(`${base}/${tool.id}/versions?cursor=${encodeURIComponent(cursor)}`)
   if(!current())return
   setVersions(old=>mergeById(old,history.list));setVersionsCursor(history.nextCursor??null)
  })
 }
 const create=()=>{
  if(uncertainCreate||!title.trim()||locked.current)return
  void operate(async current=>{
   try{
    const value=await api<PrivateTool>(base,'POST',{kind,title:title.trim()})
    if(!current())return
    apply(value);setVersions([]);setVersionsCursor(null);setTitle('');setNotice('私有草稿已创建，仅你本人可见。')
   }catch(cause){if(current())setUncertainCreate(true);throw cause}
  })
 }
 const save=async()=>{
  if(!tool||!tool.title.trim())return
  await operate(async current=>{
   const submitted:PrivateTool={...tool,title:tool.title.trim(),definition:tool.kind==='SCALE'?updateReportContract(tool.definition as ScaleDefinition):tool.definition}
   const result=await api<Pick<PrivateTool,'revision'|'contentHash'>>(`${base}/${tool.id}`,'PUT',{expectedRevision:tool.revision,title:submitted.title,definition:submitted.definition})
   if(!current())return
   const updated={...submitted,...result}
   setTool(updated);setSaved(fingerprint(updated));setValidation(null);setPreviewResult(null);setNotice('草稿已保存。固定版本需另外运行检查。')
  })
 }
 const check=()=>{if(!tool||dirty)return;void operate(async current=>{
  const result=await api<PrivateToolValidation>(`${base}/${tool.id}/validate`,'POST',{})
  if(!current())return
  if(result.revision!==tool.revision||result.contentHash!==tool.contentHash){setValidation(null);setError('服务端草稿已变化，请重新读取并核对。');return}
  setValidation(result);setIssues(result.issues);setNotice(result.valid?'技术检查通过，可试填或固定私有版本。':'请根据检查结果完善定义。')
 })}
 const checked=Boolean(tool&&validation?.valid&&!dirty&&validation.revision===tool.revision&&validation.contentHash===tool.contentHash)
 const freeze=()=>{if(!tool||!checked)return;void operate(async current=>{
  const version=await api<PrivateToolVersion>(`${base}/${tool.id}/freeze`,'POST',{expectedRevision:tool.revision,expectedContentHash:tool.contentHash})
  if(!current())return
  setVersions(old=>[version,...old.filter(item=>item.id!==version.id)]);setNotice('私有版本已固定。此操作不会发布活动、开放学生作答或进入公共工具库。')
 })}
 const preview=()=>{if(!tool||!checked)return;void operate(async current=>{
  const payload=tool.kind==='SCALE'?(tool.definition as ScaleDefinition).items.filter(item=>answers[item.itemCode]!==undefined).map(item=>({itemCode:item.itemCode,responseValue:answers[item.itemCode]})):sanitizeFormAnswers((tool.definition as FormDraft).pages.flatMap(page=>page.questions),answers)
  const result=await api<{contentHash:string;result:unknown}>(`${base}/${tool.id}/preview`,'POST',{answers:payload})
  if(!current())return
  if(result.contentHash!==tool.contentHash){setValidation(null);setPreviewResult(null);setError('服务端定义已变化，当前试填结果不再对应本页版本。请重新读取并核对草稿。');return}
  setPreviewResult(result);setNotice('试填检查完成，未保存被试数据。')
 })}
 const back=()=>{if(!mayLeave())return;setTool(null);setSaved('');setValidation(null);setPreviewing(false);setPreviewResult(null);setVersions([]);setVersionsCursor(null);void refreshList()}
 const editDefinition=(definition:PrivateTool['definition'])=>{if(!locked.current&&tool){setTool({...tool,definition});setPreviewResult(null)}}
 return <section className={`education-private-tools education-private-tools--${entry.toLowerCase()} ${entry==='SCHOOL'?'hs-panel':'ht-panel'}`} aria-label="我的私有工具">
  <header><h2>我的工具</h2><p>心理教师的量表与表单编制空间。草稿和固定版本默认仅作者本人可用，不扩大活动发布或报告读取权限。</p></header>
  <p className="education-private-boundary">支持题目静态图片与报告图片，图片的编辑与上传仅限作者；发布后，仅在对应获授权任务及允许查看的报告中读取固定版本的图片。视频、认知及 SJT 自编暂未开放。固定私有版本不等于发布给被试。</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {issues.length>0&&<ul aria-label="定义检查结果">{issues.map((issue,index)=><li key={index}>{issue.path}：{issue.message}</li>)}</ul>}
  {!tool?<>
   <div className="education-private-toolbar"><label>工具名称<input value={title} maxLength={200} disabled={busy||mediaCount>0||uncertainCreate} onChange={event=>setTitle(event.target.value)}/></label><label>类型<select value={kind} disabled={busy||mediaCount>0||uncertainCreate} onChange={event=>setKind(event.target.value as PrivateToolKind)}><option value="SCALE">量表</option><option value="FORM">表单</option></select></label><button type="button" disabled={busy||mediaCount>0||uncertainCreate||!title.trim()} onClick={create}>创建私有工具</button><button type="button" disabled={busy||mediaCount>0} onClick={()=>void refreshList()}>重新读取列表</button></div>
   {uncertainCreate&&<p role="alert">创建结果尚未确认，已暂停重复创建。请重新读取列表，核对是否已有本次工具，再决定是否创建。</p>}
   {busy&&<p role="status">正在读取或保存，请稍候…</p>}
   {!list.length&&!busy&&<p>暂无私有工具，可先创建一份量表或表单。</p>}
   <div className="education-private-list">{list.map(item=><article key={item.id}><h3>{item.title}</h3><p>{item.kind==='SCALE'?'量表':'表单'} · 草稿修订 {item.revision} · 作者私有</p><button type="button" disabled={busy||mediaCount>0} onClick={()=>open(item.id)}>编辑 {item.title}</button></article>)}</div>
   {cursor&&<button type="button" disabled={busy||mediaCount>0} onClick={()=>void refreshList(cursor)}>加载更多工具</button>}
  </>:<>
   <div className="education-private-toolbar"><button type="button" disabled={busy||mediaCount>0} onClick={back}>返回我的工具</button><button type="button" disabled={busy||mediaCount>0} onClick={()=>open(tool.id)}>重新读取草稿</button><span role="status">{mediaCount>0?'正在上传图片，完成后可保存':busy?'正在处理，请稍候':dirty?'有未保存修改':'草稿已保存'} · 修订 {tool.revision}</span></div>
   <label>工具名称<input value={tool.title} maxLength={200} disabled={busy||mediaCount>0} onChange={event=>{if(!locked.current)setTool({...tool,title:event.target.value})}}/></label>
   <div className="education-private-toolbar"><button type="button" disabled={busy||mediaCount>0||!tool.title.trim()} onClick={()=>void save()}>保存草稿</button><button type="button" disabled={busy||mediaCount>0||dirty} onClick={check}>检查定义</button><button type="button" disabled={busy||mediaCount>0||!checked} onClick={()=>{setPreviewing(value=>!value);setPreviewResult(null)}}>{previewing?'返回编辑':'试填预览'}</button><button type="button" disabled={busy||mediaCount>0||!checked} onClick={freeze}>固定私有版本</button></div>
   {previewing&&checked?<><p>使用已保存定义进行试填，不创建被试任务、不保存正式作答。</p><fieldset disabled={busy||mediaCount>0}><PrivateToolPreview imageAdapter={imageAdapter} tool={tool} answers={answers} onAnswer={(key,value)=>{setAnswers(old=>({...old,[key]:value}));setPreviewResult(null)}}/></fieldset><button type="button" disabled={busy||mediaCount>0} onClick={preview}>检查试填结果</button>{previewResult!==null&&<details open><summary>服务端预览结果</summary><pre>{JSON.stringify(previewResult,null,2)}</pre></details>}</>
    :tool.kind==='SCALE'?<><nav className="education-private-tabs" aria-label="量表编辑分区">{([['responses','响应选项'],['items','题目'],['scores','计分'],['report','报告文案']] as const).map(([key,label])=><button type="button" key={key} disabled={busy||mediaCount>0} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</nav><fieldset disabled={mediaCount>0}><ScaleDefinitionEditor definition={tool.definition as ScaleDefinition} setDefinition={value=>editDefinition(typeof value==='function'?value(tool.definition as ScaleDefinition):value)} activeTab={tab} readOnly={false} controlsDisabled={busy} saveDefinition={save} mediaEnabled={Boolean(imageAdapter)} imageAdapter={imageAdapter} mediaUploadCount={mediaCount} onUploadBusy={onUploadBusy}/></fieldset></>
    :<fieldset disabled={busy||mediaCount>0}><ResearchFormEditor value={tool.definition as FormDraft} onChange={editDefinition} renderImageField={imageAdapter?props=><EducationQuestionImageField {...props} adapter={imageAdapter} onBusy={onUploadBusy} disabled={busy}/>:undefined}/></fieldset>}
   <details><summary>当前显示的固定版本（{versions.length}）</summary>{versionsCursor&&<p>当前仅显示部分固定版本，不代表完整历史。每次最多读取 50 条，可继续加载历史；下方也会显示本次新固定的版本。</p>}{versions.length?versions.map(version=><p key={version.id}>{version.title} · 源修订 {version.sourceRevision} · 固定私有版本</p>):<p>当前未显示固定版本。保存并通过检查后可固定当前定义。</p>}{versionsCursor&&<button type="button" disabled={busy||mediaCount>0} onClick={loadMoreVersions}>加载更多固定版本</button>}<p>固定版本不会被后续草稿修改覆盖，也不会自动授予其他人使用权。</p></details>
  </>}
 </section>
}
