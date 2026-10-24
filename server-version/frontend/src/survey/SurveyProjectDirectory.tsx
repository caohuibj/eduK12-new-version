import { useEffect, useId, useRef, useState } from 'react'
import { ArrowUpRight, CalendarDays, ChevronDown, ChevronUp, FolderOpen, Plus, Search } from 'lucide-react'
import './survey-project-directory.css'

export type SurveyProject = {
  id:string; title:string; description:string; collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES'
  status:'DRAFT'|'ACTIVE'|'PAUSED'|'CLOSED'|'ARCHIVED'; revision:number; firstPublishedAt?:string|null; createdAt?:string
}
const statusLabels = {DRAFT:'草稿',ACTIVE:'进行中',PAUSED:'已暂停',CLOSED:'已结束',ARCHIVED:'已归档'}
const creationDateFormat=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})

function ProjectDescription({description}:{description:string}){
  const id=useId(),textRef=useRef<HTMLParagraphElement>(null)
  const [expanded,setExpanded]=useState(false),[overflows,setOverflows]=useState(false)
  useEffect(()=>{
    const text=textRef.current
    if(!text||expanded)return
    const measure=()=>setOverflows(text.scrollHeight>text.clientHeight+1)
    measure()
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):undefined
    observer?.observe(text);window.addEventListener('resize',measure)
    return ()=>{observer?.disconnect();window.removeEventListener('resize',measure)}
  },[description,expanded])
  return <div className="survey-project-introduction">
    <p ref={textRef} id={id} className={'survey-project-description'+(expanded?' is-expanded':'')}>{description||'尚未填写研究说明，可在研究设置中补充。'}</p>
    {(overflows||expanded)&&<button type="button" className="survey-project-description-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)}>
      {expanded?'收起介绍':'更多介绍'}{expanded?<ChevronUp size={14} aria-hidden="true"/>:<ChevronDown size={14} aria-hidden="true"/>}
    </button>}
  </div>
}

function ProjectCard({project,selected,busy,onChoose,onArchive}:{project:SurveyProject;selected:boolean;busy:boolean;onChoose:(project:SurveyProject)=>void;onArchive:(project:SurveyProject)=>void}){
  const headingId=useId()
  const createdAt=project.createdAt&&Number.isFinite(Date.parse(project.createdAt))?new Date(project.createdAt):null
  return <article className="survey-project-card" aria-labelledby={headingId} data-selected={selected} data-status={project.status}>
    <div className="survey-project-card-heading"><span className="survey-project-icon"><FolderOpen size={21} strokeWidth={1.5} aria-hidden="true"/></span>
      <div className="survey-project-heading-copy"><div className="survey-project-meta"><span className="survey-project-status" data-status={project.status}>{statusLabels[project.status]||'状态待确认'}</span><span>{project.collectionMode==='LINKED_WAVES'?'多波次关联':'单次匿名'}</span>{selected&&<span className="survey-project-current">当前研究</span>}</div>
      <h3 id={headingId}>{project.title}</h3></div></div>
    <ProjectDescription description={project.description}/>
    <div className="survey-project-card-footer"><p className="survey-project-created"><CalendarDays size={14} aria-hidden="true"/>{createdAt?<><span>建立于</span><time dateTime={createdAt.toISOString()}>{creationDateFormat.format(createdAt)}</time></>:<span>建立时间暂不可用</span>}</p>
      <div className="survey-project-actions"><button type="button" className="survey-project-open" disabled={busy} aria-describedby={headingId} onClick={()=>onChoose(project)}>查看/编辑<ArrowUpRight size={16} aria-hidden="true"/></button>
      <button type="button" className="survey-project-archive" disabled={busy||(project.status==='DRAFT'&&!!project.firstPublishedAt)
        ||(!['DRAFT','CLOSED'].includes(project.status)&&!(project.status==='ARCHIVED'&&!project.firstPublishedAt))} onClick={()=>onArchive(project)}>
        {project.status==='CLOSED'?'结束后归档':project.status==='DRAFT'?'归档草稿':
          project.status==='ARCHIVED'?(project.firstPublishedAt?'终态归档不可恢复':'恢复草稿'):'采集中不可归档'}</button></div>
    </div>
  </article>
}

