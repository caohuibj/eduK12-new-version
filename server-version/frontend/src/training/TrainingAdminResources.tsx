import CatalogDiscoveryFilters from '../components/scale-governance/CatalogDiscoveryFilters'
import {catalogQuery,EMPTY_CATALOG_FILTERS,EMPTY_CATALOG_FACETS,type CatalogFilters} from '../api/catalogDiscovery'
import CatalogClassificationTags from '../components/scale-governance/CatalogClassificationTags'
import {lazy,Suspense,useEffect,useRef,useState,type ReactNode} from 'react'
import {Layers,SlidersHorizontal,ChevronDown,RefreshCw} from 'lucide-react'
import {trainingResourceCatalog,type CatalogType,type Resource} from './trainingResourceCatalog'
import {cognitiveApi} from '../modules/cognitive/api'
import MaterialGrantModal from '../components/MaterialGrantModal'
import {useStaffFeedback} from '../components/staff-ui/useStaffFeedback'
import TrainingResourceActions from './TrainingResourceActions'
const MaterialGrants=lazy(()=>import('../pages/admin/MaterialGrants'))
const TrainingStandardConfigurationGrants=lazy(()=>import('./TrainingStandardConfigurationGrants'))
const TrainingCognitiveProfileGrants=lazy(()=>import('./TrainingCognitiveProfileGrants'))
const labels={SCALE:'量表',COGNITIVE_CONFIG:'认知配置',ASSESSMENT_BUNDLE:'固定测评包'}
const statusName=(status:string)=>({PUBLISHED:'已发布',DRAFT:'草稿',DEPRECATED:'已停用',ARCHIVED:'已归档'}[status]||status)
const errorMessage=(cause:unknown)=>cause&&typeof cause==='object'&&'message'in cause?String(cause.message):'读取失败，请重试'
function ResourceCatalog({pageTitle,navigation}:{pageTitle:string;navigation:ReactNode}){
 const [type,setType]=useState<CatalogType>('SCALE'),[rows,setRows]=useState<Resource[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [filters,setFilters]=useState({...EMPTY_CATALOG_FILTERS}),[applied,setApplied]=useState({...EMPTY_CATALOG_FILTERS}),[facets,setFacets]=useState(EMPTY_CATALOG_FACETS)
 const [status,setStatus]=useState('all'),[appliedStatus,setAppliedStatus]=useState('all'),[page,setPage]=useState(1),[total,setTotal]=useState<number|undefined>(),[hasMore,setMore]=useState(false),[target,setTarget]=useState<Resource|null>(null),[busy,setBusy]=useState(false)
 const {feedback,confirm,success,error:notifyError}=useStaffFeedback({dialogClassName:'training-accounts-dialog training-supervision-dialog'})
 const pending=useRef(false)
 const [filtersOpen,setFiltersOpen]=useState(false)
 const filterAnchor=useRef<HTMLDivElement>(null),filterButton=useRef<HTMLButtonElement>(null)
 useEffect(()=>{
  if(!filtersOpen)return
  filterAnchor.current?.querySelector<HTMLInputElement>('input')?.focus()
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!filterAnchor.current?.contains(event.target))setFiltersOpen(false)}
  document.addEventListener('pointerdown',outside)
  return()=>document.removeEventListener('pointerdown',outside)
 },[filtersOpen])
 const reset=()=>{setFilters({...EMPTY_CATALOG_FILTERS});setApplied({...EMPTY_CATALOG_FILTERS});setStatus('all');setAppliedStatus('all');setPage(1);setTarget(null)}
 const apply=(value:CatalogFilters)=>{setApplied({...value,keyword:value.keyword.trim()});setAppliedStatus(status);setPage(1);setTarget(null);setFiltersOpen(false);filterButton.current?.focus()}
 useEffect(()=>{
  let active=true;setRows([]);setLoading(true);setError('');setTotal(undefined);setMore(false)
  void trainingResourceCatalog(type,()=>active,{page,filters:applied,status:appliedStatus}).then(result=>{if(active){setRows(result.list);setTotal(result.total);setMore(result.hasMore);setFacets(result.tagFacets)}}).catch(cause=>{if(active)setError(errorMessage(cause))}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[type,revision,page,applied,appliedStatus])
 const filtered=catalogQuery(1,applied)!=='page=1'||appliedStatus!=='all'
 const count=total===undefined?'本页 '+rows.length+' 项资源':'共 '+total+' 项资源'
 const pageLabel='第 '+page+(total===undefined?'':' / '+Math.max(1,Math.ceil(total/20)))+' 页'
 async function changePolicy(resource:Resource){
  if(pending.current)return;pending.current=true;setBusy(true)
  const next=resource.policy==='OPEN'?'GRANT':'OPEN'
  try{
   if(!await confirm({title:next==='GRANT'?'改为按授权使用？':'改为开放使用？',body:<><strong>{resource.name}</strong><p>{next==='GRANT'?'后续新建使用将检查培训师授权，现有授权记录保留。':'开放后，符合现有资格的培训师无需单独材料授权即可使用。已有授权记录保留。'}</p></>,confirmLabel:'确认更改'}))return
   const response=await cognitiveApi.updateConfigAccessPolicy(resource.id,next)
   if(response.code!==0)throw Error(response.message||'策略更新失败')
   success('访问策略已更新');setRevision(value=>value+1)
  }catch(cause){notifyError('访问策略未更新',errorMessage(cause))}finally{pending.current=false;setBusy(false)}
 }
 const tools=<div className="training-account-list-tools">
  <div className="training-account-filter-anchor training-resource-filter-anchor" ref={filterAnchor}
   onKeyDown={event=>{if(event.key==='Escape'&&filtersOpen){event.preventDefault();setFiltersOpen(false);filterButton.current?.focus()}}}
   onBlur={event=>{if(event.relatedTarget instanceof Node&&!event.currentTarget.contains(event.relatedTarget))setFiltersOpen(false)}}>
   <button ref={filterButton} type="button" className="training-accounts-secondary training-supervision-filter-toggle" disabled={busy} aria-expanded={filtersOpen} aria-controls="training-resource-filters" onClick={()=>setFiltersOpen(value=>!value)}><SlidersHorizontal size={16} aria-hidden="true"/>{filtersOpen?'收起检索':'资源检索'}<ChevronDown size={15} aria-hidden="true"/></button>
   {filtersOpen&&<section className="training-account-filter-popover training-resource-filter-popover" id="training-resource-filters" aria-label="资源检索">
    <label>发布状态<select value={status} disabled={busy||loading} onChange={event=>setStatus(event.target.value)}><option value="all">全部状态</option><option value="PUBLISHED">已发布</option><option value="DRAFT">草稿</option><option value="DEPRECATED">已停用</option><option value="ARCHIVED">已归档</option></select></label>
    <CatalogDiscoveryFilters label="培训资源检索" filters={filters} facets={facets} onChange={setFilters} onApply={apply} onReset={reset} disabled={busy||loading}/>
   </section>}
  </div>
  <button type="button" className="training-accounts-secondary" aria-label="刷新资源" disabled={loading||busy} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={16} aria-hidden="true"/>刷新</button>
 </div>
 return <>
  <header className="training-management-page-heading training-course-page-heading training-account-page-heading"><h1>{pageTitle}</h1>{tools}</header>
  {navigation}
  <section className="training-accounts training-resources-panel" aria-label="资源目录">
  {feedback}
  <div className="training-resource-toolbar">
   <label className="training-resource-type">资源类型<select value={type} disabled={busy} onChange={event=>{setType(event.target.value as CatalogType);reset()}}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <span className="training-resource-count">{count}</span>
  </div>
  {filtered&&<div className="training-supervision-filter-summary"><span>{[applied.keyword&&'关键词：'+applied.keyword,appliedStatus!=='all'&&'状态：'+statusName(appliedStatus),new URLSearchParams(catalogQuery(1,applied)).has('tags')&&'已应用分类筛选'].filter(Boolean).join(' · ')}</span>{!filtersOpen&&<button type="button" disabled={busy||loading} onClick={reset}>清除筛选</button>}</div>}
  {loading?<p role="status" className="training-accounts-empty">正在读取资源目录…</p>:error?<div role="alert" className="training-accounts-error"><span>{error}</span><button type="button" onClick={()=>setRevision(value=>value+1)}>重新加载资源</button></div>:rows.length===0?<div className="training-accounts-empty"><Layers size={30} aria-hidden="true"/><h3>{filtered?'未找到匹配资源':'暂无此类资源'}</h3></div>:<div className="training-accounts-table-wrap training-resource-list-wrap" role="region" aria-label="资源列表" tabIndex={0}><table className="training-accounts-table training-resource-table"><thead><tr><th>资源名称</th><th>标识与版本</th><th>发布状态</th><th>使用规则</th><th className="training-accounts-actions-cell">授权管理</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td data-label="资源名称"><strong>{row.name}</strong><small><span>{labels[row.type]}</span> · <span>{row.description||'暂无介绍'}</span></small><CatalogClassificationTags tags={row.classificationTags}/></td><td data-label="标识与版本"><strong>{row.code}</strong><small>版本 {row.version}</small></td><td data-label="发布状态"><span className={'training-accounts-status training-accounts-status--'+(row.status==='PUBLISHED'?'active':'muted')}>{statusName(row.status)}</span></td><td data-label="使用规则">{row.note}</td><td data-label="授权管理" className="training-accounts-actions-cell"><TrainingResourceActions><button type="button" className="training-accounts-secondary" disabled={!row.grantable||busy} onClick={()=>setTarget(row)}>管理授权</button>{row.type==='COGNITIVE_CONFIG'&&row.policy&&<button type="button" className="training-accounts-secondary" disabled={busy} onClick={()=>void changePolicy(row)}>{row.policy==='OPEN'?'设为需授权':'设为开放'}</button>}</TrainingResourceActions></td></tr>)}</tbody></table></div>}
  {(page>1||hasMore)&&<div className="training-accounts-pagination"><p>{count} · {pageLabel}</p><div><button type="button" disabled={loading||busy||page<=1} onClick={()=>{setTarget(null);setPage(page-1)}}>上一页</button><button type="button" disabled={loading||busy||!hasMore} onClick={()=>{setTarget(null);setPage(page+1)}}>下一页</button></div></div>}
  {target&&<MaterialGrantModal training resourceType={target.type} resourceId={target.id} resourceName={target.name+' · '+target.version} onClose={()=>setTarget(null)} onSaved={()=>success('培训师使用授权已保存')}/>}
 </section></>
}
export default function TrainingAdminResources({pageTitle="资源与授权"}:{pageTitle?:string}={}){
 const [view,setView]=useState<'catalog'|'grants'|'standard'|'cognitive'>('catalog')
 const navigation=<div className="training-resource-views" role="group" aria-label="资源与授权视图">{([['catalog','资源目录'],['standard','固定量表配置'],['cognitive','固定认知配置'],['grants','使用授权']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</div>
 return <div className="training-resource-management">
  {view==='catalog'?<ResourceCatalog pageTitle={pageTitle} navigation={navigation}/>:<><header className="training-management-page-heading training-course-page-heading"><h1>{pageTitle}</h1></header>{navigation}<Suspense fallback={<p role="status">正在读取授权管理…</p>}>{view==='standard'?<TrainingStandardConfigurationGrants/>:view==='cognitive'?<TrainingCognitiveProfileGrants/>:<MaterialGrants training/>}</Suspense></>}
 </div>
}
