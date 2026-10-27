import {RefreshCw,Info} from 'lucide-react'
import {SchoolPrivateToolCollection,type SchoolPrivateToolControls} from '../../school/SchoolPrivateToolCollection'
import {EducationFormBulkImport} from './EducationFormBulkImport'
import {EducationScaleCsvImport} from './EducationScaleCsvImport'
import {EducationMaterialPicker,EducationMaterialPreview} from './EducationMaterialPicker'
import {useFormPendingBuffers} from '../../modules/assessment-core/form/useFormBulkDraft'
import {EducationPrivateScaleSharing} from './EducationPrivateScaleSharing'
import {createEducationPrivateImageAdapter} from './educationPrivateImageAdapter'
import {EducationQuestionImageField} from './EducationQuestionImageField'
import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react'
import {ScaleDefinitionEditor} from '../../pages/ScaleDefinitionEditor'
import {type ScaleDefinition,updateReportContract} from '../../pages/scaleDefinitionEditorModel'
import {EducationPrivateFormEditor} from './EducationPrivateFormEditor'
import type {FormDraft} from '../../survey/builder.types'
import type {ProfessionalAnswer} from '../../modules/assessment-core/form/types'
import {sanitizeFormAnswers} from '../../modules/assessment-core/form/form-visibility'
import {PrivateToolPreview} from './PrivateToolPreview'
import {privateToolBase,privateToolError,type PrivateToolApi,type PrivateTool,type PrivateToolSummary,type PrivateToolKind,type PrivateToolValidation,type PrivateToolVersion,type PrivateDraftState,type PrivateToolIssue} from './privateToolClient'
import './education-private-tools.css'

