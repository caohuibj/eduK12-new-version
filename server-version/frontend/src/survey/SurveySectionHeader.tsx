import type { ReactNode } from 'react'
import { ArrowDownRight } from 'lucide-react'
import { surveySectionMeta } from './survey-section-meta'
import './survey-sections.css'

export function SurveySectionHeader({section,title,goal,children,headingId,showNavigation=true}:{
  section:keyof typeof surveySectionMeta;title:string;goal?:string;children?:ReactNode;headingId?:string;showNavigation?:boolean
}){
  const meta=surveySectionMeta[section],Icon=meta.icon
  return <header className="survey-section-header">
    <div className="survey-section-title"><span className="survey-section-icon"><Icon size={25} strokeWidth={1.5} aria-hidden="true"/></span>
      <div><h2 id={headingId} tabIndex={headingId?-1:undefined}>{title}</h2><p className="survey-section-goal">{goal??meta.goal}</p></div>
    </div>
    {showNavigation&&<nav className="survey-section-shortcuts" aria-label={title+'快捷导航'}>{meta.links.map(([label,id],index)=><a key={id} href={'#'+id}><span className="survey-shortcut-number" aria-hidden="true">{index+1}</span><span>{label}</span><ArrowDownRight size={16} aria-hidden="true"/></a>)}</nav>}
    {children&&<div className="survey-section-policy">{children}</div>}
  </header>
}
