import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import FirstLoginPasswordChange from '../../pages/FirstLoginPasswordChange'
import { ProductPage, ProductStatus } from '../product-ui'
import { homeFor, loginUrl, readReauthReturn, type Role } from './access'

export function RouteLoading() {
  return <ProductPage><ProductStatus kind="pending" title="正在加载页面" announce="polite">请稍候。</ProductStatus></ProductPage>
}
export function RouteAccess({ children, roles }: { children: ReactNode; roles: Role[] }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const target = `${location.pathname}${location.search}${location.hash}`
  if (isLoading) return <RouteLoading />
  const pending = readReauthReturn()
  if (!user) return <Navigate to={loginUrl(pending?.target === target ? pending.role : roles.length === 1 ? roles[0] : 'TEACHER', target)} replace />
  if (!roles.includes(user.role)) return <ProductPage><ProductStatus kind="warning" title="当前账户无法访问此页面" actions={<Link to={homeFor(user.role)}>返回我的首页</Link>}>请使用获授权的账户打开原链接。</ProductStatus></ProductPage>
  if (pending?.target === target && String(pending.userId) !== String(user.id)) {
    return <ProductPage><ProductStatus kind="warning" title="请使用原账户继续" actions={<><Link to={loginUrl(pending.role, target)}>重新登录</Link><br /><Link to={homeFor(user.role)}>返回当前账户首页</Link></>}>此页面在另一个账户下中断。原账户的本地草稿不会在这里打开。</ProductStatus></ProductPage>
  }
  if (user.mustChangePassword) return <FirstLoginPasswordChange />
  return <>{children}</>
}
