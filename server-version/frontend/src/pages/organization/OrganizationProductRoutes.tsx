import { Routes, Route, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ProductPage, ProductStatus } from '../../components/product-ui'
import { RouteLoading } from '../../components/app-shell/RouteAccess'
import OrganizationAdminPage from './OrganizationAdminPage'
import OrganizationRunListPage from './OrganizationRunListPage'
import OrganizationRunDetailPage from './OrganizationRunDetailPage'

export default function OrganizationProductRoutes() {
  const { user, isLoading } = useAuth()

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

  return (
    <Routes>
      <Route path="/organizations/:organizationId" element={<OrganizationAdminPage />} />
      <Route path="/organizations/:organizationId/runs" element={<OrganizationRunListPage />} />
      <Route path="/organizations/:organizationId/runs/:runId" element={<OrganizationRunDetailPage />} />
      <Route path="/organizations/:organizationId/*" element={<OrganizationAdminPage />} />
      <Route path="*" element={<ProductPage><ProductStatus kind="warning" title="组织路径无效">请从当前组织选择器进入 Organization 产品空间。</ProductStatus></ProductPage>} />
    </Routes>
  )
}
