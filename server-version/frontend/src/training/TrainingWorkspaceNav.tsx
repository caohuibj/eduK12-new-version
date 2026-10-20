import {useRef} from 'react'
import {Link,useLocation} from 'react-router-dom'
import {Menu,X} from 'lucide-react'
import type {NavigationItem} from '../components/app-shell/navigation'
import './training-workspace-navigation.css'

export default function TrainingWorkspaceNav({items,activePath}:{items:NavigationItem[];activePath?:string}) {
 const location=useLocation(),surface=useRef<HTMLDetailsElement>(null),trigger=useRef<HTMLElement>(null)
 return <details key={location.pathname+location.search} ref={surface} className="training-workspace-menu" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();if(surface.current)surface.current.open=false;trigger.current?.focus()}}}>
  <summary ref={trigger}><Menu size={17} aria-hidden="true"/>导航菜单<span className="training-menu-close"><X size={16} aria-hidden="true"/></span></summary>
  <nav id="hui-navigation" aria-label="主要导航">{items.map(item=><Link key={item.path} to={item.path} aria-current={activePath===item.path?'page':undefined} onClick={()=>{if(surface.current)surface.current.open=false}}>{item.label}</Link>)}</nav>
 </details>
}
