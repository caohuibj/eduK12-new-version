import ApprovedScaleAxes from '../../components/scale-governance/ApprovedScaleAxes'
import SurveyPackageGrantAdmin from './SurveyPackageGrantAdmin'
import { ChevronDown, BookOpen, KeyRound, Search, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import CatalogDiscoveryFilters from '../../components/scale-governance/CatalogDiscoveryFilters'
import CatalogClassificationTags from '../../components/scale-governance/CatalogClassificationTags'
import {catalogQuery,EMPTY_CATALOG_FILTERS,EMPTY_CATALOG_FACETS,type CatalogClassificationTag,type CatalogFilters,type CatalogTagFacets} from '../../api/catalogDiscovery'
import { SourceProvenance, type CatalogApi, type CatalogGrant, type CatalogSourceRef } from '../../survey/ResearchCatalog'
import {useSurveyStandardConfigurationGrant} from '../../survey/useSurveyStandardConfigurationGrant'
import {isSurveyStandardSource} from '../../api/surveyStandardConfigurations'
import type { Kind } from '../../survey/builder.types'
type Source={ref:CatalogSourceRef;title:string;available:boolean;unsupportedReason?:string;definitionDigest?:string;classificationTags?:CatalogClassificationTag[];
 configuration?:{toolKey?:string;instrumentVersion:string;axes:Record<'CONTENT'|'PARAMETERS'|'REPORT',string>;axisVersions?:Record<'CONTENT'|'PARAMETERS'|'REPORT',string>;report:string|null}}
type SourcePage={list:Source[];page:number;hasMore:boolean;terminalReason:'PAGE_LIMIT_REACHED'|'END_OF_CATALOG'|null;tagFacets?:CatalogTagFacets;actorId?:string}
const emptySourcePage:SourcePage={list:[],page:1,hasMore:false,terminalReason:null}
const sourceKey=(source:Source)=>JSON.stringify([source.ref.kind,source.ref.sourceId,String(source.ref.sourceVersion),source.ref.organizationId??''])
export function SurveyCatalogGrants({api,password,researchers,ensureVerification,actorId}:{api:CatalogApi;password:string;researchers:{id:string;username:string;status:string}[];ensureVerification?:(context:string)=>boolean;actorId?:string}){
  const [researcherId,setResearcherId]=useState(''),[kind,setKind]=useState<Kind>('SCALE')
  const [sourcePage,setSourcePage]=useState<SourcePage>(emptySourcePage),[grants,setGrants]=useState<CatalogGrant[]>([]),[grantPage,setGrantPage]=useState(1)
  const {list:sources,page,hasMore,terminalReason}=sourcePage
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [queried,setQueried]=useState(false)
  const [managerActorId,setManagerActorId]=useState<string|null>(null),[configurationName,setConfigurationName]=useState('')
  const exact=useSurveyStandardConfigurationGrant(actorId&&actorId===managerActorId?actorId:null,api)
  const [filters,setFilters]=useState<CatalogFilters>(EMPTY_CATALOG_FILTERS),[appliedFilters,setAppliedFilters]=useState<CatalogFilters>(EMPTY_CATALOG_FILTERS),[selected,setSelected]=useState<Record<string,Source>>({})
  const inFlight=useRef(false),sourceEpoch=useRef(0),targetRef=useRef(researcherId)
  targetRef.current=researcherId
  useEffect(()=>()=>{sourceEpoch.current++},[])
  const selectedResearcher=researchers.find(r=>r.id===researcherId)
  const canGrant=!!selectedResearcher&&['ACTIVE','PENDING_MFA'].includes(selectedResearcher.status)
  const objectName=selectedResearcher?.username||'未选择研究者'
  useEffect(()=>{if(researcherId&&!researchers.some(r=>r.id===researcherId)){setResearcherId('');setGrants([]);setSelected({})}},[researchers,researcherId])
  const run=async(task:()=>Promise<void>)=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');try{await task()}catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{inFlight.current=false;setBusy(false)}}
  const loadSources=async(next=1,nextFilters=appliedFilters)=>{
    const generation=++sourceEpoch.current
    const query=new URLSearchParams({kind,...Object.fromEntries(new URLSearchParams(catalogQuery(next,nextFilters)))})
    const data=await api<SourcePage>('/source-catalog?'+query)
    if(generation!==sourceEpoch.current)return
    setSourcePage(data);setManagerActorId(data.actorId??null);setQueried(true)
  }
  const search=(next:CatalogFilters)=>{const applied={...next,keyword:next.keyword.trim()};setAppliedFilters(applied);setSelected({});setSourcePage(emptySourcePage);setQueried(false);void run(()=>loadSources(1,applied))}
  const toggle=(source:Source)=>setSelected(old=>{
    const key=sourceKey(source),next={...old}
    if(next[key])delete next[key]
    else if(Object.keys(next).length<10)next[key]=source
    return next
  })
  const loadGrants=async(id=researcherId,next=1)=>{const data=await api<{list:CatalogGrant[]}>('/researchers/'+encodeURIComponent(id)+'/tool-grants?page='+next);if(id!==targetRef.current)return;setGrants(data.list);setGrantPage(next)}
  const canWrite=(context:string)=>ensureVerification?ensureVerification(context):Boolean(password)
  const sourceWritable=(source:Source)=>!isSurveyStandardSource(source.ref)||exact.canIssue&&Boolean(configurationName.trim())
  const grant=async(source:Source)=>{
    const target=researcherId
    if(!canGrant||!target||!source.available)return
    try{
      if(isSurveyStandardSource(source.ref)){const result=await exact.issue(target,source.ref,source.title,configurationName,password);if(!result)return}
      else await api('/researchers/'+encodeURIComponent(target)+'/tool-grants','POST',{currentPassword:password,source:source.ref})
    }
    catch(e){throw new Error((e instanceof Error?e.message:'授权请求失败')+'；未取得成功确认，请先刷新现有授权核对结果，再决定是否重试。')}
    if(target!==targetRef.current)return
    setSelected(old=>{const next={...old};delete next[sourceKey(source)];return next})
    setNotice('已向 '+objectName+' 授权 '+source.title+' · 版本 '+source.ref.sourceVersion+'；研究者可在自己的项目中导入。')
    try{await loadGrants()}catch{setError('版本授权已完成，但授权列表刷新失败。请仅重选该研究者刷新列表，不要重复授权。')}
  }
  return <><section className="survey-admin-panel survey-admin-grants" aria-label="研究工具版本授权">
    <div className="survey-admin-panel-heading"><span className="survey-admin-avatar"><KeyRound size={22} aria-hidden="true"/></span><div><h2>研究工具版本授权</h2><p>选择研究者，按精确版本分配使用权限。</p></div></div>
    <details className="survey-admin-grant-boundary"><summary>查看授权边界</summary><p>从原来源目录选择明确版本。原来源的学校、组织、版权与发布边界保持不变，不授予研究原始答案访问权。</p></details>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {exact.error&&<p role="alert">{exact.error}</p>}
    {exact.pending&&<section aria-label="固定量表原请求核对"><p>{exact.pending.title} · {exact.pending.configurationName}；请求编号：<code>{exact.pending.requestId}</code>。核对期间保留原接收者和固定配置。</p>
      <button disabled={busy||exact.busy} onClick={()=>void run(async()=>{const original=exact.pending,result=await exact.recover();if(result){setNotice(result.status==='REVOKED'?'原配置已确认保存，目前已撤销。':'原固定配置已确认保存。');if(original?.recipientId===targetRef.current)await loadGrants(original.recipientId)}})}>核对原固定配置请求</button>
      {exact.absent&&<><p role="status">暂未发现原请求，只能按原编号、原接收者和原配置重试。</p><button disabled={busy||exact.busy||(!ensureVerification&&!password)} onClick={()=>{if(canWrite('按原编号重试固定配置授权'))void run(async()=>{const original=exact.pending,result=await exact.retry(password);if(result){setNotice(result.status==='REVOKED'?'原请求已保存，目前已撤销。':'原固定配置已确认保存。');if(original?.recipientId===targetRef.current)await loadGrants(original.recipientId)}})}}>按原固定配置请求重试</button></>}
    </section>}
    {busy&&<p role="status">正在读取或更新工具授权，请稍候…</p>}
    <fieldset disabled={busy} className="survey-admin-grant-form">
      <div className="survey-admin-grant-controls"><div className="survey-admin-grant-field"><label className="block">授权给研究者<select className="input block w-full" value={researcherId} onChange={e=>{const id=e.target.value;setResearcherId(id);setSelected({});setGrants([]);setGrantPage(1);setError('');setNotice('');if(id)void run(()=>loadGrants(id))}}>
        <option value="">从当前研究者列表选择</option>{researchers.filter(r=>r.status!=='REVOKED').map(r=><option value={r.id} key={r.id}>{r.username} · {r.status}</option>)}</select></label>
      <p className="survey-admin-field-hint">下拉列表对应本页研究者；可用下方研究者分页切换。</p></div>
      <div className="survey-admin-grant-field"><label className="block">来源类型<select className="input block" value={kind} onChange={e=>{sourceEpoch.current++;setKind(e.target.value as Kind);setFilters({...EMPTY_CATALOG_FILTERS});setAppliedFilters({...EMPTY_CATALOG_FILTERS});setSelected({});setSourcePage(emptySourcePage);setQueried(false);setError('');setNotice('')}}>
        <option value="SCALE">Scale · 量表</option><option value="SJT">SJT · 情境判断</option><option value="COGNITIVE">Cognitive · 认知任务</option><option value="FORM">Form · 已批准的表单</option></select></label><p className="survey-admin-field-hint">按来源查询，保留工具的具体版本。</p></div></div>
      <p className="survey-admin-grant-target"><UserRound size={16} aria-hidden="true"/><span>当前授权对象：<strong>{objectName}</strong></span></p>
      {selectedResearcher&&!canGrant&&<p className="text-sm">该研究者当前资格不可接收新授权；可查看或撤销已有授权，后台权限规则保持不变。</p>}

      {kind==='FORM'&&<p className="text-sm">可授权的表单须已完成系统审批、自动保存验证和 Survey 范围准入；不会扫描其他研究者未提交的私有草稿。</p>}
      {kind==='SCALE'&&<label className="block">标准量表授权配置名称<input aria-label="标准量表授权配置名称" className="input block" maxLength={120} value={configurationName} disabled={Boolean(exact.pending)} onChange={event=>setConfigurationName(event.target.value)}/><span className="survey-admin-field-hint">标准量表以管理员选定的报告组合固定。请用用途或报告样式命名；研究者直接使用，不能再选择 R。专业搭配由管理员核对。</span></label>}
      <CatalogDiscoveryFilters label="可授权版本检索" filters={filters} facets={sourcePage.tagFacets??EMPTY_CATALOG_FACETS} onChange={setFilters} onApply={search} disabled={busy}/>
      <button type="button" className="btn-secondary" disabled={busy} onClick={()=>search(filters)}><Search size={16} aria-hidden="true"/>查询可授权版本</button>
      {!queried&&!busy&&!error&&<div className="survey-admin-empty-state survey-admin-source-empty"><span className="survey-admin-empty-icon"><BookOpen size={28} aria-hidden="true"/></span><p>选择来源类型后查询版本；不会自动加载全部目录。</p><span>核对来源与版本后，再为所选研究者授权。</span></div>}
      {kind==='SCALE'&&<ApprovedScaleAxes choices={sources.flatMap(source=>source.available&&isSurveyStandardSource(source.ref)&&source.configuration?.toolKey?[{id:sourceKey(source),toolKey:source.configuration.toolKey,title:source.title,versions:source.configuration.axisVersions??source.configuration.axes}]:[])} disabled={busy||!!exact.pending||Object.keys(selected).length>=10} scopeLabel="当前来源目录页，可用现有分页与检索查看其他版本" onSelect={id=>{const source=sources.find(value=>sourceKey(value)===id&&value.available);if(source)setSelected(old=>({...old,[id]:source}))}}/>}
      <section aria-label="已选精确版本" className="survey-admin-selection">
        <h3>已选 {Object.keys(selected).length} 个精确版本（最多10个）</h3>
        <p>只勾选明确版本；翻页保留选择，重新检索、切换来源或授权对象时清空。每个版本单独授权。</p>
        {Object.values(selected).map(source=><div key={sourceKey(source)}><p>{source.title} · 版本 {source.ref.sourceVersion} → {objectName}</p><button type="button" className="btn-secondary" onClick={()=>toggle(source)}>移除选择：{source.title}</button><button type="button" className="btn-primary" aria-label={'授权已选版本：'+source.title+' · '+source.ref.sourceVersion+' → '+objectName} disabled={busy||(!ensureVerification&&!password)||!canGrant||!sourceWritable(source)} onClick={()=>{if(canWrite('授权 '+source.title+' · 版本 '+source.ref.sourceVersion+' 给 '+objectName))void run(()=>grant(source))}}>授权此精确版本</button></div>)}
      </section>
      <div className="survey-admin-tool-grid">{sources.map((source,index)=><article key={JSON.stringify(source.ref)+index} className="survey-admin-card survey-admin-tool-card">
        <label><input type="checkbox" checked={Boolean(selected[sourceKey(source)])} disabled={busy||!source.available||(!selected[sourceKey(source)]&&Object.keys(selected).length>=10)} onChange={()=>toggle(source)}/>{'选择精确版本：'+source.title+' · '+source.ref.sourceVersion}</label>
        <details className="survey-admin-tool-disclosure"><summary aria-label={'版本详情与授权：'+source.title}>
          <span className="survey-admin-avatar"><BookOpen size={21} aria-hidden="true"/></span>
          <span className="survey-admin-card-name"><h3>{source.title}</h3><span>{source.ref.kind} · 版本 {source.ref.sourceVersion}</span></span>
          <span className="survey-admin-badge">{source.available?'可用版本':'暂不可用'}</span><ChevronDown className="survey-admin-disclosure-chevron" size={18} aria-hidden="true"/>
        </summary><CatalogClassificationTags tags={source.classificationTags}/><div className="survey-admin-tool-body"><p className="survey-admin-object">授权给 <strong>{objectName}</strong> · 版本 {source.ref.sourceVersion}</p>
        {source.configuration&&<p>题本 {source.configuration.instrumentVersion} · 报告 {source.configuration.report??'不配置反馈'}；C/P/R 组合已批准，内容摘要见详情。</p>}<details><summary>查看来源编号与内容摘要</summary><p className="break-all">来源编号：{source.ref.sourceId}</p>{source.definitionDigest&&<p className="break-all">内容摘要：{source.definitionDigest}</p>}</details>
        {!source.available&&<p className="text-sm">不可授权：{source.unsupportedReason||'当前来源未提供可安全冻结的版本'}</p>}
        <button type="button" className="btn-primary" aria-label={'授权此版本：'+source.title+' · '+source.ref.sourceVersion+' → '+objectName} disabled={busy||(!ensureVerification&&!password)||!canGrant||!source.available||!sourceWritable(source)} onClick={()=>{if(canWrite('授权 '+source.title+' · 版本 '+source.ref.sourceVersion+' 给 '+objectName))void run(()=>grant(source))}}>授权此版本</button>
        </div></details>
      </article>)}</div>
      <div className="survey-admin-pagination"><button type="button" className="btn-secondary" disabled={busy||page<=1} onClick={()=>void run(()=>loadSources(page-1))}>来源上一页</button><span>来源第 {page} 页</span><button type="button" className="btn-secondary" disabled={busy||!hasMore} onClick={()=>void run(()=>loadSources(page+1))}>来源下一页</button></div>
      {terminalReason==='PAGE_LIMIT_REACHED'&&<p role="status" className="text-sm">已到达来源目录浏览上限：每类最多显示前 1000 个版本，仍有更多版本未显示。</p>}
      {terminalReason==='END_OF_CATALOG'&&<p role="status" className="text-sm">{sources.length?'已到达来源目录末页。':'当前页没有可授权版本。'}</p>}
      {researcherId&&<div className="survey-admin-existing-grants"><button type="button" className="btn-secondary" onClick={()=>void run(()=>loadGrants())}>刷新现有授权（只读）</button><div className="survey-admin-section-heading"><h3>{objectName} 的工具授权</h3><span className="survey-admin-muted">当前页 {grants.length} 项</span></div>{!busy&&!error&&!grants.length&&<p className="survey-admin-grant-empty">当前页暂无版本授权。</p>}<div className="survey-admin-tool-grid">{grants.map(item=><article key={item.id} className="survey-admin-card survey-admin-tool-card">
        <details className="survey-admin-tool-disclosure"><summary aria-label={'查看与管理授权：'+item.title}>
          <span className="survey-admin-avatar"><ShieldCheck size={21} aria-hidden="true"/></span><span className="survey-admin-card-name"><h4>{item.title}</h4><span>{item.kind} · 版本 {item.sourceRef.sourceVersion}</span></span><span className="survey-admin-badge" data-status={item.status}>{item.status==='ACTIVE'?'已授权':item.status==='REVOKED'?'已撤销':'状态待核对'}</span><ChevronDown className="survey-admin-disclosure-chevron" size={18} aria-hidden="true"/>
        </summary><div className="survey-admin-tool-body"><p className="survey-admin-object">研究者：<strong>{objectName}</strong> · 版本 {item.sourceRef.sourceVersion}</p>
        {item.selectedBinding&&<p>固定使用配置：{item.configurationName}</p>}<details><summary>来源与冻结摘要</summary><SourceProvenance source={item.sourceRef} provenance={item.sourceProvenance}/></details>
        {item.status==='ACTIVE'&&<button type="button" className="btn-secondary" disabled={busy||(!ensureVerification&&!password)} onClick={()=>{
          if(!canWrite('撤销 '+objectName+' 的工具版本授权'))return
          if(window.confirm('撤销 '+objectName+' 的 '+item.title+' · 版本 '+item.sourceRef.sourceVersion+' 授权？将阻止新的导入及后续冻结发布；既有已发布和进行中的研究不受影响。'))void run(async()=>{
            await api('/tool-grants/'+encodeURIComponent(item.id)+'/revoke','POST',{currentPassword:password})
            setNotice(objectName+' 的 '+item.title+' · 版本 '+item.sourceRef.sourceVersion+' 授权已撤销。既有已发布研究不变。')
            try{await loadGrants()}catch{setError('撤销已完成，但列表刷新失败；请仅重选研究者刷新列表，不要重复撤销。')}})
          else{setError('');setNotice('已取消撤销 '+objectName+' 的 '+item.title+' · 版本 '+item.sourceRef.sourceVersion+' 授权，未提交变更。')}
        }} aria-label={'撤销版本授权：'+objectName+' · '+item.title+' · '+item.sourceRef.sourceVersion}>撤销版本授权</button>}
        </div></details>
      </article>)}</div><div className="survey-admin-pagination"><button type="button" className="btn-secondary" disabled={busy||grantPage<=1} onClick={()=>void run(()=>loadGrants(researcherId,grantPage-1))}>授权上一页</button><span>授权第 {grantPage} 页</span><button type="button" className="btn-secondary" disabled={busy||grants.length<25} onClick={()=>void run(()=>loadGrants(researcherId,grantPage+1))}>授权下一页</button></div></div>}
    </fieldset>
  </section><SurveyPackageGrantAdmin password={password} researchers={researchers} ensureVerification={ensureVerification}/></>
}
