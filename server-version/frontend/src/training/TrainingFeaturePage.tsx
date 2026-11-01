import { ArrowLeft, ArrowRight, Check, ChevronRight } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { loginUrl } from '../components/app-shell/access'
import TrainingPublicHeader from './TrainingPublicHeader'
import { trainingFeatures } from './featureContent'
import './training-portal-refresh.css'

export default function TrainingFeaturePage() {
  const { feature: slug } = useParams()
  const { user } = useAuth()
  const feature = trainingFeatures.find(item => item.slug === slug)
  if (!feature) return <div className="training-portal training-feature-page">
    <TrainingPublicHeader />
    <section className="training-feature-missing"><p className="training-portal-kicker">Training · 功能介绍</p><h1>暂未找到这项功能介绍</h1><p>从首页选择一项功能，继续了解 Training。</p><Link className="training-portal-login training-portal-login--primary" to="/">返回首页<ArrowRight size={17} aria-hidden="true" /></Link></section>
  </div>
  const { Icon } = feature
  const learnerHref = user?.role === 'STUDENT' ? '/student' : loginUrl('STUDENT', '/student')
  const trainerHref = user?.role === 'TEACHER' ? feature.trainerPath : loginUrl('TEACHER', feature.trainerPath)
  return <div className="training-portal training-feature-page">
    <TrainingPublicHeader />
    <div className="training-feature-page-inner">
      <nav className="training-feature-breadcrumb" aria-label="功能介绍位置"><Link to="/">首页</Link><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{feature.title}</span></nav>
      <section className="training-feature-hero" aria-labelledby="training-feature-title">
        <div>
          <p className="training-portal-kicker"><span>{feature.marker} /</span> {feature.title}</p>
          <h1 id="training-feature-title">{feature.headline}</h1>
          <p className="training-feature-lead">{feature.introduction}</p>
          <p className="training-feature-audience"><strong>适用角色与场景</strong>{feature.audience}</p>
          <a className="training-feature-anchor" href="#feature-start">找到我的使用入口<ArrowRight size={17} aria-hidden="true" /></a>
        </div>
        <aside className="training-feature-preview" aria-label={`${feature.title}流程示意`}>
          <div className="training-feature-preview-top"><Icon size={30} strokeWidth={1.3} aria-hidden="true" /><span>功能一览 · 流程示意</span></div>
          <h2>{feature.previewTitle}</h2>
          <ol>{feature.previewItems.map((item, index) => <li key={item}><span>0{index + 1}</span><span>{item}</span><Check size={16} aria-hidden="true" /></li>)}</ol>
          <p>围绕课程，连接教与学。</p>
        </aside>
      </section>

      <nav className="training-feature-tabs" aria-label="浏览 Training 功能">{trainingFeatures.map(({ slug: key, title, marker }) => <Link key={key} to={`/features/${key}`} aria-current={key === slug ? 'page' : undefined}><span>{marker}</span>{title}<ArrowRight size={15} aria-hidden="true" /></Link>)}</nav>

      <section className="training-portal-section" aria-labelledby="feature-capabilities-title">
        <div className="training-portal-section-heading"><div><p className="training-portal-kicker">功能与使用场景</p><h2 id="feature-capabilities-title">可以做什么</h2></div><p>{feature.description}</p></div>
        <div className="training-feature-capabilities">{feature.capabilities.map(({ title, text }, index) => <article key={title}><span className="training-feature-capability-number">0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section className="training-portal-section" aria-labelledby="feature-steps-title">
        <div className="training-portal-section-heading"><div><p className="training-portal-kicker">从这里开始</p><h2 id="feature-steps-title">如何使用{feature.title}</h2></div></div>
        <ol className="training-feature-steps">{feature.steps.map(({ title, text }, index) => <li key={title}><span className="training-learning-number">0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
      </section>

      <section className="training-feature-results training-portal-section" aria-labelledby="feature-results-title">
        <p className="training-portal-kicker">完成之后</p><h2 id="feature-results-title">产出与使用边界</h2>
        <ul>{feature.outputs.map(text => <li key={text}><Check size={17} aria-hidden="true"/><span>{text}</span></li>)}</ul>
        <p>{feature.boundary}</p>
      </section>
      <section className="training-feature-start" id="feature-start" aria-labelledby="feature-start-title">
        <p className="training-portal-kicker">把了解，变成一次开始</p><h2 id="feature-start-title">进入你的学习与课程空间。</h2>
        <div className="training-feature-entry-grid">
          {user?.role !== 'TEACHER' && <article><span>学员入口</span><h3>{feature.learnerAction}</h3><p>{feature.learnerNote}</p><Link className="training-portal-login training-portal-login--primary" to={learnerHref}>{user?.role === 'STUDENT' ? '进入我的课程' : '登录并进入课程'}<ArrowRight size={17} aria-hidden="true" /></Link></article>}
          {user?.role !== 'STUDENT' && <article><span>培训师入口</span><h3>{feature.trainerAction}</h3><p>{feature.trainerNote}</p><Link className="training-portal-login training-portal-login--primary" to={trainerHref}>{user?.role === 'TEACHER' ? feature.trainerAction : '登录并进入功能'}<ArrowRight size={17} aria-hidden="true" /></Link></article>}
        </div>
        {!user && <p className="training-feature-register">初次使用？准备好课程码或培训师注册码，<Link to="/register">注册 Training 账号<ArrowRight size={14} aria-hidden="true" /></Link></p>}
      </section>
      <footer className="training-portal-footer"><Link to="/"><ArrowLeft size={15} aria-hidden="true" />返回 Training 首页</Link><span>© {new Date().getFullYear()} Huitraining</span></footer>
    </div>
  </div>
}
