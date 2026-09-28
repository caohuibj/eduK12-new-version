import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut, PanelLeft } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useCognitiveEnabled } from '../../contexts/CapabilitiesContext'
import { OrganizationProvider, useOrganization } from '../../contexts/OrganizationContext'
import OrganizationProductRoutes from '../../pages/organization/OrganizationProductRoutes'
import Footer from '../Footer'
import { ProductButton } from '../product-ui'
import StaffNavigation from './StaffNavigation'
import { homeFor, isAuthPath, isPublicAssessmentPath, shellModeFor } from './access'
import { activeNavigation, breadcrumbsFor, isStaffWorkspacePath, navigationFor, organizationNavigation, routeTitle } from './navigation'
import './app-shell.css'
import '../staff-ui/staff-ui.css'
import '../student-ui/student-ui.css'
import '../assessment-ui/assessment-ui.css'

function AppShellContent({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const cognitive = useCognitiveEnabled()
  const { organizations, total: organizationTotal, platformRole, active: activeOrganization, activeLoading: organizationLoading, activeError: organizationError, error: organizationListError, isLoading: organizationsLoading, refresh: refreshOrganizations, selectOrganization } = useOrganization()
  const location=useLocation(), navigate=useNavigate()
  const organizationProductRoute=location.pathname==='/organizations'||location.pathname.startsWith('/organizations/')||location.pathname==='/organization-tasks'
  const organizationWorkspaceRoute=location.pathname.startsWith('/organizations/')
  const desiredMode=shellModeFor(location.pathname), guestClassroom=location.pathname.startsWith('/student/classroom/')&&user?.role!=='STUDENT'
  const mode=guestClassroom||(desiredMode==='standard'&&!user)?'public':desiredMode
  const roleClass=user?.role?` hui-app--${user.role.toLowerCase()}`:''
  const assessmentSurfaceClass=mode==='focused'?' hui-app--assessment-runner':''
  const reportSurfaceClass=/^\/student\/(?:scales\/result\/|questionnaires\/result\/|cognitive\/sessions\/[^/]+\/result|situational\/attempts\/[^/]+\/result|composite\/attempts\/[^/]+\/report)/.test(location.pathname)||/^\/relational\/attempts\/[^/]+\/report/.test(location.pathname)?' hui-app--report-surface':''
  const studentSubmitClass=/^\/student\/(?:assignments|checkins)\/[^/]+$/.test(location.pathname)?' hui-app--student-submit':''
  const entryMode=location.pathname==='/'||isAuthPath(location.pathname)
  const staffMode=mode==='standard'&&(user?.role==='ADMIN'||user?.role==='TEACHER'), staffWorkspace=staffMode&&isStaffWorkspacePath(location.pathname)
  const routeOrganizationId=matchPath('/organizations/:organizationId/*',location.pathname)?.params.organizationId
  const displayOrganization=!routeOrganizationId||routeOrganizationId==='new'||activeOrganization?.organization.id===routeOrganizationId?activeOrganization:null
  const items=[...navigationFor(user?.role,cognitive),...(user?organizationNavigation(displayOrganization?.organization.id,displayOrganization?.allowedActions,platformRole):[])]
  const active=activeNavigation(items,location.pathname), title=routeTitle(location.pathname,active), breadcrumbs=breadcrumbsFor(location.pathname,homeFor(user?.role),active,displayOrganization?.organization.name)
  const mainRef=useRef<HTMLElement>(null), toggleRef=useRef<HTMLButtonElement>(null), previousPath=useRef(location.pathname)
  const [openPath,setOpenPath]=useState<string|null>(null),[loggingOut,setLoggingOut]=useState(false),menuOpen=openPath===location.pathname
  const onNavigate=(path:string)=>{setOpenPath(null);if(path===location.pathname)mainRef.current?.focus()}
  useEffect(()=>{if(organizationError||!user||mode!=='standard'||activeOrganization||organizationLoading||organizations.length!==1)return;void selectOrganization(organizations[0].id)},[user,mode,activeOrganization,organizationLoading,organizations,selectOrganization,organizationError])
  useEffect(()=>{if(mode==='display')return;document.title=`${title==='Huisurvey'?'':`${title} · `}Huisurvey`;if(previousPath.current!==location.pathname&&mode!=='focused')mainRef.current?.focus();previousPath.current=location.pathname},[location.pathname,title,mode])
  if(mode==='display')return <>{children}</>
  return <div className={`hui-app hui-app--${mode}${roleClass}${staffMode?' hui-app--staff':''}${assessmentSurfaceClass}${reportSurfaceClass}${studentSubmitClass}${entryMode?' hui-app--entry':''}`} data-shell-mode={mode}>
    <div className="hui-product"><a className="hui-skip" href="#hui-main" onClick={()=>mainRef.current?.focus()}>跳到主要内容</a></div>
    {!entryMode&&<header className="hui-product hui-app-header">{mode==='focused'?<span className="hui-brand">Huisurvey</span>:<Link className="hui-brand" to={homeFor(user?.role)}>Huisurvey</Link>}
      {mode==='standard'&&<ProductButton ref={toggleRef} className="hui-menu-toggle" aria-expanded={menuOpen} aria-controls="hui-navigation" onKeyDown={e=>{if(e.key==='Escape')setOpenPath(null)}} onClick={()=>setOpenPath(menuOpen?null:location.pathname)}><PanelLeft size={18} aria-hidden="true"/>导航菜单</ProductButton>}
      <div className="hui-account">{isPublicAssessmentPath(location.pathname)?<span>公开参与</span>:user?<span>{user.nickname||user.username} · {{STUDENT:'学生',TEACHER:'教师',ADMIN:'管理员',PARENT:'家长'}[user.role]}</span>:<span>欢迎使用</span>}
        {user&&mode==='standard'&&(organizations.length>0||organizationsLoading)&&<label className="hui-organization-switch"><span>组织</span><select aria-label="当前组织" value={displayOrganization?.organization.id||''} disabled={organizationLoading||organizationsLoading} onChange={e=>{const id=e.target.value;if(!id)return;if(organizationWorkspaceRoute)navigate(`/organizations/${encodeURIComponent(id)}`);else void selectOrganization(id)}}><option value="" disabled>{organizationLoading||organizationsLoading?'正在加载…':'选择组织'}</option>{displayOrganization&&!organizations.some(i=>i.id===displayOrganization.organization.id)&&<option value={displayOrganization.organization.id}>{displayOrganization.organization.name}</option>}{organizations.map(o=><option key={o.id} value={o.id}>{o.name}{o.status==='SUSPENDED'?'（已暂停）':''}</option>)}</select></label>}
        {staffMode&&organizationTotal>organizations.length&&<Link to="/organizations">更多组织</Link>}
        {user&&mode==='standard'&&(organizationError||organizationListError)&&<button type="button" className="hui-context-retry" onClick={()=>{if(routeOrganizationId&&routeOrganizationId!=='new')void selectOrganization(routeOrganizationId);else void refreshOrganizations()}}>组织连接失败，重试</button>}
        {user&&mode==='standard'&&<ProductButton disabled={loggingOut} onClick={async()=>{setLoggingOut(true);try{await logout()}finally{setLoggingOut(false)}}}><LogOut size={16} aria-hidden="true"/>{loggingOut?'正在退出…':'退出登录'}</ProductButton>}
      </div>
    </header>}
    <div className="hui-app-body">{mode==='standard'&&<nav id="hui-navigation" aria-label="主要导航" className={`hui-product hui-navigation ${menuOpen?'hui-navigation--open':''}`} onKeyDown={e=>{if(e.key==='Escape'){setOpenPath(null);toggleRef.current?.focus()}}}>{staffMode?<StaffNavigation items={items} activePath={active?.path} onNavigate={onNavigate}/>:items.map(item=><Link key={item.path} to={item.path} aria-current={active?.path===item.path?'page':undefined} onClick={()=>onNavigate(item.path)}>{item.label}</Link>)}</nav>}
      <div className="hui-app-content">{mode==='standard'&&<nav className="hui-product hui-breadcrumb" aria-label="当前位置"><ol>{breadcrumbs.map((crumb,index)=><li key={`${index}:${crumb.label}`}>{index>0&&<ChevronRight size={14} aria-hidden="true"/>}{crumb.path?<Link to={crumb.path}>{crumb.label}</Link>:<span aria-current="page">{crumb.label}</span>}</li>)}</ol></nav>}
        <main id="hui-main" ref={mainRef} tabIndex={-1} className={`hui-app-main ${(isAuthPath(location.pathname)||location.pathname==='/profile'||location.pathname==='/student/profile'||user?.mustChangePassword)?'hui-auth-content':''}`}>{organizationProductRoute?<OrganizationProductRoutes/>:staffWorkspace?<div className="hui-staff-workspace" data-staff-workspace="true">{children}</div>:children}</main>
      </div>
    </div>{!entryMode&&mode!=='focused'&&<Footer variant="light"/>}
  </div>
}
export default function AppShell({children}:{children:ReactNode}){return <OrganizationProvider><AppShellContent>{children}</AppShellContent></OrganizationProvider>}
