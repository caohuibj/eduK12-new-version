import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ProductPage, ProductStatus } from '../components/product-ui'
import { RouteLoading } from '../components/app-shell/RouteAccess'
import { hasAdminEntry, type AdminEntry } from './authority'
import FirstLoginPasswordChange from '../pages/FirstLoginPasswordChange'
export default function AdminAccess({ children, system=false, entries, surveyOnly=false }: {children:ReactNode;system?:boolean;entries?:AdminEntry[];surveyOnly?:boolean}) {
  const {user,isLoading}=useAuth(), location=useLocation()
  if(isLoading)return <RouteLoading/>
  if(!user)return <Navigate replace to={'/admin/login?returnTo='+encodeURIComponent(location.pathname)}/>
  if(user.mustChangePassword)return <FirstLoginPasswordChange/>
  if((surveyOnly&&user.platformRole==='SYSTEM_ADMIN')||(system&&user.platformRole!=='SYSTEM_ADMIN') || (entries&&!entries.some(e=>hasAdminEntry(user,e))))
    return <ProductPage><ProductStatus kind="warning" title="当前账号没有此入口的管理权限" actions={<Link to="/admin/entrances">查看已授权入口</Link>}>权限可能已被撤销，请刷新确认或联系系统管理员。</ProductStatus></ProductPage>
  return <>{children}</>
}
