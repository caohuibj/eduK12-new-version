import type {MouseEvent,ReactNode} from 'react'
import {ArrowRight} from 'lucide-react'
import {SchoolTaskHelp} from './SchoolTaskHelp'
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

export function SchoolProfessionalHome({items,username,schoolName,onNavigate,administrator=false}:{items:SchoolNavigationItem[];username:string;schoolName?:string;onNavigate:(id:string)=>void;administrator?:boolean}){
 return <div className="hs-overview hs-professional-home">
  <header className="hs-professional-home-heading"><div><h1>{administrator?'学校管理工作台':'心理教师工作台'}</h1><p>你好，{username}。{administrator?'查看校园活动，处理学校事务与授权范围内的群体报告。':'从校园活动、学校事务与专业支持开始今天的工作。'}</p></div>{schoolName&&<p className="hs-professional-school"><span>当前学校</span>{schoolName}</p>}</header>
  {sections(items).map(section=><section key={section.group} className="hs-professional-section" aria-label={section.group}><h2>{section.group}</h2><div className="hs-workspace-shortcuts">{section.items.map(item=><a key={item.id} href={workspaceHref(item.id)} onClick={event=>follow(event,item.id,onNavigate)}><span className="hs-professional-card-icon"><item.icon size={22} aria-hidden="true"/></span><div><h3>{item.label}</h3><p>{item.description}</p></div><ArrowRight size={17} aria-hidden="true"/></a>)}</div></section>)}
 </div>
}

export function SchoolProfessionalClassScope({children,admission=false,recovery=false}:{children:ReactNode;admission?:boolean;recovery?:boolean}){
 const title=admission||recovery?'选择班级':'选择学校和班级'
 const label=recovery?'恢复账号班级选择':admission?'审批班级选择':'学校与班级选择'
 const helpLabel=recovery?'学生账号恢复范围说明':admission?'班级注册与审批说明':'学校与班级使用说明'
 return <section className="hs-panel hs-professional-class-scope" aria-label={label}>
  <header><h2>{title}</h2><SchoolTaskHelp label={helpLabel} buttonText="使用说明">{recovery?<p>选择学校和班级后，处理该班级已获授权的账号恢复与注册异常。切换班级会清空当前填写内容和一次性凭据。</p>:admission?<><p>选择学校和班级，刷新后查看注册进度与审批条件。</p><p>学校管理员负责名册和注册窗口；心理教师在注册关闭、人数一致且无待处理异常后确认整班身份审批。</p><p>班级审批不代表校园活动已开放。</p></>:<><p>选择学校和班级后，可进入你已获授权的校园功能。</p><p>查看学校和班级；管理员可维护年级与班级。</p></>}</SchoolTaskHelp></header>
  {children}
 </section>
}
