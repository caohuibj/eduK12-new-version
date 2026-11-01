import {deferredResearcherComponent} from './deferred-researcher-component'
import {useCallback,useEffect,useRef,useState} from 'react'
import {Plus,Search,Wrench,ArrowRight,FileText,SlidersHorizontal,Layers,Pencil,X,CalendarDays,ShieldCheck} from 'lucide-react'
import {toolLibraryApi as api,libraryKindLabel,type LibraryTool,type ToolRef} from './tool-library-api'
import type {CatalogGrant} from './ResearchCatalog'
import {SourceProvenance} from './ResearchCatalog'
import type {BuilderLeaveRisk} from './SurveyBuilder'
import './survey-tool-library.css'
import './survey-tool-library-polish.css'
import CatalogDiscoveryFilters from '../components/scale-governance/CatalogDiscoveryFilters'
import CatalogClassificationTags from '../components/scale-governance/CatalogClassificationTags'
import {catalogQuery,EMPTY_CATALOG_FILTERS,EMPTY_CATALOG_FACETS,type CatalogClassificationTag,type CatalogTagFacets} from '../api/catalogDiscovery'


const toolKinds=[['','全部'],['SCALE','量表'],['FORM','表单'],['COMPOSITION','组合问卷']] as const
const updatedDate=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'})
function ToolUpdated({value}:{value:string}){
  const date=new Date(value)
  return Number.isNaN(date.getTime())?null:<span className="survey-library-updated"><CalendarDays size={13} aria-hidden="true"/><span>更新于</span><time dateTime={date.toISOString()}>{updatedDate.format(date)}</time></span>
}

// Load researcher authoring/preview code only when its existing control is opened.
const SurveyToolTemplateEditor=deferredResearcherComponent(()=>import('./SurveyToolTemplateEditor').then(module=>module.SurveyToolTemplateEditor),'工具编辑器')

