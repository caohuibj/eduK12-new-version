import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useCognitiveEnabled } from '../../contexts/CapabilitiesContext'
import { OrganizationProvider, useOrganization } from '../../contexts/OrganizationContext'
import OrganizationProductRoutes from '../../pages/organization/OrganizationProductRoutes'
import Footer from '../Footer'
import { ProductButton } from '../product-ui'
import { homeFor, isAuthPath, isPublicAssessmentPath, shellModeFor } from './access'
import { activeNavigation, navigationFor, routeTitle } from './navigation'
import './app-shell.css'

function AppShellContent({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const cognitive = useCognitiveEnabled()
  const {
    organizations,
    active: activeOrganization,
    activeLoading: organizationLoading,
    activeError: organizationError,
    selectOrganization,
  } = useOrganization()
  const location = useLocation()
  const navigate = useNavigate()
  const organizationRoute = location.pathname.startsWith('/organizations/')
  const desiredMode = shellModeFor(location.pathname)
  const guestClassroom = location.pathname.startsWith('/student/classroom/') && user?.role !== 'STUDENT'
  const mode = guestClassroom || (desiredMode === 'standard' && !user) ? 'public' : desiredMode
  const items = navigationFor(user?.role, cognitive)
  const active = activeNavigation(items, location.pathname)
  const title = routeTitle(location.pathname, active)
  const mainRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const previousPath = useRef(location.pathname)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const menuOpen = openPath === location.pathname
  const reportingContext = activeOrganization?.access
  const reportingDenied = reportingContext?.explicitDenies.some((permission) => ['*', 'REPORT_READ', 'ORG_GROUP_REPORT_V1'].includes(permission)) === true
  const canOpenReporting = Boolean(
    activeOrganization?.organization.status === 'ACTIVE'
    && reportingContext?.membershipId
    && !reportingDenied
    && (
      reportingContext.orgRole === 'ORG_ADMIN'
      || reportingContext.capabilities.includes('PSYCHOLOGY_STAFF')
      || reportingContext.personas.includes('TEACHER')
      || reportingContext.personas.includes('COUNSELOR')
    ),
  )

  useEffect(() => {
    if (!user || mode !== 'standard' || activeOrganization || organizationLoading || organizations.length !== 1) return
    void selectOrganization(organizations[0].id)
  }, [user, mode, activeOrganization, organizationLoading, organizations, selectOrganization])

  useEffect(() => {
    if (mode === 'display') return
    document.title = `${title === 'Huisurvey' ? '' : `${title} · `}Huisurvey`
    if (previousPath.current !== location.pathname && mode !== 'focused') mainRef.current?.focus()
    previousPath.current = location.pathname
  }, [location.pathname, title, mode])

  if (mode === 'display') return <>{children}</>
  return (
    <div className={`hui-app hui-app--${mode}`} data-shell-mode={mode}>
      <div className="hui-product"><a className="hui-skip" href="#hui-main" onClick={() => mainRef.current?.focus()}>跳到主要内容</a></div>
      <header className="hui-product hui-app-header">
        {mode === 'focused' ? <span className="hui-brand">Huisurvey</span> : <Link className="hui-brand" to={homeFor(user?.role)}>Huisurvey</Link>}
        {mode === 'standard' && <ProductButton ref={toggleRef} className="hui-menu-toggle" aria-expanded={menuOpen} aria-controls="hui-navigation" onKeyDown={(event) => { if (event.key === 'Escape') setOpenPath(null) }} onClick={() => setOpenPath(menuOpen ? null : location.pathname)}>导航菜单</ProductButton>}
        <div className="hui-account">
          {isPublicAssessmentPath(location.pathname) ? <span>公开参与</span> : user ? <span>{user.nickname || user.username} · {{ STUDENT: '学生', TEACHER: '教师', ADMIN: '管理员', PARENT: '家长' }[user.role]}</span> : <span>欢迎使用</span>}
          {user && mode === 'standard' && organizations.length > 0 && (
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
              <span>组织</span>
              <select
                aria-label="当前组织"
                className="min-h-11 max-w-56 rounded-lg border border-slate-300 bg-white px-3 text-slate-900"
                value={activeOrganization?.organization.id || ''}
                disabled={organizationLoading}
                onChange={(event) => {
                  const organizationId = event.target.value
                  if (!organizationId) return
                  if (organizationRoute) navigate(`/organizations/${encodeURIComponent(organizationId)}`)
                  else void selectOrganization(organizationId)
                }}
              >
                <option value="" disabled>{organizationLoading ? '正在加载…' : '选择组织'}</option>
                {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}{organization.status === 'SUSPENDED' ? '（已暂停）' : ''}</option>)}
              </select>
            </label>
          )}
          {user && mode === 'standard' && activeOrganization && <><Link to={`/organizations/${encodeURIComponent(activeOrganization.organization.id)}`}>组织空间</Link>{activeOrganization.access.canGovern && <Link to={`/organizations/${encodeURIComponent(activeOrganization.organization.id)}/runs`}>Runs</Link>}{canOpenReporting && <Link to={`/organizations/${encodeURIComponent(activeOrganization.organization.id)}/reporting`}>Reporting</Link>}</>}
          {user && mode === 'standard' && organizationError && <span role="status" className="text-sm text-red-700">组织上下文不可用</span>}
          {user && mode === 'standard' && <ProductButton disabled={loggingOut} onClick={async () => { setLoggingOut(true); try { await logout() } finally { setLoggingOut(false) } }}>{loggingOut ? '正在退出…' : '退出登录'}</ProductButton>}
        </div>
      </header>
      <div className="hui-app-body">
        {mode === 'standard' && <nav id="hui-navigation" aria-label="主要导航" className={`hui-product hui-navigation ${menuOpen ? 'hui-navigation--open' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape') { setOpenPath(null); toggleRef.current?.focus() } }}>
          {items.map((item) => <Link key={item.path} to={item.path} aria-current={active?.path === item.path ? 'page' : undefined} onClick={() => { setOpenPath(null); if (item.path === location.pathname) toggleRef.current?.focus() }}>{item.label}</Link>)}
        </nav>}
        <div className="hui-app-content">
          {mode === 'standard' && <nav className="hui-product hui-breadcrumb" aria-label="当前位置"><Link to={homeFor(user?.role)}>首页</Link>{organizationRoute ? <><span aria-hidden="true">/</span><span>组织空间</span></> : active && <><span aria-hidden="true">/</span>{active.path === location.pathname ? <span>{active.label}</span> : <Link to={active.path}>{active.label}</Link>}</>}{!organizationRoute && title !== active?.label && <><span aria-hidden="true">/</span><span>{title}</span></>}</nav>}
          <main id="hui-main" ref={mainRef} tabIndex={-1} className={`hui-app-main ${(isAuthPath(location.pathname) || location.pathname === '/profile' || location.pathname === '/student/profile' || user?.mustChangePassword) ? 'hui-auth-content' : ''}`}>{organizationRoute ? <OrganizationProductRoutes /> : children}</main>
        </div>
      </div>
      {mode !== 'focused' && <Footer variant="light" />}
    </div>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  return <OrganizationProvider><AppShellContent>{children}</AppShellContent></OrganizationProvider>
}
