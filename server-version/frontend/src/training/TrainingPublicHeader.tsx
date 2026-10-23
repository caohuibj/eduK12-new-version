import { useLayoutEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'
import TrainingHomeBrand from './TrainingHomeBrand'
import TrainingAppearanceControl from './TrainingAppearanceControl'

export default function TrainingPublicHeader() {
  const authLink = useAuthLinks()
  const { pathname, hash } = useLocation()
  useLayoutEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash])
  return <header className="training-portal-header">
    <Link to="/" aria-label="Training 首页" className="training-public-brand"><TrainingHomeBrand /></Link>
    <nav className="training-portal-actions" aria-label="Training 入口导航">
      <Link className="training-portal-login training-portal-login--primary" to={authLink('/login')}>登录</Link>
      <Link className="training-portal-login training-portal-register" to={authLink('/register')}>注册</Link>
      <TrainingAppearanceControl />
    </nav>
  </header>
}
