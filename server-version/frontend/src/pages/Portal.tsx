import { useCapabilities } from '../contexts/CapabilitiesContext'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpenCheck, GraduationCap, HeartHandshake, ShieldCheck } from 'lucide-react'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'
import '../components/auth/auth-shell.css'

const roles = [
  { key: 'student', title: '学生入口', description: '参加课程，完成测评和学习任务', path: '/student/login', Icon: GraduationCap },
  { key: 'teacher', title: '教师入口', description: '管理课程与测评，查看学习情况', path: '/teacher/account-login', Icon: BookOpenCheck },
  { key: 'parent', title: '家长入口', description: '参与已分配的测评并查看自己的结果', path: '/parent/login', Icon: HeartHandshake },
  { key: 'admin', title: '管理员入口', description: '管理账户、内容与平台授权', path: '/admin/login', Icon: ShieldCheck },
] as const

export default function Portal() {
  const authLink = useAuthLinks()
  const { parentPortalEnabled, isLoading } = useCapabilities()
  const displayRoles = parentPortalEnabled ? roles : [roles[0], roles[1], roles[3], roles[2]]
  return <div className="hui-entry-page">
    <section className="hui-entry-hero" aria-labelledby="hui-entry-title">
      <div className="hui-auth-brand" aria-label="Huisurvey">
        <span className="hui-auth-brand__mark" aria-hidden="true" />
        <strong>Huisurvey</strong>
      </div>
      <div className="hui-entry-hero__body">
        <span className="hui-entry-kicker">教育 · 科学 · 关爱</span>
        <h1 id="hui-entry-title">让每一次测评，成为看见成长的机会</h1>
        <p>Huisurvey 为学生、教师、家长与学校提供清晰、可信、低负担的课程与测评体验。</p>
        <div className="hui-entry-features" aria-label="平台特点">
          <span>统一的课程与测评入口</span>
          <span>清晰的结果与成长反馈</span>
          <span>电脑、平板与手机一致体验</span>
        </div>
      </div>
    </section>

    <section className="hui-entry-panel" aria-labelledby="hui-role-title">
      <header className="hui-entry-panel__header">
        <h2 id="hui-role-title">欢迎使用 Huisurvey</h2>
        <p>请选择您的身份入口。登录后可继续课程、测评与已保存的任务。</p>
      </header>
      <nav aria-label="身份入口" className="hui-entry-roles">
        {displayRoles.map(({ key, title, description, path, Icon }) => key === 'parent' && !parentPortalEnabled ? <div key={key} className="hui-entry-role hui-entry-role--parent hui-entry-role--unavailable">
          <span className="hui-entry-role__top"><span className="hui-entry-role__icon" aria-hidden="true"><Icon size={19} /></span><strong>{title}</strong></span>
          <p>{isLoading ? '正在确认入口状态…' : '家长入口尚未开放，请以学校通知为准。'}</p>
          <span className="hui-entry-role__action">{isLoading ? '正在确认' : '尚未开放'}</span>
        </div> : <Link key={key} to={authLink(path)} className={`hui-entry-role hui-entry-role--${key}`}>
          <span className="hui-entry-role__top">
            <span className="hui-entry-role__icon" aria-hidden="true"><Icon size={19} /></span>
            <strong>{title}</strong>
          </span>
          <p>{description}</p>
          <span className="hui-entry-role__action">进入 <ArrowRight size={14} aria-hidden="true" /></span>
        </Link>)}
      </nav>
      <p className="hui-entry-tagline">Better Assessment. Healthier Students. Brighter Schools.</p>
    </section>
  </div>
}
