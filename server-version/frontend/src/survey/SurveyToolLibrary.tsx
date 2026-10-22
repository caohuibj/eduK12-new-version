import {useCallback,useEffect,useRef,useState} from 'react'
import {Plus,Search,Wrench,ArrowRight,FileText,SlidersHorizontal,Layers,Pencil} from 'lucide-react'
import {toolLibraryApi as api,libraryKindLabel,type LibraryTool,type ToolRef} from './tool-library-api'
import type {CatalogGrant} from './ResearchCatalog'
import {SourceProvenance} from './ResearchCatalog'
import {SurveyToolTemplateEditor} from './SurveyToolTemplateEditor'
import type {BuilderLeaveRisk} from './SurveyBuilder'
import './survey-tool-library.css'

type Props={visible?:boolean;projectId?:string;onSelected?:(ids:string[])=>Promise<void>;onBeforeSelect?:()=>boolean;targetLabel?:string;onLeaveRiskChange?:(risk:BuilderLeaveRisk)=>void;onNavigateLibrary?:()=>void}
export function SurveyToolLibrary({visible=true,projectId,onSelected,onBeforeSelect,targetLabel, onLeaveRiskChange,onNavigateLibrary}:Props){
  const [source,setSource]=useState<'owned'|'granted'>('owned'),[list,setList]=useState<LibraryTool[]>([]),[grants,setGrants]=useState<CatalogGrant[]>([])
  const [kind,setKind]=useState(''),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[total,setTotal]=useState(0)
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[generation,setGeneration]=useState(0)
  const [active,setActive]=useState<string|null>(()=>!projectId?new URLSearchParams(window.location.search).get('tool'):null)
  const [creating,setCreating]=useState(false)
  const [renaming,setRenaming]=useState<{id:string;title:string;originalTitle:string;revision:number}|null>(null),[renameError,setRenameError]=useState('')
  const [pendingKind,setPendingKind]=useState<LibraryTool['kind']|null>(null)
  const createRequest=useRef<{requestId:string;kind:LibraryTool['kind'];title:string}|null>(null),selectRequest=useRef<{key:string;requestId:string}|null>(null)
  const writeLock=useRef(false),readEpoch=useRef(0)
  const load=useCallback(async()=>{const epoch=++readEpoch.current;setLoading(true);setError('');
    try{
      if(source==='owned'){const result=await api<{list:LibraryTool[];total:number}>('/tool-library?page='+page+'&kind='+kind+'&query='+encodeURIComponent(query));if(epoch===readEpoch.current){setList(result.list);setTotal(result.total)}}
      else{const result=await api<{list:CatalogGrant[]}>('/tool-library/catalog?page='+page);if(epoch===readEpoch.current)setGrants(result.list)}
    }catch(cause){if(epoch===readEpoch.current)setError(cause instanceof Error?cause.message:'工具集读取失败')}
    finally{if(epoch===readEpoch.current)setLoading(false)}
  },[source,page,kind,query])
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
  if(active&&!projectId)return <SurveyToolTemplateEditor id={active} onReturn={()=>open(null)} onLeaveRiskChange={onLeaveRiskChange}/>
  return <section className={'survey-tool-library'+(projectId?' is-picker':'')} aria-label={projectId?'选用研究工具':'独立工具集'}>
    <header className="survey-library-heading"><div><h1 id={projectId?'survey-tool-picker-heading':'survey-tools-heading'} tabIndex={-1}>{projectId?'选用研究工具':'工具集'}</h1><p>{projectId?'从工具集中选用；本研究保留选用时的内容修订。':'独立编制与管理工具，在不同研究中重复选用。'}</p></div>
      {projectId?<button type="button" className="btn-secondary" onClick={onNavigateLibrary}>前往工具集 <ArrowRight size={16}/></button>:<button type="button" className="btn-primary" aria-expanded={creating} disabled={busy||!!pendingKind||!!renaming} onClick={()=>setCreating(value=>!value)}><Plus size={17}/>编制工具</button>}
    </header>
    {!projectId&&creating&&<div className="survey-library-create-choices" role="group" aria-label="选择要编制的工具">
      {([{kind:'SCALE',title:'量表',text:'设置维度、计分与反馈',Icon:SlidersHorizontal},{kind:'FORM',title:'表单',text:'编写题目、分页与显示条件',Icon:FileText},{kind:'COMPOSITION',title:'普通组合问卷',text:'按顺序组合已有工具',Icon:Layers}] as const).map(({kind,title,text,Icon})=><button type="button" key={kind} disabled={busy||!!renaming||!!pendingKind&&pendingKind!==kind} onClick={()=>void create(kind)}><Icon size={21}/><span><strong>{pendingKind===kind?'重试进入'+title:title}</strong><small>{text}</small></span><ArrowRight size={16}/></button>)}
      {pendingKind&&<p role="status">{busy?'正在打开编制页…':'进入结果尚未确认，请重试同一入口；不会重复创建。'}</p>}
    </div>}
    <div className="survey-library-toolbar"><div className="survey-library-sources" role="group" aria-label="工具来源"><button type="button" aria-pressed={source==='owned'} disabled={!!renaming} onClick={()=>{setSource('owned');setPage(1)}}>我编制的</button><button type="button" aria-pressed={source==='granted'} disabled={!!renaming} onClick={()=>{setSource('granted');setPage(1)}}>已获授权</button></div>
      {source==='owned'&&<><label className="survey-library-kind"><SlidersHorizontal size={16}/><select aria-label="筛选工具类型" disabled={!!renaming} value={kind} onChange={event=>{setKind(event.target.value);setPage(1)}}><option value="">全部类型</option><option value="FORM">表单</option><option value="SCALE">量表</option><option value="COMPOSITION">普通组合问卷</option></select></label><form role="search" onSubmit={event=>{event.preventDefault();if(renaming)return;setQuery(search.trim());setPage(1)}}><Search size={17}/><input aria-label="检索工具" disabled={!!renaming} placeholder="搜索工具名称" value={search} onChange={event=>setSearch(event.target.value)}/><button type="submit" disabled={!!renaming}>检索</button></form></>}
    </div>
    {error&&<div role="alert" className="survey-library-error">{error}<button type="button" disabled={loading||busy||!!renaming} onClick={()=>setGeneration(value=>value+1)}>重新读取列表</button></div>}
    {notice&&<p role="status" className="survey-library-notice">{notice}</p>}
    {loading?<p role="status" className="survey-library-empty">正在读取工具…</p>:<div className="survey-library-grid">{source==='owned'?list.map(tool=>{const Icon=tool.kind==='FORM'?FileText:tool.kind==='SCALE'?SlidersHorizontal:Layers;return <article key={tool.id} className="survey-library-card"><div className="survey-library-card-top"><span><Icon size={17}/>{libraryKindLabel[tool.kind]}</span><small>我编制的</small></div><div className="survey-library-card-name"><h2>{tool.title}</h2>{!projectId&&['FORM','SCALE'].includes(tool.kind)&&<button type="button" className="survey-library-rename" aria-label={'修改名称：'+tool.title} aria-expanded={renaming?.id===tool.id} disabled={busy||loading||!!pendingKind||!!renaming} onClick={()=>{setRenaming({id:tool.id,title:tool.title,originalTitle:tool.title,revision:tool.revision});setRenameError('');setError('')}}><Pencil size={14}/><span>修改名称</span></button>}</div>
      {renaming?.id===tool.id&&<form className="survey-library-rename-form" aria-label="修改工具名称" onSubmit={event=>{event.preventDefault();void rename()}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();cancelRename()}}}><fieldset disabled={busy}><label>工具名称<input className="input" autoFocus maxLength={200} value={renaming.title} onChange={event=>{setRenaming({...renaming,title:event.target.value});setRenameError('')}}/></label>{renameError&&<p role="alert">{renameError}</p>}<div><button type="submit" className="btn-primary" disabled={!renaming.title.trim()||renaming.title.trim()===renaming.originalTitle}>{busy?'保存中…':'保存名称'}</button><button type="button" className="btn-secondary" onClick={cancelRename}>取消</button></div></fieldset></form>}
      <p>{tool.kind==='COMPOSITION'?'按顺序组合已有工具，各测评分别处理结果。':tool.kind==='SCALE'?'维度、计分及原始分区间反馈。':'分页、题目与条件显示。'}</p><footer><span>修订 {tool.revision}</span>{projectId?<button className="btn-secondary" disabled={busy} onClick={()=>void select({source:'owned',id:tool.id,revision:tool.revision})}>{targetLabel||'加入本研究'} <ArrowRight size={16}/></button>:<button className="btn-secondary" disabled={busy||!!pendingKind||!!renaming} onClick={()=>open(tool.id)}>编辑 <ArrowRight size={16}/></button>}</footer></article>}):grants.map(grant=><article key={grant.id} className="survey-library-card"><div className="survey-library-card-top"><span><Wrench size={17}/>{libraryKindLabel[grant.kind]}</span><small>已获授权</small></div><h2>{grant.title}</h2><p>原版固定版本 · {grant.sourceRef.sourceVersion}</p><details><summary>来源与使用限制</summary><SourceProvenance source={grant.sourceRef} provenance={grant.sourceProvenance}/></details><footer><span>内容与计分只读</span>{projectId?<button className="btn-secondary" disabled={busy} onClick={()=>void select({source:'granted',id:grant.id})}>{targetLabel||'加入本研究'} <ArrowRight size={16}/></button>:<span>进入研究后选用</span>}</footer></article>)}</div>}
    {!loading&&!error&&(source==='owned'?!list.length:!grants.length)&&<div className="survey-library-empty"><Wrench size={28}/><h2>{source==='owned'?'暂无符合条件的工具':'暂无已授权工具'}</h2><p>{source==='owned'?(projectId?'前往工具集编制，或切换到已获授权。':'点击“编制工具”，创建第一份表单、量表或普通组合问卷。'):'由管理员按具体工具及版本授予使用权限。'}</p></div>}
    <footer className="survey-library-pagination"><span>{source==='owned'?'共 '+total+' 项 · ':''}第 {page} 页</span><button className="btn-secondary" disabled={busy||loading||!!renaming||page<=1} onClick={()=>setPage(value=>value-1)}>上一页</button><button className="btn-secondary" disabled={busy||loading||!!renaming||(source==='owned'?page*12>=total:grants.length<25)} onClick={()=>setPage(value=>value+1)}>下一页</button></footer>
    <details className="survey-library-help"><summary>选用、版本与开放范围说明</summary><p>工具集不属于任何具体研究。加入研究时复制保存的精确修订，后续工具集修改不影响已有研究。普通组合问卷不提供打包综合报告；选用后在发布与采集安排工具顺序和反馈策略。</p><p>表单、量表和普通组合问卷支持自建。SJT 与认知测验暂不开放自建，仅可按授权使用原版固定版本。授权撤销后不能继续导入或冻结新版本。</p></details>
  </section>
}
