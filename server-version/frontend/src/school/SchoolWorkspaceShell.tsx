import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Menu, X } from 'lucide-react'
import { workspaceHref, type SchoolNavigationItem } from './school-navigation'

export function SchoolWorkspaceShell({items,page,onNavigate,context,children}:{items:SchoolNavigationItem[];page:string;onNavigate:(id:string)=>void;context?:ReactNode;children:ReactNode}){
 const [open,setOpen]=useState(false)
 const toggle=useRef<HTMLButtonElement>(null)
 const content=useRef<HTMLDivElement>(null)
 const previous=useRef(page)
 const active=items.find(i=>i.id===page)
 const groups=[...new Set(items.map(i=>i.group))]
 useEffect(()=>{
  if(previous.current!==page){setOpen(false);content.current?.focus();previous.current=page}
  document.title=`${active?.label??'校园功能'} · Huischool`
 },[page,active?.label])
 const navigate=(event:React.MouseEvent<HTMLAnchorElement>,id:string)=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
  event.preventDefault();setOpen(false);onNavigate(id)
 }
 return <div className="hs-workspace-layout">
  <div className="hs-workspace-mobilebar">
   <button ref={toggle} type="button" aria-expanded={open} aria-controls="hs-workspace-navigation" onClick={()=>setOpen(!open)}>{open?<X size={19}/>:<Menu size={19}/>}功能导航</button>
   <span>{active?.label??'校园功能'}</span>
  </div>
  <nav id="hs-workspace-navigation" aria-label="工作台功能导航" className={`hs-workspace-navigation${open?' is-open':''}`} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);toggle.current?.focus()}}}>
   <p className="hs-nav-caption">你的校园空间</p>
   {groups.map(group=><div className="hs-nav-group" key={group}><p>{group}</p>{items.filter(i=>i.group===group).map(item=><a key={item.id} href={workspaceHref(item.id)} aria-current={page===item.id?'page':undefined} onClick={e=>navigate(e,item.id)}><item.icon size={18} aria-hidden="true"/><span>{item.label}</span></a>)}</div>)}
  </nav>
  <div ref={content} tabIndex={-1} className="hs-workspace-content">
   {page!=='overview'&&<div className="hs-workspace-page-heading"><a href={workspaceHref('overview')} onClick={e=>navigate(e,'overview')}><ArrowLeft size={16} aria-hidden="true"/>返回概览</a><p className="hs-section-kicker">{active?.group??'校园空间'}</p><h1>{active?.label??'暂不可用的校园功能'}</h1><p>{active?.description??'该入口当前不在你的授权范围内，请返回概览选择可用功能。'}</p></div>}
   {context}
   {active?children:<section className="hs-panel"><h2>当前无法进入此功能</h2><p>学校授权或账号状态变化后，可用功能也会相应更新。</p><a className="hs-workspace-inline-link" href={workspaceHref('overview')} onClick={e=>navigate(e,'overview')}>查看可用功能 <ArrowRight size={16}/></a></section>}
  </div>
 </div>
}

export function SchoolWorkspaceOverview({username,items,onNavigate,pending}:{username:string;items:SchoolNavigationItem[];onNavigate:(id:string)=>void;pending?:ReactNode}){
 const groups=[...new Set(items.filter(i=>!['overview','account'].includes(i.id)).map(i=>i.group))]
 return <>
  <div className="hs-workspace-welcome"><div><p className="hs-eyebrow">HUISCHOOL · 校园工作台</p><h1>欢迎，{username}</h1><p>从今天的校园活动开始，让每一次参与与陪伴都有温度。</p></div></div>
  {pending}
  <section className="hs-overview-section" aria-label="可用功能"><h2>从这里开始</h2><div className="hs-workspace-shortcuts">{[...groups,'账号'].map(group=>{
   const item=items.find(i=>i.group===group)!
   return <a href={workspaceHref(item.id)} key={group} onClick={e=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();onNavigate(item.id)}}><item.icon size={24} aria-hidden="true"/><h3>{group==='账号'?'我的账号':group}</h3><p>{item.description}</p><span>{group==='账号'?'查看账号':`进入${item.label}`} <ArrowRight size={16}/></span></a>
  })}</div></section>
 </>
}
