import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ResearchCatalog, SourceProvenance, type CatalogGrant } from './ResearchCatalog'
import { ResearchFormEditor } from './ResearchFormEditor'
import { ResearchScaleEditor } from './ResearchScaleEditor'
import { ResearchCognitiveEditor } from './ResearchCognitiveEditor'
import { ResearchCognitivePreview, type CognitivePreviewSnapshot } from './ResearchCognitivePreview'
import { ResearchSjtEditor } from './ResearchSjtEditor'
import { ResearchPreview,type PreviewFocusRequest } from './ResearchPreview'
import type { ResearchDraft, Kind, Definition, FormDraft, ScaleDraft, SjtDraft, CognitiveDraft, Issue } from './builder.types'
import { researchKey } from './builder.types'
import { ResearchAuthoringGuide,ResearchImportGuide } from './ResearchAuthoringGuide'
import { ResearchIssueList } from './ResearchIssueList'
import { authoringIssueTarget,type AuthoringIssue,type ImportIssueContext } from './authoring-issue-location'
import './survey-workspace.css'
import { publishSurveyMeasurement } from './measurement-publication'
import { SurveyScaleLibrarySubmission } from './SurveyScaleLibrarySubmission'
import { SurveyScaleVersions } from './SurveyScaleVersions'
import { useInstrumentLibrary, type InstrumentLibrary } from './instrument-library'

type Envelope<T>={code:number|string;message:string;data:T|null}
type Preview={revision:number;ok:boolean;issues:Issue[];definitionDigest?:string;scoringDigest?:string;
  kind:Kind;cognitivePreview?:CognitivePreviewSnapshot;score?:{scores?:{key:string;value:number|null;status:string}[];metrics?:{key:string;value:number|null}[]}|null}
type BulkBatch={batchId:string;format:'TEXT'|'CSV';content:string;pageKey?:string;dimensionKey?:string}
type BulkResult={revision:number;count:number;ok:boolean;digest:string;issues:{line:number;message:string}[];
  items:{type:string;prompt:string;options:string[];sourceLine?:number;dimensionKey?:string}[]}
