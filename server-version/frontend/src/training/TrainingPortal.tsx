import TrainingHomeBrand from './TrainingHomeBrand'
import './training-portal-refresh.css'
import { Link } from 'react-router-dom'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'

/** One training account entrance; the server resolves roles and code types. */
export default function TrainingPortal() {
  const authLink = useAuthLinks()
  return <div className="training-portal">
    <header className="training-portal-header">
      <TrainingHomeBrand />
      <div className="training-portal-actions">
        <Link className="training-portal-login training-portal-login--primary" to={authLink('/login')}>登录</Link>
        <Link className="training-portal-login training-portal-register" to={authLink('/register')}>注册</Link>
      </div>
    </header>
    <section className="training-portal-main" aria-labelledby="training-title">
      <div className="training-portal-copy">
        <p className="training-eyebrow">一段学习 · 一程生长</p>
        <h1 id="training-title">让学习，<br />更有回响。</h1>
        <p className="training-portal-description">从课程参与到专业成长，<br />每一步都有清晰的开始。</p>
        <span className="training-portal-accent" aria-hidden="true" />
      </div>
    </section>
    <footer className="training-portal-footer"><span>© {new Date().getFullYear()} Huitraining</span><span>学习，始于当下。</span></footer>
  </div>
}
