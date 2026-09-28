import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Building2, ChevronDown, FolderOpen, Layers3, Search, ShieldCheck, UserRound } from 'lucide-react'
import { navigationSections, type NavigationItem, type NavigationSection } from './navigation'
const icons = { teaching: BookOpen, assessment: Layers3, organization: Building2, content: FolderOpen, system: ShieldCheck, account: UserRound }
function Group({ section, label, items, activePath, searching, onNavigate }: { section: NavigationSection; label: string; items: NavigationItem[]; activePath?: string; searching: boolean; onNavigate: (path: string) => void }) {
  const id=useId(), isActive=items.some(item=>item.path===activePath), [expanded,setExpanded]=useState(isActive||section==='teaching'||section==='assessment')
  useEffect(()=>{if(isActive)setExpanded(true)},[isActive,activePath])
  const Icon=icons[section], open=searching||expanded
  return <section className="hui-nav-group"><button type="button" className="hui-nav-group__toggle" aria-expanded={open} aria-controls={id} onClick={()=>setExpanded(!expanded)} disabled={searching}><Icon size={16} aria-hidden="true"/><span>{label}</span><ChevronDown size={14} aria-hidden="true" className="hui-nav-chevron"/></button><ul id={id} hidden={!open} className="hui-nav-group__items">{items.map(item=><li key={item.path}><Link to={item.path} aria-current={item.path===activePath?'page':undefined} onClick={()=>onNavigate(item.path)}>{item.label}</Link></li>)}</ul></section>
}
export default function StaffNavigation({items,activePath,onNavigate}:{items:NavigationItem[];activePath?:string;onNavigate:(path:string)=>void}) {
  const [query,setQuery]=useState(''), normalized=query.trim().toLocaleLowerCase(), visible=items.filter(item=>!normalized||`${item.label} ${item.path}`.toLocaleLowerCase().includes(normalized))
  return <><div className="hui-nav-intro"><span>HUISURVEY</span><strong>管理工作空间</strong></div><label className="hui-nav-search"><Search size={16} aria-hidden="true"/><span className="sr-only">查找管理页面</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="查找页面"/></label>{navigationSections.map(section=>{const entries=visible.filter(item=>item.section===section.id);return entries.length?<Group key={section.id} section={section.id} label={section.label} items={entries} activePath={activePath} searching={Boolean(normalized)} onNavigate={path=>{setQuery('');onNavigate(path)}}/>:null})}{visible.length===0&&<p role="status" className="hui-nav-empty">没有匹配的页面。请尝试其他名称。</p>}</>
}
