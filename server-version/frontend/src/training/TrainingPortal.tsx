import TrainingBrand from './TrainingBrand'
import './training-portal-refresh.css'
import { ArrowRight, BarChart3, BookOpen, GraduationCap, UserRound, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'

/** Public Training entry: exactly two role choices; no edition-specific admin login. */
export default function TrainingPortal() {
  const authLink = useAuthLinks()

  return <div className="training-portal">
    <header className="training-portal-header">
      <TrainingBrand />
      <a className="training-portal-login" href="#training-roles" title="选择学员或培训师身份登录">登录</a>
    </header>

    <section className="training-portal-main" aria-labelledby="training-title">
      <div className="training-portal-copy">
        <p className="training-eyebrow">HUISURVEY · 培训空间</p>
        <h1 id="training-title">让学习，<br />更有回响。</h1>
        <p className="training-portal-description">从课程参与到专业成长，<br />每一步都有清晰的开始。</p>
        <span className="training-portal-accent" aria-hidden="true" />
        <div className="training-portal-benefits" aria-label="培训理念">
          <span><BookOpen size={22} strokeWidth={1.7} aria-hidden="true" />专注学习</span>
          <span><UsersRound size={22} strokeWidth={1.7} aria-hidden="true" />促进交流</span>
          <span><BarChart3 size={22} strokeWidth={1.7} aria-hidden="true" />助力成长</span>
        </div>
      </div>

      <nav id="training-roles" className="training-role-cards" aria-label="选择培训身份" tabIndex={-1}>
        <Link className="training-role-card training-role-card--learner" to={authLink('/student/login')}>
          <span className="training-role-icon"><UserRound size={48} strokeWidth={1.6} aria-hidden="true" /></span>
          <strong>我是学员</strong>
          <small>加入课程，开始学习</small>
          <span className="training-card-arrow"><ArrowRight size={29} strokeWidth={1.8} aria-hidden="true" /></span>
        </Link>
        <Link className="training-role-card training-role-card--trainer" to={authLink('/teacher/account-login')}>
          <span className="training-role-icon"><GraduationCap size={51} strokeWidth={1.6} aria-hidden="true" /></span>
          <strong>我是培训师</strong>
          <small>创建课程，组织培训</small>
          <span className="training-card-arrow"><ArrowRight size={29} strokeWidth={1.8} aria-hidden="true" /></span>
        </Link>
      </nav>
    </section>

    <footer className="training-portal-footer">
      <span>© {new Date().getFullYear()} huisurvey. All rights reserved.</span>
      <span>从课程参与到专业成长</span>
    </footer>
  </div>
}
