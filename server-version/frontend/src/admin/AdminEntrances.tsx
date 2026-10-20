import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ProductPage, ProductStatus } from '../components/product-ui'
import { businessRoleLabel,entryLabels,entryPaths,hasAdminEntry,type AdminEntry } from './authority'
import AdminStepUp from './AdminStepUp'
export default function AdminEntrances(){
  const {user}=useAuth()
  return <ProductPage><h1>管理入口</h1><p>当前账号只能使用已授权的管理入口。业务身份与学校、课程、研究项目范围分别校验。</p>
    {user&&<p role="note">业务身份：{businessRoleLabel(user)}。管理资格与业务身份分别保存；本页只显示当前管理授权。</p>}
    {Boolean(user?.platformRole==='SYSTEM_ADMIN'||user?.entryGrants?.length)&&<AdminStepUp/>}
    <ul>{user?.platformRole==='SYSTEM_ADMIN'&&<li><Link to="/admin/permissions">系统治理与入口授权</Link></li>}
      {(Object.keys(entryPaths) as AdminEntry[]).filter(entry=>hasAdminEntry(user,entry)).map(entry=><li key={entry}><Link to={entryPaths[entry]}>{entryLabels[entry]}</Link></li>)}
    </ul>
    {!user?.entryGrants?.length&&user?.platformRole!=='SYSTEM_ADMIN'&&<ProductStatus kind="warning" title="尚无管理授权">请联系系统管理员授予所需入口权限。</ProductStatus>}
  </ProductPage>
}
