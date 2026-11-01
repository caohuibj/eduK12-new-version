import { useCallback, useEffect, useRef, useState } from 'react'
import type { Kind } from './builder.types'
import CatalogDiscoveryFilters from '../components/scale-governance/CatalogDiscoveryFilters'
import CatalogClassificationTags from '../components/scale-governance/CatalogClassificationTags'
import {catalogQuery,EMPTY_CATALOG_FILTERS,EMPTY_CATALOG_FACETS,type CatalogClassificationTag,type CatalogTagFacets} from '../api/catalogDiscovery'
export type CatalogSourceRef={kind:Kind;sourceId:string;sourceVersion:string|number;organizationId?:string}
export type CatalogProvenance={source:CatalogSourceRef;definitionDigest:string;adapterVersion:string;license?:unknown;[key:string]:unknown}
export type CatalogGrant={id:string;title:string;kind:Kind;status:string;sourceRef:CatalogSourceRef;sourceProvenance?:CatalogProvenance;createdAt?:string;revokedAt?:string|null;
 recipientId?:string;issuerId?:string;configurationName?:string;selectedBinding?:{authorizationId:string;authorizationRevision:number;bindingHash:string;configurationHash:string};
 supersedes?:{selectedBinding:{authorizationId:string;authorizationRevision:number;bindingHash:string;configurationHash:string};reason:string}}
export type CatalogApi=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
export function SourceProvenance({source,provenance}:{source?:CatalogSourceRef;provenance?:CatalogProvenance}){
  source=source||provenance?.source
  const values=[['内容摘要',provenance?.definitionDigest],['适配版本',provenance?.adapterVersion]].filter(([,value])=>typeof value==='string')
  return <div className="rounded-lg border bg-slate-50 p-3 text-sm space-y-2" aria-label="原版工具来源">
    <p className="font-semibold">已授权原版工具 · 只读版本快照</p>
    {source&&<p className="break-all">{source.kind} · {source.sourceId} · 版本 {source.sourceVersion}{source.organizationId?' · 组织 '+source.organizationId:''}</p>}
    <dl className="break-all">{values.map(([key,value])=><div key={key}><dt className="inline">{key}：</dt><dd className="inline">{String(value)}</dd></div>)}</dl>
    <p>保留原版内容、计分与来源。不得在此改编题目或评分；复制后仍为只读授权工具。授权不代表诊断资质或额外版权许可。</p>
  </div>
}
export function ResearchCatalog({projectId,api,busy,onImport}:{projectId:string;api:CatalogApi;busy:boolean;onImport:(grant:CatalogGrant)=>Promise<void>}){
  type Result={list:(CatalogGrant&{classificationTags?:CatalogClassificationTag[]})[];hasMore?:boolean;tagFacets?:CatalogTagFacets}
  const [catalog,setCatalog]=useState<(Result&{projectId:string;api:CatalogApi})|null>(null)
  const list=catalog?.projectId===projectId&&catalog.api===api?catalog.list:[]
  const [page,setPage]=useState(1),[error,setError]=useState(''),[loading,setLoading]=useState(false)
  const [filters,setFilters]=useState({...EMPTY_CATALOG_FILTERS}),[applied,setApplied]=useState({...EMPTY_CATALOG_FILTERS})
  const readEpoch=useRef(0)
  const pending=useRef<{projectId:string;api:CatalogApi;query:string;promise:Promise<Result>}|null>(null)
  const load=useCallback(async(next=1)=>{
    const epoch=++readEpoch.current
    setLoading(true);setError('')
    let request:typeof pending.current=null
    try{
      // Join only a live read of this exact scope/page. Never cache a completed
      // grant list or reuse an earlier project's authorization response.
      request=pending.current
      const query=catalogQuery(next,applied)
      if(!request||request.projectId!==projectId||request.api!==api||request.query!==query){
        request={projectId,api,query,promise:api<Result>('/projects/'+encodeURIComponent(projectId)+'/catalog?'+query)}
        pending.current=request
      }
      const data=await request.promise
      if(epoch!==readEpoch.current)return
      setCatalog({...data,projectId,api});setPage(next)
    }catch(e){if(epoch===readEpoch.current)setError(e instanceof Error?e.message:'授权目录无法加载')}
    finally{
      if(request&&pending.current===request)pending.current=null
      if(epoch===readEpoch.current)setLoading(false)
    }
  },[projectId,api,applied])
  useEffect(()=>{
    const epoch=readEpoch
    setCatalog(null);setPage(1);void load()
    return()=>{epoch.current++}
  },[load])
  return <section id="survey-authorized-catalog" tabIndex={-1} className="survey-catalog border rounded-xl p-4 space-y-3" aria-label="授权原版工具目录">
    <h3 className="font-semibold">导入已授权的原版工具</h3>
    <p className="text-sm text-slate-600">仅列出Survey 管理员授予您的明确版本；导入后不能编辑原版内容或计分。撤销授权后不能再次导入或冻结发布，既有已发布研究不受影响。</p>
    {error&&<p role="alert">{error}</p>}
    {!loading&&!error&&!list.length&&<p className="text-sm">{catalogQuery(1,applied)!=='page=1'?'没有匹配的已授权工具，可调整条件或清除筛选。':'暂无可导入的授权工具。请联系 Survey 管理员确认具体工具与版本。'}</p>}
    {loading&&<p role="status">正在加载授权目录…</p>}
    <CatalogDiscoveryFilters label="已授权原版工具检索" filters={filters} facets={catalog?.tagFacets??EMPTY_CATALOG_FACETS} onChange={setFilters} disabled={busy||loading} onApply={value=>{readEpoch.current++;setCatalog(null);setPage(1);setApplied({...value,keyword:value.keyword.trim()})}}/>
    {!loading&&!error&&list.length>0&&<p role="status" className="text-sm">本页 {list.length} 项；筛选适用于全部已授权工具。</p>}
    <div className="survey-catalog-grid">{list.map(grant=><article key={grant.id} className="border rounded-lg p-3 space-y-2">
      <h4 className="font-medium">{grant.title}</h4><p className="text-sm">{grant.kind} · 版本 {grant.sourceRef.sourceVersion}{grant.selectedBinding?' · '+grant.configurationName:''}</p><CatalogClassificationTags tags={grant.classificationTags}/><details><summary>查看来源与使用限制：{grant.title}</summary><SourceProvenance source={grant.sourceRef} provenance={grant.sourceProvenance}/></details>
      <button type="button" className="btn-secondary" disabled={busy||loading} onClick={()=>void onImport(grant)}>{grant.selectedBinding?'使用此配置：'+grant.configurationName:'导入此版本：'+grant.title}</button>
    </article>)}</div>
    <div className="flex gap-3 items-center text-sm"><button type="button" className="btn-secondary" disabled={busy||loading||page<=1} onClick={()=>void load(page-1)}>目录上一页</button>
      <span>目录第 {page} 页</span><button type="button" className="btn-secondary" disabled={busy||loading||!(catalog?.hasMore??list.length>=25)} onClick={()=>void load(page+1)}>目录下一页</button>
      <button type="button" className="btn-secondary" disabled={busy||loading} onClick={()=>void load(page)}>刷新授权目录</button></div>
  </section>
}
