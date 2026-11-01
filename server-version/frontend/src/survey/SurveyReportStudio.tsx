import {ReportTemplateFields,type ReportTemplateDefinition as Template} from '../modules/assessment-core/report/ReportTemplateFields'
import { SurveySectionHeader } from './SurveySectionHeader'
import { useCallback, useEffect, useRef, useState } from 'react'
import { publishSurveyMeasurement } from './measurement-publication'
import {FileText,ArrowDownRight} from 'lucide-react'
import './survey-workspace-polish.css'

export interface ReportLeaveRisk {dirty:boolean;pending:boolean;busy:boolean}
type Payload={measurementReleaseId:string;metricKeys:string[];audience:'student'|'parent'|'teacher'|'researcher';language:string;
  template:Template;assets:{assetId:string;sha256:string;mediaType:string;rightsStatus:'self_authored'|'authorized';rightsNote:string}[]}
type Draft={id:string;report_key:string;version:string;revision:number;payload:Payload;state:'DRAFT'|'PUBLISHED';published_release_id:string|null}
type Summary={id:string;reportKey:string;version:string;revision:number;state:'DRAFT'|'PUBLISHED';publishedReleaseId:string|null}
type Measurement={id:string;family:string;key:string;version:string;status:string;contentHash:string;metrics:{metricKey:string;unit:string}[]}
type NativeInstrument={id:string;title:string;kind:string;status:string;revision:number;catalogGrantId?:string|null;readOnly?:boolean}
type Scenario='INTERPRETABLE'|'NO_REFERENCE'|'INVALID'
type Preview={synthetic:true;scenario:Scenario;revision:number;report:{title:string|null;blocks:unknown[];limitations:string[];disclaimer:string|null}}
type Create={requestId:string;reportKey:string;version:string;payload:Payload}

const cookie=()=>document.cookie.split('; ').find(value=>value.startsWith('huisurvey_research_csrf='))?.split('=').slice(1).join('=')||''
async function reportApi<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(method!=='GET'){
    let token=cookie()
    if(!token){
      const response=await fetch('/api/survey/auth/csrf',{credentials:'same-origin'})
      const envelope=await response.json() as {code:number;data:{csrfToken:string}|null}
      if(!response.ok||envelope.code!==0)throw new Error('无法建立研究者安全会话，请重新登录')
      token=envelope.data?.csrfToken||''
    }
    if(!token)throw new Error('研究者安全令牌不可用')
    headers['X-CSRF-Token']=decodeURIComponent(token)
  }
  const response=await fetch('/api/survey'+path,{method,headers,credentials:'same-origin',...(body===undefined?{}:{body:JSON.stringify(body)})})
  let envelope:{code:number;message?:string;data:T}
  try{envelope=await response.json()}catch{throw new Error('报告请求未得到有效响应，请重试原请求')}
  if(!response.ok||envelope.code!==0)throw new Error(envelope.message||'报告操作失败')
  return envelope.data
}
const initialPayload=(measurement:Measurement):Payload=>({measurementReleaseId:measurement.id,metricKeys:measurement.metrics.map(m=>m.metricKey),
  audience:'researcher',language:'zh-CN',template:{title:'研究反馈',blocks:[{type:'TEXT',text:'本报告提供本项目的描述性反馈。'}],limitations:[]},assets:[]})
const errorMessage=(e:unknown)=>e instanceof Error?e.message:'报告操作失败'
const textValue=(value:unknown)=>typeof value==='string'?value:''
function PreviewBlock({value}:{value:unknown}){
  if(!value||typeof value!=='object')return null
  const block=value as Record<string,unknown>
  if(block.type==='TEXT'||block.type==='REFERENCE_BAND')return <p>{textValue(block.text)}</p>
  if(block.type==='METRIC')return <p>{textValue(block.label)||textValue(block.metricKey)}：{typeof block.value==='number'?block.value:'不可用'} {textValue(block.unit)}</p>
  if(block.type==='ASSET')return <p>冻结图片：{textValue(block.alt)}（此编辑器不加载资产）</p>
  if(block.type==='CHART')return <p>图表区块已保留；此编辑器不展示图表。</p>
  return null
}


