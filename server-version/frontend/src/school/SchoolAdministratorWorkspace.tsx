import {useState,type ReactNode} from 'react'
import {SchoolReportHeader} from './SchoolReportPresentation'

export function SchoolAdminPanel({title,label,help,children,className=''}:{title:string;label:string;help:ReactNode;children:ReactNode;className?:string}){
 return <section className={'hs-panel hs-admin-panel '+className}><SchoolReportHeader compact title={title} label={label}>{help}</SchoolReportHeader>{children}</section>
}

export function SchoolAdminSections({panes,label,busy=false}:{panes:Array<{id:string;title:string;content:ReactNode}>;label:string;busy?:boolean}){
 const [active,setActive]=useState(panes[0]?.id)
 return <div className="hs-admin-sections"><nav className="hs-admin-tabs" aria-label={label}>{panes.map(pane=><button key={pane.id} type="button" aria-pressed={active===pane.id} aria-controls={'hs-admin-pane-'+pane.id} disabled={busy} onClick={()=>setActive(pane.id)}>{pane.title}</button>)}</nav>{panes.map(pane=><div key={pane.id} id={'hs-admin-pane-'+pane.id} className="hs-admin-pane" role="region" aria-label={pane.title} hidden={active!==pane.id}>{pane.content}</div>)}</div>
}
