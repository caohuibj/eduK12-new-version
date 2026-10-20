import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ProductPage, ProductStatus } from '../components/product-ui'
import { entryLabels, hasAdminEntry } from './authority'
import AdminStepUp from './AdminStepUp'
export default function AdminEntrances(){
  const {user}=useAuth()
  return <ProductPage><h1>管理入口</h1><p>当前账号只能使用已授权的管理入口。业务身份与学校、课程、研究项目范围分别校验。</p>
    <AdminStepUp/>
    <ul>{user?.platformRole==='SYSTEM_ADMIN'&&<li><Link to="/admin/permissions">系统治理与入口授权</Link></li>}
      {hasAdminEntry(user,'TRAINING')&&<li><Link to="/admin/training">{entryLabels.TRAINING}</Link></li>}
      {hasAdminEntry(user,'SURVEY')&&<li><Link to="/admin/survey-researchers">{entryLabels.SURVEY}</Link></li>}
      {(hasAdminEntry(user,'HUISCHOOL')||hasAdminEntry(user,'HUITEACHER'))&&<li><Link to="/admin/education-products">学校产品治理</Link></li>}
    </ul>
    {!user?.entryGrants?.length&&user?.platformRole!=='SYSTEM_ADMIN'&&<ProductStatus kind="warning" title="尚无管理授权">请联系系统管理员授予所需入口权限。</ProductStatus>}
  </ProductPage>
}
