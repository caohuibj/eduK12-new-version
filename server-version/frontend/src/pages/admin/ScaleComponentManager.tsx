import {useEffect,useMemo,useRef,useState} from 'react'
import {componentRequest as api,uploadComponentWorkbook,downloadComponentTemplate,componentDocument,componentContentPlaceholder,type ComponentDocument,type ComponentDraft,type ComponentPointer,type ComponentPreview,type ImportResult,type ComponentAxis} from '../../api/scaleComponentImport'
import {ScaleDefinitionEditor} from '../ScaleDefinitionEditor'
import type {ScaleDefinition} from '../scaleDefinitionEditorModel'
import {ReportTemplateFields} from '../../modules/assessment-core/report/ReportTemplateFields'
import {EntryAdmissionChoices,type StandardCombinationEntryAdmissionProduct} from '../../components/scale-governance/EntryAdmissionChoices'
import AdminStepUp from '../../admin/AdminStepUp'

type Header=Pick<ComponentDraft,'id'|'toolKey'|'configurationName'|'revision'|'publishedReleaseId'>
type PendingImport={requestId:string;digest:string}
const axes:ComponentAxis[]=['CONTENT','PARAMETERS','REPORT'],labels={CONTENT:'C 题本及计分',PARAMETERS:'P 参数及阈值',REPORT:'R 报告'}
const message=(e:unknown)=>e instanceof Error?e.message:'操作未确认，请刷新核对'
const simpleDefinition=(d:ScaleDefinition)=>{try{return typeof d.respondentType==='string'&&!!d.source&&!!d.license&&!!d.display&&Array.isArray(d.items)&&Array.isArray(d.responseSets)&&d.responseSets.length>0&&d.responseSets.every(set=>typeof set.key==='string'&&Array.isArray(set.options)&&set.options.length>=2)&&Array.isArray(d.report?.interpretations)&&Array.isArray(d.report.scoreOrder)&&Array.isArray(d.report.primaryScoreKeys)&&d.items.length<=200&&!('scorerKey'in d.scoring)&&d.scoring.defaultMissingPolicy.type==='complete_required'&&d.scoring.itemRules.every(i=>['identity','reverse'].includes(i.transform.type))&&d.scoring.scores.every(s=>s.source.type==='items'&&['sum','mean'].includes(s.source.aggregation))}catch{return false}}
export default function ScaleComponentManager({actorId,initialCombination}:{actorId:string;initialCombination?:ComponentPointer|null}){
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
 const refresh=async()=>{const epoch=++pageEpoch.current,r=await api<{list:Header[];hasMore:boolean}>('/component-drafts?page='+page);if(live.current&&epoch===pageEpoch.current){setRows(r.list);setMore(r.hasMore);setLoadedPage(page)}}
 useEffect(()=>{void refresh().catch(e=>{if(live.current)setError(message(e))});return()=>{pageEpoch.current++}},[page])
 const run=async(work:()=>Promise<void>)=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');try{await work()}catch(e){if(live.current)setError(message(e))}finally{inFlight.current=false;if(live.current)setBusy(false)}}
 const doc=useMemo(()=>{try{const d=JSON.parse(text);if(!d||typeof d.toolKey!=='string'||typeof d.configurationName!=='string'||!d.changedParts||typeof d.changedParts!=='object'||Array.isArray(d.changedParts))return null;for(const part of Object.values(d.changedParts))if(!part||typeof part!=='object'||typeof (part as {version?:unknown}).version!=='string')return null;return d as ComponentDocument}catch{return null}},[text])
 const dirty=text!==savedText,readOnly=!!selected?.publishedReleaseId
 const choose=(d:ComponentDraft)=>{if(!live.current)return;componentPool.current=structuredClone(d.changedParts);const raw=JSON.stringify(componentDocument(d),null,2);setSelected(d);setText(raw);setSavedText(raw);setPreview(null);setIsNew(false);pendingPublish.current=null;pendingCreate.current=null}
 const change=(next:string)=>{setText(next);setPreview(null)}
 const mutate=(work:(draft:ComponentDocument)=>ComponentDocument)=>{setPreview(null);setText(current=>JSON.stringify(work(JSON.parse(current)),null,2))}
 const open=(id:string)=>run(async()=>{if(dirty&&!window.confirm('放弃未保存修改并读取草稿？'))return;choose(await api<ComponentDraft>('/component-drafts/'+id))})
 const loadPrefill=async(pointer:ComponentPointer)=>{if(dirty&&!window.confirm('放弃当前未保存修改并创建新版本？'))return;const d=await api<ComponentDocument>('/component-revision-prefill',pointer);if(!live.current)return;componentPool.current=structuredClone(d.changedParts);setSelected(null);setText(JSON.stringify(d,null,2));setSavedText('');setPreview(null);setIsNew(true);pendingCreate.current=null;setNotice('请保留本次实际修改的组分、填写新版本号；未提供组分会继承下方精确基础组合。')}
 const prefill=(pointer:ComponentPointer)=>run(()=>loadPrefill(pointer))
 const initialRef=useRef('')
 useEffect(()=>{if(initialCombination&&initialRef.current!==initialCombination.releaseId){initialRef.current=initialCombination.releaseId;void prefill(initialCombination)}},[initialCombination])
 const checkFile=()=>run(async()=>{if(!file)return;const r=await uploadComponentWorkbook('preview',file);if(live.current){setResult(r);setFilePreviewed(true)}})
 const importFile=()=>run(async()=>{
  if(!file||!result||!filePreviewed)return
  if(pending&&pending.digest!==result.digest)throw new Error('有另一份待核对导入请求，请先读取草稿列表核对原结果')
  const request=pending??{requestId:crypto.randomUUID(),digest:result.digest};sessionStorage.setItem(storageKey,JSON.stringify(request));setPending(request)
  const r=await uploadComponentWorkbook('save',file,{requestId:request.requestId,expectedDigest:request.digest})
  if(!live.current)return;setResult(r);setFilePreviewed(false)
  if(r.entries.every(e=>e.status!=='FAILED')){sessionStorage.removeItem(storageKey);setPending(null)}
  setNotice('请逐项核对导入结果。已成功条目不会因其他条目失败而重复建立。');await refresh()
 })
 const save=()=>run(async()=>{
  if(!doc)return
  if(isNew){
   const request=pendingCreate.current??{requestId:crypto.randomUUID(),draft:componentDocument(doc)}
   if(JSON.stringify(request.draft)!==JSON.stringify(componentDocument(doc)))throw new Error('创建结果尚未确认，请先刷新核对原请求')
   pendingCreate.current=request;const d=await api<ComponentDraft>('/component-drafts',request);choose(d)
  }else if(selected){const d=await api<ComponentDraft>('/component-drafts/'+selected.id,{expectedRevision:selected.revision,draft:componentDocument(doc)});choose(d)}
  if(live.current)setNotice('草稿已保存，尚未发布。');await refresh()
 })
 const inspect=()=>run(async()=>{if(!selected||dirty)return;const p=await api<ComponentPreview>('/component-drafts/'+selected.id+'/preview');if(live.current)setPreview(p)})
 const publish=()=>run(async()=>{
  if(!selected||!preview||dirty||preview.blockers.length||!products.length||!reason.trim())return
  const body={requestId:'',expectedRevision:preview.revision,expectedPreviewHash:preview.previewHash,expectedBase:preview.baseCombination,allowedProducts:[...products].sort(),reason:reason.trim()}
  const old=pendingPublish.current
  if(old&&(old.id!==selected.id||JSON.stringify({...old.input as object,requestId:''})!==JSON.stringify(body)))throw new Error('原发布请求尚待核对，不能更换内容、原因或入口')
  const request=old??{id:selected.id,requestId:crypto.randomUUID(),input:body};const input={...body,requestId:request.requestId};pendingPublish.current={...request,input}
  const r=await api<{id:string;state:string;blockers:string[]}>('/component-drafts/'+selected.id+'/publish',input)
  pendingPublish.current=null;if(!live.current)return
  choose(await api<ComponentDraft>('/component-drafts/'+selected.id));setNotice('配置状态：'+r.state+(r.blockers.length?'；'+r.blockers.join('；'):'；未自动分配任何使用权。'));await refresh()
 })
 const c=doc?.changedParts.CONTENT,rawReport=doc?.changedParts.REPORT?.payload,r=rawReport&&typeof rawReport==='object'?rawReport:null,report=r?('definition'in r?r.definition:r):null,template=r&&'template'in r?r.template:null
 const effective=c?.definition??preview?.triplet?.definition
 const updateC=(action:ScaleDefinition|((previous:ScaleDefinition)=>ScaleDefinition))=>mutate(d=>({...d,changedParts:{...d.changedParts,CONTENT:{...d.changedParts.CONTENT!,definition:componentContentPlaceholder(typeof action==='function'?action(d.changedParts.CONTENT!.definition):action)}}}))
 const setAxisVersion=(axis:ComponentAxis,version:string)=>mutate(d=>{
  if(axis==='REPORT'){const old=d.changedParts.REPORT!,p=old.payload;return {...d,changedParts:{...d.changedParts,REPORT:{version,payload:p?('definition'in p?{...p,definition:{...p.definition,reportVersion:version}}:{...p,reportVersion:version}):null}}}}
  return {...d,changedParts:{...d.changedParts,[axis]:{...d.changedParts[axis]!,version}}}
 })
 return <section className="sys-panel" aria-busy={busy}>
  <h2>批量导入、草稿与发布</h2><p>使用 Excel 导入完整量表，或独立更新 C、P、R。未提供组分只从明确基础组合继承；首次 C-only 配置需明确选择不配置 P/R。</p>
  {error&&<p role="alert" className="sys-message sys-error">{error}</p>}{notice&&<p role="status" className="sys-message">{notice}</p>}
  <button disabled={busy} onClick={()=>void run(downloadComponentTemplate)}>下载 Excel 模板</button>
  <label className="system-field">上传 Excel<input type="file" accept=".xlsx" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);setResult(null);setFilePreviewed(false)}}/></label>
  <div className="system-actions"><button disabled={busy||!file} onClick={()=>void checkFile()}>预览导入</button><button disabled={busy||!filePreviewed||!result?.entries.some(e=>!e.issues.length)} onClick={()=>void importFile()}>确认保存有效条目</button></div>
  {pending&&<p role="status">待核对请求：{pending.requestId}。重选原文件并预览后可安全重试。<button disabled={busy} onClick={()=>{if(window.confirm('确认已从草稿列表核对原导入结果，并开始另一份导入？')){sessionStorage.removeItem(storageKey);setPending(null)}}}>已核对，开始新导入</button></p>}
  {result&&<ol>{result.entries.map(e=><li key={e.index}>第 {e.index+1} 项 · {e.toolKey??'未识别'} · {e.status??(e.issues.length?'需修正':'可保存')} {e.changedParts?.join(' / ')}{e.issues.map((i,n)=><p key={n}>{i.sheet} 第{i.row}行 · {i.path}：{i.message}</p>)}</li>)}</ol>}
  <h3>版本草稿</h3><button disabled={busy} onClick={()=>void run(refresh)}>刷新草稿</button>
  <ul>{rows.map(row=><li key={row.id}>{row.configurationName} · {row.toolKey} · 修订{row.revision} · {row.publishedReleaseId?'已冻结':'草稿'} <button disabled={busy} onClick={()=>void open(row.id)}>编辑／查看 {row.configurationName}</button>{row.publishedReleaseId&&<button disabled={busy} onClick={()=>void run(async()=>{const p=await api<ComponentPreview>('/component-drafts/'+row.id+'/preview');if(p.triplet)await loadPrefill({releaseId:row.publishedReleaseId!,combinationHash:p.triplet.combinationHash})})}>创建新版本</button>}</li>)}</ul>
  <nav aria-label="组分草稿分页"><button disabled={busy||page<=1} onClick={()=>setPage(p=>p-1)}>上一页草稿</button><span>第 {page} 页</span><button disabled={busy||loadedPage!==page||!more} onClick={()=>setPage(p=>p+1)}>下一页草稿</button></nav>
  {(selected||isNew)&&<section><h3>{isNew?'创建新版本草稿':selected?.configurationName} {readOnly?'· 已冻结，只读':''}</h3>
   <fieldset disabled={busy||readOnly}><legend>本次修改</legend>{doc&&<><label className="system-field">配置名称<input value={doc.configurationName} onChange={e=>mutate(d=>({...d,configurationName:e.target.value}))}/></label><p>基础组合：{doc.baseCombination?`${doc.baseCombination.releaseId} / ${doc.baseCombination.combinationHash}`:'未选择；不会自动采用任何最新版本'}</p>{axes.map(a=><label key={a}><input type="checkbox" checked={!!doc.changedParts[a]} onChange={e=>{const checked=e.target.checked;mutate(d=>{const next={...d.changedParts};if(checked)Object.assign(next,{[a]:componentPool.current[a]});else{Object.assign(componentPool.current,{[a]:next[a]});delete next[a]}return {...d,changedParts:next}})}} disabled={!doc.changedParts[a]&&!componentPool.current[a]}/>{labels[a]}{doc.changedParts[a]&&<input aria-label={labels[a]+'版本'} value={doc.changedParts[a]!.version} onChange={e=>setAxisVersion(a,e.target.value)}/>}</label>)}</>}
   <label className="system-field">完整组分定义 JSON<textarea rows={16} spellCheck={false} value={text} onChange={e=>change(e.target.value)}/></label>
   {!doc&&<p role="alert">JSON 格式或必需结构不完整；输入保留，修正后可保存。</p>}
   {c&&simpleDefinition(c.definition)&&<details><summary>使用已有量表编辑器编辑 C</summary><nav>{(['basic','responses','items','scores'] as const).map(t=><button key={t} onClick={()=>setTab(t)}>{t}</button>)}</nav><ScaleDefinitionEditor definition={c.definition} setDefinition={updateC} activeTab={tab} readOnly={readOnly} controlsDisabled={busy} saveDefinition={save} mediaEnabled={false}/></details>}
   {report&&effective&&simpleDefinition(effective)&&Array.isArray(report.interpretations)&&report.interpretations.every(i=>i?.source?.type==='score_only'&&Array.isArray(i.bands)&&Array.isArray(i.guidance)&&!i.bands.length&&!i.guidance.length)&&<details><summary>使用已有报告内容编辑器</summary><ScaleDefinitionEditor definition={{...effective,report}} setDefinition={action=>{const next=typeof action==='function'?action({...effective,report}):action;mutate(d=>{const old=d.changedParts.REPORT!;return {...d,changedParts:{...d.changedParts,REPORT:{...old,payload:old.payload&&'definition'in old.payload?{...old.payload,definition:next.report}:next.report}}}})}} activeTab="report" readOnly={readOnly} controlsDisabled={busy} saveDefinition={save} mediaEnabled={false}/></details>}
   {template&&Array.isArray(template.blocks)&&effective&&simpleDefinition(effective)&&<details><summary>使用已有报告结构编辑器</summary><ReportTemplateFields template={template} metricKeys={effective.scoring.scores.map(s=>s.key)} onChange={next=>mutate(d=>({...d,changedParts:{...d.changedParts,REPORT:{...d.changedParts.REPORT!,payload:{...d.changedParts.REPORT!.payload as object,template:next} as NonNullable<typeof r>}}}))}/></details>}
   <p>C.definition 的 report/referencePolicy 为占位，实际配置请在 REPORT/PARAMETERS 组分编辑。已有编辑器暂未可视化的高级计分、素材身份和图表字段可在完整 JSON 中编辑，保存时不会静默删除。</p>
   <button disabled={!doc||!dirty} onClick={()=>void save()}>{isNew?'建立新版本草稿':'保存草稿'}</button></fieldset>
   {selected&&!readOnly&&<><button disabled={busy||dirty} onClick={()=>void inspect()}>预览拟发布组合</button>{preview&&<section><p>{preview.reviewNotice}</p><p>新增：{preview.changedParts.join(' / ')}；继承：{preview.inheritedParts.join(' / ')}。</p>{preview.blockers.map((b,i)=><p key={i} role="alert">{b}</p>)}<details><summary>核对参数、报告及组分差异</summary><pre>{JSON.stringify(preview.parts,null,2)}</pre></details><EntryAdmissionChoices includeEducationEntries label="发布后允许的业务入口" value={products} disabled={busy} onChange={setProducts}/><label className="system-field">发布说明<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label><AdminStepUp/><button disabled={busy||dirty||preview.blockers.length>0||!products.length||!reason.trim()} onClick={()=>void publish()}>发布并自动试运行</button></section>}</>}
   {readOnly&&<button disabled={busy} onClick={()=>void run(async()=>{const p=await api<ComponentPreview>('/component-drafts/'+selected!.id+'/preview');if(p.triplet)await loadPrefill({releaseId:selected!.publishedReleaseId!,combinationHash:p.triplet.combinationHash})})}>从已冻结配置创建新版本</button>}
  </section>}
 </section>
}
