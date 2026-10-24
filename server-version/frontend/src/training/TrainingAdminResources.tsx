import {lazy,Suspense,useEffect,useRef,useState,type ReactNode} from 'react'
import {Search,Layers,SlidersHorizontal,ChevronDown,RefreshCw} from 'lucide-react'
import {trainingResourceCatalog,type CatalogType,type Resource} from './trainingResourceCatalog'
import {cognitiveApi} from '../modules/cognitive/api'
import MaterialGrantModal from '../components/MaterialGrantModal'
import {useStaffFeedback} from '../components/staff-ui/useStaffFeedback'
import TrainingResourceActions from './TrainingResourceActions'
const MaterialGrants=lazy(()=>import('../pages/admin/MaterialGrants'))
const InstrumentAuthorization=lazy(()=>import('../pages/admin/InstrumentAuthorization'))
const labels={SCALE:'量表',COGNITIVE_CONFIG:'认知配置',ASSESSMENT_BUNDLE:'固定测评包'}
const statusName=(status:string)=>({PUBLISHED:'已发布',DRAFT:'草稿',DEPRECATED:'已停用',ARCHIVED:'已归档'}[status]||status)
const errorMessage=(cause:unknown)=>cause&&typeof cause==='object'&&'message'in cause?String(cause.message):'读取失败，请重试'
function ResourceCatalog({pageTitle,navigation}:{pageTitle:string;navigation:ReactNode}){
 const [type,setType]=useState<CatalogType>('SCALE'),[rows,setRows]=useState<Resource[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [keyword,setKeyword]=useState(''),[status,setStatus]=useState('all'),[query,setQuery]=useState({keyword:'',status:'all'}),[page,setPage]=useState(1),[target,setTarget]=useState<Resource|null>(null),[busy,setBusy]=useState(false)
 const {feedback,confirm,success,error:notifyError}=useStaffFeedback({dialogClassName:'training-accounts-dialog training-supervision-dialog'})
 const pending=useRef(false)
 const [filtersOpen,setFiltersOpen]=useState(false)
 const filterAnchor=useRef<HTMLDivElement>(null),filterButton=useRef<HTMLButtonElement>(null),filterInput=useRef<HTMLInputElement>(null)
 useEffect(()=>{
  if(!filtersOpen)return
  filterInput.current?.focus()
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!filterAnchor.current?.contains(event.target))setFiltersOpen(false)}
  document.addEventListener('pointerdown',outside)
  return()=>document.removeEventListener('pointerdown',outside)
 },[filtersOpen])
 const reset=()=>{setKeyword('');setStatus('all');setQuery({keyword:'',status:'all'});setPage(1)}
 useEffect(()=>{
  let active=true;setRows([]);setLoading(true);setError('');setPage(1)
  void trainingResourceCatalog(type,()=>active).then(list=>{if(active)setRows(list)}).catch(cause=>{if(active)setError(errorMessage(cause))}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[type,revision])
 const filtered=rows.filter(row=>(query.status==='all'||row.status===query.status)&&[row.name,row.code,row.version,row.description].some(value=>String(value||'').toLocaleLowerCase().includes(query.keyword.toLocaleLowerCase())))
 const pages=Math.max(1,Math.ceil(filtered.length/20)),currentPage=Math.min(page,pages),visible=filtered.slice((currentPage-1)*20,currentPage*20)
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
   {filtersOpen&&<section className="training-account-filter-popover training-resource-filter-popover" id="training-resource-filters" aria-label="资源检索"><form className="training-supervision-filters" onSubmit={event=>{event.preventDefault();setQuery({keyword:keyword.trim(),status});setPage(1);setFiltersOpen(false);filterButton.current?.focus()}}>
    <label className="training-supervision-search">搜索资源<span className="training-accounts-search-input"><Search size={17} aria-hidden="true"/><input ref={filterInput} type="search" value={keyword} disabled={busy} maxLength={200} onChange={event=>setKeyword(event.target.value)} placeholder="名称、标识、版本或介绍"/></span></label>
    <label>发布状态<select value={status} disabled={busy} onChange={event=>setStatus(event.target.value)}><option value="all">全部状态</option><option value="PUBLISHED">已发布</option><option value="DRAFT">草稿</option><option value="DEPRECATED">已停用</option><option value="ARCHIVED">已归档</option></select></label>
    <div className="training-supervision-filter-actions"><button type="submit" disabled={busy} className="training-accounts-primary">查询</button><button type="button" disabled={busy} className="training-accounts-secondary" onClick={reset}>重置</button></div>
   </form></section>}
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
   <span className="training-resource-count">共 {filtered.length} 项资源</span>
  </div>
  {(query.keyword||query.status!=='all')&&<div className="training-supervision-filter-summary"><span>{[query.keyword&&'关键词：'+query.keyword,query.status!=='all'&&'状态：'+statusName(query.status)].filter(Boolean).join(' · ')}</span><button type="button" disabled={busy} onClick={reset}>清除筛选</button></div>}
  {loading?<p role="status" className="training-accounts-empty">正在读取资源目录…</p>:error?<div role="alert" className="training-accounts-error"><span>{error}</span><button type="button" onClick={()=>setRevision(value=>value+1)}>重新加载资源</button></div>:visible.length===0?<div className="training-accounts-empty"><Layers size={30} aria-hidden="true"/><h3>{query.keyword||query.status!=='all'?'未找到匹配资源':'暂无此类资源'}</h3></div>:<div className="training-accounts-table-wrap training-resource-list-wrap" role="region" aria-label="资源列表" tabIndex={0}><table className="training-accounts-table training-resource-table"><thead><tr><th>资源名称</th><th>标识与版本</th><th>发布状态</th><th>使用规则</th><th className="training-accounts-actions-cell">授权管理</th></tr></thead><tbody>{visible.map(row=><tr key={row.id}><td data-label="资源名称"><strong>{row.name}</strong><small>{row.description||'暂无介绍'}</small></td><td data-label="标识与版本"><strong>{row.code}</strong><small>版本 {row.version}</small></td><td data-label="发布状态"><span className={'training-accounts-status training-accounts-status--'+(row.status==='PUBLISHED'?'active':'muted')}>{statusName(row.status)}</span></td><td data-label="使用规则">{row.note}</td><td data-label="授权管理" className="training-accounts-actions-cell"><TrainingResourceActions><button type="button" className="training-accounts-secondary" disabled={!row.grantable||busy} onClick={()=>setTarget(row)}>管理授权</button>{row.type==='COGNITIVE_CONFIG'&&row.policy&&<button type="button" className="training-accounts-secondary" disabled={busy} onClick={()=>void changePolicy(row)}>{row.policy==='OPEN'?'设为需授权':'设为开放'}</button>}</TrainingResourceActions></td></tr>)}</tbody></table></div>}
  {pages>1&&<div className="training-accounts-pagination"><p>共 {filtered.length} 项资源 · 第 {currentPage} / {pages} 页</p><div><button type="button" disabled={loading||busy||currentPage<=1} onClick={()=>setPage(currentPage-1)}>上一页</button><button type="button" disabled={loading||busy||currentPage>=pages} onClick={()=>setPage(currentPage+1)}>下一页</button></div></div>}
  {target&&<MaterialGrantModal training resourceType={target.type} resourceId={target.id} resourceName={target.name+' · '+target.version} onClose={()=>setTarget(null)} onSaved={()=>success('培训师使用授权已保存')}/>}
 </section></>
}
export default function TrainingAdminResources({pageTitle="资源与授权"}:{pageTitle?:string}={}){
 const [view,setView]=useState<'catalog'|'grants'|'rights'>('catalog')
 const navigation=<div className="training-resource-views" role="group" aria-label="资源与授权视图">{([['catalog','资源目录'],['grants','使用授权'],['rights','内容权利']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</div>
 return <div className="training-resource-management">
  {view==='catalog'?<ResourceCatalog pageTitle={pageTitle} navigation={navigation}/>:<><header className="training-management-page-heading training-course-page-heading"><h1>{pageTitle}</h1></header>{navigation}<Suspense fallback={<p role="status">正在读取授权管理…</p>}>{view==='grants'?<MaterialGrants training/>:<InstrumentAuthorization training/>}</Suspense></>}
 </div>
}
