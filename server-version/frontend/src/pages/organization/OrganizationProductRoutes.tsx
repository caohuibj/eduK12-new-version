import { useEffect, useState } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import { ProductPage, ProductStatus } from '../../components/product-ui'
import { RouteLoading } from '../../components/app-shell/RouteAccess'
import OrganizationCreatePage from './OrganizationCreatePage'
import OrganizationTasksPage from './OrganizationTasksPage'
import OrganizationAdminPage from './OrganizationAdminPage'
import OrganizationRunListPage from './OrganizationRunListPage'
import OrganizationRunDetailPage from './OrganizationRunDetailPage'
import OrganizationReportingPage from './OrganizationReportingPage'
import OrganizationDeliveryPage from './OrganizationDeliveryPage'

type RouteContextCheck = {
  key: string
  status: 'checking' | 'verified' | 'failed'
}

export default function OrganizationProductRoutes() {
  const { user, isLoading } = useAuth()
  const { active, activeError, selectOrganization } = useOrganization()
  const location = useLocation()
  const routeOrganizationId = location.pathname === '/organizations/new' ? '' : location.pathname.split('/')[2] || ''
  const context = active?.organization.id === routeOrganizationId ? active : null
  const routeContextKey = user && routeOrganizationId ? `${user.id}:${routeOrganizationId}` : ''
  const [routeContextCheck, setRouteContextCheck] = useState<RouteContextCheck | null>(null)
  const canOpenReporting = context?.allowedActions?.includes('REPORTING') === true
  const canOpenDelivery = context?.allowedActions?.includes('DELIVERY') === true

  useEffect(() => {
    if (isLoading || !user || !routeOrganizationId || !routeContextKey) return
    if (context) {
      setRouteContextCheck((current) => current?.key === routeContextKey && current.status === 'verified'
        ? current
        : { key: routeContextKey, status: 'verified' })
      return
    }

    let cancelled = false
    setRouteContextCheck({ key: routeContextKey, status: 'checking' })
    void selectOrganization(routeOrganizationId).then((projection) => {
      if (cancelled) return
      setRouteContextCheck({
        key: routeContextKey,
        status: projection?.organization.id === routeOrganizationId ? 'verified' : 'failed',
      })
    })
    return () => {
      cancelled = true
    }
  }, [context, isLoading, routeContextKey, routeOrganizationId, selectOrganization, user])

  if (isLoading) return <RouteLoading />
  if (!user) {
    return (
      <ProductPage>
        <ProductStatus kind="warning" title="需要登录" actions={<Link to="/">返回登录入口</Link>}>
          Organization 产品空间只接受当前已认证会话，具体组织权限由服务器实时验证。
        </ProductStatus>
      </ProductPage>
    )
  }

  if (location.pathname === '/organizations/new') return <OrganizationCreatePage />
  if (location.pathname === '/organization-tasks') return <OrganizationTasksPage key={user.id} />

  if (routeOrganizationId && !context) {
    const currentCheck = routeContextCheck?.key === routeContextKey ? routeContextCheck : null
    if (currentCheck?.status === 'failed') {
      return (
        <ProductPage>
          <ProductStatus kind="error" title="无法进入组织空间" actions={<Link to="/">返回首页</Link>}>
            {activeError || '当前账户没有此组织的有效访问上下文。'}
          </ProductStatus>
        </ProductPage>
      )
    }
    return <ProductPage><ProductStatus kind="pending" title="正在验证组织上下文">服务器正在重新确认当前 Organization authority。</ProductStatus></ProductPage>
  }

  const organizationRoot = `/organizations/${encodeURIComponent(routeOrganizationId)}`
  return (
    <>
      {routeOrganizationId && context && (
        <nav className="hui-product mb-4 flex flex-wrap gap-3 text-sm" aria-label="Organization 产品导航">
          <Link to={organizationRoot}>组织</Link>
          {context.allowedActions?.includes('RUNS') && <Link to={`${organizationRoot}/runs`}>Runs</Link>}
          {canOpenReporting && <Link to={`${organizationRoot}/reporting`}>Reporting</Link>}
          {canOpenDelivery && <Link to={`${organizationRoot}/delivery`}>Safety / CSV</Link>}
        </nav>
      )}
      <Routes key={`${user.id}:${location.pathname}`}>
        <Route path="/organizations/:organizationId" element={<OrganizationAdminPage />} />
        <Route path="/organizations/:organizationId/runs" element={<OrganizationRunListPage />} />
        <Route path="/organizations/:organizationId/runs/:runId" element={<OrganizationRunDetailPage />} />
        <Route path="/organizations/:organizationId/reporting" element={<OrganizationReportingPage />} />
        <Route path="/organizations/:organizationId/delivery" element={<OrganizationDeliveryPage />} />
        <Route path="/organizations/:organizationId/*" element={<OrganizationAdminPage />} />
        <Route path="*" element={<ProductPage><ProductStatus kind="warning" title="组织路径无效">请从当前组织选择器进入 Organization 产品空间。</ProductStatus></ProductPage>} />
      </Routes>
    </>
  )
}
