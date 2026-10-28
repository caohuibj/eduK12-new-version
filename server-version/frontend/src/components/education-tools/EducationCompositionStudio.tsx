import {contextOptionsForKey,assessmentContextLabels,type AssessmentContextKey} from '../../modules/assessment-context/options'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {EducationPrivateVersionChooser} from './EducationPrivateVersionChooser'
import {CompositionOutline} from '../../modules/assessment-core/composition/CompositionOutline'
import {SchoolPrivateToolCollection,type SchoolPrivateToolControls} from '../../school/SchoolPrivateToolCollection'
import {PrivateToolPreview,type PrivateToolPreviewValue} from './PrivateToolPreview'
import {EducationPublicFormChooser} from './EducationPublicFormChooser'
import {educationPublicFormPreviewMedia,publicFormPreviewPath,publicStandardPreviewPath} from './educationPublicFormClient'
import {createEducationPrivateImageAdapter} from './educationPrivateImageAdapter'
import {EducationMaterialPreview} from './EducationMaterialPicker'
import {privateToolBase,privateToolError,type PrivateToolApi,type PrivateToolVersion,type PrivateTool,type PrivateDraftState} from './privateToolClient'
import {compositionTitle,type CompositionTool,type CompositionSummary,type CompositionReference} from './educationCompositionClient'
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
 const population=entry==='SCHOOL'?'STUDENT':'TEACHER'
 const [rows,setRows]=useState<CompositionSummary[]>([]),[cursor,setCursor]=useState<string|null>(null)
 const [controls,setControls]=useState<SchoolPrivateToolControls>({query:'',sort:'updated',view:'list'})
 const [tool,setTool]=useState<CompositionTool|null>(null),[saved,setSaved]=useState(''),[title,setTitle]=useState('')
 const [references,setReferences]=useState<CompositionReference[]>([]),[versions,setVersions]=useState<PrivateToolVersion[]>([])
 const [versionsCursor,setVersionsCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [uncertain,setUncertain]=useState(false),[preview,setPreview]=useState(false),[previewIndex,setPreviewIndex]=useState(0)
 const [previewTool,setPreviewTool]=useState<PrivateToolPreviewValue|null>(null),[previewError,setPreviewError]=useState(''),[previewInstruction,setPreviewInstruction]=useState('')
 const [sourceView,setSourceView]=useState<'PRIVATE'|'PUBLIC_FORM'|'STANDARD_SCALE'>('PRIVATE')
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
   if(value.kind!=='COMPOSITION'||value.definition.administration.population!==population)throw new Error('这份问卷不属于当前'+(entry==='SCHOOL'?'学生':'教师')+'自评编制入口。')
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
 const save=()=>{if(!tool||!tool.title.trim())return;void operate(async current=>{
  const submitted={...tool,title:tool.title.trim()}
  const result=await api<CompositionTool>(`${base}/${tool.id}`,'PUT',{expectedRevision:tool.revision,title:submitted.title,definition:tool.definition})
  if(current()){const next={...submitted,...result};setTool(next);setSaved(fingerprint(next));setNotice('问卷草稿已保存。')}
 })}
 const freeze=()=>{if(!tool||dirty||!tool.definition.blocks.length)return;void operate(async current=>{
  const value=await api<PrivateToolVersion>(`${base}/${tool.id}/freeze`,'POST',{expectedRevision:tool.revision,expectedContentHash:tool.contentHash})
  if(current()){setVersions(old=>merge([value],old));setNotice('问卷版本已固定。请在'+(entry==='SCHOOL'?'本人学校活动的测评批次':'学校改进的评价活动')+'中选用本版本，再预览并发布任务。')}
 })}
 // A preview renders the saved local revision's exact immutable leaves. Do not
 // first call the legacy whole-composition preview (all bodies + compilation)
 // and then fetch those bodies again. Freeze alone owns full runtime validation
 // and rechecks the actual draft revision/hash; preview is never its receipt.
 const showPreview=()=>{if(!tool||dirty||locked.current||!tool.definition.blocks.length)return
  setPreview(true);setPreviewIndex(0);setAnswers({});setPreviewTool(null);setPreviewError('')
 }
 const block=preview?tool?.definition.blocks[previewIndex]:undefined
 const reference=block?references.find(row=>row.sourceProvider===block.source.provider&&row.id===block.source.versionId&&row.contentHash===block.source.contentHash):undefined
 useEffect(()=>{
  let current=true;setPreviewTool(null);setPreviewError('');setPreviewInstruction('');setAnswers({})
  if(block&&reference)void api<{id:string;kind:'SCALE'|'FORM';title:string;contentHash:string;definition:PrivateTool['definition'];instruction?:string}>(
   reference.sourceProvider==='PRIVATE_VERSION'?`${base}/${reference.toolId}/versions/${block.source.versionId}`:reference.sourceProvider==='PUBLIC_FORM'?publicFormPreviewPath(organizationId,reference.id,reference.contentHash):publicStandardPreviewPath(organizationId,reference.id,reference.contentHash))
   .then(value=>{if(current){
    if(value.id!==block.source.versionId||value.contentHash!==block.source.contentHash||value.kind!==block.source.kind)throw new Error('固定工具身份已不匹配。')
    setPreviewTool({id:reference.sourceProvider==='PRIVATE_VERSION'?reference.toolId:reference.id,title:value.title,kind:value.kind,definition:value.definition});setPreviewInstruction(value.instruction??'')
   }}).catch(reason=>{if(current)setPreviewError(privateToolError(reason))})
  return()=>{current=false}
 },[api,base,organizationId,block,reference])
 const previewToolId=previewTool?.id
 const publicMedia=useMemo(()=>block&&block.source.provider!=='PRIVATE_VERSION'?educationPublicFormPreviewMedia({api,entry,organizationId,actorId,versionId:block.source.versionId,contentHash:block.source.contentHash,provider:block.source.provider}):undefined,
  [api,entry,organizationId,actorId,block?.source.provider,block?.source.versionId,block?.source.contentHash])
 const imageAdapter=useMemo(()=>publicMedia?.imageAdapter??(previewToolId?createEducationPrivateImageAdapter({api,entry,organizationId,toolId:previewToolId,actorId}):undefined),
  [publicMedia,api,entry,organizationId,previewToolId,actorId])
 const moreVersions=()=>{if(!tool||!versionsCursor)return;void operate(async current=>{
  const page=await api<{list:PrivateToolVersion[];nextCursor:string|null}>(`${base}/${tool.id}/versions?cursor=${encodeURIComponent(versionsCursor)}`)
  if(current()){setVersions(old=>merge(old,page.list));setVersionsCursor(page.nextCursor)}
 })}
 return <section className={'education-private-tools education-private-tools--'+entry.toLowerCase()+' '+(entry==='SCHOOL'?'hs-panel':'ht-panel')+' education-composition-studio education-composition-studio--'+entry.toLowerCase()} aria-label="普通问卷编制">
  <header className="education-private-heading"><div><h2>{tool?'普通问卷编制':'我的普通问卷'}</h2><p>将本人固定量表和表单、获授权公共量表与表单编成一份{entry==='SCHOOL'?'学生':'教师'}自评问卷，各项保留独立计分与反馈。</p></div></header>
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
   <label>问卷说明<textarea value={tool.definition.instruction} maxLength={16000} disabled={busy} onChange={event=>change({definition:{...tool.definition,instruction:event.target.value}})}/></label>
   <fieldset disabled={busy}><legend>背景信息区段</legend><p>按所选工具的原版适用范围配置；勾选后会作为问卷第一屏展示并固定。未勾选时不会增加背景页。</p>
    {(['gradeLevel','birthYearMonth','sexAtBirth','primaryLanguage','countryOrRegion'] as AssessmentContextKey[]).map(key=>{
     const labels=assessmentContextLabels
     return <label key={key}><input type="checkbox" checked={tool.definition.contextFields?.some(field=>field.contextKey===key)??false} onChange={event=>{
      const fields=(tool.definition.contextFields??[]).filter(field=>field.contextKey!==key)
      if(event.target.checked)fields.push({contextKey:key,formType:key==='birthYearMonth'?'year_month':'single_choice',formLabel:labels[key],formOptions:contextOptionsForKey(key)})
      const {contextFields:_,...definition}=tool.definition;change({definition:{...definition,...(fields.length?{contextFields:fields}:{})}})
     }}/>{labels[key]}</label>
    })}
   </fieldset>
   <div className="survey-composition-studio"><div><nav aria-label="问卷工具来源"><button type="button" aria-pressed={sourceView==='PRIVATE'} onClick={()=>setSourceView('PRIVATE')}>本人固定工具</button><button type="button" aria-pressed={sourceView==='PUBLIC_FORM'} onClick={()=>setSourceView('PUBLIC_FORM')}>获授权公共表单</button><button type="button" aria-pressed={sourceView==='STANDARD_SCALE'} onClick={()=>setSourceView('STANDARD_SCALE')}>获授权公共量表</button></nav>
    {sourceView==='PRIVATE'?<EducationPrivateVersionChooser key={tool.id} api={api} organizationId={organizationId} disabled={busy||tool.definition.blocks.length>=50}
     onSelect={value=>{if(value.kind==='COMPOSITION')return;const leaf={...value,kind:value.kind,sourceProvider:'PRIVATE_VERSION' as const};setReferences(old=>mergeReferences(old,[leaf]));change({definition:{...tool.definition,blocks:[...tool.definition.blocks,
      {blockId:crypto.randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:value.kind,versionId:value.id,contentHash:value.contentHash}}]}})}}/>:
     <EducationPublicFormChooser key={sourceView} kind={sourceView==='STANDARD_SCALE'?'SCALE':'FORM'} api={api} entry={entry} organizationId={organizationId} actorId={actorId} disabled={busy||tool.definition.blocks.length>=50} onChoose={value=>{
      const provider=value.kind==='SCALE'?'STANDARD_SCALE' as const:'PUBLIC_FORM' as const
      setReferences(old=>mergeReferences(old,[{id:value.sourceId,sourceProvider:provider,kind:value.kind,title:value.title,contentHash:value.contentHash,version:value.versions.content,versions:value.versions,requiredContextKeys:value.requiredContextKeys}]))
      change({definition:{...tool.definition,blocks:[...tool.definition.blocks,{blockId:crypto.randomUUID(),instruction:'',source:value.kind==='SCALE'?{provider:'STANDARD_SCALE',kind:'SCALE',versionId:value.sourceId,contentHash:value.contentHash}:{provider:'PUBLIC_FORM',kind:'FORM',versionId:value.sourceId,contentHash:value.contentHash}}]}})
     }}/>}</div>
    <CompositionOutline items={tool.definition.blocks.map(row=>({id:row.blockId,title:compositionTitle(row,references),
     detail:(row.source.provider==='STANDARD_SCALE'?'公共量表':row.source.provider==='PUBLIC_FORM'?'公共表单':row.source.kind==='SCALE'?'量表':'表单')+' · 固定版本 '+referenceVersion(references.find(ref=>ref.sourceProvider===row.source.provider&&ref.id===row.source.versionId&&ref.contentHash===row.source.contentHash))}))} max={50} disabled={busy}
     onMove={(index,offset)=>{const blocks=[...tool.definition.blocks];[blocks[index],blocks[index+offset]]=[blocks[index+offset],blocks[index]];change({definition:{...tool.definition,blocks}})}}
     onRemove={index=>change({definition:{...tool.definition,blocks:tool.definition.blocks.filter((_,i)=>i!==index)}})}
     renderItemEditor={(_,index)=><label className="education-composition-block-instruction">工具衔接说明 {index+1}<textarea value={tool.definition.blocks[index].instruction} maxLength={16000} disabled={busy}
      onChange={event=>change({definition:{...tool.definition,blocks:tool.definition.blocks.map((block,i)=>i===index?{...block,instruction:event.target.value}:block)}})}/></label>}
     footer="量表的本人反馈范围由所选固定版本决定，表单仅采集信息。正式整包不能拆分或加入这里。"/>
   </div>
   {preview&&<section aria-label="问卷内容预览"><h3>问卷内容预览</h3><p>试填仅保留在本页，不计分或保存为正式作答。</p><p>{tool.definition.instruction}</p>{!!tool.definition.contextFields?.length&&<aside aria-label="背景信息预览"><h4>背景信息（问卷第一屏）</h4>{tool.definition.contextFields.map(field=><p key={field.contextKey}>{field.formLabel}（必答）{field.formOptions.length?'：'+field.formOptions.map(option=>option.label).join('、'):'：YYYY-MM'}</p>)}</aside>}
    <div><button disabled={previewIndex===0} onClick={()=>setPreviewIndex(index=>index-1)}>上一工具</button><span>{previewIndex+1} / {tool.definition.blocks.length}</span>
     <button disabled={previewIndex===tool.definition.blocks.length-1} onClick={()=>setPreviewIndex(index=>index+1)}>下一工具</button></div>
    <h4>{block?compositionTitle(block,references):''}</h4>{block?.instruction&&<p className="whitespace-pre-wrap">{block.instruction}</p>}{previewInstruction&&<p className="whitespace-pre-wrap">{previewInstruction}</p>}{previewError?<p role="alert">{previewError}</p>:!reference?<p>当前固定工具不可读取，请重新核对来源。</p>:!previewTool?<p role="status">正在读取当前固定工具…</p>:
     <PrivateToolPreview tool={previewTool} answers={answers} onAnswer={(key,value)=>setAnswers(old=>({...old,[key]:value}))} imageAdapter={imageAdapter}
      renderMaterials={items=>items?.map(item=><EducationMaterialPreview key={item.asset.assetId} api={api} organizationId={organizationId} toolId={previewTool.id} item={item} loadContent={publicMedia?.loadContent}/>)}/>}
   </section>}
   <details className="education-private-versions"><summary>固定问卷版本（{versions.length}）</summary><p>固定版本保持原有内容；后续编辑只改变草稿。发布任务需在评价活动中另外执行。</p>
    {versions.map(version=><p key={version.id}>{version.title} · 修订 {version.sourceRevision}</p>)}{versionsCursor&&<button disabled={busy} onClick={moreVersions}>加载更多固定版本</button>}
   </details>
  </>}
 </section>
}
