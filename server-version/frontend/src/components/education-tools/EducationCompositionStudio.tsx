import {contextOptionsForKey,assessmentContextLabels,type AssessmentContextKey} from '../../modules/assessment-context/options'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {EducationPrivateVersionChooser} from './EducationPrivateVersionChooser'
import {SchoolPrivateGroupDisclosure} from './SchoolPrivateGroupDisclosure'
import {CompositionOutline} from '../../modules/assessment-core/composition/CompositionOutline'
import {SchoolPrivateToolCollection,type SchoolPrivateToolControls} from '../../school/SchoolPrivateToolCollection'
import {PrivateToolPreview,type PrivateToolPreviewValue} from './PrivateToolPreview'
import {EducationPublicFormChooser} from './EducationPublicFormChooser'
import {educationPublicFormPreviewMedia,publicNativePreviewPath,publicFormPreviewPath,publicStandardPreviewPath,libraryScalePreviewPath} from './educationPublicFormClient'
import {createEducationPrivateImageAdapter} from './educationPrivateImageAdapter'
import {EducationMaterialPreview} from './EducationMaterialPicker'
import {privateToolBase,privateToolError,type PrivateToolApi,type PrivateToolVersion,type PrivateTool,type PrivateDraftState} from './privateToolClient'
import {compositionTitle,type CompositionTool,type CompositionSummary,type CompositionReference,type CompositionSource} from './educationCompositionClient'
import {compositionAdministrationForEntry,compositionAdministrationLabel,type CompositionResponseMode} from './educationCompositionAdministration'
import type {ProfessionalAnswer} from '../../modules/assessment-core/form/types'
import '../../survey/survey-composition-studio.css'
import './education-composition.css'

type Props={api:PrivateToolApi;organizationId:string;actorId:string;entry:'SCHOOL'|'TEACHER';onDraftStateChange?:(value:PrivateDraftState)=>void}
const merge=<T extends {id:string}>(old:T[],rows:T[])=>Array.from(new Map([...old,...rows].map(row=>[row.id,row])).values())
const mergeReferences=(old:CompositionReference[],rows:CompositionReference[])=>Array.from(new Map([...old,...rows].map(row=>[row.sourceProvider+':'+row.id,row])).values())
const referenceVersion=(reference:CompositionReference|undefined)=>reference?.sourceProvider==='PRIVATE_VERSION'?reference.sourceRevision:reference?.version??'已选'
const fingerprint=(tool:CompositionTool)=>JSON.stringify({title:tool.title,definition:tool.definition})
/** Product adapter: exact private versions and current entry authority stay
 * in the education API. The ordered editor and leaf preview are shared UI. */
