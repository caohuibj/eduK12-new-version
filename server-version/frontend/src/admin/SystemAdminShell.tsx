import {useEffect,useRef,useState,type ReactNode} from 'react'
import {Link,useLocation} from 'react-router-dom'
import {ShieldCheck,KeyRound,LibraryBig,ClipboardCheck,FileCheck,LogOut,Moon,Sun} from 'lucide-react'
import {SYSTEM_HOME,SYSTEM_SURVEY_AUDIT} from './systemWorkspace'
import './system-admin.css'
const themeKey='eduk12:system-admin:theme:v1'
function initialTheme():'light'|'dark'{try{const saved=localStorage.getItem(themeKey);if(saved==='light'||saved==='dark')return saved}catch{/* Device preference is optional. */}return typeof window.matchMedia==='function'&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
export default function SystemAdminShell({children,username,loggingOut,onLogout}:{children:ReactNode;username:string;loggingOut:boolean;onLogout:()=>Promise<void>}){
 const {pathname}=useLocation(),[theme,setTheme]=useState(initialTheme),main=useRef<HTMLElement>(null),previous=useRef(pathname)
 useEffect(()=>{try{localStorage.setItem(themeKey,theme)}catch{/* Keep the current appearance if storage is unavailable. */}},[theme])
 useEffect(()=>{if(previous.current!==pathname)main.current?.focus();previous.current=pathname},[pathname])
 const links=[{path:'/admin/permissions',label:'管理授权',Icon:KeyRound,active:pathname==='/admin/permissions'||pathname===SYSTEM_HOME},
  {path:'/admin/scale-library-governance',label:'工具库治理',Icon:LibraryBig,active:['/admin/scale-library-governance','/admin/instrument-authorizations'].includes(pathname)},
  {path:'/admin/reporting-content',label:'报告内容',Icon:FileCheck,active:pathname==='/admin/reporting-content'},
  {path:SYSTEM_SURVEY_AUDIT,label:'数据审计',Icon:ClipboardCheck,active:[SYSTEM_SURVEY_AUDIT,'/admin/survey-system'].includes(pathname)}]
 return <div className="hui-app system-admin-shell" data-system-theme={theme}>
  <a className="system-skip" href="#hui-main">跳至主要内容</a>
  <header className="system-topbar"><Link className="system-brand" to={SYSTEM_HOME} aria-label="系统管理"><span className="system-brand-mark"><ShieldCheck size={25} aria-hidden="true"/></span><span><strong>系统管理</strong><small>账号 · 权限 · 平台治理</small></span></Link>
   <nav className="system-navigation" aria-label="主要导航">{links.map(({path,label,Icon,active})=><Link key={path} to={path} aria-current={active?'page':undefined}><Icon size={18} aria-hidden="true"/>{label}</Link>)}</nav>
   <div className="system-account"><span className="system-identity"><strong>{username}</strong><span>系统管理员</span></span><button type="button" disabled={loggingOut} onClick={()=>void onLogout()} aria-label={loggingOut?'正在退出…':'退出登录'}><LogOut size={17} aria-hidden="true"/><span>{loggingOut?'正在退出…':'退出登录'}</span></button><button type="button" className="system-theme" aria-label={theme==='dark'?'切换为浅色外观':'切换为深色外观'} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={18} aria-hidden="true"/>:<Moon size={18} aria-hidden="true"/>}</button></div>
  </header>
  <main id="hui-main" ref={main} tabIndex={-1} className="system-main">{children}</main>
  <footer className="system-footer">系统管理 · 操作可追溯，权限按范围生效</footer>
 </div>
}
