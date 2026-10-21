import TrainingHomeBrand from './TrainingHomeBrand'
import { trainingWelcomeCopy } from './welcomeCopy'
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
        <p className="training-eyebrow">{trainingWelcomeCopy.eyebrow}</p>
        <h1 id="training-title">{trainingWelcomeCopy.titleLines[0]}<br />{trainingWelcomeCopy.titleLines[1]}</h1>
        <p className="training-portal-description">{trainingWelcomeCopy.descriptionLines[0]}<br />{trainingWelcomeCopy.descriptionLines[1]}</p>
        <span className="training-portal-accent" aria-hidden="true" />
      </div>
    </section>
    <footer className="training-portal-footer"><span>© {new Date().getFullYear()} Huitraining</span><span>{trainingWelcomeCopy.footer}</span></footer>
  </div>
}