class BuilderApiError extends Error {
  constructor(message:string,readonly issues:AuthoringIssue[]){super(message)}
}
const getCookie=(name:string)=>document.cookie.split('; ').find(v=>v.startsWith(encodeURIComponent(name)+'='))?.split('=').slice(1).join('=')||''
async function api<T>(path:string,method='GET',payload?:unknown):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(method!=='GET'){
    let csrf=getCookie('huisurvey_research_csrf')
    if(!csrf){
      const res=await fetch('/api/survey/auth/csrf',{credentials:'same-origin'})
      if(!res.ok)throw new Error('研究者安全令牌获取失败')
      const body=await res.json() as Envelope<{csrfToken:string}>
      csrf=body.data?.csrfToken||''
    }
    if(!csrf)throw new Error('无法建立安全会话，请重新登录')
    headers['X-CSRF-Token']=decodeURIComponent(csrf)
  }
  const response=await fetch('/api/survey'+path,{method,headers,credentials:'same-origin',
    ...(payload===undefined?{}:{body:JSON.stringify(payload)})})
  const data=await response.json() as Envelope<T|{issues:AuthoringIssue[]}>
  if(!response.ok||data.code!==0){
    const more=data.data as {issues?:AuthoringIssue[]}|null
    throw new BuilderApiError(data.message||'操作失败',more?.issues??[])
  }
  return data.data as T
}
const displayKind:Record<Kind,string>={FORM:'Form · 表单',SCALE:'Scale · 量表',SJT:'SJT · 情境判断',COGNITIVE:'Cognitive · 认知任务'}
const toolStatus=(status:string)=>({DRAFT:'草稿',PUBLISHED:'已发布',ARCHIVED:'已归档'} as Record<string,string>)[status]||status
const kindLabel:Record<Kind,string>={FORM:'表单',SCALE:'量表',SJT:'情境判断',COGNITIVE:'认知任务'}
const directionLabel=(direction:string)=>({descriptive:'仅描述',higher_is_more:'越高代表越多',higher_is_better:'越高越好',higher_is_worse:'越高越差',bipolar:'双极方向'} as Record<string,string>)[direction]||direction
export type BuilderLeaveRisk={dirty:boolean;busy:boolean}
export function SurveyBuilder({projectId,projectStatus='DRAFT',instrumentLibrary,onLeaveRiskChange}:{projectId:string;projectStatus?:string;instrumentLibrary?:InstrumentLibrary;onLeaveRiskChange?:(risk:BuilderLeaveRisk)=>void}){
  const prefix='/projects/'+encodeURIComponent(projectId)+'/instruments'
  const {list:instruments,page:instrumentPage,refresh:refreshList,error:listError,loading:listLoading}=useInstrumentLibrary(projectId,instrumentLibrary)
  const [active,setActive]=useState<ResearchDraft|null>(null),[dirty,setDirty]=useState(false)
  const licensedReadOnly=Boolean(active?.readOnly||active?.catalogGrantId)
  const readOnly=licensedReadOnly||active?.status==='PUBLISHED'
  const measurementWritable=['DRAFT','ACTIVE'].includes(projectStatus)
  const [publishedReleaseId,setPublishedReleaseId]=useState('')
  const [showLibrarySubmission,setShowLibrarySubmission]=useState(false)
  const editGeneration=useRef(0)
  const editorRoot=useRef<HTMLDivElement>(null)
  const [apiIssues,setApiIssues]=useState<AuthoringIssue[]>([])
  const [newKind,setNewKind]=useState<Kind>('FORM'),[newTitle,setNewTitle]=useState('')
  const [leaveBusy,setLeaveBusy]=useState(false)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [preview,setPreview]=useState<Preview|null>(null),[showPreview,setShowPreview]=useState(false)
  const [answerReview,setAnswerReview]=useState<{ok:boolean;issues:Issue[];
    missing:{itemKey:string;reason:string}[]}|null>(null)
  const [previewFocus,setPreviewFocus]=useState<PreviewFocusRequest|null>(null)
  const previewFocusSequence=useRef(0)
  const [bulkText,setBulkText]=useState(''),[bulkFormat,setBulkFormat]=useState<'TEXT'|'CSV'>('TEXT')
  const [bulkTargetPageKey,setBulkTargetPageKey]=useState('')
  const [bulk,setBulk]=useState<{batch:BulkBatch;result:BulkResult}|null>(null)
  const [undo,setUndo]=useState<{definition:Definition;title:string}|null>(null)
  useEffect(()=>{setActive(null);setPreview(null);setError('');setBulk(null)},[projectId])
  const hasUnsaved=dirty||!!newTitle.trim()||!!bulkText.trim()
  useEffect(()=>{onLeaveRiskChange?.({dirty:hasUnsaved,busy:leaveBusy})},[hasUnsaved,leaveBusy,onLeaveRiskChange])
  useEffect(()=>()=>onLeaveRiskChange?.({dirty:false,busy:false}),[onLeaveRiskChange])
  const run=async(task:()=>Promise<void>,writes=true)=>{
    setLeaveBusy(writes);setBusy(true);setError('');setNotice('');setApiIssues([])
    try{await task()}catch(e){setError(e instanceof Error?e.message:'操作失败');if(e instanceof BuilderApiError)setApiIssues(e.issues)}
    finally{setBusy(false);setLeaveBusy(false)}
  }
  // The write is already acknowledged. List failures have their own retry UI
  // and must never invite another create/import with a fresh request ID.
  const refreshAfterWrite=(page:number)=>refreshList(page,true).catch(()=>{})
  const clearReview=()=>{
    setPublishedReleaseId('');setShowLibrarySubmission(false);setPreview(null);setShowPreview(false);setAnswerReview(null);setPreviewFocus(null)
    setBulk(null);setBulkText('');setUndo(null);setBulkTargetPageKey('')
  }
  const select=async(id:string)=>{
    await run(async()=>{
      if((dirty||!!bulkText.trim())&&!window.confirm('当前草稿存在未保存内容。确定放弃并切换研究工具？'))return
      const r=await api<ResearchDraft>(prefix+'/'+id)
      setActive(r);setDirty(false);clearReview()
    },false)
  }
  const create=(event:FormEvent)=>{event.preventDefault();void run(async()=>{
    if((dirty||!!bulkText.trim())&&!window.confirm('当前草稿存在未保存内容。确定放弃并创建另一份研究工具？'))return
    const item=await api<ResearchDraft>(prefix,'POST',{
      requestId:crypto.randomUUID(),instrumentKey:researchKey('i'),kind:newKind,title:newTitle.trim(),
    })
    setActive(item);setDirty(false);clearReview();setNewTitle('')
    setNotice('已创建私有研究草稿；进入共用库需另行申请并经管理员审批')
    await refreshAfterWrite(1)
  })}
  const importCatalog=(grant:CatalogGrant)=>run(async()=>{
    if((dirty||!!bulkText.trim())&&!window.confirm('当前草稿存在未保存内容。确定放弃并导入原版工具？'))return
    const item=await api<ResearchDraft>('/projects/'+encodeURIComponent(projectId)+'/catalog/'+encodeURIComponent(grant.id)+'/import','POST',{
      requestId:crypto.randomUUID(),instrumentKey:researchKey('i'),title:grant.title,
    })
    setActive(item);setDirty(false);clearReview()
    setNotice('已导入明确版本的原版工具，内容与计分只读。')
    await refreshAfterWrite(1)
  })
  const change=(definition:Definition)=>{
    if(readOnly)return
    editGeneration.current++
    setActive(old=>old?{...old,definition}:old)
    setDirty(true);setPreview(null);setBulk(null);setUndo(null);setAnswerReview(null);setPreviewFocus(null);setApiIssues([])
  }
  const save=()=>{if(!active||readOnly||!dirty)return;const snapshot=active,generation=editGeneration.current;void run(async()=>{
    const updated=await api<ResearchDraft>(prefix+'/'+snapshot.id,'PATCH',{
      revision:snapshot.revision,title:snapshot.title,definition:snapshot.definition,
    })
    // Native disabled controls stop new typing; an upload already in flight
    // can still finish. Keep that new draft content against the ACK revision.
    const changedWhileSaving=editGeneration.current!==generation
    setActive(current=>changedWhileSaving&&current?.id===snapshot.id
      ?{...updated,title:current.title,definition:current.definition}:updated)
    setDirty(changedWhileSaving);setPreview(null);setBulk(null);setUndo(null)
    await refreshAfterWrite(instrumentPage)
    setNotice(changedWhileSaving?'本次草稿已保存；保存期间产生的新修改仍待保存。'
      :snapshot.kind==='FORM'?'表单草稿已保存；请到「发布与采集」选择本表单，检查并冻结波次。'
        :'草稿已保存；可在编制区发布测量版本，波次冻结另行进行')
  })}
  const publishMeasurement=()=>{if(!active||dirty||!measurementWritable||active.status==='ARCHIVED')return;void run(async()=>{
    const result=await publishSurveyMeasurement(api,projectId,active)
    setPublishedReleaseId(result.releaseId)
    if(active.kind==='SCALE'&&!licensedReadOnly)setActive({...active,status:'PUBLISHED',measurementReleaseId:result.releaseId})
    await refreshAfterWrite(instrumentPage)
    setNotice('测量版本已发布供本项目自用；未创建波次、启动采集或进入共用库。')
  })}
  const revise=()=>{if(!active||active.kind!=='SCALE'||licensedReadOnly||active.status!=='PUBLISHED'||dirty)return;void run(async()=>{
    const next=await api<ResearchDraft>(prefix+'/'+encodeURIComponent(active.id)+'/revise','POST',{revision:active.revision})
    setActive(next);setDirty(false);clearReview();await refreshAfterWrite(instrumentPage)
    setNotice('已建立下一版本草稿；原发布版本、报告和波次保持不变。')
  })}
  const validate=()=>{if(!active||readOnly||dirty)return;void run(async()=>{
    const result=await api<Preview>(prefix+'/'+active.id+'/validate','POST',{})
    setPreview(result);setShowPreview(result.ok)
    setNotice(result.ok?'结构与研究性计分编译已通过；这是非正式试答预览':'请先修正提示的结构问题')
  },false)}
  const simulate=(answers:Record<string,unknown>)=>{if(!active||readOnly||dirty)return;void run(async()=>{
    const r=await api<Preview>(prefix+'/'+active.id+'/preview','POST',{answers})
    setPreview(r);setNotice(r.ok?'已根据后台现有计分器模拟计算，不会生成正式答卷':'模拟未通过，请检查作答和规则')
  },false)}
  const validateFormAnswers=(answers:Record<string,unknown>)=>{
    if(!active||readOnly||dirty||active.kind!=='FORM')return
    void run(async()=>{
      const result=await api<{ok:boolean;issues:Issue[];missing:{itemKey:string;reason:string}[]}>(
        prefix+'/'+active.id+'/form-dry-run','POST',{answers})
      setAnswerReview(result)
      setNotice(result.ok?'正式 Form 校验通过；未产生正式答卷':'请修正高亮题目后再试提交')
      const first=result.issues[0]?.path.match(/^answers\.([a-z][a-z0-9_-]*)/i)?.[1]
      setPreviewFocus(first?{itemKey:first,sequence:++previewFocusSequence.current}:null)
    },false)
  }
  const duplicate=()=>{if(!active)return;void run(async()=>{
    if(bulkText.trim()&&!window.confirm('存在尚未导入的文本。确定放弃并切换到工具副本？'))return
    const r=await api<ResearchDraft>(prefix+'/'+active.id+'/copy','POST',{
      requestId:crypto.randomUUID(),instrumentKey:researchKey('i'),title:active.title+'（副本）',
    })
    setActive(r);setDirty(false);clearReview()
    setNotice(r.readOnly||r.catalogGrantId?'已复制授权原版工具，副本仍保持原版来源与只读限制。':'已复制为新的独立研究工具，不能仅凭同名假定纵向可比')
    await refreshAfterWrite(1)
  })}
  const archive=()=>{if(!active)return;void run(async()=>{
    if(bulkText.trim()&&!window.confirm('存在尚未导入的文本。确定放弃并归档当前工具？'))return
    await api(prefix+'/'+active.id+'/archive','POST',{revision:active.revision})
    setActive(null);setDirty(false);clearReview()
    await refreshAfterWrite(instrumentPage);setNotice('草稿已归档')
  })}
  const bulkPreview=()=>{if(!active||readOnly||dirty)return;void run(async()=>{
    const batch:BulkBatch={batchId:crypto.randomUUID(),format:bulkFormat,content:bulkText,
      ...(active.kind==='FORM'&&bulkTargetPageKey?{pageKey:bulkTargetPageKey}:{})}
    const result=await api<BulkResult>(prefix+'/'+active.id+'/bulk-import/preview','POST',batch)
    setBulk({batch,result})
    setNotice(result.ok?'请检查以下题目，确认后再提交（不会提前写入数据）':'输入含错误，未写入任何题目')
  },false)}
  const bulkApply=()=>{if(!active||readOnly||!bulk||dirty||!bulk.result.ok)return;void run(async()=>{
    const before={definition:structuredClone(active.definition),title:active.title}
    const updated=await api<ResearchDraft>(prefix+'/'+active.id+'/bulk-import/apply','POST',{
      revision:active.revision,digest:bulk.result.digest,batch:bulk.batch,
    })
    setUndo(before);setActive(updated);setDirty(false);setBulk(null);setBulkText('');setPreview(null)
    await refreshAfterWrite(instrumentPage);setNotice('整批题目已导入。若需撤销，可使用撤销本次导入。')
  })}
  const undoImport=()=>{if(!active||readOnly||!undo)return;void run(async()=>{
    const updated=await api<ResearchDraft>(prefix+'/'+active.id,'PATCH',{
      revision:active.revision,title:undo.title,definition:undo.definition,
    })
    setUndo(null);setActive(updated);setPreview(null);setDirty(false)
    await refreshAfterWrite(instrumentPage);setNotice('已撤销上一批导入')
  })}
  const locateIssue=(issue:AuthoringIssue,context?:ImportIssueContext)=>{
    if(!active)return
    const target=authoringIssueTarget(active,issue,context)
    if(!target.targetId)return
    if(active.kind==='FORM'&&target.targetId.startsWith('survey-preview-')){
      setPreviewFocus({itemKey:target.targetId.slice('survey-preview-'.length),sequence:++previewFocusSequence.current})
      return
    }
    if('sceneIndex' in target&&target.sceneIndex!==undefined){
      // Reuse the existing scene selector; shared SJT editor/runtime stays intact.
      editorRoot.current?.querySelectorAll('nav[aria-label="情境列表"] > div')[target.sceneIndex]
        ?.querySelector<HTMLButtonElement>('button')?.click()
    }
    window.requestAnimationFrame(()=>{
      const element=document.getElementById(target.targetId)
      if(!element)return
      element.classList.add('survey-authoring-target');element.focus()
      element.scrollIntoView?.({block:'center'})
      if(element instanceof HTMLTextAreaElement&&'line' in target&&target.line){
        const lines=element.value.split('\n'),line=target.line-1
        if(line<0||line>=lines.length)return
        const endLine=target.endLine
        const start=lines.slice(0,line).reduce((n,text)=>n+text.length+1,0)
        const end=lines.slice(0,endLine).join('\n').length
        element.setSelectionRange(start,end)
      }
    })
  }
  return <section className="survey-builder-shell survey-studio-surface bg-white border rounded-xl p-4 sm:p-6 my-5 space-y-5" aria-label="Survey Research Builder">
    <header><h2 className="text-xl font-semibold">研究工具 · Builder</h2>
      <p className="text-sm text-slate-600">创建表单、心理量表、情境测验和受控认知任务。自编工具默认私有，供本项目使用；量表可另行申请进入共用库，须经系统管理员审批。</p>
    </header>
    {error&&<p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3">{apiIssues.length?'工具还有待修正字段，请按下方提示定位。':error}</p>}
    {active&&<ResearchIssueList draft={active} issues={apiIssues} onLocate={locateIssue}/>}
    <ResearchAuthoringGuide/>
    {listError&&<div role="alert" className="border-l-4 border-red-600 bg-red-50 p-3">{listError}
      <button type="button" className="btn-secondary" disabled={listLoading} onClick={()=>void run(()=>refreshList(instrumentPage),false)}>重试研究工具列表</button></div>}
    {notice&&<p role="status" className="border-l-4 border-teal-600 bg-teal-50 p-3">{notice}</p>}
    <fieldset disabled={busy} className="min-w-0 border-0 p-0 space-y-5" aria-label="研究工具操作">
    <a className="survey-catalog-jump" href="#survey-authorized-catalog">已有授权工具？前往原版工具目录导入</a>
    <a className="survey-catalog-jump" href="#survey-tool-navigation">查看当前工具属性与题目导航</a>
    <form className="flex flex-wrap gap-3 items-end border-b pb-4" onSubmit={create}>
      <label className="text-sm">工具类型
        <select className="input block" value={newKind} onChange={e=>setNewKind(e.target.value as Kind)}>
          {Object.entries(displayKind).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
      <label className="text-sm flex-1 min-w-44">名称
        <input className="input block w-full" required maxLength={200} value={newTitle}
          onChange={e=>setNewTitle(e.target.value)} placeholder="如：学习动机前测"/></label>
      <button disabled={busy||!newTitle.trim()} className="btn-primary">创建草稿</button>
    </form>
    <div className="grid md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_250px] gap-5">
      <nav aria-label="当前项目研究工具" className="space-y-2">
        <h3 className="font-semibold text-sm">工具列表</h3>
        {listLoading&&<p role="status" className="text-sm">正在加载研究工具…</p>}
        {!listLoading&&!listError&&!instruments.length&&<p className="text-sm text-slate-500">本页暂无工具。可在上方创建草稿，或前往下方授权目录导入。</p>}
        <div className="flex items-center justify-between gap-2 text-xs mb-3">
          <button type="button" className="btn-secondary" disabled={busy||instrumentPage<=1}
            onClick={()=>void run(()=>refreshList(instrumentPage-1),false)}>上一页</button>
          <span>第 {instrumentPage} 页</span>
          <button type="button" className="btn-secondary" disabled={busy||instruments.length<25}
            onClick={()=>void run(()=>refreshList(instrumentPage+1),false)}>下一页</button>
        </div>
        {instruments.map(item=><button type="button" key={item.id}
          className={'block w-full text-left rounded-lg border p-3 '+(active?.id===item.id?'border-sky-700 bg-sky-50':'bg-white')}
          aria-current={active?.id===item.id?true:undefined} onClick={()=>void select(item.id)} disabled={busy}>
          <strong className="block text-sm break-words">{item.title}</strong>
          <span className="text-xs text-slate-600">{item.kind} · {kindLabel[item.kind]||item.kind} · 修订 {item.revision} · {toolStatus(item.status)}</span>
        </button>)}
      </nav>
      <div className="min-w-0 space-y-4">
      {!active&&<div className="border border-dashed rounded-xl p-6 text-sm text-slate-600">选择工具后可编辑题目、检查结构并预览作答。量表等测量工具可在此发布自用版本；研究波次另行选择版本并冻结采集。</div>}
      {active&&<><div className="rounded-xl bg-slate-50 border p-4 space-y-3">
        <p className="text-xs">{displayKind[active.kind]} · 工具标识 <code>{active.instrumentKey}</code> · 修订 {active.revision} {dirty?'· 未保存':''}</p>
        {licensedReadOnly&&<SourceProvenance provenance={active.sourceProvenance}/>}
        <label className="text-sm block">研究工具名称
          <input className="input block w-full" value={active.title} readOnly={readOnly} maxLength={200} onChange={e=>{
            if(readOnly)return
            editGeneration.current++
            setActive(d=>d?{...d,title:e.target.value}:d);setDirty(true);setPreview(null);setApiIssues([])
          }}/></label>
        <div className="flex flex-wrap gap-2">
          {!readOnly&&<button className="btn-primary" type="button" disabled={busy||!dirty||active.status==='ARCHIVED'} onClick={save}>保存草稿</button>}
          {!readOnly&&<button className="btn-secondary" type="button" disabled={busy||dirty} onClick={validate}>结构检查与编译预览</button>}
          <button className="btn-secondary" type="button" disabled={busy||dirty} onClick={duplicate}>复制为新工具</button>
          <button className="btn-secondary" type="button" disabled={busy||dirty||active.status==='ARCHIVED'} onClick={archive}>归档</button>
          {undo&&<button className="btn-secondary" type="button" disabled={busy||dirty} onClick={undoImport}>撤销本次导入</button>}
        </div>
        {active.kind!=='FORM'&&(!readOnly||(active.kind==='SCALE'&&!!active.catalogGrantId))&&<section aria-label="测量版本发布" className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2">
          <h3 className="font-semibold text-sky-900">发布测量版本 · 项目自用</h3>
          <p className="text-sm text-slate-600">发布保存后的精确测量版本供报告及波次使用，不启动采集。波次冻结会锁定该次采集内容；申请进入共用库需另行提交审核。</p>
          <button type="button" className="btn-primary" disabled={busy||dirty||active.status==='ARCHIVED'||!measurementWritable} onClick={publishMeasurement}>发布测量版本</button>
          {!measurementWritable&&<p className="text-sm">项目已关闭或归档，不能发布新的测量版本。</p>}
          {publishedReleaseId&&<p className="text-xs break-all">已发布版本标识：{publishedReleaseId}</p>}
        </section>}
        {active.kind==='SCALE'&&!licensedReadOnly&&<>
          <SurveyScaleVersions key={active.id+'-'+active.revision+'-'+active.status} projectId={projectId} draft={active} transport={api}/>
          {active.status==='PUBLISHED'&&<><p className="text-sm text-sky-900">已发布版本只读。修订会建立下一版本草稿，不覆盖原发布版本。</p><button type="button" className="btn-primary" disabled={busy||dirty||!measurementWritable} onClick={revise}>修订新版本</button></>}
          <button type="button" className="btn-secondary" onClick={()=>setShowLibrarySubmission(value=>!value)}>{showLibrarySubmission?'收起共用库申请':'申请进入共用库'}</button>
          {showLibrarySubmission&&<SurveyScaleLibrarySubmission key={active.id} sourceId={active.id}/>}
        </>}
        {dirty&&<p className="text-xs text-amber-700">请先保存。若另一个标签已经更新，服务器将拒绝旧 revision 的覆盖，本地内容不会被自动清除。</p>}
      </div>
      {!readOnly&&active.status==='DRAFT'&&<div ref={editorRoot} id="survey-authoring-definition" tabIndex={-1} className="survey-authoring-target">
        {active.kind==='FORM'&&<ResearchFormEditor key={active.id} value={active.definition as FormDraft} onChange={change} projectId={projectId}/>}
        {active.kind==='SCALE'&&<ResearchScaleEditor key={active.id} value={active.definition as ScaleDraft} onChange={change} projectId={projectId}/>}
        {active.kind==='COGNITIVE'&&<ResearchCognitiveEditor value={active.definition as CognitiveDraft} onChange={change}/>}
        {active.kind==='SJT'&&<ResearchSjtEditor key={active.id} value={active.definition as SjtDraft} onChange={change} projectId={projectId}/>}
      </div>}
      {!readOnly&&(active.kind==='FORM'||active.kind==='SCALE')&&active.status==='DRAFT'&&<div className="border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">批量录入</h3>
        <p className="text-sm text-slate-600">先解析预览，确认后整批写入。文本题块用空行分隔，首行为题干，后续行为选项；完整题型和配置请使用 CSV 模板。</p>
        <ResearchImportGuide draft={active} onUse={csv=>{
          if(bulkText.trim()&&!window.confirm('用完整模板替换导入框内的内容？尚未导入的文本会被替换。'))return
          setBulkText(csv);setBulkFormat('CSV');setBulk(null)
        }}/>
        <label className="text-sm">输入格式<select className="input block" value={bulkFormat} onChange={e=>{
          setBulkFormat(e.target.value as 'TEXT'|'CSV');setBulk(null)}}>
          <option value="TEXT">多行文本</option><option value="CSV">标准 CSV</option></select></label>
        {!readOnly&&active.kind==='FORM'&&(active.definition as FormDraft).pages.length>0&&
          <label className="block text-sm">导入到指定分页
            <select className="input block w-full" value={bulkTargetPageKey}
              onChange={e=>{setBulkTargetPageKey(e.target.value);setBulk(null)}}>
              <option value="">默认第一页</option>
              {(active.definition as FormDraft).pages.map(page=>
                <option key={page.pageKey} value={page.pageKey}>{page.title||page.pageKey}</option>)}
            </select>
          </label>}
        <label className="block text-sm">待解析的导入内容<textarea id="survey-bulk-input" className="input block w-full" rows={7} value={bulkText} onChange={e=>{setBulkText(e.target.value);setBulk(null)}}
          placeholder={bulkFormat==='TEXT'?'今天上课我能集中注意力\nA. 从不\nB. 有时\nC. 经常\n\n今天我愿意主动提问\nA. 从不\nB. 有时\nC. 经常':'type,prompt,required,options,dimension\nSINGLE,今天我愿意提问,true,从不||有时||经常,'}/></label>
        <button type="button" className="btn-secondary" disabled={busy||dirty||!bulkText.trim()} onClick={bulkPreview}>解析并预览（不保存）</button>
        {bulk&&<div className="border rounded-lg p-3 space-y-2">
          <p className="font-semibold text-sm">候选题数：{bulk.result.count}</p>
          <ResearchIssueList draft={active} issues={bulk.result.issues}
            importContext={{...bulk.batch,items:bulk.result.items}}
            onLocate={issue=>locateIssue(issue,{...bulk.batch,items:bulk.result.items})}/>
          {bulk.result.items.slice(0,50).map((item,i)=><p key={i} className="text-sm">{i+1}. {item.prompt}（{item.type}，{item.options.length} 个选项）</p>)}
          {bulk.result.ok&&<button className="btn-primary" type="button" disabled={busy||dirty||active.revision!==bulk.result.revision}
            onClick={bulkApply}>确认导入全部题目</button>}
        </div>}
      </div>}
      {!readOnly&&preview&&<div className="border rounded-xl p-4 space-y-2">
        <h3 className="font-semibold">{preview.ok?'编译校验通过':'编译与结构问题'}</h3>
        <details className="text-xs break-words"><summary>查看修订与内容摘要</summary>草稿修订：{preview.revision} · 内容摘要：{preview.definitionDigest||'未计算'}</details>
        <ResearchIssueList draft={active} issues={preview.issues} onLocate={locateIssue}/>
        {preview.score&&<div className="text-sm">
          <p className="font-semibold">研究内部模拟计分（不对被试开放）</p>
          {(preview.score.scores||preview.score.metrics||[]).map((s,i)=><p key={i}>{s.key}：{s.value??'不可计算'}</p>)}
        </div>}
      </div>}
      {!readOnly&&preview?.ok&&!dirty&&<div>
        <button type="button" className="btn-secondary" onClick={()=>setShowPreview(x=>!x)}>
          {showPreview?'收起模拟作答':'展开模拟作答'}</button>
        {showPreview&&<>{active.kind==='COGNITIVE'?<ResearchCognitivePreview snapshot={preview.cognitivePreview}/>:<ResearchPreview draft={active} onSimulate={simulate} onValidateForm={validateFormAnswers}
            errorPath={answerReview?.issues[0]?.path} focusRequest={previewFocus}/>}
          {answerReview&&<div role="status" className="border rounded-lg p-3 my-3 space-y-2">
            <p className="font-medium">{answerReview.ok?'Form 试提交通过':'Form 试提交未通过'}</p>
            <ResearchIssueList draft={active} issues={answerReview.issues} onLocate={locateIssue}/>
            {answerReview.missing.length>0&&<p className="text-sm">缺失语义：
              {answerReview.missing.map(row=>row.itemKey+' ('+row.reason+')').join('，')}</p>}
          </div>}</>}
      </div>}
      </>}
      </div>
      <aside aria-label="研究工具属性与题目导航"
        id="survey-tool-navigation" tabIndex={-1} className="survey-tool-navigation min-w-0 self-start rounded-xl bg-slate-50 border p-4">
        <details open><summary className="font-semibold">属性与题目导航（可收起）</summary>
        <div className="space-y-3">
        {!active&&<p className="text-xs text-slate-600">选择工具后显示其内容结构和保存状态。</p>}
        {active&&<>
          <p className="text-sm break-words font-medium">{active.title}</p>
          <dl className="text-xs space-y-2">
            <div><dt className="inline">类型：</dt><dd className="inline">{displayKind[active.kind]}</dd></div>
            <div><dt className="inline">修订：</dt><dd className="inline">v{active.revision}{dirty?'（未保存）':''}</dd></div>
            <div><dt className="inline">状态：</dt><dd className="inline">{toolStatus(active.status)}</dd></div>
            <div><dt className="inline">工具编码：</dt><dd className="break-all">{active.instrumentKey}</dd></div>
          </dl>
          {!readOnly&&<div className="flex flex-col gap-2">
            <button type="button" className="btn-primary" disabled={busy||!dirty} onClick={save}>
              保存当前修订</button>
            <button type="button" className="btn-secondary" disabled={busy||dirty}
              onClick={validate}>验证冻结结构</button>
          </div>}
          {!readOnly&&active.kind==='FORM'&&(active.definition as FormDraft).pages.map(page=>
            <div key={page.pageKey} className="border-t pt-2">
              <p className="text-sm font-semibold">{page.title||page.pageKey}</p>
              <nav className="grid gap-1 text-xs mt-2" aria-label="本页题目导航">
                {page.questions.map(q=><a key={q.itemKey} className="underline break-words"
                  href={'#survey-form-'+q.itemKey}>{q.prompt.slice(0,36)||'未填写题干'}</a>)}
              </nav>
            </div>)}
          {!readOnly&&active.kind==='SCALE'&&<>
            <h4 className="text-sm font-semibold">维度与问题</h4>
            {(active.definition as ScaleDraft).dimensions.map(dim=>
              <p className="text-xs" key={dim.dimensionKey}>{dim.label||dim.dimensionKey} · {directionLabel(dim.direction)}</p>)}
            {(active.definition as ScaleDraft).items.map(q=><a className="block text-xs underline break-words"
              href={'#survey-scale-'+q.itemKey} key={q.itemKey}>{q.prompt.slice(0,35)||'未填写题干'}</a>)}
          </>}
          {!readOnly&&active.kind==='SJT'&&<>
            <h4 className="text-sm font-semibold">共享场景与构念</h4>
            {(active.definition as SjtDraft).metrics.map(m=><p className="text-xs" key={m.metricKey}>
              {m.label||m.metricKey}</p>)}
            {(()=>{const definition=active.definition as SjtDraft;return (definition.schemaVersion===2?definition.scenes.flatMap(scene=>scene.questions):definition.questions)})().map(q=><a key={q.questionKey}
              className="block text-xs underline break-words"
              href={'#survey-sjt-'+q.questionKey}>{q.prompt.slice(0,35)||'未填写问题'}</a>)}
          </>}
          {preview&&!preview.ok&&<p role="alert" className="text-xs text-red-700">
            结构未通过，先处理 {preview.issues.length} 项错误。目录不代表研究科学效度验证。
          </p>}
          <p className="text-xs text-slate-600">在工具列表切换工具，在编制区编辑题目；此处查看属性并快速定位。
            手机端同样可展开题目导航，全部设置无需拖拽即可操作。</p>
        </>}
        </div></details>
      </aside>
    </div>
    <ResearchCatalog projectId={projectId} api={api} busy={busy} onImport={importCatalog}/>
    </fieldset>
  </section>
}
