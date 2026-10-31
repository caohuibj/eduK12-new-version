import {useEffect,useId,useMemo,useRef,useState,type KeyboardEvent} from 'react'
import {ArrowRight,CheckCircle2,Download,FileSpreadsheet,FolderOpen,LockKeyhole,RefreshCw,Upload} from 'lucide-react'
import {componentRequest as api,uploadComponentWorkbook,downloadComponentTemplate,componentDocument,componentContentPlaceholder,type ComponentDocument,type ComponentDraft,type ComponentPointer,type ComponentPreview,type ImportResult,type ComponentAxis} from '../../api/scaleComponentImport'
import type {StandardOnboardingTarget} from '../../api/surveyStandard'
import {ScaleDefinitionEditor} from '../ScaleDefinitionEditor'
import type {ScaleDefinition} from '../scaleDefinitionEditorModel'
import {ReportTemplateFields} from '../../modules/assessment-core/report/ReportTemplateFields'
import {EntryAdmissionChoices,type StandardCombinationEntryAdmissionProduct} from '../../components/scale-governance/EntryAdmissionChoices'
import AdminStepUp from '../../admin/AdminStepUp'
import ScaleComponentPreview from './ScaleComponentPreview'
import './scale-component-manager.css'

type Header=Pick<ComponentDraft,'id'|'toolKey'|'configurationName'|'revision'|'publishedReleaseId'>
type PendingImport={requestId:string;digest:string}
const axes:ComponentAxis[]=['CONTENT','PARAMETERS','REPORT'],labels={CONTENT:'C 题本及计分',PARAMETERS:'P 参数及阈值',REPORT:'R 报告'}
const friendlyLabels={CONTENT:'题本及计分',PARAMETERS:'参数及阈值',REPORT:'报告'}
const resultLabels:Record<string,string>={IMPORTED:'已保存草稿',EXISTING:'已保存（原请求）',INVALID:'需要修正',FAILED:'结果待核对'}
const publicationLabels:Record<string,string>={APPROVED:'已批准，等待试运行',TRIAL_RUNNING:'正在试运行',TRIAL_FAILED:'试运行未通过',ONLINE:'已上线',WITHDRAWN:'已停止新增使用'}
const message=(e:unknown)=>e instanceof Error?e.message:'操作未确认，请刷新核对'
const simpleDefinition=(d:ScaleDefinition)=>{try{return typeof d.respondentType==='string'&&!!d.source&&!!d.license&&!!d.display&&Array.isArray(d.items)&&Array.isArray(d.responseSets)&&d.responseSets.length>0&&d.responseSets.every(set=>typeof set.key==='string'&&Array.isArray(set.options)&&set.options.length>=2)&&Array.isArray(d.report?.interpretations)&&Array.isArray(d.report.scoreOrder)&&Array.isArray(d.report.primaryScoreKeys)&&d.items.length<=200&&!('scorerKey'in d.scoring)&&d.scoring.defaultMissingPolicy.type==='complete_required'&&d.scoring.itemRules.every(i=>['identity','reverse'].includes(i.transform.type))&&d.scoring.scores.every(s=>s.source.type==='items'&&['sum','mean'].includes(s.source.aggregation))}catch{return false}}
export default function ScaleComponentManager({actorId,initialCombination,initialIntake}:{actorId:string;initialCombination?:ComponentPointer|null;initialIntake?:{target:StandardOnboardingTarget;workspace:'import'|'drafts'}|null}){
 const uid=useId(),editorHeading=useRef<HTMLHeadingElement>(null),importTab=useRef<HTMLButtonElement>(null),draftTab=useRef<HTMLButtonElement>(null)
 const [workspace,setWorkspace]=useState<'import'|'drafts'>(initialCombination?'drafts':initialIntake?.workspace??'import')
 const [onlyIssues,setOnlyIssues]=useState(false),[filterText,setFilterText]=useState(initialIntake?.target.instrumentKey??''),[filterStatus,setFilterStatus]=useState<'all'|'draft'|'frozen'>('all')
 const [advancedOpen,setAdvancedOpen]=useState(false),[advancedEdited,setAdvancedEdited]=useState(false),[listLoading,setListLoading]=useState(true),[busyLabel,setBusyLabel]=useState('')
 const storageKey='scale-component-import:'+actorId
 const [file,setFile]=useState<File|null>(null),[result,setResult]=useState<ImportResult|null>(null),[filePreviewed,setFilePreviewed]=useState(false)
 const [pending,setPending]=useState<PendingImport|null>(()=>{try{return JSON.parse(sessionStorage.getItem(storageKey)||'null')}catch{return null}})
 const [rows,setRows]=useState<Header[]>([]),[page,setPage]=useState(1),[more,setMore]=useState(false),[loadedPage,setLoadedPage]=useState(0)
 const [selected,setSelected]=useState<ComponentDraft|null>(null),[text,setText]=useState(''),[savedText,setSavedText]=useState(''),[isNew,setIsNew]=useState(false)
 const [preview,setPreview]=useState<ComponentPreview|null>(null),[products,setProducts]=useState<StandardCombinationEntryAdmissionProduct[]>([]),[reason,setReason]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[tab,setTab]=useState<'basic'|'responses'|'items'|'scores'>('items')
 const componentPool=useRef<ComponentDocument['changedParts']>({})
 const inFlight=useRef(false),live=useRef(true),pageEpoch=useRef(0)
 const pendingPublish=useRef<{id:string;requestId:string;input:unknown}|null>(null),pendingCreate=useRef<{requestId:string;draft:ComponentDocument}|null>(null)
 useEffect(()=>{live.current=true;return()=>{live.current=false;pageEpoch.current++}},[])
 const refresh=async()=>{const epoch=++pageEpoch.current;setListLoading(true);try{const r=await api<{list:Header[];hasMore:boolean}>('/component-drafts?page='+page);if(live.current&&epoch===pageEpoch.current){setRows(r.list);setMore(r.hasMore);setLoadedPage(page)}}finally{if(live.current&&epoch===pageEpoch.current)setListLoading(false)}}
 useEffect(()=>{void refresh().catch(e=>{if(live.current)setError(message(e))});return()=>{pageEpoch.current++}},[page])
 const run=async(work:()=>Promise<void>,label='正在处理，请稍候…')=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setBusyLabel(label);setError('');setNotice('');try{await work()}catch(e){if(live.current)setError(message(e))}finally{inFlight.current=false;if(live.current){setBusy(false);setBusyLabel('')}}}
 const doc=useMemo(()=>{try{const d=JSON.parse(text);if(!d||typeof d.toolKey!=='string'||typeof d.configurationName!=='string'||!d.changedParts||typeof d.changedParts!=='object'||Array.isArray(d.changedParts))return null;for(const part of Object.values(d.changedParts))if(!part||typeof part!=='object'||typeof (part as {version?:unknown}).version!=='string')return null;return d as ComponentDocument}catch{return null}},[text])
 const dirty=text!==savedText,readOnly=!!selected?.publishedReleaseId
 const choose=(d:ComponentDraft)=>{if(!live.current)return;componentPool.current=structuredClone(d.changedParts);const raw=JSON.stringify(componentDocument(d),null,2);setSelected(d);setText(raw);setSavedText(raw);setPreview(null);setIsNew(false);setWorkspace('drafts');setAdvancedOpen(false);setAdvancedEdited(false);pendingPublish.current=null;pendingCreate.current=null}
 const selectedId=selected?.id??null
 useEffect(()=>{if(workspace==='drafts'&&(selectedId||isNew))editorHeading.current?.focus()},[workspace,selectedId,isNew])
 const change=(next:string)=>{setText(next);setAdvancedEdited(true);setPreview(null)}
 const mutate=(work:(draft:ComponentDocument)=>ComponentDocument)=>{setPreview(null);setText(current=>JSON.stringify(work(JSON.parse(current)),null,2))}
 const open=(id:string)=>run(async()=>{if(dirty&&!window.confirm('放弃未保存修改并读取草稿？'))return;choose(await api<ComponentDraft>('/component-drafts/'+id))},'正在读取草稿…')
 const loadPrefill=async(pointer:ComponentPointer)=>{if(dirty&&!window.confirm('放弃当前未保存修改并创建新版本？'))return;const d=await api<ComponentDocument>('/component-revision-prefill',pointer);if(!live.current)return;componentPool.current=structuredClone(d.changedParts);setSelected(null);setText(JSON.stringify(d,null,2));setSavedText('');setPreview(null);setIsNew(true);setWorkspace('drafts');setAdvancedOpen(false);setAdvancedEdited(false);pendingCreate.current=null;setNotice('请保留本次实际修改的组分、填写新版本号；未提供组分会继承下方精确基础组合。')}
 const prefill=(pointer:ComponentPointer)=>run(()=>loadPrefill(pointer))
 const initialRef=useRef('')
 useEffect(()=>{if(initialCombination&&initialRef.current!==initialCombination.releaseId){initialRef.current=initialCombination.releaseId;void prefill(initialCombination)}},[initialCombination])
 const checkFile=()=>run(async()=>{if(!file)return;const r=await uploadComponentWorkbook('preview',file);if(live.current){setResult(r);setFilePreviewed(true)}},'正在解析 Excel 并定位问题…')
 const importFile=()=>run(async()=>{
  if(!file||!result||!filePreviewed)return
  if(pending&&pending.digest!==result.digest)throw new Error('有另一份待核对导入请求，请先读取草稿列表核对原结果')
  const request=pending??{requestId:crypto.randomUUID(),digest:result.digest};sessionStorage.setItem(storageKey,JSON.stringify(request));setPending(request)
  const r=await uploadComponentWorkbook('save',file,{requestId:request.requestId,expectedDigest:request.digest})
  if(!live.current)return;setResult(r);setFilePreviewed(false)
  if(r.entries.every(e=>e.status!=='FAILED')){sessionStorage.removeItem(storageKey);setPending(null)}
  setNotice('请逐项核对导入结果。已成功条目不会因其他条目失败而重复建立。');await refresh()
 },'正在逐项保存有效草稿…')
 const save=()=>run(async()=>{
  if(!doc)return
  if(isNew){
   const request=pendingCreate.current??{requestId:crypto.randomUUID(),draft:componentDocument(doc)}
   if(JSON.stringify(request.draft)!==JSON.stringify(componentDocument(doc)))throw new Error('创建结果尚未确认，请先刷新核对原请求')
   pendingCreate.current=request;const d=await api<ComponentDraft>('/component-drafts',request);choose(d)
  }else if(selected){const d=await api<ComponentDraft>('/component-drafts/'+selected.id,{expectedRevision:selected.revision,draft:componentDocument(doc)});choose(d)}
  if(live.current)setNotice('草稿已保存，尚未发布。');await refresh()
 },'正在保存草稿…')
 const inspect=()=>run(async()=>{if(!selected||dirty)return;const p=await api<ComponentPreview>('/component-drafts/'+selected.id+'/preview');if(live.current)setPreview(p)},'正在核对所选版本组合…')
 const publish=()=>run(async()=>{
  if(!selected||!preview||dirty||preview.blockers.length||!products.length||!reason.trim())return
  const body={requestId:'',expectedRevision:preview.revision,expectedPreviewHash:preview.previewHash,expectedBase:preview.baseCombination,allowedProducts:[...products].sort(),reason:reason.trim()}
  const old=pendingPublish.current
  if(old&&(old.id!==selected.id||JSON.stringify({...old.input as object,requestId:''})!==JSON.stringify(body)))throw new Error('原发布请求尚待核对，不能更换内容、原因或入口')
  const request=old??{id:selected.id,requestId:crypto.randomUUID(),input:body};const input={...body,requestId:request.requestId};pendingPublish.current={...request,input}
  const r=await api<{id:string;state:string;blockers:string[]}>('/component-drafts/'+selected.id+'/publish',input)
  pendingPublish.current=null;if(!live.current)return
  setNotice('配置状态：'+(publicationLabels[r.state]??r.state)+(r.blockers.length?'；'+r.blockers.join('；'):'；未自动分配任何使用权。'))
  choose(await api<ComponentDraft>('/component-drafts/'+selected.id));await refresh()
 },'正在批准并试运行；评分、报告和数据库回读通过后才会上线…')
 const c=advancedEdited?undefined:doc?.changedParts.CONTENT,rawReport=advancedEdited?null:doc?.changedParts.REPORT?.payload,r=rawReport&&typeof rawReport==='object'?rawReport:null,report=r?('definition'in r?r.definition:r):null,template=r&&'template'in r?r.template:null
 const effective=c?.definition??preview?.triplet?.definition
 const updateC=(action:ScaleDefinition|((previous:ScaleDefinition)=>ScaleDefinition))=>mutate(d=>({...d,changedParts:{...d.changedParts,CONTENT:{...d.changedParts.CONTENT!,definition:componentContentPlaceholder(typeof action==='function'?action(d.changedParts.CONTENT!.definition):action)}}}))
 const setAxisVersion=(axis:ComponentAxis,version:string)=>mutate(d=>{
  if(axis==='REPORT'){const old=d.changedParts.REPORT!,p=old.payload;return {...d,changedParts:{...d.changedParts,REPORT:{version,payload:p?('definition'in p?{...p,definition:{...p.definition,reportVersion:version}}:{...p,reportVersion:version}):null}}}}
  return {...d,changedParts:{...d.changedParts,[axis]:{...d.changedParts[axis]!,version}}}
 })
 const validCount=result?.entries.filter(e=>!e.issues.length).length??0,issueCount=result?.entries.filter(e=>e.issues.length>0).length??0
 const savedCount=result?.entries.filter(e=>e.status==='IMPORTED'||e.status==='EXISTING').length??0
 const visibleResults=result?.entries.filter(e=>!onlyIssues||e.issues.length>0)??[]
 const visibleRows=rows.filter(row=>(!filterText.trim()||(row.configurationName+' '+row.toolKey).toLocaleLowerCase().includes(filterText.trim().toLocaleLowerCase()))
  &&(filterStatus==='all'||(filterStatus==='frozen')===!!row.publishedReleaseId))
 const metadata=c?.metadata&&typeof c.metadata==='object'&&!Array.isArray(c.metadata)?c.metadata:null
 const instruction=metadata?.instruction&&typeof metadata.instruction==='object'&&!Array.isArray(metadata.instruction)?metadata.instruction as Record<string,unknown>:null
 const guideValue=(key:string)=>typeof instruction?.[key]==='string'?instruction[key] as string:''
 const setGuide=(key:string,value:string)=>mutate(d=>{const content=d.changedParts.CONTENT!,old=content.metadata.instruction;return {...d,changedParts:{...d.changedParts,CONTENT:{...content,metadata:{...content.metadata,instruction:{schemaVersion:1,text:'',language:'zh-CN',version:content.version,source:'管理员填写',...(old&&typeof old==='object'?old:{}),[key]:value}}}}}})
 const copyFrozen=(id:string,releaseId:string)=>run(async()=>{const p=await api<ComponentPreview>('/component-drafts/'+id+'/preview');if(p.triplet)await loadPrefill({releaseId,combinationHash:p.triplet.combinationHash})},'正在复制精确配置为新版本…')
 const moveTab=(event:KeyboardEvent<HTMLButtonElement>)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||busy)return;event.preventDefault();const next=event.key==='Home'?'import':event.key==='End'?'drafts':workspace==='import'?'drafts':'import';setWorkspace(next);(next==='import'?importTab:draftTab).current?.focus()}
 const tabs={basic:'基本信息',responses:'选项组',items:'题目',scores:'计分'}
 const isUnconfigured=(a:ComponentAxis)=>a==='PARAMETERS'?doc?.changedParts.PARAMETERS?.payload===null:a==='REPORT'?doc?.changedParts.REPORT?.payload===null:false
 return <section className="sys-panel scale-components" aria-busy={busy}>
  <header className="component-heading"><div><span className="component-eyebrow">系统管理员 · 量表版本</span><h2>导入量表，按版本发布</h2><p>先保存可编辑草稿，再核对组合并发布。新版本不会替换历史问卷、报告或授权。</p></div><FileSpreadsheet aria-hidden="true" size={34}/></header>
  {initialIntake&&<aside className="component-message" aria-label="当前接入待办"><div><strong>{initialIntake.target.name} · {initialIntake.target.instrumentVersion}</strong><p>工具标识：{initialIntake.target.instrumentKey}</p><p>这里只导航到已有操作，不会从目录自动创建草稿、补造计分或发布。请按待办准备完整内容，下载模板填写后导入；已有草稿可在当前页按工具标识筛选后继续编辑。</p></div></aside>}
  <div className="component-tabs" role="tablist" aria-label="量表管理任务">
   <button ref={importTab} id={uid+'-import-tab'} role="tab" aria-selected={workspace==='import'} aria-controls={uid+'-import'} tabIndex={workspace==='import'?0:-1} disabled={busy} onKeyDown={moveTab} onClick={()=>setWorkspace('import')}><Upload size={16} aria-hidden="true"/>批量导入</button>
   <button ref={draftTab} id={uid+'-drafts-tab'} role="tab" aria-selected={workspace==='drafts'} aria-controls={uid+'-drafts'} tabIndex={workspace==='drafts'?0:-1} disabled={busy} onKeyDown={moveTab} onClick={()=>setWorkspace('drafts')}><FolderOpen size={16} aria-hidden="true"/>草稿与版本{dirty&&<span className="component-dot" aria-label="有未保存修改"/>}</button>
  </div>
  {error&&<p role="alert" className="component-message component-error">{error}</p>}{notice&&<p role="status" className="component-message component-success">{notice}</p>}
  {busy&&<p role="status" className="component-message"><RefreshCw className="component-spin" size={16} aria-hidden="true"/>{busyLabel}</p>}
  <section id={uid+'-import'} role="tabpanel" aria-labelledby={uid+'-import-tab'} hidden={workspace!=='import'}>
   <ol className="component-steps" aria-label="导入步骤"><li data-done={!!file}><span>1</span>下载并填写</li><li data-done={filePreviewed||!!savedCount}><span>2</span>预览并修正</li><li data-done={!!savedCount}><span>3</span>保存有效草稿</li></ol>
   <div className="component-import-grid"><div className="component-surface"><h3>使用普通 Excel 列填写</h3><p>题干、选项、维度、反向、权重、参数分档及报告文字可直接填写。高级结构保留 JSON 模式。</p><button disabled={busy} onClick={()=>void run(downloadComponentTemplate,'正在准备 Excel 模板…')}><Download size={16} aria-hidden="true"/>下载 Excel 模板</button><small>每批最多 10 份 · .xlsx · 2 MiB 以内</small></div>
    <div className="component-surface"><label className="component-field">上传 Excel<input type="file" accept=".xlsx" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);setResult(null);setFilePreviewed(false);setOnlyIssues(false)}}/></label><p>{file?`已选择：${file.name}`:'选择填写好的模板，预览后才会保存。'}</p><div className="component-actions"><button disabled={busy||!file} onClick={()=>void checkFile()}>预览导入</button><button className="component-primary" disabled={busy||!filePreviewed||!validCount} onClick={()=>void importFile()}>确认保存有效条目<ArrowRight size={16} aria-hidden="true"/></button></div></div>
   </div>
   {pending&&<aside className="component-message"><div><strong>有一份导入请求待核对</strong><p>重选原文件并预览后可安全重试。请先从草稿列表核对，再开始另一份导入。</p><details><summary>请求信息</summary><code>{pending.requestId}</code></details><button disabled={busy} onClick={()=>{if(window.confirm('确认已从草稿列表核对原导入结果，并开始另一份导入？')){sessionStorage.removeItem(storageKey);setPending(null)}}}>已核对，开始新导入</button></div></aside>}
   {result&&<section className="component-results" aria-label="导入结果"><div className="component-section-heading"><div><h3>{filePreviewed?'预览结果':'保存结果'}</h3><p>{result.entries.length} 项 · {filePreviewed?`${validCount} 项可保存`:`${savedCount} 项已保存`} · {issueCount} 项需处理</p></div><label className="component-check"><input type="checkbox" checked={onlyIssues} disabled={!issueCount} onChange={e=>setOnlyIssues(e.target.checked)}/>只看需处理条目</label></div>
    <ol className="component-result-list">{visibleResults.map(e=><li key={e.index} data-issue={!!e.issues.length}><div className="component-section-heading"><div><span className="component-badge">{e.status?resultLabels[e.status]??e.status:e.issues.length?'需要修正':'可保存'}</span><h4>{e.configurationName??e.draft?.configurationName??e.toolKey??'未识别的条目'}</h4><small>第 {e.index+1} 项 · {e.toolKey??'未识别'}{e.changedParts?.length?' · '+e.changedParts.map(a=>friendlyLabels[a]).join(' / '):''}</small></div>{e.draft?.id&&<button disabled={busy} aria-label={'打开草稿 '+e.draft.configurationName} onClick={()=>void open(e.draft!.id)}>打开草稿<ArrowRight size={15} aria-hidden="true"/></button>}</div>{e.issues.length>0&&<ul className="component-issues">{e.issues.map((i,n)=><li key={n}><strong>{i.sheet} · 第 {i.row} 行</strong><p>{i.message}</p><small>字段：{i.path}</small></li>)}</ul>}</li>)}</ol>
   </section>}
  </section>
  <section id={uid+'-drafts'} role="tabpanel" aria-labelledby={uid+'-drafts-tab'} hidden={workspace!=='drafts'}>
   <div className="component-section-heading"><div><h3>版本草稿</h3><p>草稿可修改，已批准配置只读。修改已冻结内容时创建新版本。</p></div><button disabled={busy||listLoading} onClick={()=>void run(refresh,'正在刷新草稿…')}><RefreshCw size={15} aria-hidden="true"/>刷新草稿</button></div>
   <div className="component-filter"><label className="component-field">筛选本页草稿<input type="search" value={filterText} placeholder="名称或量表编码" onChange={e=>setFilterText(e.target.value)}/></label><label className="component-field">本页状态<select value={filterStatus} onChange={e=>setFilterStatus(e.target.value as typeof filterStatus)}><option value="all">全部状态</option><option value="draft">可编辑草稿</option><option value="frozen">已批准，只读</option></select></label>{(filterText||filterStatus!=='all')&&<button onClick={()=>{setFilterText('');setFilterStatus('all')}}>清除筛选</button>}</div>
   {listLoading?<p role="status">正在读取草稿…</p>:visibleRows.length?<ul className="component-draft-list">{visibleRows.map(row=><li key={row.id} data-selected={selected?.id===row.id}><div><span className="component-badge">{row.publishedReleaseId?<><LockKeyhole size={12} aria-hidden="true"/>已批准，只读</>:'可编辑草稿'}</span><h4>{row.configurationName}</h4><small>{row.toolKey} · 修订 {row.revision}</small></div><div className="component-actions"><button disabled={busy} onClick={()=>void open(row.id)}>编辑／查看 {row.configurationName}</button>{row.publishedReleaseId&&<button disabled={busy} onClick={()=>void copyFrozen(row.id,row.publishedReleaseId!)}>创建新版本</button>}</div></li>)}</ul>:<div className="component-empty"><FolderOpen size={26} aria-hidden="true"/><h4>{rows.length?'本页没有匹配的草稿':'还没有版本草稿'}</h4><p>{rows.length?'修改名称或状态筛选，或切换下一页。':'先下载模板并导入，或从标准量表的已冻结配置创建新版本。'}</p>{!rows.length&&<button onClick={()=>setWorkspace('import')}>前往批量导入</button>}</div>}
   <nav className="component-pagination" aria-label="组分草稿分页"><span>第 {page} 页 · 本页显示 {visibleRows.length} / {rows.length} 项</span><div><button disabled={busy||listLoading||page<=1} onClick={()=>setPage(p=>p-1)}>上一页草稿</button><button disabled={busy||listLoading||loadedPage!==page||!more} onClick={()=>setPage(p=>p+1)}>下一页草稿</button></div></nav>
   {(selected||isNew)&&<section className="component-editor" aria-label="草稿编辑"><div className="component-section-heading"><div><span className="component-eyebrow">{readOnly?'已批准配置 · 只读':isNew?'新版本草稿':'编辑草稿'}</span><h3 ref={editorHeading} tabIndex={-1}>{isNew?'创建新版本草稿':selected?.configurationName}</h3><p>{readOnly?'原配置保持冻结。复制后再修改和发布。':dirty?'有未保存修改，保存后才能核对发布组合。':'修改已保存，可继续核对拟发布组合。'}</p></div>{readOnly?<LockKeyhole size={22} aria-hidden="true"/>:<span className="component-badge">{dirty?'未保存':'已保存'}</span>}</div>
    <fieldset disabled={busy||readOnly||advancedEdited} className="component-fields"><legend>名称与本次修改</legend>{doc&&<><label className="component-field">配置名称<input value={doc.configurationName} onChange={e=>mutate(d=>({...d,configurationName:e.target.value}))}/></label><p className="component-help">{doc.baseCombination?'未勾选的组分继承所选基础配置。':'尚无基础配置；缺少的组分需补齐，或明确不配置参数/报告。'}</p>
     {doc.baseCombination&&<details className="component-technical"><summary>查看精确基础版本</summary><code>{doc.baseCombination.releaseId}</code><code>{doc.baseCombination.combinationHash}</code></details>}
     <div className="component-axis-grid">{axes.map(a=><div key={a} className="component-axis"><label className="component-check"><input type="checkbox" checked={!!doc.changedParts[a]} onChange={e=>{const checked=e.target.checked;mutate(d=>{const next={...d.changedParts};if(checked)Object.assign(next,{[a]:componentPool.current[a]});else{Object.assign(componentPool.current,{[a]:next[a]});delete next[a]}return {...d,changedParts:next}})}} disabled={!doc.changedParts[a]&&!componentPool.current[a]}/><strong>{friendlyLabels[a]}</strong></label><p>{doc.changedParts[a]?(isUnconfigured(a)?'明确不配置':'本次提供此组分'):doc.baseCombination?'继承基础版本':'尚未提供'}</p>{doc.changedParts[a]&&<label className="component-field">{labels[a]}版本<input value={doc.changedParts[a]!.version} onChange={e=>setAxisVersion(a,e.target.value)}/></label>}{a!=='CONTENT'&&!doc.changedParts[a]&&<button onClick={()=>mutate(d=>({...d,changedParts:{...d.changedParts,[a]:{version:'none-v1',payload:null}}}))}>明确不配置{a==='PARAMETERS'?'参数':'报告'}</button>}</div>)}</div>
    </>}</fieldset>
    {metadata&&c&&<fieldset className="component-fields" disabled={busy||readOnly}><legend>量表名称与指导语</legend><label className="component-field">量表名称<input value={typeof metadata.title==='string'?metadata.title:''} onChange={e=>mutate(d=>({...d,changedParts:{...d.changedParts,CONTENT:{...d.changedParts.CONTENT!,metadata:{...d.changedParts.CONTENT!.metadata,title:e.target.value}}}}))}/></label>
     <label className="component-field">指导语<textarea aria-label="指导语" rows={3} value={guideValue('text')} placeholder="可填写作答前展示的指导语" onChange={e=>setGuide('text',e.target.value)}/></label><div className="component-inline-fields"><label className="component-field">指导语语言<input value={guideValue('language')} placeholder="zh-CN" onChange={e=>setGuide('language',e.target.value)}/></label><label className="component-field">指导语版本<input value={guideValue('version')} placeholder={c.version} onChange={e=>setGuide('version',e.target.value)}/></label><label className="component-field">指导语来源<input value={guideValue('source')} placeholder="管理员填写" onChange={e=>setGuide('source',e.target.value)}/></label></div>
    </fieldset>}
    <fieldset disabled={busy||readOnly} className="component-fields"><legend>内容编辑</legend>
     {c&&simpleDefinition(c.definition)&&<details className="component-technical"><summary>使用已有量表编辑器编辑 C</summary><nav className="component-editor-tabs" aria-label="量表编辑内容">{(['basic','responses','items','scores'] as const).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{tabs[t]}</button>)}</nav><ScaleDefinitionEditor definition={c.definition} setDefinition={updateC} activeTab={tab} readOnly={readOnly} controlsDisabled={busy} saveDefinition={save} mediaEnabled={false}/></details>}
     {report&&effective&&simpleDefinition(effective)&&Array.isArray(report.interpretations)&&report.interpretations.every(i=>i?.source?.type==='score_only'&&Array.isArray(i.bands)&&Array.isArray(i.guidance)&&!i.bands.length&&!i.guidance.length)&&<details className="component-technical"><summary>使用已有报告内容编辑器</summary><ScaleDefinitionEditor definition={{...effective,report}} setDefinition={action=>{const next=typeof action==='function'?action({...effective,report}):action;mutate(d=>{const old=d.changedParts.REPORT!;return {...d,changedParts:{...d.changedParts,REPORT:{...old,payload:old.payload&&'definition'in old.payload?{...old.payload,definition:next.report}:next.report}}}})}} activeTab="report" readOnly={readOnly} controlsDisabled={busy} saveDefinition={save} mediaEnabled={false}/></details>}
     {template&&Array.isArray(template.blocks)&&effective&&simpleDefinition(effective)&&<details className="component-technical"><summary>使用已有报告结构编辑器</summary><ReportTemplateFields template={template} metricKeys={effective.scoring.scores.map(s=>s.key)} onChange={next=>mutate(d=>({...d,changedParts:{...d.changedParts,REPORT:{...d.changedParts.REPORT!,payload:{...d.changedParts.REPORT!.payload as object,template:next} as NonNullable<typeof r>}}}))}/></details>}
    </fieldset>
    <div className="component-fields"><button disabled={busy} className="component-disclosure" aria-expanded={advancedOpen||!doc} aria-controls={uid+'-definition'} onClick={()=>setAdvancedOpen(!advancedOpen)}>高级定义 · 完整 JSON{advancedOpen?'（收起）':'（展开）'}</button>
     <div id={uid+'-definition'} hidden={!advancedOpen&&!!doc}><p className="component-help">高级计分、参数、素材和图表在此保留完整结构。C 中的 report/referencePolicy 为占位，实际配置在 REPORT/PARAMETERS 中修改。</p><label className="component-field">完整组分定义 JSON<textarea aria-label="完整组分定义 JSON" className="component-json" rows={16} disabled={busy} readOnly={readOnly} spellCheck={false} value={text} onChange={e=>change(e.target.value)}/></label></div>
     {!doc&&<p role="alert" className="component-message component-error">JSON 格式或必需结构不完整；输入保留，修正后可保存。</p>}{advancedEdited&&doc&&<p className="component-help">高级修改保存并通过校验后，常规编辑项会重新显示。</p>}
    </div>
    {!readOnly&&<div className="component-save-bar"><span>{dirty?'请先保存修改，再核对发布。':'草稿已保存，尚未发布。'}</span><div className="component-actions"><button disabled={busy||!doc||!dirty} className="component-primary" onClick={()=>void save()}>{isNew?'建立新版本草稿':'保存草稿'}</button>{selected&&<button disabled={busy||dirty} onClick={()=>void inspect()}>预览拟发布组合<ArrowRight size={15} aria-hidden="true"/></button>}</div></div>}
    {selected&&!readOnly&&preview&&<section className="component-publication" aria-label="发布预览"><div className="component-section-heading"><div><h3>{preview.blockers.length?'拟发布组合需要处理':'拟发布组合已核对'}</h3><p>{preview.reviewNotice}</p></div>{!preview.blockers.length&&<CheckCircle2 size={24} aria-hidden="true"/>}</div>
     <div className="component-preview-grid">{axes.map(a=><div key={a}><small>{friendlyLabels[a]}</small><strong>{preview.parts[a]?.version??'尚未提供'}</strong><span>{preview.changedParts.includes(a)?'本次提供':preview.inheritedParts.includes(a)?'继承基础版本':'尚未提供'}</span></div>)}</div>
     {preview.blockers.length>0&&<ul className="component-issues">{preview.blockers.map((b,i)=><li key={i} role="alert">{b}</li>)}</ul>}
     <ScaleComponentPreview preview={preview}/>
     <details className="component-technical"><summary>核对参数、报告及组分差异</summary><pre>{JSON.stringify(preview.parts,null,2)}</pre></details>
     <EntryAdmissionChoices includeEducationEntries label="发布后允许的业务入口" value={products} disabled={busy} onChange={setProducts}/><label className="component-field">发布说明<textarea aria-label="发布说明" rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label><AdminStepUp/>
     <p className="component-help">{preview.blockers.length?'先处理上方问题，草稿会继续保留。':!products.length?'请选择至少一个允许的业务入口。':!reason.trim()?'请填写发布说明。':'身份验证及自动试运行通过后才会上线，不会自动分配个人使用权。'}</p><button className="component-primary" disabled={busy||dirty||preview.blockers.length>0||!products.length||!reason.trim()} onClick={()=>void publish()}>发布并自动试运行</button>
    </section>}
    {readOnly&&<div className="component-save-bar"><span>已冻结配置不可原地修改。</span><button disabled={busy} className="component-primary" onClick={()=>void copyFrozen(selected!.id,selected!.publishedReleaseId!)}>从已冻结配置创建新版本<ArrowRight size={16} aria-hidden="true"/></button></div>}
   </section>}
  </section>
 </section>
}