type Props={visible?:boolean;projectId?:string;onSelected?:(ids:string[])=>Promise<void>;onBeforeSelect?:()=>boolean;targetLabel?:string;onLeaveRiskChange?:(risk:BuilderLeaveRisk)=>void;onNavigateLibrary?:()=>void}
export function SurveyToolLibrary({visible=true,projectId,onSelected,onBeforeSelect,targetLabel, onLeaveRiskChange,onNavigateLibrary}:Props){
  const [source,setSource]=useState<'owned'|'granted'>('owned'),[list,setList]=useState<LibraryTool[]>([]),[grants,setGrants]=useState<(CatalogGrant&{classificationTags?:CatalogClassificationTag[]})[]>([])
  const [grantFilters,setGrantFilters]=useState({...EMPTY_CATALOG_FILTERS}),[appliedGrantFilters,setAppliedGrantFilters]=useState({...EMPTY_CATALOG_FILTERS}),[tagFacets,setTagFacets]=useState(EMPTY_CATALOG_FACETS)
  const [kind,setKind]=useState(''),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[total,setTotal]=useState(0),[hasMore,setHasMore]=useState(false)
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[generation,setGeneration]=useState(0)
  const [active,setActive]=useState<string|null>(()=>!projectId?new URLSearchParams(window.location.search).get('tool'):null)
  const [creating,setCreating]=useState(false)
  const [renaming,setRenaming]=useState<{id:string;title:string;originalTitle:string;revision:number}|null>(null),[renameError,setRenameError]=useState('')
  const [pendingKind,setPendingKind]=useState<LibraryTool['kind']|null>(null)
  const createRequest=useRef<{requestId:string;kind:LibraryTool['kind'];title:string}|null>(null),selectRequest=useRef<{key:string;requestId:string}|null>(null)
  const writeLock=useRef(false),readEpoch=useRef(0)
  const load=useCallback(async()=>{const epoch=++readEpoch.current;setLoading(true);setError('');
    try{
      if(source==='owned'){const result=await api<{list:LibraryTool[];total:number;hasMore?:boolean}>('/tool-library?page='+page+'&kind='+kind+'&query='+encodeURIComponent(query)+(projectId?'&selectable=true':''));if(epoch===readEpoch.current){setList(projectId?result.list.filter(tool=>tool.readiness==='READY'):result.list);setTotal(result.total);setHasMore(result.hasMore??page*12<result.total)}}
      else{const result=await api<{list:(CatalogGrant&{classificationTags?:CatalogClassificationTag[]})[];tagFacets?:CatalogTagFacets;hasMore?:boolean}>('/tool-library/catalog?'+catalogQuery(page,appliedGrantFilters));if(epoch===readEpoch.current){setGrants(result.list);setTagFacets(result.tagFacets??EMPTY_CATALOG_FACETS);setHasMore(result.hasMore??result.list.length>=25)}}
    }catch(cause){if(epoch===readEpoch.current)setError(cause instanceof Error?cause.message:'工具集读取失败')}
    finally{if(epoch===readEpoch.current)setLoading(false)}
  },[source,page,kind,query,projectId,appliedGrantFilters])
  useEffect(()=>{const epoch=readEpoch;if(!active)void load();return()=>{epoch.current++}},[load,generation,active])
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),5000);return()=>window.clearTimeout(timer)},[notice])
  useEffect(()=>{if(active)return;onLeaveRiskChange?.({dirty:!!pendingKind||!!renaming&&renaming.title.trim()!==renaming.originalTitle,busy});return()=>onLeaveRiskChange?.({dirty:false,busy:false})},[active,busy,pendingKind,renaming,onLeaveRiskChange])
  useEffect(()=>{if(projectId||!visible)return;const url=new URL(window.location.href);if(active)url.searchParams.set('tool',active);else url.searchParams.delete('tool');if(url.href!==window.location.href)window.history.replaceState(null,'',url.pathname+url.search+url.hash)},[active,projectId,visible])
  const open=(id:string|null)=>{
    setActive(id);setError('')
    if(!projectId){const url=new URL(window.location.href);if(id)url.searchParams.set('tool',id);else url.searchParams.delete('tool');window.history.replaceState(null,'',url.pathname+url.search+url.hash)}
  }
  const create=async(kind:LibraryTool['kind'])=>{
    if(createRequest.current&&createRequest.current.kind!==kind)return
    if(writeLock.current)return;writeLock.current=true;setBusy(true);setError('')
    const request=createRequest.current??(createRequest.current={requestId:crypto.randomUUID(),kind,title:kind==='COMPOSITION'?'未命名组合问卷':'未命名'+libraryKindLabel[kind]});setPendingKind(kind)
    try{const tool=await api<LibraryTool>('/tool-library','POST',request);createRequest.current=null;setPendingKind(null);setCreating(false);open(tool.id)}
    catch(cause){setError(cause instanceof Error?cause.message:'创建失败')}
    finally{setBusy(false);writeLock.current=false}
  }
  const rename=async()=>{
    if(!renaming||writeLock.current)return
    const snapshot=renaming,title=snapshot.title.trim();if(!title||title===snapshot.originalTitle)return
    writeLock.current=true;setBusy(true);setRenameError('');setNotice('')
    try{
      // List rows omit definitions. Read the saved document, then bind the write to its revision.
      const current=await api<LibraryTool>('/tool-library/'+encodeURIComponent(snapshot.id))
      if(current.status!=='DRAFT')throw new Error('工具当前不可编辑，请取消并重新读取列表。')
      if(current.title!==title&&current.revision!==snapshot.revision){
        setList(rows=>rows.map(row=>row.id===current.id?current:row))
        setRenaming({...snapshot,originalTitle:current.title,revision:current.revision})
        setRenameError('工具已更新，已读取最新修订。请确认名称后再次保存。');return
      }
      const result=current.title===title?current:await api<LibraryTool>('/tool-library/'+encodeURIComponent(snapshot.id),'PATCH',{revision:current.revision,title,definition:current.definition})
      setList(rows=>rows.map(row=>row.id===result.id?result:row));setRenaming(null);setNotice('名称已保存。');setGeneration(value=>value+1)
    }catch(cause){setRenameError(cause instanceof Error?cause.message:'名称保存失败，输入仍保留')}
    finally{setBusy(false);writeLock.current=false}
  }
  const cancelRename=()=>{if(!writeLock.current){setRenaming(null);setRenameError('')}}
  const select=async(tool:ToolRef)=>{
    if(!projectId||writeLock.current||onBeforeSelect?.()===false)return;const key=JSON.stringify(tool)
    if(selectRequest.current&&selectRequest.current.key!==key){setError('上次选用结果尚未确认，请先重试同一工具。');return}
    writeLock.current=true;setBusy(true);setError('');setNotice('')
    const request=selectRequest.current?.key===key?selectRequest.current:{key,requestId:crypto.randomUUID()};selectRequest.current=request
    try{
      const result=await api<{instrumentIds:string[]}>('/tool-library/select/'+encodeURIComponent(projectId),'POST',{requestId:request.requestId,tool})
      // ACK is final; list failure must never cause another selection with a fresh request.
      setNotice(targetLabel?'已加入当前问卷（'+result.instrumentIds.length+' 个工具）。请核对顺序并保存波次草稿。':'已加入本研究（'+result.instrumentIds.length+' 个工具）。请在「发布与采集」选择并安排顺序。')
      selectRequest.current=null
      await onSelected?.(result.instrumentIds).catch(()=>{})
    }catch(cause){setError(cause instanceof Error?cause.message:'选用失败')}
    finally{setBusy(false);writeLock.current=false}
  }
  const clearFilters=()=>{if(renaming)return;setSearch('');setQuery('');setKind('');setPage(1)}
  if(active&&!projectId)return <SurveyToolTemplateEditor id={active} onReturn={()=>open(null)} onLeaveRiskChange={onLeaveRiskChange}/>
  return <section className={'survey-tool-library'+(projectId?' is-picker':'')} aria-label={projectId?'选用研究工具':'独立工具集'}>
    <header className="survey-library-heading"><div className="survey-library-title"><h1 id={projectId?'survey-tool-picker-heading':'survey-tools-heading'} tabIndex={-1}>{projectId?'选用研究工具':'工具集'}</h1><p>{projectId?'选用已完成的自建工具或已授权的原版工具。':'编制一次，在不同研究中重复选用。'}</p></div>
      <div className="survey-library-header-actions">
      {source==='owned'&&<form className="survey-library-search" role="search" aria-label="检索自建工具" onSubmit={event=>{event.preventDefault();if(renaming)return;setQuery(search.trim());setPage(1)}}><Search size={17} aria-hidden="true"/><input type="search" aria-label="检索工具" disabled={!!renaming} placeholder="搜索工具名称" value={search} onChange={event=>setSearch(event.target.value)}/><button type="submit" disabled={!!renaming}>检索</button></form>}
      {projectId?<button type="button" className="btn-secondary" onClick={onNavigateLibrary}>前往工具集 <ArrowRight size={16}/></button>:<button type="button" className="btn-primary" aria-expanded={creating} aria-controls="survey-library-create-menu" disabled={busy||!!pendingKind||!!renaming} onClick={()=>setCreating(value=>!value)}><Plus size={17} aria-hidden="true"/>编制工具</button>}
      </div>
    </header>
    {!projectId&&creating&&<div id="survey-library-create-menu" className="survey-library-create-choices" role="group" aria-label="选择要编制的工具">
      {([{kind:'SCALE',title:'量表',text:'设置维度、计分与反馈',Icon:SlidersHorizontal},{kind:'FORM',title:'表单',text:'编写题目、分页与显示条件',Icon:FileText},{kind:'COMPOSITION',title:'普通组合问卷',text:'按顺序组合已有工具',Icon:Layers}] as const).map(({kind,title,text,Icon})=><button type="button" key={kind} disabled={busy||!!renaming||!!pendingKind&&pendingKind!==kind} onClick={()=>void create(kind)}><Icon size={21}/><span><strong>{pendingKind===kind?'重试进入'+title:title}</strong><small>{text}</small></span><ArrowRight size={16}/></button>)}
      {pendingKind&&<p role="status">{busy?'正在打开编制页…':'进入结果尚未确认，请重试同一入口；不会重复创建。'}</p>}
    </div>}
    <div className="survey-library-toolbar"><div className="survey-library-sources" role="group" aria-label="工具来源"><button type="button" aria-pressed={source==='owned'} disabled={!!renaming} onClick={()=>{setSource('owned');setPage(1)}}><Pencil size={15} aria-hidden="true"/>我编制的</button><button type="button" aria-pressed={source==='granted'} disabled={!!renaming} onClick={()=>{setSource('granted');setPage(1)}}><ShieldCheck size={16} aria-hidden="true"/>已获授权</button></div>
      {!loading&&!error&&<span className="survey-library-result-count">{source==='owned'?(projectId?'本页可选 '+list.length+' 项':'共 '+total+' 项工具'):'本页 '+grants.length+' 项授权工具'}</span>}
    </div>
    {source==='owned'?<div className="survey-library-filterbar"><div className="survey-library-type-filters" role="group" aria-label="筛选工具类型">{toolKinds.map(([value,label])=><button type="button" key={value} aria-pressed={kind===value} disabled={!!renaming} onClick={()=>{setKind(value);setPage(1)}}>{label}</button>)}</div>
      {(query||kind)&&<button type="button" className="survey-library-clear" disabled={!!renaming} onClick={clearFilters}><X size={14} aria-hidden="true"/>清除筛选</button>}
      {query&&<span className="survey-library-query">关键词：{query}</span>}
    </div>:<p className="survey-library-grant-note"><ShieldCheck size={15} aria-hidden="true"/>原版内容与计分保持只读，可在研究中选用。</p>}
    {source==='granted'&&<CatalogDiscoveryFilters label="已获授权工具检索" filters={grantFilters} facets={tagFacets} onChange={setGrantFilters} disabled={busy||loading||!!renaming} onApply={value=>{readEpoch.current++;setGrants([]);setPage(1);setAppliedGrantFilters({...value,keyword:value.keyword.trim()})}}/>}

    {error&&<div role="alert" className="survey-library-error">{error}<button type="button" disabled={loading||busy||!!renaming} onClick={()=>setGeneration(value=>value+1)}>重新读取列表</button></div>}
    {notice&&<p role="status" className="survey-library-notice">{notice}</p>}
    {loading?<p role="status" className="survey-library-empty">正在读取工具…</p>:<div className="survey-library-grid">{source==='owned'?list.map(tool=>{const Icon=tool.kind==='FORM'?FileText:tool.kind==='SCALE'?SlidersHorizontal:Layers;return <article key={tool.id} className="survey-library-card" aria-label={tool.title} data-kind={tool.kind} data-readiness={tool.readiness}><div className="survey-library-card-top"><span><Icon size={17}/>{libraryKindLabel[tool.kind]}</span><small>{tool.readiness==='READY'?'已完成编制':'编制中'}</small></div><div className="survey-library-card-name"><h2>{tool.title}</h2></div>
      {renaming?.id===tool.id&&<form className="survey-library-rename-form" aria-label="修改工具名称" onSubmit={event=>{event.preventDefault();void rename()}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();cancelRename()}}}><fieldset disabled={busy}><label>工具名称<input className="input" autoFocus maxLength={200} value={renaming.title} onChange={event=>{setRenaming({...renaming,title:event.target.value});setRenameError('')}}/></label>{renameError&&<p role="alert">{renameError}</p>}<div><button type="submit" className="btn-primary" disabled={!renaming.title.trim()||renaming.title.trim()===renaming.originalTitle}>{busy?'保存中…':'保存名称'}</button><button type="button" className="btn-secondary" onClick={cancelRename}>取消</button></div></fieldset></form>}
      <p>{tool.kind==='COMPOSITION'?'将已有工具按顺序组合，统一安排作答流程。':tool.kind==='SCALE'?'配置维度、题目、计分与研究反馈。':'收集基本信息、反馈或自定义内容。'}</p><footer><div className="survey-library-card-meta"><ToolUpdated value={tool.updatedAt}/><span>修订 {tool.revision}</span></div><div className="survey-library-card-actions">{!projectId&&['FORM','SCALE'].includes(tool.kind)&&<button type="button" className="survey-library-rename" aria-label={'修改名称：'+tool.title} aria-expanded={renaming?.id===tool.id} disabled={busy||loading||!!pendingKind||!!renaming} onClick={()=>{setRenaming({id:tool.id,title:tool.title,originalTitle:tool.title,revision:tool.revision});setRenameError('');setError('')}}><Pencil size={14}/><span>修改名称</span></button>}{projectId?<button className="btn-secondary" disabled={busy} onClick={()=>void select({source:'owned',id:tool.id,revision:tool.revision})}>{targetLabel||'加入本研究'} <ArrowRight size={16}/></button>:<button className="btn-secondary" disabled={busy||!!pendingKind||!!renaming} onClick={()=>open(tool.id)}>编辑 <ArrowRight size={16}/></button>}</div></footer></article>}):grants.map(grant=><article key={grant.id} className="survey-library-card" aria-label={grant.title} data-kind={grant.kind} data-readiness="GRANTED"><div className="survey-library-card-top"><span><Wrench size={17}/>{libraryKindLabel[grant.kind]}</span><small>已获授权</small></div><h2>{grant.title}</h2><p className="survey-library-grant-version">原版固定版本 · {grant.sourceRef.sourceVersion}</p><CatalogClassificationTags tags={grant.classificationTags}/><details><summary>来源与使用限制</summary><SourceProvenance source={grant.sourceRef} provenance={grant.sourceProvenance}/></details><footer><span>内容与计分只读</span>{projectId?<button className="btn-secondary" disabled={busy} onClick={()=>void select({source:'granted',id:grant.id})}>{targetLabel||'加入本研究'} <ArrowRight size={16}/></button>:<span>进入研究后选用</span>}</footer></article>)}</div>}
    {!loading&&!error&&(source==='owned'?!list.length:!grants.length)&&<div className="survey-library-empty"><Wrench size={28}/><h2>{source==='owned'?(query||kind?'没有符合条件的工具':'还没有自建工具'):catalogQuery(1,appliedGrantFilters)!=='page=1'?'没有符合条件的已授权工具':'暂无已授权工具'}</h2><p>{source==='owned'?(query||kind?'试试其他类型或关键词，或清除筛选查看全部自建工具。':projectId?'请先在工具集中保存并点击“完成编制”，或切换到“已获授权”；未完成、修订已变化或依赖已失效的工具不会显示。':'点击“编制工具”，创建第一份表单、量表或普通组合问卷。'):catalogQuery(1,appliedGrantFilters)!=='page=1'?'可调整条件或清除筛选，查看全部已获授权版本。':'由管理员按具体工具及版本授予使用权限。'}</p>{source==='owned'&&(query||kind)&&<button type="button" className="btn-secondary" onClick={clearFilters}>显示全部自建工具</button>}</div>}
    <footer className="survey-library-pagination"><span>{source==='owned'&&!projectId?'每页 12 项 · ':''}第 {page}{source==='owned'&&!projectId?' / '+Math.max(1,Math.ceil(total/12)):''} 页</span><button className="btn-secondary" disabled={busy||loading||!!renaming||page<=1} onClick={()=>setPage(value=>value-1)}>上一页</button><button className="btn-secondary" disabled={busy||loading||!!renaming||!hasMore} onClick={()=>setPage(value=>value+1)}>下一页</button></footer>
    <details className="survey-library-help"><summary>选用、版本与开放范围说明</summary><p>工具集不属于任何具体研究。自建工具保存后需点击“完成编制”；加入研究时复制已完成的精确修订，后续工具集修改不影响已有研究。普通组合问卷不提供打包综合报告；选用后在发布与采集安排工具顺序和反馈策略。</p><p>表单、量表和普通组合问卷支持自建。SJT 与认知测验暂不开放自建，仅可按授权使用原版固定版本。授权撤销后不能继续导入或冻结新版本。</p></details>
  </section>
}