export function SurveyProjectDirectory({projects,selectedId,page,busy,loading,error,query,status,
  onQuery,onStatus,onChoose,onArchive,onPage,onRefresh,onCreate,pageSize=25,sort='created_desc',total,hasNext,onPageSize,onSort,onClear}:{
  projects:SurveyProject[]; selectedId?:string; page:number; busy:boolean; loading:boolean
  error:string; query:string; status:string; onQuery:(value:string)=>void; onStatus:(value:string)=>void
  onChoose:(project:SurveyProject)=>void; onArchive:(project:SurveyProject)=>void; onPage:(page:number)=>void
  pageSize?:number; sort?:string; total?:number; hasNext?:boolean; onPageSize?:(value:number)=>void; onSort?:(value:string)=>void; onClear?:()=>void
  onRefresh:()=>void; onCreate:()=>void
}) {
  const [searchOpen,setSearchOpen]=useState(false)
  const searchInput=useRef<HTMLInputElement>(null)
  useEffect(()=>{if(searchOpen)searchInput.current?.focus()},[searchOpen])
  const filtered=!!(query.trim()||status)
  const clear=()=>{if(onClear)onClear();else{onQuery('');onStatus('')}}
  const pageCount=total===undefined?undefined:Math.max(1,Math.ceil(total/pageSize))
  return <section className="survey-project-directory" aria-labelledby="survey-projects-heading">
    <header className="survey-directory-heading">
      <div className="survey-directory-title"><h1 id="survey-projects-heading" tabIndex={-1}>研究工作台</h1><p>集中管理问卷、波次与数据。</p></div>
      <div className="survey-directory-actions">
        <button type="button" className="btn-secondary survey-directory-search-toggle" aria-label="研究检索"
          aria-expanded={searchOpen} aria-controls="survey-directory-search" data-filtered={!!(query||status)}
          onClick={()=>setSearchOpen(open=>!open)}><Search size={18} aria-hidden="true"/><span className="survey-directory-search-label">研究检索</span>
          {(query||status)&&<span className="survey-filter-indicator" aria-hidden="true">已筛选</span>}</button>
        <button type="button" className="btn-primary" disabled={busy||loading} onClick={onCreate}><Plus size={18} aria-hidden="true"/>新建研究</button>
      </div>
    </header>
    <div className="survey-directory-browse-bar">
      <div className="survey-directory-status-filters" role="group" aria-label="按研究状态筛选">
        {[['','全部'],...Object.entries(statusLabels)].map(([value,label])=><button type="button" key={value} aria-pressed={status===value}
          disabled={busy} onClick={()=>onStatus(value)}>{label}</button>)}
      </div>
      <div className="survey-directory-view-options">
        <label>创建时间<select className="input" aria-label="创建时间排序" value={sort} disabled={busy} onChange={event=>onSort?.(event.target.value)}>
          <option value="created_desc">最新在前</option><option value="created_asc">最早在前</option>
        </select></label>
        <label>每页显示<select className="input" value={pageSize} disabled={busy} onChange={event=>onPageSize?.(Number(event.target.value))}>
          {[10,25,50,100].map(size=><option key={size} value={size}>{size} 项</option>)}
        </select></label>
      </div>
    </div>
    <div id="survey-directory-search" className="survey-directory-toolbar" role="search" aria-label="检索研究" hidden={!searchOpen}>
      <label>检索研究<input ref={searchInput} className="input" type="search" value={query} maxLength={200} placeholder="搜索全部研究的名称或说明"
        onChange={event=>onQuery(event.target.value)}/></label>
      {filtered&&<button type="button" className="btn-secondary" onClick={clear}>清除筛选</button>}
      <button type="button" className="btn-secondary" disabled={busy||loading} onClick={onRefresh}>刷新本页研究</button>
    </div>
    {!searchOpen&&query&&<div className="survey-directory-active-filters" aria-label="当前检索条件"><strong>关键词：{query}</strong><button type="button" onClick={()=>onQuery('')}>清除关键词</button></div>}
    {loading&&<p role="status" className="survey-workspace-message">正在读取研究列表，请稍候…</p>}
    {error&&<div role="alert" className="survey-workspace-message survey-workspace-message--error">
      <p>研究列表未能更新：{error}。当前会话及已显示的研究会保留。</p>
      <button type="button" className="btn-secondary" disabled={busy||loading} onClick={onRefresh}>重试研究列表</button>
    </div>}
    <div className="survey-project-grid">{projects.map(project=><ProjectCard key={project.id} project={project} selected={selectedId===project.id} busy={busy} onChoose={onChoose} onArchive={onArchive}/>)}</div>
    {!loading&&!error&&!projects.length&&<div className="survey-directory-empty">
      <h3>{filtered?'没有符合条件的研究':page===1?'从一项研究草稿开始':'本页没有研究项目'}</h3>
      <p>{filtered?'试试其他状态或关键词，也可以清除筛选查看全部研究。':page===1?'先填写研究名称与采集方式，再编制工具、配置波次并检查发布。':'可返回上一页继续查看已有研究。'}</p>
      {filtered?<button type="button" className="btn-secondary" onClick={clear}>显示全部研究</button>
        :page===1&&<button type="button" className="btn-secondary" disabled={busy} onClick={onCreate}>填写第一项研究</button>}
    </div>}
    <footer className="survey-directory-footer">
    {!loading&&!error&&<p className="survey-directory-count" role="status">{total===undefined?`本页 ${projects.length} 项研究`:`共 ${total} 项研究${total?` · 显示 ${(page-1)*pageSize+1}–${(page-1)*pageSize+projects.length} 项`:''}`} </p>}
    <nav className="survey-directory-pagination" aria-label="研究项目分页">
      <button type="button" className="btn-secondary" disabled={busy||loading||page<=1} onClick={()=>onPage(page-1)}>上一页</button>
      <span>第 {page}{pageCount?` / ${pageCount}`:''} 页</span>
      <button type="button" className="btn-secondary" disabled={busy||loading||!(hasNext??projects.length>=pageSize)} onClick={()=>onPage(page+1)}>下一页</button>
    </nav>
    </footer>
  </section>
}
