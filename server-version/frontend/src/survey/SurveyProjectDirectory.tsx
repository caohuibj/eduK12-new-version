import { useEffect, useId, useRef, useState } from 'react'
import { ArrowUpRight, CalendarDays, ChevronDown, ChevronUp, FolderOpen, Plus, Search } from 'lucide-react'

export type SurveyProject = {
  id:string; title:string; description:string; collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES'
  status:'DRAFT'|'ACTIVE'|'PAUSED'|'CLOSED'|'ARCHIVED'; revision:number; firstPublishedAt?:string|null; createdAt?:string
}
const statusLabels = {DRAFT:'草稿',ACTIVE:'采集中',PAUSED:'暂停',CLOSED:'已结束',ARCHIVED:'已归档'}
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
  return <article className="survey-project-card" aria-labelledby={headingId} data-selected={selected}>
    <div className="survey-project-card-top"><span className="survey-project-icon"><FolderOpen size={23} strokeWidth={1.5} aria-hidden="true"/></span>
      <span className="survey-project-status" data-status={project.status}>{statusLabels[project.status]||'状态待确认'}</span></div>
    <p className="survey-project-meta">{project.collectionMode==='LINKED_WAVES'?'多波次关联':'单次匿名'}</p>
    <h3 id={headingId}>{project.title}</h3>
    <ProjectDescription description={project.description}/>
    {selected&&<p className="survey-project-current">当前编辑中的研究</p>}
    <p className="survey-project-created"><CalendarDays size={15} aria-hidden="true"/>{createdAt?<><span>建立于</span><time dateTime={createdAt.toISOString()}>{creationDateFormat.format(createdAt)}</time></>:<span>建立时间暂不可用</span>}</p>
    <div className="survey-project-actions"><button type="button" className="survey-project-open" disabled={busy} aria-describedby={headingId} aria-pressed={selected} onClick={()=>onChoose(project)}>查看/编辑<ArrowUpRight size={17} aria-hidden="true"/></button>
      <button type="button" className="survey-project-archive" disabled={busy||(project.status==='DRAFT'&&!!project.firstPublishedAt)
        ||(!['DRAFT','CLOSED'].includes(project.status)&&!(project.status==='ARCHIVED'&&!project.firstPublishedAt))} onClick={()=>onArchive(project)}>
        {project.status==='CLOSED'?'结束后归档':project.status==='DRAFT'?'归档草稿':
          project.status==='ARCHIVED'?(project.firstPublishedAt?'终态归档不可恢复':'恢复草稿'):'采集中不可归档'}</button></div>
  </article>
}

export function SurveyProjectDirectory({projects,selectedId,page,busy,loading,error,query,status,
  onQuery,onStatus,onChoose,onArchive,onPage,onRefresh,onCreate}:{
  projects:SurveyProject[]; selectedId?:string; page:number; busy:boolean; loading:boolean
  error:string; query:string; status:string; onQuery:(value:string)=>void; onStatus:(value:string)=>void
  onChoose:(project:SurveyProject)=>void; onArchive:(project:SurveyProject)=>void; onPage:(page:number)=>void
  onRefresh:()=>void; onCreate:()=>void
}) {
  const [searchOpen,setSearchOpen]=useState(false)
  const searchInput=useRef<HTMLInputElement>(null)
  useEffect(()=>{if(searchOpen)searchInput.current?.focus()},[searchOpen])
  const needle=query.trim().toLocaleLowerCase()
  const visible=projects.filter(project=>(!needle||(project.title+' '+project.description).toLocaleLowerCase().includes(needle))
    &&(!status||project.status===status))
  const clear=()=>{onQuery('');onStatus('')}
  return <section className="survey-project-directory" aria-labelledby="survey-projects-heading">
    <header className="survey-directory-heading">
      <h1 id="survey-projects-heading" tabIndex={-1}>研究工作台</h1>
      <div className="survey-directory-actions">
        <button type="button" className="btn-secondary survey-directory-search-toggle" aria-label="研究检索"
          aria-expanded={searchOpen} aria-controls="survey-directory-search" data-filtered={!!(query||status)}
          onClick={()=>setSearchOpen(open=>!open)}><Search size={18} aria-hidden="true"/>研究检索
          {(query||status)&&<span className="survey-filter-indicator" aria-hidden="true">已筛选</span>}</button>
        <button type="button" className="btn-primary" disabled={busy||loading} onClick={onCreate}><Plus size={18} aria-hidden="true"/>新建研究</button>
      </div>
    </header>
    <div id="survey-directory-search" className="survey-directory-toolbar" role="search" aria-label="筛选本页研究" hidden={!searchOpen}>
      <label>筛选本页研究<input ref={searchInput} className="input" type="search" value={query} placeholder="研究名称或说明"
        onChange={event=>onQuery(event.target.value)}/></label>
      <label>本页状态<select className="input" value={status} onChange={event=>onStatus(event.target.value)}>
        <option value="">全部状态</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
      {(query||status)&&<button type="button" className="btn-secondary" onClick={clear}>清除筛选</button>}
      <button type="button" className="btn-secondary" disabled={busy||loading} onClick={onRefresh}>刷新本页研究</button>
    </div>
    {loading&&<p role="status" className="survey-workspace-message">正在读取研究列表，请稍候…</p>}
    {error&&<div role="alert" className="survey-workspace-message survey-workspace-message--error">
      <p>研究列表未能更新：{error}。当前会话及已显示的研究会保留。</p>
      <button type="button" className="btn-secondary" disabled={busy||loading} onClick={onRefresh}>重试研究列表</button>
    </div>}
    <div className="survey-project-grid">{visible.map(project=><ProjectCard key={project.id} project={project} selected={selectedId===project.id} busy={busy} onChoose={onChoose} onArchive={onArchive}/>)}</div>
    {!loading&&!error&&!visible.length&&<div className="survey-directory-empty">
      <h3>{projects.length?'本页没有符合条件的研究':page===1?'从一项研究草稿开始':'本页没有研究项目'}</h3>
      <p>{projects.length?'可清除筛选查看本页内容，或使用分页查看其他研究。':page===1?'先填写研究名称与采集方式，再编制工具、配置波次并检查发布。':'可返回上一页继续查看已有研究。'}</p>
      {projects.length?<button type="button" className="btn-secondary" onClick={clear}>显示本页全部研究</button>
        :page===1&&<button type="button" className="btn-secondary" disabled={busy} onClick={onCreate}>填写第一项研究</button>}
    </div>}
    <footer className="survey-directory-footer">
    {!loading&&!error&&<p className="survey-directory-count" role="status">第 {page} 页共 {projects.length} 项，当前显示 {visible.length} 项。筛选仅作用于本页。</p>}
    <nav className="survey-directory-pagination" aria-label="研究项目分页">
      <button type="button" className="btn-secondary" disabled={busy||loading||page<=1} onClick={()=>onPage(page-1)}>上一页</button>
      <span>项目第 {page} 页</span>
      <button type="button" className="btn-secondary" disabled={busy||loading||projects.length<25} onClick={()=>onPage(page+1)}>下一页</button>
    </nav>
    </footer>
  </section>
}
