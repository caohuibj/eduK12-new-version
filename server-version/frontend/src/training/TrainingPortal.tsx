import { useState } from 'react'
import TrainingHomeBrand from './TrainingHomeBrand'
import './training-portal-refresh.css'
import { ArrowRight, GraduationCap, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'

/** Public Training entry: exactly two role choices; no edition-specific admin login. */
export default function TrainingPortal() {
  const authLink = useAuthLinks()
  const [mode, setMode] = useState<'login' | 'register'>('login')

  return <div className="training-portal">
    <header className="training-portal-header">
      <TrainingHomeBrand />
      <div className="training-portal-actions">
        {(['login', 'register'] as const).map(kind => <button key={kind}
          type="button"
          className={`training-portal-login${kind === 'register' ? ' training-portal-register' : ''}`}
          aria-pressed={mode === kind} aria-controls="training-roles"
          onClick={() => setMode(kind)}>
          {kind === 'login' ? '登录' : '注册'}
        </button>)}
      </div>
    </header>

    <section className="training-portal-main" aria-labelledby="training-title">
      <div className="training-portal-copy">
        <p className="training-eyebrow">一段学习 · 一程生长</p>
        <h1 id="training-title">让学习，<br />更有回响。</h1>
        <p className="training-portal-description">从课程参与到专业成长，<br />每一步都有清晰的开始。</p>
        <span className="training-portal-accent" aria-hidden="true" />
      </div>

      <nav id="training-roles" className="training-role-cards training-role-cards--active"
        aria-label={mode === 'register' ? '选择注册身份' : '选择登录身份'}>
        <p className="training-role-mode" aria-live="polite">{mode === 'register' ? '选择身份，开始注册' : '选择身份，继续登录'}</p>
        <Link className="training-role-card training-role-card--learner" to={authLink(mode === 'register' ? '/student/course-login' : '/student/login')}>
          <span className="training-role-icon"><UserRound size={48} strokeWidth={1.6} aria-hidden="true" /></span>
          <span className="training-role-text"><strong>我是学员</strong>
          <small>{mode === 'register' ? '使用课程码，加入课程' : '加入课程，开始学习'}</small></span>
          <span className="training-card-arrow"><span className="training-card-action">{mode === 'register' ? '注册' : '登录'}</span><ArrowRight size={29} strokeWidth={1.8} aria-hidden="true" /></span>
        </Link>
        <Link className="training-role-card training-role-card--trainer" to={authLink(mode === 'register' ? '/teacher/login' : '/teacher/account-login')}>
          <span className="training-role-icon"><GraduationCap size={51} strokeWidth={1.6} aria-hidden="true" /></span>
          <span className="training-role-text"><strong>我是培训师</strong>
          <small>{mode === 'register' ? '使用培训师注册码，创建账号' : '创建课程，组织培训'}</small></span>
          <span className="training-card-arrow"><span className="training-card-action">{mode === 'register' ? '注册' : '登录'}</span><ArrowRight size={29} strokeWidth={1.8} aria-hidden="true" /></span>
        </Link>
      </nav>
    </section>

    <footer className="training-portal-footer">
      <span>© {new Date().getFullYear()} Huitraining</span>
      <span>学习，始于当下。</span>
    </footer>
  </div>
}
