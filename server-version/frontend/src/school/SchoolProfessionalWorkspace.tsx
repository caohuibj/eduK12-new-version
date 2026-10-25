import type {MouseEvent} from 'react'
import {ArrowRight} from 'lucide-react'
import {workspaceHref,type SchoolNavigationItem} from './school-navigation'

const sections=(items:SchoolNavigationItem[])=>{
 const entries=items.filter(item=>!['overview','account'].includes(item.id))
 return [...new Set(entries.map(item=>item.group))].map(group=>({group,items:entries.filter(item=>item.group===group)}))
}
function follow(event:MouseEvent<HTMLAnchorElement>,id:string,onNavigate:(id:string)=>void){
 if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
 event.preventDefault();onNavigate(id)
}

export function SchoolProfessionalNavigation({items,page,onNavigate}:{items:SchoolNavigationItem[];page:string;onNavigate:(id:string)=>void}){
 const groups=sections(items)
 const active=groups.find(section=>section.items.some(item=>item.id===page))
 return <>
  <nav className="hs-professional-groups" aria-label="校园功能分组">{groups.map(section=>{
   const destination=section.items.find(item=>item.id===page)||section.items.find(item=>item.id==='activities')||section.items[0]
   return <a key={section.group} href={workspaceHref(destination.id)} aria-current={active?.group===section.group?'true':undefined} onClick={event=>follow(event,destination.id,onNavigate)}>{section.group}</a>
  })}</nav>
  {active&&<nav className="hs-professional-pages" aria-label={active.group+'功能入口'}>{active.items.map(item=><a key={item.id} href={workspaceHref(item.id)} aria-current={page===item.id?'page':undefined} onClick={event=>follow(event,item.id,onNavigate)}><item.icon size={17} aria-hidden="true"/>{item.label}</a>)}</nav>}
 </>
}

export function SchoolProfessionalHome({items,username,schoolName,onNavigate}:{items:SchoolNavigationItem[];username:string;schoolName?:string;onNavigate:(id:string)=>void}){
 return <div className="hs-overview hs-professional-home">
  <header className="hs-professional-home-heading"><div><h1>心理教师工作台</h1><p>你好，{username}。从校园活动、学校事务与专业支持开始今天的工作。</p></div>{schoolName&&<p className="hs-professional-school"><span>当前学校</span>{schoolName}</p>}</header>
  {sections(items).map(section=><section key={section.group} className="hs-professional-section" aria-label={section.group}><h2>{section.group}</h2><div className="hs-workspace-shortcuts">{section.items.map(item=><a key={item.id} href={workspaceHref(item.id)} onClick={event=>follow(event,item.id,onNavigate)}><span className="hs-professional-card-icon"><item.icon size={22} aria-hidden="true"/></span><div><h3>{item.label}</h3><p>{item.description}</p></div><ArrowRight size={17} aria-hidden="true"/></a>)}</div></section>)}
 </div>
}
