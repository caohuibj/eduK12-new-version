import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import { ProductPage, ProductStatus } from '../../components/product-ui'
import { RouteLoading } from '../../components/app-shell/RouteAccess'
import OrganizationAdminPage from './OrganizationAdminPage'
import OrganizationRunListPage from './OrganizationRunListPage'
import OrganizationRunDetailPage from './OrganizationRunDetailPage'
import OrganizationReportingPage from './OrganizationReportingPage'
import OrganizationDeliveryPage from './OrganizationDeliveryPage'

export default function OrganizationProductRoutes() {
  const { user, isLoading } = useAuth()
  const { active } = useOrganization()
  const location = useLocation()
  const routeOrganizationId = location.pathname.split('/')[2] || ''
  const context = active?.organization.id === routeOrganizationId ? active : null
  const reportingDenied = context?.access.explicitDenies.some((permission) => ['*', 'REPORT_READ', 'ORG_GROUP_REPORT_V1'].includes(permission)) === true
  const canOpenReporting = Boolean(
    context?.organization.status === 'ACTIVE'
    && context.access.membershipId
    && !reportingDenied
    && (
      context.access.orgRole === 'ORG_ADMIN'
      || context.access.capabilities.includes('PSYCHOLOGY_STAFF')
      || context.access.personas.includes('TEACHER')
      || context.access.personas.includes('COUNSELOR')
    ),
  )

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

  const organizationRoot = `/organizations/${encodeURIComponent(routeOrganizationId)}`
  return (
    <>
      {routeOrganizationId && (
        <nav className="hui-product mb-4 flex flex-wrap gap-3 text-sm" aria-label="Organization 产品导航">
          <Link to={organizationRoot}>组织</Link>
          {context?.access.canGovern && <Link to={`${organizationRoot}/runs`}>Runs</Link>}
          {canOpenReporting && <Link to={`${organizationRoot}/reporting`}>Reporting</Link>}
          {canOpenReporting && <Link to={`${organizationRoot}/delivery`}>Safety / CSV</Link>}
        </nav>
      )}
      <Routes>
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