type Props={api:PrivateToolApi;organizationId:string;entry:'SCHOOL'|'TEACHER';actorId?:string;onDraftStateChange?:(state:PrivateDraftState)=>void}
function SchoolLayout({entry,className,children}:{entry:Props['entry'];className:string;children:ReactNode}){return entry==='SCHOOL'?<div className={className}>{children}</div>:<>{children}</>}
const mergeById=<T extends {id:string}>(current:T[],next:T[]):T[]=>Array.from(new Map([...current,...next].map(item=>[item.id,item])).values())
const fingerprint=(tool:PrivateTool)=>JSON.stringify({title:tool.title,definition:tool.definition})
/** A keyed session prevents responses from one school from entering another editor. */
export function EducationPrivateToolStudio(props:Props){return <PrivateToolSession key={`${props.entry}:${props.actorId??'session'}:${props.organizationId}`} {...props}/>}
function PrivateToolSession({api,organizationId,entry,actorId='session',onDraftStateChange}:Props){
 const {hasPending:bulkPending,onPendingChange,clear:clearPending}=useFormPendingBuffers()
 const pendingRef=useRef(bulkPending);pendingRef.current=bulkPending
 const [csvPending,setCsvPending]=useState(false)
 const [importBusy,setImportBusy]=useState(false)
 const importPending=useRef(false)
 const onImportBusy=useCallback((value:boolean)=>{importPending.current=value;setImportBusy(value)},[])
 const base=privateToolBase(organizationId)
 const [list,setList]=useState<PrivateToolSummary[]>([])
 const [cursor,setCursor]=useState<string|null>(null)
 const [catalog,setCatalog]=useState<SchoolPrivateToolControls>({query:'',sort:'updated',view:'list'})
 const [editorSessionRevision,setEditorSessionRevision]=useState(0)
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
 const [sharingVersion,setSharingVersion]=useState<PrivateToolVersion|null>(null)
 const [sharingState,setSharingState]=useState<PrivateDraftState>({dirty:false,writing:false})
 const sharingStateRef=useRef(sharingState);sharingStateRef.current=sharingState
 const [tab,setTab]=useState<'responses'|'items'|'scores'|'report'>('responses')
 const [previewing,setPreviewing]=useState(false)
 const [answers,setAnswers]=useState<Record<string,ProfessionalAnswer>>({})
 const [previewResult,setPreviewResult]=useState<unknown>(null)
 const alive=useRef(true),epoch=useRef(0),locked=useRef(false)
 const toolId=tool?.id
 const imageAdapter=useMemo(()=>toolId?createEducationPrivateImageAdapter({api,entry,actorId,organizationId,toolId}):undefined,[api,entry,actorId,organizationId,toolId])
 const onUploadBusy=useCallback((uploading:boolean)=>{if(!alive.current)return;mediaPending.current=Math.max(0,mediaPending.current+(uploading?1:-1));setMediaCount(mediaPending.current)},[])
 const dirty=tool?fingerprint(tool)!==saved:Boolean(title.trim())
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty||bulkPending||csvPending||sharingState.dirty
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current+=1;locked.current=false}},[])
 useEffect(()=>{onDraftStateChange?.({dirty:dirty||bulkPending||csvPending||sharingState.dirty,writing:busy||importBusy||mediaCount>0||sharingState.writing})},[dirty,bulkPending,csvPending,busy,importBusy,mediaCount,sharingState,onDraftStateChange])
 useEffect(()=>()=>{onDraftStateChange?.({dirty:false,writing:false})},[onDraftStateChange])
 useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(dirtyRef.current||locked.current||importPending.current||mediaPending.current>0||sharingStateRef.current.writing){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[])
 const operate=useCallback(async(work:(current:()=>boolean)=>Promise<void>)=>{
  if(locked.current||importPending.current||mediaPending.current>0||sharingStateRef.current.writing)return
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
 const mayLeave=()=>!locked.current&&!importPending.current&&!sharingStateRef.current.writing&&mediaPending.current===0&&(!dirtyRef.current||window.confirm('当前草稿尚未保存，确定放弃修改吗？'))
 const apply=(value:PrivateTool)=>{setEditorSessionRevision(revision=>revision+1);clearPending();setCsvPending(false);setSharingVersion(null);setSharingState({dirty:false,writing:false});setTool(value);setSaved(fingerprint(value));setValidation(null);setPreviewing(false);setAnswers({});setPreviewResult(null);setTab('responses')}
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
  if(csvPending||pendingRef.current||!tool||!tool.title.trim())return
  await operate(async current=>{
   const submitted:PrivateTool={...tool,title:tool.title.trim(),definition:tool.kind==='SCALE'?updateReportContract(tool.definition as ScaleDefinition):tool.definition}
   const result=await api<Pick<PrivateTool,'revision'|'contentHash'>>(`${base}/${tool.id}`,'PUT',{expectedRevision:tool.revision,title:submitted.title,definition:submitted.definition})
   if(!current())return
   const updated={...submitted,...result}
   setTool(updated);setSaved(fingerprint(updated));setValidation(null);setPreviewResult(null);setNotice('草稿已保存。固定版本需另外运行检查。')
  })
 }
 const check=()=>{if(csvPending||pendingRef.current||!tool||dirty)return;void operate(async current=>{
  const result=await api<PrivateToolValidation>(`${base}/${tool.id}/validate`,'POST',{})
  if(!current())return
  if(result.revision!==tool.revision||result.contentHash!==tool.contentHash){setValidation(null);setError('服务端草稿已变化，请重新读取并核对。');return}
  setValidation(result);setIssues(result.issues);setNotice(result.valid?'技术检查通过，可试填或固定私有版本。':'请根据检查结果完善定义。')
 })}
 const checked=Boolean(tool&&validation?.valid&&!dirty&&!bulkPending&&!csvPending&&validation.revision===tool.revision&&validation.contentHash===tool.contentHash)
 const freeze=()=>{if(csvPending||pendingRef.current||!tool||!checked)return;void operate(async current=>{
  const version=await api<PrivateToolVersion>(`${base}/${tool.id}/freeze`,'POST',{expectedRevision:tool.revision,expectedContentHash:tool.contentHash})
  if(!current())return
  setVersions(old=>[version,...old.filter(item=>item.id!==version.id)]);setNotice('私有版本已固定。此操作不会发布活动、开放学生作答或进入公共工具库。')
 })}
 const preview=()=>{if(csvPending||pendingRef.current||!tool||!checked)return;void operate(async current=>{
  const payload=tool.kind==='SCALE'?(tool.definition as ScaleDefinition).items.filter(item=>answers[item.itemCode]!==undefined).map(item=>({itemCode:item.itemCode,responseValue:answers[item.itemCode]})):sanitizeFormAnswers((tool.definition as FormDraft).pages.flatMap(page=>page.questions),answers)
  const result=await api<{contentHash:string;result:unknown}>(`${base}/${tool.id}/preview`,'POST',{answers:payload})
  if(!current())return
  if(result.contentHash!==tool.contentHash){setValidation(null);setPreviewResult(null);setError('服务端定义已变化，当前试填结果不再对应本页版本。请重新读取并核对草稿。');return}
  setPreviewResult(result);setNotice('试填检查完成，未保存被试数据。')
 })}
 const back=()=>{if(!mayLeave())return;clearPending();setCsvPending(false);setTool(null);setSaved('');setValidation(null);setPreviewing(false);setPreviewResult(null);setVersions([]);setVersionsCursor(null);void refreshList()}
 const editDefinition=(definition:PrivateTool['definition'])=>{if(!locked.current&&!importPending.current&&tool){
  if(JSON.stringify(definition)!==JSON.stringify(tool.definition)){
   setAnswers({});setValidation(null);setPreviewing(false)
   if(Object.keys(answers).length)setNotice('定义已修改，旧版本试填答案已清除，请保存并重新检查后试填。不会影响正式作答数据。')
  }
  setTool({...tool,definition});setPreviewResult(null)
 }}
 const boundaryHelp=<details className="education-private-boundary"><summary>{entry==='SCHOOL'&&!tool?<><Info size={16} aria-hidden="true"/>使用说明</>:'使用范围与权限说明'}</summary><p>草稿和固定版本默认仅作者本人可用，不扩大活动发布或报告读取权限。支持题目静态图片与报告图片，图片的编辑与上传仅限作者；发布后，仅在对应获授权任务及允许查看的报告中读取固定版本的图片。视频、认知及 SJT 自编暂未开放。固定私有版本不等于发布给被试。</p>{entry==='SCHOOL'&&tool&&<ol className="education-private-steps" aria-label="私有工具编制步骤"><li>1 · 编制与保存</li><li>2 · 检查定义</li><li>3 · 试填核对</li><li>4 · 固定版本</li></ol>}</details>
 return <section className={`education-private-tools education-private-tools--${entry.toLowerCase()} ${entry==='SCHOOL'?'hs-panel':'ht-panel'}`} aria-label="我的私有工具">
  {(entry!=='SCHOOL'||tool)&&<SchoolLayout entry={entry} className="education-private-top"><header className="education-private-heading"><div><h2>{tool?`${tool.kind==='SCALE'?'量表':'表单'}编制`:entry==='SCHOOL'?'工具列表':'我的工具'}</h2><p>{tool?'编辑并保存草稿，检查后试填核对，再固定可复用的版本。':'心理教师的量表与表单编制空间。选择已有工具继续编辑，或新建一份草稿。'}</p></div><span className="education-private-badge">作者私有</span></header>
  {boundaryHelp}</SchoolLayout>}
  {error&&<p role="alert">{error}</p>}{notice&&!(entry==='SCHOOL'&&notice==='草稿已保存。固定版本需另外运行检查。')&&<p className="education-private-notice" role="status">{notice}</p>}
  {issues.length>0&&<ul aria-label="定义检查结果">{issues.map((issue,index)=><li key={index}>{issue.path}：{issue.message}</li>)}</ul>}
  {!tool?entry==='SCHOOL'?<SchoolPrivateToolCollection items={list} hasMore={Boolean(cursor)} busy={busy||importBusy||mediaCount>0||sharingState.writing} error={error} controls={catalog} onControls={setCatalog} onRefresh={()=>void refreshList()} onMore={()=>void refreshList(cursor!)} onSelect={open} helpControl={boundaryHelp} createControl={<div className="education-private-library-actions"><details className="education-private-create"><summary>新建工具</summary><div className="education-private-toolbar"><label>工具名称<input value={title} maxLength={200} disabled={busy||importBusy||mediaCount>0||sharingState.writing||uncertainCreate} onChange={event=>setTitle(event.target.value)}/></label><label>类型<select value={kind} disabled={busy||importBusy||mediaCount>0||sharingState.writing||uncertainCreate} onChange={event=>setKind(event.target.value as PrivateToolKind)}><option value="SCALE">量表</option><option value="FORM">表单</option></select></label><button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing||uncertainCreate||!title.trim()} className="education-private-primary" onClick={create}>创建私有工具</button></div></details></div>} uncertainCreate={uncertainCreate}/>:<>
   <div className="education-private-toolbar"><label>工具名称<input value={title} maxLength={200} disabled={busy||importBusy||mediaCount>0||sharingState.writing||uncertainCreate} onChange={event=>setTitle(event.target.value)}/></label><label>类型<select value={kind} disabled={busy||importBusy||mediaCount>0||sharingState.writing||uncertainCreate} onChange={event=>setKind(event.target.value as PrivateToolKind)}><option value="SCALE">量表</option><option value="FORM">表单</option></select></label><button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing||uncertainCreate||!title.trim()} className="education-private-primary" onClick={create}>创建私有工具</button><button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing} onClick={()=>void refreshList()}>重新读取列表</button></div>
   {uncertainCreate&&<p role="alert">创建结果尚未确认，已暂停重复创建。请重新读取列表，核对是否已有本次工具，再决定是否创建。</p>}
   {busy&&<p role="status">正在读取或保存，请稍候…</p>}
   {!list.length&&!busy&&<p>暂无私有工具，可先创建一份量表或表单。</p>}
   <div className="education-private-list">{list.map(item=><article key={item.id}><div><h3>{item.title}</h3><p>{item.kind==='SCALE'?'量表':'表单'} · 草稿修订 {item.revision} · 作者私有</p></div><button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing} aria-label={'编辑 '+item.title} onClick={()=>open(item.id)}>编辑 {item.title}</button></article>)}</div>
   {cursor&&<button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing} onClick={()=>void refreshList(cursor)}>加载更多工具</button>}
  </>:<>
   <SchoolLayout entry={entry} className="education-private-editor-overview"><div className="education-private-toolbar education-private-navigation"><button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing} onClick={back}>返回我的工具</button><button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing} aria-label="重新读取草稿" title="重新读取草稿" className={entry==='SCHOOL'?'education-private-reload':undefined} onClick={()=>open(tool.id)}>{entry==='SCHOOL'?<RefreshCw size={18} aria-hidden="true"/>:<>重新读取草稿</>}</button><span className="education-private-save-state" role="status" aria-live="polite">{csvPending?(tool?.kind==='FORM'?'有待处理表单导入内容':'有待处理CSV内容'):bulkPending?'有未应用批量内容':mediaCount>0?'正在上传图片，完成后可保存':busy?'正在处理，请稍候':dirty?'有未保存修改':'草稿已保存'} · 修订 {tool.revision}</span></div>
   {entry==='TEACHER'&&<ol className="education-private-steps" aria-label="私有工具编制步骤"><li>1 · 编制与保存</li><li>2 · 检查定义</li><li>3 · 试填核对</li><li>4 · 固定版本</li></ol>}
   <SchoolLayout entry={entry} className="education-private-editor-controls"><label className="education-private-title-field">工具名称<input value={tool.title} maxLength={200} disabled={busy||importBusy||mediaCount>0||sharingState.writing} onChange={event=>{if(!locked.current)setTool({...tool,title:event.target.value})}}/></label>
   <div className="education-private-toolbar education-private-actions" role="group" aria-label="草稿与版本操作"><button type="button" className={checked?undefined:'education-private-primary'} disabled={busy||importBusy||mediaCount>0||sharingState.writing||bulkPending||csvPending||!tool.title.trim()} onClick={()=>void save()}>保存草稿</button><button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing||bulkPending||csvPending||dirty} onClick={check}>检查定义</button><button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing||!checked} onClick={()=>{setPreviewing(value=>!value);setPreviewResult(null)}}>{previewing?'返回编辑':'试填预览'}</button><button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing||!checked} className={checked?'education-private-primary':undefined} onClick={freeze}>固定私有版本</button></div></SchoolLayout>
   <p className="education-private-step-help">{dirty?'请先保存修改，再检查定义。':checked?'定义检查已通过。建议试填核对后固定版本；活动发布仍在活动工作区单独完成。':'保存后检查定义，检查通过后可试填和固定版本。'}</p></SchoolLayout>
   {entry==='SCHOOL'&&tool.kind==='FORM'&&!previewing&&<EducationFormBulkImport key={`${tool.id}:${editorSessionRevision}`} api={api} organizationId={organizationId} actorId={actorId} tool={tool} disabled={dirty||bulkPending||busy||importBusy||mediaCount>0||sharingState.writing} onBusy={onImportBusy} onPendingChange={setCsvPending} onImported={value=>{apply(value);setNotice('表单题目已追加并保存，请重新检查定义。')}}/>}
   {previewing&&checked?<><p>使用已保存定义进行试填，不创建被试任务、不保存正式作答。</p><fieldset disabled={busy||importBusy||mediaCount>0||sharingState.writing}><PrivateToolPreview renderMaterials={items=>items?.map(item=><EducationMaterialPreview key={item.asset.assetId} api={api} organizationId={organizationId} toolId={tool.id} item={item}/>)} imageAdapter={imageAdapter} tool={tool} answers={answers} onAnswer={(key,value)=>{setAnswers(old=>({...old,[key]:value}));setPreviewResult(null)}}/></fieldset><button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing} onClick={preview}>检查试填结果</button>{previewResult!==null&&<details open><summary>服务端预览结果</summary><pre>{JSON.stringify(previewResult,null,2)}</pre></details>}</>
    :tool.kind==='SCALE'?<><nav className="education-private-tabs" aria-label="量表编辑分区">{([['responses','响应选项'],['items','题目'],['scores','计分'],['report','报告文案']] as const).map(([key,label])=><button type="button" key={key} disabled={csvPending||busy||importBusy||mediaCount>0||sharingState.writing} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</nav><fieldset disabled={mediaCount>0||sharingState.writing}><ScaleDefinitionEditor importControl={<EducationScaleCsvImport api={api} organizationId={organizationId} tool={tool} disabled={dirty||bulkPending||busy||importBusy||mediaCount>0||sharingState.writing} onPendingChange={setCsvPending} onBusy={onImportBusy} onImported={value=>{apply(value);setNotice('CSV题目已导入并保存，请重新检查定义。')}}/>} key={`${tool.id}:${editorSessionRevision}`} renderItemMaterials={(item,change)=><EducationMaterialPicker api={api} entry={entry} actorId={actorId} organizationId={organizationId} toolId={tool.id} value={item.materials} onChange={materials=>change({materials})} disabled={busy||importBusy||csvPending} label="题目展示素材" onBusy={onUploadBusy}/>} renderFeedbackContent={(content,change)=><EducationMaterialPicker api={api} entry={entry} actorId={actorId} organizationId={organizationId} toolId={tool.id} value={content.materials} onChange={materials=>change({...content,materials})} disabled={busy||importBusy||csvPending} label="反馈展示素材" onBusy={onUploadBusy}/>} renderFeedbackPreview={content=>content.materials?.map(item=><EducationMaterialPreview key={item.asset.assetId} api={api} organizationId={organizationId} toolId={tool.id} item={item}/>)} onPendingChange={onPendingChange} definition={tool.definition as ScaleDefinition} setDefinition={value=>editDefinition(typeof value==='function'?value(tool.definition as ScaleDefinition):value)} activeTab={tab} readOnly={false} controlsDisabled={busy||importBusy||csvPending||sharingState.writing} saveDefinition={save} mediaEnabled={Boolean(imageAdapter)} imageAdapter={imageAdapter} mediaUploadCount={mediaCount} onUploadBusy={onUploadBusy}/></fieldset></>
    :<fieldset disabled={busy||importBusy||csvPending||mediaCount>0||sharingState.writing}><EducationPrivateFormEditor compactSettings={entry==='SCHOOL'} renderMaterials={(question,change)=><EducationMaterialPicker api={api} entry={entry} actorId={actorId} organizationId={organizationId} toolId={tool.id} value={question.materials} onChange={materials=>change({...question,materials})} disabled={busy||importBusy||csvPending} label="题目展示素材" onBusy={onUploadBusy}/>} bulkPending={bulkPending} onPendingChange={onPendingChange} key={`${tool.id}:${editorSessionRevision}`} value={tool.definition as FormDraft} onChange={editDefinition} renderImageField={imageAdapter?props=><EducationQuestionImageField {...props} adapter={imageAdapter} onBusy={onUploadBusy} disabled={busy}/>:undefined}/></fieldset>}
   <details className="education-private-versions"><summary>当前显示的固定版本（{versions.length}）</summary><p className="education-private-step-help">每个版本保留固定时的内容。后续编辑只改变草稿，不会覆盖已固定版本。</p>{versionsCursor&&<p>当前仅显示部分固定版本，不代表完整历史。每次最多读取 50 条，可继续加载历史；下方也会显示本次新固定的版本。</p>}{versions.length?versions.map(version=><div className="education-private-version" key={version.id}><div><strong>{version.title}</strong><p>源修订 {version.sourceRevision} · 固定私有版本</p></div>{tool.kind==='SCALE'&&<button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing} onClick={()=>{
    if(sharingVersion?.id===version.id)return
    if(sharingState.dirty&&!window.confirm('切换入库申请版本将放弃尚未提交的申请内容，是否继续？'))return
    setSharingVersion(version);setSharingState({dirty:false,writing:false})
   }}>申请入库 / 查看申请 · 修订 {version.sourceRevision}</button>}</div>):<p>当前未显示固定版本。保存并通过检查后可固定当前定义。</p>}{versionsCursor&&<button type="button" disabled={busy||importBusy||mediaCount>0||sharingState.writing} onClick={loadMoreVersions}>加载更多固定版本</button>}<p>固定版本不会被后续草稿修改覆盖，也不会自动授予其他人使用权。</p></details>
   {tool.kind==='SCALE'&&sharingVersion&&<><button type="button" disabled={sharingState.writing} onClick={()=>{
    if(sharingState.dirty&&!window.confirm('关闭入库申请将放弃尚未提交的申请内容，是否继续？'))return
    setSharingVersion(null);setSharingState({dirty:false,writing:false})
   }}>关闭入库申请</button><EducationPrivateScaleSharing api={api} entry={entry} organizationId={organizationId} actorId={actorId} toolId={tool.id} version={sharingVersion} disabled={busy||mediaCount>0} onDraftStateChange={setSharingState}/></>}
  </>}
 </section>
}
