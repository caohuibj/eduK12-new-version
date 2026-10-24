import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogOut, Moon, Sun, UsersRound, LibraryBig } from 'lucide-react'
import { productOrigins, SURVEY_ADMIN_PATH } from '../products/origins'
import { SurveyAppearance, useSurveyAppearance } from './SurveyAppearance'
import { SurveyBrand } from './SurveyBrand'
import { surveyAppearanceHref } from './survey-appearance-links'
import './survey-admin-shell.css'

function ManagementFrame({ children, username, loggingOut, onLogout }: {
  children: ReactNode; username: string; loggingOut: boolean; onLogout: () => Promise<void>
}) {
  const location=useLocation(), main=useRef<HTMLElement>(null), previous=useRef(location.pathname)
  const { mode, theme, setMode }=useSurveyAppearance(), origins=productOrigins()
  const library=location.pathname==='/admin/scale-library-governance'
  useEffect(()=>{
    if(previous.current!==location.pathname)main.current?.focus()
    previous.current=location.pathname
  },[location.pathname])
  return <div className="hui-app hui-survey-admin-shell survey-admin-frame">
    <a className="survey-skip-link" href="#hui-main">跳至主要内容</a>
    <header className="survey-admin-topbar">
      <div className="survey-admin-topbar-brand"><SurveyBrand href={origins?surveyAppearanceHref(origins.survey+'/',mode):'/'}/></div>
      <nav className="survey-admin-primary-nav" aria-label="主要导航">
        <Link to={SURVEY_ADMIN_PATH} aria-current={!library?'page':undefined}><UsersRound size={17} aria-hidden="true"/>研究者授权</Link>
        <Link to="/admin/scale-library-governance?workspace=survey" aria-current={library?'page':undefined}><LibraryBig size={17} aria-hidden="true"/>工具库审批</Link>
      </nav>
      <div className="survey-admin-topbar-account"><span className="survey-admin-identity"><strong>{username}</strong><span>Survey 管理员</span></span>
        <button className="survey-admin-logout" type="button" aria-label={loggingOut?'正在退出…':'退出登录'} disabled={loggingOut} onClick={()=>void onLogout()}><LogOut size={16} aria-hidden="true"/><span>{loggingOut?'正在退出…':'退出登录'}</span></button>
        <button type="button" className="survey-admin-theme-toggle" aria-label={theme==='dark'?'切换为浅色外观':'切换为深色外观'} title={theme==='dark'?'切换为浅色外观':'切换为深色外观'} onClick={()=>setMode(theme==='dark'?'light':'dark')}>
          {theme==='dark'?<Sun size={19} aria-hidden="true"/>:<Moon size={19} aria-hidden="true"/>}
        </button>
      </div>
    </header>
    <main id="hui-main" ref={main} tabIndex={-1} className="survey-admin-main">{children}</main>
    <footer>Research · 观风知微</footer>
  </div>
}
export default function SurveyAdminShell(props: Parameters<typeof ManagementFrame>[0]) {
  return <SurveyAppearance><ManagementFrame {...props}/></SurveyAppearance>
}