export function EducationCompositionStudio(props:Props){
 const scope=useRef({api:props.api,actorId:props.actorId,organizationId:props.organizationId,entry:props.entry,epoch:0})
 if(scope.current.api!==props.api||scope.current.actorId!==props.actorId||scope.current.organizationId!==props.organizationId||scope.current.entry!==props.entry)
  scope.current={...props,epoch:scope.current.epoch+1}
 return <CompositionSession key={scope.current.epoch} {...props}/>
}
function CompositionSession({api,organizationId,actorId,entry,onDraftStateChange}:Props){
 const base=privateToolBase(organizationId)
 const [rows,setRows]=useState<CompositionSummary[]>([]),[cursor,setCursor]=useState<string|null>(null)
 const [controls,setControls]=useState<SchoolPrivateToolControls>({query:'',sort:'updated',view:'list'})
 const [tool,setTool]=useState<CompositionTool|null>(null),[saved,setSaved]=useState(''),[title,setTitle]=useState('')
 const [references,setReferences]=useState<CompositionReference[]>([]),[versions,setVersions]=useState<PrivateToolVersion[]>([])
 const [versionsCursor,setVersionsCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [uncertain,setUncertain]=useState(false),[preview,setPreview]=useState(false),[previewIndex,setPreviewIndex]=useState(0)
 const [previewTool,setPreviewTool]=useState<PrivateToolPreviewValue|null>(null),[previewError,setPreviewError]=useState(''),[previewInstruction,setPreviewInstruction]=useState('')
 const [sourceView,setSourceView]=useState<'PRIVATE'|'PUBLIC_FORM'|'STANDARD_SCALE'|'LIBRARY_SCALE'|'COGNITIVE_CONFIG'|'SJT_RELEASE'>('PRIVATE')
 const [nativePreview,setNativePreview]=useState<{kind:'COGNITIVE'|'SJT';profile?:'experience'|'standard'|'research';instruction?:string}|null>(null)
 const [answers,setAnswers]=useState<Record<string,ProfessionalAnswer>>({})
 const mounted=useRef(true),epoch=useRef(0),locked=useRef(false)
 const dirty=tool?fingerprint(tool)!==saved:Boolean(title.trim()),dirtyRef=useRef(dirty);dirtyRef.current=dirty
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++}},[])
 useEffect(()=>{onDraftStateChange?.({dirty,writing:busy})},[dirty,busy,onDraftStateChange])
 useEffect(()=>()=>{onDraftStateChange?.({dirty:false,writing:false})},[onDraftStateChange])
 useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(dirtyRef.current||locked.current){event.preventDefault();event.returnValue=''}}
  window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[])
 const operate=useCallback(async(work:(current:()=>boolean)=>Promise<void>)=>{
  if(locked.current)return
  locked.current=true;setBusy(true);setError('');setNotice('')
  const token=epoch.current,current=()=>mounted.current&&token===epoch.current
  try{await work(current)}catch(reason){if(current())setError(privateToolError(reason))}
  finally{if(current()){locked.current=false;setBusy(false)}}
 },[])
 const refresh=useCallback((next?:string)=>operate(async current=>{
  const data=await api<{list:CompositionSummary[];nextCursor:string|null}>(base+'?kind=COMPOSITION'+(next?'&cursor='+encodeURIComponent(next):''))
  if(current()){setRows(old=>merge(next?old:[],data.list));setCursor(data.nextCursor);setUncertain(false)}
 }),[api,base,operate])
 useEffect(()=>{void refresh()},[refresh])
 const mayLeave=()=>!locked.current&&(!dirtyRef.current||window.confirm('当前问卷尚未保存，确定放弃修改吗？'))
 const apply=(value:CompositionTool)=>{setTool(value);setSaved(fingerprint(value));setReferences(value.references??[]);setPreview(false);setPreviewTool(null)}
 const open=(id:string)=>{
  if(!mayLeave())return
  void operate(async current=>{
   const value=await api<CompositionTool>(`${base}/${encodeURIComponent(id)}`)
   if(!current())return
   if(value.kind!=='COMPOSITION'||!compositionAdministrationForEntry(value.definition.administration,entry))throw new Error('这份问卷的施测对象或作答方式不适用于当前编制入口。')
   apply(value);setVersions([]);setVersionsCursor(null)
   const history=await api<{list:PrivateToolVersion[];nextCursor:string|null}>(`${base}/${id}/versions`)
   if(current()){setVersions(history.list);setVersionsCursor(history.nextCursor)}
  })
 }
 const create=()=>{if(uncertain||!title.trim())return;void operate(async current=>{
  try{const value=await api<CompositionTool>(base,'POST',{kind:'COMPOSITION',title:title.trim()})
   if(current()){apply(value);setTitle('');setVersions([]);setVersionsCursor(null);setNotice('普通问卷草稿已创建。')}}
  catch(reason){if(current())setUncertain(true);throw reason}
 })}
 const change=(patch:Partial<CompositionTool>)=>{if(tool&&!locked.current){setTool({...tool,...patch});setPreview(false);setPreviewTool(null)}}
 const changeResponseMode=(responseMode:CompositionResponseMode)=>{
  if(!tool||locked.current||tool.definition.administration.responseMode===responseMode)return
  const administration=compositionAdministrationForEntry({population:tool.definition.administration.population,responseMode,...(responseMode==='EXPERT_REPORT'?{targetKind:'PERSON'}:{})},entry)
  if(!administration)return
  if((tool.definition.blocks.length||['STUDENT_REPORT','EXPERT_REPORT'].includes(responseMode)&&tool.definition.contextFields?.length)
   &&!window.confirm('更改作答方式需要重新选择适用的固定工具。确定清空当前工具列表及不适用的个人背景字段吗？'))return
  const {contextFields,...definition}=tool.definition
  delete definition.groupReporting
  setReferences([]);setAnswers({});setSourceView('PRIVATE');change({definition:{...definition,schemaVersion:responseMode==='EXPERT_REPORT'?2:1,adapterVersion:responseMode==='EXPERT_REPORT'?'2.0.0':'1.0.0',
   ...(!['STUDENT_REPORT','EXPERT_REPORT'].includes(responseMode)&&contextFields?{contextFields}:{}),administration,blocks:[]}})
 }
 const save=()=>{if(!tool||!tool.title.trim())return;void operate(async current=>{
  const submitted={...tool,title:tool.title.trim()}
  const result=await api<CompositionTool>(`${base}/${tool.id}`,'PUT',{expectedRevision:tool.revision,title:submitted.title,definition:tool.definition})
  if(current()){const next={...submitted,...result};setTool(next);setSaved(fingerprint(next));setNotice('问卷草稿已保存。')}
 })}
 const freeze=()=>{if(!tool||dirty||!tool.definition.blocks.length)return;void operate(async current=>{
  const value=await api<PrivateToolVersion>(`${base}/${tool.id}/freeze`,'POST',{expectedRevision:tool.revision,expectedContentHash:tool.contentHash})
  if(current()){setVersions(old=>merge([{...value,administration:tool.definition.administration}],old));setNotice('问卷版本已固定。请在'+(entry==='SCHOOL'?'本人学校活动的测评批次':'学校改进的评价活动')+'中选用本版本，再预览并发布任务。')}
 })}
 // A preview renders the saved local revision's exact immutable leaves. Do not
 // first call the legacy whole-composition preview (all bodies + compilation)
 // and then fetch those bodies again. Freeze alone owns full runtime validation
 // and rechecks the actual draft revision/hash; preview is never its receipt.
 const showPreview=()=>{if(!tool||dirty||locked.current||!tool.definition.blocks.length)return
  setPreview(true);setPreviewIndex(0);setAnswers({});setPreviewTool(null);setPreviewError('')
 }
 const block=preview?tool?.definition.blocks[previewIndex]:undefined
 const responseMode=tool?.definition.administration.responseMode??'SELF'
 const groupChoices=responseMode==='SELF'?tool?.definition.blocks.flatMap(block=>{
  const reference=references.find(reference=>reference.sourceProvider===block.source.provider&&reference.id===block.source.versionId&&reference.contentHash===block.source.contentHash)
  return reference&&'groupChoice' in reference&&reference.groupChoice?[{...reference.groupChoice,blockId:block.blockId}]:[]
 })??[]:[]
 const sourceViewActual=sourceView
 const targetKind=tool?.definition.administration.responseMode==='EXPERT_REPORT'?tool.definition.administration.targetKind:undefined
 const reference=block?references.find(row=>row.sourceProvider===block.source.provider&&row.id===block.source.versionId&&row.contentHash===block.source.contentHash):undefined
 useEffect(()=>{
  let current=true;setPreviewTool(null);setNativePreview(null);setPreviewError('');setPreviewInstruction('');setAnswers({})
  if(block&&reference&&(block.source.provider==='COGNITIVE_CONFIG'||block.source.provider==='SJT_RELEASE')){
   const selected=block.source
   void api<{id:string;kind:'COGNITIVE'|'SJT';contentHash:string;profile?:'experience'|'standard'|'research';instruction?:string}>(publicNativePreviewPath(organizationId,selected))
    .then(value=>{if(current){if(value.id!==selected.versionId||value.contentHash!==selected.contentHash||value.kind!==selected.kind||selected.provider==='COGNITIVE_CONFIG'&&value.profile!==selected.profile)throw new Error('固定原生工具身份已不匹配。');setNativePreview(value)}}).catch(reason=>{if(current)setPreviewError(privateToolError(reason))})
   return()=>{current=false}
  }
  if(block&&reference)void api<{id:string;kind:'SCALE'|'FORM';title:string;contentHash:string;definition:PrivateTool['definition'];instruction?:string}>(
   reference.sourceProvider==='PRIVATE_VERSION'?`${base}/${reference.toolId}/versions/${block.source.versionId}`:reference.sourceProvider==='PUBLIC_FORM'?publicFormPreviewPath(organizationId,reference.id,reference.contentHash,responseMode,targetKind):reference.sourceProvider==='LIBRARY_SCALE'?libraryScalePreviewPath(organizationId,reference.id,reference.contentHash,responseMode,targetKind):publicStandardPreviewPath(organizationId,reference.id,reference.contentHash,responseMode,targetKind))
   .then(value=>{if(current){
    if(value.id!==block.source.versionId||value.contentHash!==block.source.contentHash||value.kind!==block.source.kind)throw new Error('固定工具身份已不匹配。')
    setPreviewTool({id:reference.sourceProvider==='PRIVATE_VERSION'?reference.toolId:reference.id,title:value.title,kind:value.kind,definition:value.definition});setPreviewInstruction(value.instruction??'')
   }}).catch(reason=>{if(current)setPreviewError(privateToolError(reason))})
  return()=>{current=false}
 },[api,base,organizationId,block,reference,responseMode,targetKind])
 const previewToolId=previewTool?.id
 const publicMedia=useMemo(()=>block&&(block.source.provider==='PUBLIC_FORM'||block.source.provider==='STANDARD_SCALE'||block.source.provider==='LIBRARY_SCALE')?educationPublicFormPreviewMedia({api,entry,organizationId,actorId,versionId:block.source.versionId,contentHash:block.source.contentHash,provider:block.source.provider}):undefined,
  [api,entry,organizationId,actorId,block?.source.provider,block?.source.versionId,block?.source.contentHash])
 const imageAdapter=useMemo(()=>publicMedia?.imageAdapter??(previewToolId?createEducationPrivateImageAdapter({api,entry,organizationId,toolId:previewToolId,actorId}):undefined),
  [publicMedia,api,entry,organizationId,previewToolId,actorId])
 const moreVersions=()=>{if(!tool||!versionsCursor)return;void operate(async current=>{
  const page=await api<{list:PrivateToolVersion[];nextCursor:string|null}>(`${base}/${tool.id}/versions?cursor=${encodeURIComponent(versionsCursor)}`)
  if(current()){setVersions(old=>merge(old,page.list));setVersionsCursor(page.nextCursor)}
 })}
 return <section className={'education-private-tools education-private-tools--'+entry.toLowerCase()+' '+(entry==='SCHOOL'?'hs-panel':'ht-panel')+' education-composition-studio education-composition-studio--'+entry.toLowerCase()} aria-label="普通问卷编制">
  <header className="education-private-heading"><div><h2>{tool?'普通问卷编制':'我的普通问卷'}</h2><p>将本人固定量表和表单、获授权公共量表与表单编成一份{entry==='SCHOOL'?'学生自评或家长、教师观察':'教师自评或学生评教'}问卷，各项保留独立计分与反馈。本人作答还可加入获授权的认知与情境任务。</p></div></header>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!tool?<>
   <form onSubmit={event=>{event.preventDefault();create()}}><label>问卷名称<input value={title} maxLength={200} onChange={event=>setTitle(event.target.value)} disabled={busy}/></label><button type="submit" disabled={busy||uncertain||!title.trim()}>新建普通问卷</button></form>
   <SchoolPrivateToolCollection items={rows} hasMore={!!cursor} busy={busy} error={error} controls={controls} onControls={setControls}
    onRefresh={()=>void refresh()} onMore={()=>void refresh(cursor??undefined)} onSelect={open} createControl={null} helpControl={null} uncertainCreate={uncertain}
    emptyText="暂无普通问卷，可先新建一份。" placeholder="搜索问卷名称"/>
  </>:<>
   <div className="education-private-actions"><button type="button" disabled={busy} onClick={()=>{if(mayLeave()){setTool(null);setSaved('');void refresh()}}}>返回普通问卷列表</button>
    <button type="button" disabled={busy||!dirty||!tool.title.trim()} onClick={save}>保存问卷草稿</button>
    <button type="button" disabled={busy||dirty||!tool.definition.blocks.length} onClick={showPreview}>预览问卷</button>
    <button type="button" disabled={busy||dirty||!tool.definition.blocks.length} onClick={freeze}>固定问卷版本</button></div>
   {dirty&&<p role="status">当前有未保存修改，请先保存后再预览或固定版本。</p>}
   <label>问卷名称<input value={tool.title} maxLength={200} disabled={busy} onChange={event=>change({title:event.target.value})}/></label>
   <label>问卷作答方式<select value={responseMode} disabled={busy} onChange={event=>changeResponseMode(event.target.value as CompositionResponseMode)}>
    {entry==='SCHOOL'?<><option value="SELF">学生自评</option><option value="PARENT_REPORT">家长观察学生</option><option value="TEACHER_REPORT">教师观察学生</option></>:
     <><option value="SELF">教师自评</option><option value="STUDENT_REPORT">学生评价教师</option><option value="EXPERT_REPORT">受邀专家观察</option></>}
   </select></label>
   {['PARENT_REPORT','TEACHER_REPORT'].includes(responseMode)&&<p>观察任务按当前有效关系分配给家长或教师。参与作答不自动获得学生个人报告，各项反馈仍独立核准。</p>}
   <label>问卷说明<textarea value={tool.definition.instruction} maxLength={16000} disabled={busy} onChange={event=>change({definition:{...tool.definition,instruction:event.target.value}})}/></label>
   {responseMode==='STUDENT_REPORT'&&<p>学生评教仅开放符合人数与隐私规则的群体反馈，不显示学生个人答案。本模式不采集个人背景页；需要受评教师个人背景才能计分的工具暂不能加入。</p>}
   {tool.definition.administration.responseMode==='EXPERT_REPORT'&&<div><label>专家观察目标类型<select disabled={busy} value={tool.definition.administration.targetKind} onChange={event=>{
    const administration=compositionAdministrationForEntry({population:'TEACHER',responseMode:'EXPERT_REPORT',targetKind:event.target.value},entry)
    if(!administration||tool.definition.blocks.length&&!window.confirm('改变观察目标需要重新选择适用工具，确认清空当前工具列表？'))return
    setReferences([]);setAnswers({});change({definition:{...tool.definition,administration,blocks:[]}})
   }}>{[['PERSON','教师个人'],['TEAM','团队'],['ORGANIZATION','组织'],['ACTIVITY','活动'],['ARTIFACT','作品'],['PROJECT','项目']].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <p>专家按接受的活动邀请观察真实目标。量表须在原固定版本中明确声明专家观察，且只用于教师个人；其他目标只用表单。正式证据与被评教师可见反馈分别授权。</p>
    <p>公共和共用工具须有匹配本次目标的显式专家观察声明，并已获授权；已有自评或其他他评声明不能代替。</p></div>}
   <fieldset disabled={busy||responseMode==='STUDENT_REPORT'||responseMode==='EXPERT_REPORT'}><legend>背景信息区段</legend><p>按所选工具的原版适用范围配置；勾选后会作为问卷第一屏展示并固定。未勾选时不会增加背景页。</p>
    {(['gradeLevel','birthYearMonth','sexAtBirth','primaryLanguage','countryOrRegion'] as AssessmentContextKey[]).map(key=>{
     const labels=assessmentContextLabels
     return <label key={key}><input type="checkbox" checked={tool.definition.contextFields?.some(field=>field.contextKey===key)??false} onChange={event=>{
      const fields=(tool.definition.contextFields??[]).filter(field=>field.contextKey!==key)
      if(event.target.checked)fields.push({contextKey:key,formType:key==='birthYearMonth'?'year_month':'single_choice',formLabel:labels[key],formOptions:contextOptionsForKey(key)})
      const {contextFields:_,...definition}=tool.definition;change({definition:{...definition,...(fields.length?{contextFields:fields}:{})}})
     }}/>{labels[key]}</label>
    })}
   </fieldset>
   <div className="survey-composition-studio"><div><nav aria-label="问卷工具来源"><button type="button" aria-pressed={sourceViewActual==='PRIVATE'} onClick={()=>setSourceView('PRIVATE')}>本人固定工具</button><button type="button" aria-pressed={sourceViewActual==='PUBLIC_FORM'} onClick={()=>setSourceView('PUBLIC_FORM')}>获授权公共表单</button><button type="button" aria-pressed={sourceViewActual==='STANDARD_SCALE'} onClick={()=>setSourceView('STANDARD_SCALE')}>获授权公共量表</button><button type="button" aria-pressed={sourceViewActual==='LIBRARY_SCALE'} onClick={()=>setSourceView('LIBRARY_SCALE')}>获授权共用量表</button><button type="button" disabled={responseMode!=='SELF'} aria-pressed={sourceViewActual==='COGNITIVE_CONFIG'} onClick={()=>setSourceView('COGNITIVE_CONFIG')}>获授权认知任务</button><button type="button" disabled={responseMode!=='SELF'} aria-pressed={sourceViewActual==='SJT_RELEASE'} onClick={()=>setSourceView('SJT_RELEASE')}>获授权情境任务</button></nav>
    {sourceViewActual==='PRIVATE'?<EducationPrivateVersionChooser key={tool.id+':'+responseMode+':'+(tool.definition.administration.responseMode==='EXPERT_REPORT'?tool.definition.administration.targetKind:'')} api={api} organizationId={organizationId} disabled={busy||tool.definition.blocks.length>=50}
     onSelect={value=>{if(value.kind==='COMPOSITION')return;if(value.kind==='SCALE'&&tool.definition.administration.responseMode==='EXPERT_REPORT'&&tool.definition.administration.targetKind!=='PERSON'){setError('非人员观察目标只支持表单');return}const leaf={...value,kind:value.kind,sourceProvider:'PRIVATE_VERSION' as const};setReferences(old=>mergeReferences(old,[leaf]));change({definition:{...tool.definition,blocks:[...tool.definition.blocks,
      {blockId:crypto.randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:value.kind,versionId:value.id,contentHash:value.contentHash}}]}})}}/>:
     <EducationPublicFormChooser key={sourceViewActual+':'+responseMode} kind={sourceViewActual==='PUBLIC_FORM'?'FORM':sourceViewActual==='COGNITIVE_CONFIG'?'COGNITIVE':sourceViewActual==='SJT_RELEASE'?'SJT':'SCALE'} catalog={sourceViewActual==='LIBRARY_SCALE'?'LIBRARY':'PUBLIC'} responseMode={responseMode} targetKind={targetKind} api={api} entry={entry} organizationId={organizationId} actorId={actorId} disabled={busy||tool.definition.blocks.length>=50} onChoose={value=>{
      if(value.kind==='SCALE'&&targetKind&&targetKind!=='PERSON'){setError('非人员观察目标只支持表单');return}
      if((value.kind==='COGNITIVE'||value.kind==='SJT')&&responseMode!=='SELF'){setError('认知与情境任务仅支持本人作答。');return}
      if(value.kind==='COGNITIVE'&&!value.profile){setError('请选择明确的认知任务版本。');return}
      const provider=value.sourceProvider==='FORM'?'PUBLIC_FORM' as const:value.sourceProvider
      const common={versionId:value.sourceId,contentHash:value.contentHash}
      const source:CompositionSource=provider==='COGNITIVE_CONFIG'?{...common,provider,kind:'COGNITIVE',profile:value.profile!,...(value.artifactHash&&value.selectedBinding?{artifactHash:value.artifactHash,selectedBinding:value.selectedBinding}:{})}:provider==='SJT_RELEASE'?{...common,provider,kind:'SJT'}:provider==='LIBRARY_SCALE'?{...common,provider,kind:'SCALE'}:provider==='STANDARD_SCALE'?{...common,provider,kind:'SCALE',...(value.selectedBinding?{selectedBinding:value.selectedBinding}:{})}:{...common,provider:'PUBLIC_FORM',kind:'FORM'}
      setReferences(old=>mergeReferences(old,[{id:value.sourceId,sourceProvider:provider,kind:value.kind,title:value.title,contentHash:value.contentHash,version:value.versions.content,versions:value.versions,requiredContextKeys:value.requiredContextKeys}]))
      change({definition:{...tool.definition,blocks:[...tool.definition.blocks,{blockId:crypto.randomUUID(),instruction:'',source}]}})
     }}/>}</div>
    <CompositionOutline items={tool.definition.blocks.map(row=>({id:row.blockId,title:compositionTitle(row,references),
     detail:(row.source.provider==='LIBRARY_SCALE'?'共用量表':row.source.provider==='STANDARD_SCALE'?'公共量表':row.source.provider==='PUBLIC_FORM'?'公共表单':row.source.kind==='COGNITIVE'?'认知任务 · '+{experience:'体验版',standard:'正式版',research:'科研版'}[row.source.profile]:row.source.kind==='SJT'?'情境任务':row.source.kind==='SCALE'?'量表':'表单')+(row.source.provider==='STANDARD_SCALE'&&row.source.selectedBinding?' · 管理员固定配置':' · 固定版本 '+referenceVersion(references.find(ref=>ref.sourceProvider===row.source.provider&&ref.id===row.source.versionId&&ref.contentHash===row.source.contentHash)))}))} max={50} disabled={busy}
     onMove={(index,offset)=>{const blocks=[...tool.definition.blocks];[blocks[index],blocks[index+offset]]=[blocks[index+offset],blocks[index]];change({definition:{...tool.definition,blocks}})}}
     onRemove={index=>change({definition:{...tool.definition,blocks:tool.definition.blocks.filter((_,i)=>i!==index)}})}
     renderItemEditor={(_,index)=><><label className="education-composition-block-instruction">工具衔接说明 {index+1}<textarea value={tool.definition.blocks[index].instruction} maxLength={16000} disabled={busy}
      onChange={event=>change({definition:{...tool.definition,blocks:tool.definition.blocks.map((block,i)=>i===index?{...block,instruction:event.target.value}:block)}})}/></label>{responseMode==='SELF'&&tool.definition.blocks[index].source.kind!=='FORM'&&<label><input type="checkbox" disabled={busy} checked={tool.definition.blocks[index].longitudinal===true} onChange={event=>change({definition:{...tool.definition,blocks:tool.definition.blocks.map((block,i)=>i===index?{...block,longitudinal:event.target.checked}:block)}})}/>允许本工具已获准的本人数字指标用于纵向查看；具体追踪指标在任务发布时选择。</label>}</>}
     footer="量表反馈由固定版本和受众权限独立决定，表单仅采集信息。正式整包不能拆分或加入这里。"/>
   </div>
   {responseMode==='SELF'&&<SchoolPrivateGroupDisclosure choices={groupChoices} value={tool.definition.groupReporting??null} disabled={busy} onChange={groupReporting=>{
    const definition={...tool.definition};delete definition.groupReporting
    change({definition:{...definition,...(groupReporting?{groupReporting}:{})}})
   }}/>}
   {preview&&<section aria-label="问卷内容预览"><h3>问卷内容预览</h3><p>试填仅保留在本页，不计分或保存为正式作答。</p><p>{tool.definition.instruction}</p>{!!tool.definition.contextFields?.length&&<aside aria-label="背景信息预览"><h4>背景信息（问卷第一屏）</h4>{tool.definition.contextFields.map(field=><p key={field.contextKey}>{field.formLabel}（必答）{field.formOptions.length?'：'+field.formOptions.map(option=>option.label).join('、'):'：YYYY-MM'}</p>)}</aside>}
    <div><button disabled={previewIndex===0} onClick={()=>setPreviewIndex(index=>index-1)}>上一工具</button><span>{previewIndex+1} / {tool.definition.blocks.length}</span>
     <button disabled={previewIndex===tool.definition.blocks.length-1} onClick={()=>setPreviewIndex(index=>index+1)}>下一工具</button></div>
    <h4>{block?compositionTitle(block,references):''}</h4>{block?.instruction&&<p className="whitespace-pre-wrap">{block.instruction}</p>}{previewInstruction&&<p className="whitespace-pre-wrap">{previewInstruction}</p>}{previewError?<p role="alert">{previewError}</p>:!reference?<p>当前固定工具不可读取，请重新核对来源。</p>:nativePreview?<aside aria-label="原生任务预览"><p>{nativePreview.kind==='COGNITIVE'?'认知任务 · '+({experience:'体验版',standard:'正式版',research:'科研版'}[nativePreview.profile!]):'情境任务'}</p>{nativePreview.instruction&&<p>{nativePreview.instruction}</p>}<p>任务将在正式分配后，按固定版本的原生作答流程呈现。</p></aside>:!previewTool?<p role="status">正在读取当前固定工具…</p>:
     <PrivateToolPreview tool={previewTool} answers={answers} onAnswer={(key,value)=>setAnswers(old=>({...old,[key]:value}))} imageAdapter={imageAdapter}
      renderMaterials={items=>items?.map(item=><EducationMaterialPreview key={item.asset.assetId} api={api} organizationId={organizationId} toolId={previewTool.id} item={item} loadContent={publicMedia?.loadContent}/>)}/>}
   </section>}
   <details className="education-private-versions"><summary>固定问卷版本（{versions.length}）</summary><p>固定版本保持原有内容；后续编辑只改变草稿。发布任务需在评价活动中另外执行。</p>
    {versions.map(version=><p key={version.id}>{version.title} · 修订 {version.sourceRevision} · {compositionAdministrationLabel(version.administration)}</p>)}{versionsCursor&&<button disabled={busy} onClick={moreVersions}>加载更多固定版本</button>}
   </details>
  </>}
 </section>
}
