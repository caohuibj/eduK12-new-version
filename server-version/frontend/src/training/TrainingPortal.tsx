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
        <p className="training-eyebrow">书山问道 · 拾级而上</p>
        <h1 id="training-title">以学习为径，<br />见更远的天地。</h1>
        <p className="training-portal-description">从一门课程启程，<br />在探索中求知，在实践中成长。</p>
        <span className="training-portal-accent" aria-hidden="true" />
      </div>
    </section>
    <footer className="training-portal-footer"><span>© {new Date().getFullYear()} Huitraining</span><span>学习，始于当下。</span></footer>
  </div>
}