export type ReportTransport=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
export function SurveyReportStudio({instrumentTitles=[],projectId,projectStatus='DRAFT',active=true,onLeaveRiskChange,transport=reportApi,basePath,nativePublishing=true,audiences=['researcher','student','parent','teacher'],recoveryKey}:{projectId:string;projectStatus?:string;active?:boolean;onLeaveRiskChange?:(risk:ReportLeaveRisk)=>void;transport?:ReportTransport;basePath?:string;nativePublishing?:boolean;audiences?:Payload['audience'][];recoveryKey?:string;instrumentTitles?:{id:string;title:string}[]}){
  const base=basePath??('/projects/'+encodeURIComponent(projectId)+'/report-drafts')
  const reportApi=transport
  const [measurements,setMeasurements]=useState<Measurement[]>([]),[list,setList]=useState<Summary[]>([])
  const [measurementsLoaded,setMeasurementsLoaded]=useState(false),[listLoaded,setListLoaded]=useState(false)
  const [loadingLists,setLoadingLists]=useState(false),[listLoading,setListLoading]=useState(false)
  const [nativeInstruments,setNativeInstruments]=useState<NativeInstrument[]>([]),[nativeId,setNativeId]=useState(''),[nativePage,setNativePage]=useState(1),[nativeCount,setNativeCount]=useState(0),[showNative,setShowNative]=useState(false)
  const [page,setPage]=useState(1),[selected,setSelected]=useState<Draft|null>(null),[dirty,setDirty]=useState(false)
  const [measurementId,setMeasurementId]=useState(''),[reportKey,setReportKey]=useState(''),[version,setVersion]=useState('1')
  const [expandedBlock,setExpandedBlock]=useState<number|null>(0)
  const [copyVersion,setCopyVersion]=useState(''),[publicationNote,setPublicationNote]=useState('')
  const [scenario,setScenario]=useState<Scenario>('INTERPRETABLE'),[preview,setPreview]=useState<Preview|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[listError,setListError]=useState('')
  const [pendingCreate,setPendingCreateState]=useState<Create|null>(()=>{
    if(!recoveryKey)return null
    try{const raw=sessionStorage.getItem(recoveryKey);if(!raw)return null;const saved=JSON.parse(raw);return saved.scope===recoveryKey&&saved.request?.requestId&&saved.request?.payload?saved.request:null}catch{return null}
  })
  const setPendingCreate=(request:Create|null)=>{
    if(recoveryKey){if(request)sessionStorage.setItem(recoveryKey,JSON.stringify({scope:recoveryKey,request}));else sessionStorage.removeItem(recoveryKey)}
    setPendingCreateState(request)
  }
  useEffect(()=>{onLeaveRiskChange?.({dirty,pending:!!pendingCreate,busy})},[dirty,pendingCreate,busy,onLeaveRiskChange])
  useEffect(()=>()=>onLeaveRiskChange?.({dirty:false,pending:false,busy:false}),[onLeaveRiskChange])
  useEffect(()=>{
    if(!dirty&&!pendingCreate&&!busy)return
    const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',protect)
    return ()=>window.removeEventListener('beforeunload',protect)
  },[dirty,pendingCreate,busy])
  const initialRequested=useRef(false)
  // Report corrections remain available after collection closes; the server checks current ownership.
  const measurementWritable=['DRAFT','ACTIVE'].includes(projectStatus),readOnly=selected?.state==='PUBLISHED'
  const measurement=measurements.find(m=>m.id===selected?.payload.measurementReleaseId)
  const run=useCallback(async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await fn()}catch(e){setError(errorMessage(e))}finally{setBusy(false)}},[])
  const loadList=useCallback(async(nextPage:number)=>{
    setListLoading(true)
    try{const rows=await reportApi<Summary[]>(base+'?page='+nextPage);setList(rows);setPage(nextPage);setListError('');setListLoaded(true)}
    catch(e){setListError(errorMessage(e));throw e}
    finally{setListLoading(false)}
  },[base,reportApi])
  const loadNative=useCallback(async(nextPage:number)=>{
    const result=await reportApi<{list:NativeInstrument[]}>('/projects/'+encodeURIComponent(projectId)+'/instruments?page='+nextPage)
    const native=result.list.filter(row=>row.kind!=='FORM'&&row.status!=='ARCHIVED'&&((!row.catalogGrantId&&!row.readOnly)||(row.kind==='SCALE'&&!!row.catalogGrantId)))
    setNativeInstruments(native);setNativeCount(result.list.length);setNativePage(nextPage);setNativeId(native[0]?.id||'')
  },[projectId,reportApi])
  const load=useCallback(()=>run(async()=>{
    setLoadingLists(true)
    try{
      const choices=await reportApi<Measurement[]>(base+'/measurements');setMeasurements(choices);setMeasurementsLoaded(true)
      setMeasurementId(current=>current||choices[0]?.id||'');await loadList(1)
      if(nativePublishing&&!choices.length){await loadNative(1);setShowNative(true)}
    }finally{setLoadingLists(false)}
  }),[base,loadList,loadNative,run,nativePublishing,reportApi])
  useEffect(()=>{if(active&&!initialRequested.current){initialRequested.current=true;void load()}},[active,load]) // Project-keyed workspace retains edits while switching tabs.
  const publishMeasurement=()=>void run(async()=>{
    const source=nativeInstruments.find(row=>row.id===nativeId);if(!source)throw new Error('请选择本项目可发布的测量')
    const result=await publishSurveyMeasurement(reportApi,projectId,source)
    setNotice('测量版本已发布，可用于编制报告；未开启被试采集。')
    const choices=await reportApi<Measurement[]>(base+'/measurements');setMeasurements(choices);setMeasurementId(result.releaseId)
  })
  const afterWrite=()=>loadList(1).catch(()=>{})
  const choose=(id:string)=>void run(async()=>{
    if(dirty&&!window.confirm('当前报告有未保存内容，确定放弃并切换？'))return
    const row=await reportApi<Draft>(base+'/'+encodeURIComponent(id));setSelected(row);setExpandedBlock(0);setDirty(false);setPreview(null);setPublicationNote('');setCopyVersion('')
  })
  const create=async(request:Create)=>{
    setPendingCreate(request)
    const row=await reportApi<Draft>(base,'POST',request)
    setPendingCreate(null);setSelected(row);setExpandedBlock(0);setDirty(false);setPreview(null);setPublicationNote('');setCopyVersion('')
    setNotice('报告草稿已创建，尚未发布。');await afterWrite()
  }
  const startCreate=()=>void run(async()=>{
    if(pendingCreate){await create(pendingCreate);return}
    if(dirty&&!window.confirm('当前报告有未保存内容，确定放弃并创建？'))return
    const choice=measurements.find(m=>m.id===measurementId)
    if(!choice)throw new Error('请先选择本项目可用的测量发布版本')
    await create({requestId:crypto.randomUUID(),reportKey:reportKey.trim(),version:version.trim(),payload:initialPayload(choice)})
  })
  const copy=()=>{if(!selected)return;void run(async()=>{
    if(!copyVersion.trim()||copyVersion.trim()===selected.version)throw new Error('请填写与原版不同的新版本号')
    await create({requestId:crypto.randomUUID(),reportKey:selected.report_key,version:copyVersion.trim(),payload:structuredClone(selected.payload)})
  })}
  const change=(payload:Payload)=>{if(!selected||readOnly)return;setSelected({...selected,payload});setDirty(true);setPreview(null)}
  const save=()=>{if(!selected||!dirty)return;const snapshot=selected;void run(async()=>{
    const row=await reportApi<Draft>(base+'/'+snapshot.id,'PATCH',{revision:snapshot.revision,payload:{...snapshot.payload,template:{...snapshot.payload.template,limitations:snapshot.payload.template.limitations.filter(line=>line.trim()),blocks:snapshot.payload.template.blocks.map(block=>block.type==='REFERENCE_BAND'?{...block,guidance:block.guidance.filter(line=>line.trim())}:block)}}})
    setSelected(row);setDirty(false);setPreview(null);setNotice('报告草稿已保存。');await afterWrite()
  })}
  const simulate=()=>{if(!selected||dirty)return;void run(async()=>{
    const result=await reportApi<Preview>(base+'/'+selected.id+'/preview','POST',{scenario});setPreview(result)
    setNotice('仅使用合成指标与参考情境，未读取真实答卷。')
  })}
  const publish=()=>{if(!selected||dirty)return;void run(async()=>{
    const result=await reportApi<{releaseId:string}>(base+'/'+selected.id+'/publish','POST',{revision:selected.revision,publicationNote:publicationNote.trim()})
    setSelected({...selected,state:'PUBLISHED',published_release_id:result.releaseId});setNotice('报告版本已发布。已有报告与原始分数未被改写。');await afterWrite()
  })}
  const measurementName=(m:Measurement,index:number)=>instrumentTitles.find(tool=>m.key.endsWith(':'+tool.id))?.title||(m.key.length>60?({SCALE:'量表测量',SJT:'情境测验',COGNITIVE:'认知测验'}[m.family]||'测量版本')+' '+(index+1):m.key)
  const measurementStatus=(status:string)=>({PUBLISHED:'已发布',SUPERSEDED:'历史版本',RETIRED:'已停用'}[status]||status)
  const refreshAction=<button type="button" className="btn-secondary" disabled={busy} onClick={()=>void load()}>刷新报告与测量列表</button>
  return <section className={"survey-report-surface survey-studio-surface bg-white border rounded-xl p-4 sm:p-6 my-5 space-y-5"+(!basePath?" survey-report-workspace":"")} aria-label="项目私有报告">
    <SurveySectionHeader compact={!basePath} section="reports" title="项目私有报告" goal={!basePath?'选定测量版本，编写报告，再预览并发布。':undefined} actions={!basePath?refreshAction:undefined} policyLabel="用途与操作说明">{basePath?<p>参考区块只引用已有参考类型与分段标识，不创建阈值或常模。</p>:<div className="survey-report-guide">
      <p><strong>什么时候需要？</strong>需要把量表等测量的指标、解释文字和局限说明组织成统一报告时使用。只收集问卷或导出原始数据时，可以跳过。</p>
      <ol><li>先点击“发布或更新测量版本”，为研究内支持的量表保存测量版本；这一步不会开放招募。</li><li>选择测量版本创建报告草稿，编写文字与指标，保存后用合成情境预览。</li><li>填写发布说明并发布报告版本，再到“发布与采集 → 研究者报告与参考版本”读取、选用该精确版本；随研究定义冻结。</li></ol>
      <p><strong>谁能看到？</strong>当前仅供研究者读取；模板中的“受众”是用途标注，不授予其他角色访问权，也不会自动把报告发给被试。被试原始指标反馈在“发布与采集”中单独配置。</p>
      <p><strong>功能边界：</strong>合成预览不读取真实答卷、不生成正式个人报告；参考解释只引用已批准的参考分段，不在这里建立阈值、常模或修改计分规则。普通 Form 不绑定测量报告。</p>
    </div>}</SurveySectionHeader>
    {!basePath&&<div className="survey-report-purpose"><FileText size={18} aria-hidden="true"/><p><strong>按需设置，只供研究者使用</strong><span>不设置报告，也可以正常收集问卷和导出答卷。</span></p></div>}
    {error&&<p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3">{error}</p>}
    {notice&&<p role="status" className="border-l-4 border-teal-600 bg-teal-50 p-3">{notice}</p>}
    {listError&&<p role="alert">列表加载失败：{listError}。已成功的写入无需重做。</p>}
    {loadingLists&&<p role="status">正在加载测量版本与报告，请稍候…</p>}
    {basePath&&refreshAction}
    <fieldset id="survey-report-create" tabIndex={-1} disabled={busy||!!pendingCreate} className="survey-report-create survey-task-card space-y-3"><legend>创建报告草稿</legend>
      <label className="block">测量发布版本<select className="input block w-full" value={measurementId} onChange={e=>setMeasurementId(e.target.value)}>
        <option value="">请选择</option>{measurements.map((m,index)=><option key={m.id} value={m.id}>{basePath?m.key+' · '+m.version+' · '+m.family+' · '+m.status:measurementName(m,index)+' · '+m.version+' · '+measurementStatus(m.status)}</option>)}</select></label>
      {measurementsLoaded&&!loadingLists&&!error&&!measurements.length&&<p>暂无本项目获准的测量发布版本。{nativePublishing?'可在下方显式发布自编测量或获准的只读量表；目录原版内容不会改写。':'请先在测量编制入口完成发布并核对内容授权。'}</p>}
      <label>报告系列标识<input className="input block" maxLength={168} placeholder={basePath?undefined:"例如：学习体验报告"} value={reportKey} onChange={e=>setReportKey(e.target.value)}/></label>
      <label>报告版本<input className="input block" maxLength={240} value={version} onChange={e=>setVersion(e.target.value)}/></label>
      <button type="button" className="btn-primary" disabled={!measurementId||!reportKey.trim()||!version.trim()} onClick={startCreate}>创建报告草稿</button>
    </fieldset>
    {nativePublishing&&<button type="button" className="btn-secondary survey-report-native-toggle" disabled={busy} onClick={()=>{if(showNative)setShowNative(false);else void run(async()=>{await loadNative(1);setShowNative(true)})}}>{showNative?'收起测量发布':'发布或更新测量版本'}</button>}
    {nativePublishing&&showNative&&<fieldset disabled={busy||!measurementWritable||!!pendingCreate} className="survey-report-native-panel border rounded p-3 space-y-2"><legend>发布本项目测量版本</legend>
      {!measurementWritable&&<p>项目采集已关闭或归档，不能发布新的测量；仍可修订历史报告。</p>}
      <p>仅发布测量版本，不创建波次或启动真实采集。授权只读量表保持原版内容，发布前仍须核验来源版本及当前许可；其他目录工具和 Form 不在此发布。</p>
      <label>可发布测量<select className="input block w-full" value={nativeId} onChange={e=>setNativeId(e.target.value)}><option value="">请选择</option>{nativeInstruments.map(row=><option key={row.id} value={row.id}>{row.title} · {row.kind} · 修订 {row.revision}{row.catalogGrantId?' · 授权只读原版':''}</option>)}</select></label>
      <button type="button" className="btn-primary" disabled={!nativeId} onClick={publishMeasurement}>发布所选测量版本</button>
      <div className="flex gap-2"><button type="button" className="btn-secondary" disabled={nativePage<=1} onClick={()=>void run(()=>loadNative(nativePage-1))}>上一页测量草稿</button><span>草稿第 {nativePage} 页</span><button type="button" className="btn-secondary" disabled={nativeCount<25} onClick={()=>void run(()=>loadNative(nativePage+1))}>下一页测量草稿</button></div>
      {!nativeInstruments.length&&<p>此页暂无可发布测量，请先编制研究工具或导入获准的只读量表。</p>}
    </fieldset>}
    {pendingCreate&&<div role="status"><p>本次创建尚未确认。重试会沿用同一请求与内容。</p>
      <button type="button" className="btn-secondary" disabled={busy} onClick={startCreate}>重试本次创建</button>
      <button type="button" className="btn-secondary" disabled={busy} onClick={()=>{if(window.confirm('创建可能已经成功，请先刷新列表核对。仍要放弃本次请求？'))setPendingCreate(null)}}>放弃本次创建请求</button></div>}
    <div id="survey-report-editor" tabIndex={-1} className="survey-report-layout grid md:grid-cols-[220px_minmax(0,1fr)] gap-5">
      <nav id="survey-report-list" tabIndex={-1} aria-label="报告草稿与版本" className="survey-tool-rail space-y-2"><h3 className="survey-rail-title">报告草稿与版本</h3>{list.map(row=><button type="button" key={row.id} className="btn-secondary block w-full text-left" aria-pressed={selected?.id===row.id} disabled={busy||!!pendingCreate} onClick={()=>choose(row.id)}>{row.reportKey} · {row.version} · {row.state==='PUBLISHED'?'已发布':'草稿'}</button>)}
        {listLoading&&<p role="status">正在加载报告列表…</p>}
        {listLoaded&&!listLoading&&!listError&&!list.length&&<p>暂无报告草稿</p>}
        <div className="survey-rail-pagination"><button type="button" className="btn-secondary" disabled={busy||page<=1} onClick={()=>void run(()=>loadList(page-1))}>上一页</button>
          <span>第 {page} 页</span><button type="button" className="btn-secondary" disabled={busy||list.length<25} onClick={()=>void run(()=>loadList(page+1))}>下一页</button></div>
      </nav>
      {!selected&&<div className="survey-task-empty">{!basePath&&<span className="survey-report-empty-icon"><FileText size={27} strokeWidth={1.4} aria-hidden="true"/></span>}<h3>{!basePath&&listLoaded&&!list.length?'从第一份报告开始':'选择一个报告版本，继续编制'}</h3><p>从版本列表打开已有报告，或在上方创建一份新草稿。</p>{!basePath&&<a className="survey-report-empty-link" href="#survey-report-create">前往创建报告<ArrowDownRight size={16} aria-hidden="true"/></a>}<p>已发布内容保持只读，修订需明确复制为新版本。</p></div>}
      {selected&&<div className="survey-report-editor space-y-4 min-w-0">{basePath?<h3 className="font-semibold">{selected.report_key} · {selected.version} · 修订 {selected.revision}</h3>:<header className="survey-report-editor-heading"><h3>{selected.report_key} · {selected.version} · 修订 {selected.revision}</h3><span className="survey-workflow-status">{dirty?'未保存':selected.state==='PUBLISHED'?'已发布 · 只读':'草稿'}</span></header>}
        <p style={{overflowWrap:'anywhere'}}>测量：{basePath?measurement?.key||selected.payload.measurementReleaseId:measurement?measurementName(measurement,measurements.indexOf(measurement)):'已绑定的测量版本'} {measurement?.version||''}</p>
        {!basePath&&<details className="survey-report-identifiers"><summary>测量版本标识</summary><code>{selected.payload.measurementReleaseId}</code>{measurement&&<p>{measurement.key}</p>}</details>}
        {selected.state==='PUBLISHED'&&<p>已发布版本只读。修改内容请明确复制为新版本。</p>}
        <div className="survey-report-composer"><fieldset disabled={busy||readOnly||!!pendingCreate} className="survey-report-content space-y-3 min-w-0"><legend>报告内容</legend>
          <label className="block">报告标题<input className="input block w-full" value={selected.payload.template.title||''} onChange={e=>change({...selected.payload,template:{...selected.payload.template,title:e.target.value||undefined}})}/></label>
          <label className="block">受众<select className="input block" value={selected.payload.audience} onChange={e=>change({...selected.payload,audience:e.target.value as Payload['audience']})}>
            {audiences.map(audience=><option key={audience} value={audience}>{{researcher:'研究者',student:'学生',parent:'家长',teacher:'教师'}[audience]}</option>)}</select></label>
          <label className="block">语言<input className="input block" maxLength={240} value={selected.payload.language} onChange={e=>change({...selected.payload,language:e.target.value})}/></label>
          <ReportTemplateFields template={selected.payload.template} metricKeys={selected.payload.metricKeys} onChange={template=>change({...selected.payload,template})} plain={!!basePath} expandedBlock={expandedBlock} onExpandedBlockChange={setExpandedBlock}/>
          <div className="survey-workflow-save">{!basePath&&<span>{dirty?'内容有修改，请先保存':'当前内容已保存'}</span>}<button type="button" className="btn-primary" disabled={!dirty} onClick={save}>保存报告草稿</button></div>
        </fieldset>
        <aside className="survey-report-release" aria-label="报告预览与发布">
        <fieldset disabled={busy||dirty||!!pendingCreate} className="survey-workflow-group border rounded p-3 space-y-2"><legend>合成预览</legend>
          <p>使用合成数据，不读取真实答卷，不生成正式报告。</p>
          <label>预览情境<select className="input block" value={scenario} onChange={e=>{setScenario(e.target.value as Scenario);setPreview(null)}}><option value="INTERPRETABLE">可解释的合成情境</option><option value="NO_REFERENCE">无参考</option><option value="INVALID">质量无效</option></select></label>
          <button type="button" className="btn-secondary" onClick={simulate}>预览合成报告</button>
        </fieldset>
        {dirty&&<p role="status">请先保存修改，再预览或发布。</p>}
        {preview&&<section className="survey-report-preview border rounded p-3 space-y-2" aria-label="合成报告预览"><h4>{preview.report.title}</h4><p>合成样例 · 修订 {preview.revision}</p>{preview.report.blocks.map((block,index)=><PreviewBlock key={index} value={block}/>)}{preview.report.limitations.map((line,index)=><p key={index}>{line}</p>)}<p>{preview.report.disclaimer}</p></section>}
        {selected.state==='DRAFT'?<fieldset disabled={busy||dirty||!!pendingCreate} className="space-y-2"><legend>发布此版本</legend>
          <label>发布说明<textarea className="input block w-full" minLength={3} maxLength={4000} value={publicationNote} onChange={e=>setPublicationNote(e.target.value)}/></label>
          <p>发布后本版本不可编辑；不会覆盖原始分数或已有报告。</p><button type="button" className="btn-primary" disabled={publicationNote.trim().length<3} onClick={publish}>发布报告版本</button>
        </fieldset>:<fieldset disabled={busy||!!pendingCreate} className="space-y-2"><legend>复制为新版本</legend>
          <label>新报告版本号<input className="input block" maxLength={240} value={copyVersion} onChange={e=>setCopyVersion(e.target.value)}/></label>
          <button type="button" className="btn-primary" disabled={!copyVersion.trim()||copyVersion.trim()===selected.version} onClick={copy}>复制已发布报告为新草稿</button>
        </fieldset>}
        </aside></div>
      </div>}
    </div>
  </section>
}
