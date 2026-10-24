import { ArrowDown, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import TrainingPublicHeader from './TrainingPublicHeader'
import { trainingFeatures } from './featureContent'
import { trainingWelcomeCopy } from './welcomeCopy'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'
import { productOrigins } from '../products/origins'
import './training-portal-refresh.css'

const learningSteps = [
  { title: '加入课程', description: '使用课程码加入，进入自己的学习空间。' },
  { title: '开展学习', description: '查看课程内容，按安排完成学习与课堂任务。' },
  { title: '参与测评', description: '从课程任务进入，按要求完成练习与测评。' },
  { title: '回看反馈', description: '查看已开放的结果，让每次学习有所回应。' },
] as const

/** Public product overview; existing authentication and course access stay authoritative. */
export default function TrainingPortal() {
  const authLink = useAuthLinks()
  const adminOrigin = productOrigins()?.admin
  return <div className="training-portal" id="training-top">
    <div className="training-portal-intro">
      <TrainingPublicHeader />
      <section className="training-portal-main" aria-labelledby="training-title">
        <div className="training-portal-copy">
          <p className="training-eyebrow">{trainingWelcomeCopy.eyebrow}</p>
          <h1 id="training-title">{trainingWelcomeCopy.titleLines[0]}<br />{trainingWelcomeCopy.titleLines[1]}</h1>
          <p className="training-portal-description">{trainingWelcomeCopy.descriptionLines[0]}<br />{trainingWelcomeCopy.descriptionLines[1]}</p>
          <Link className="training-portal-copy-contact" to="/contact">联系我们<ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      </section>
    </div>

    <div className="training-portal-overview">
      <section className="training-portal-section" id="training-features" aria-labelledby="training-features-title">
        <div className="training-portal-section-heading">
          <div><p className="training-portal-kicker">教与学，在此相连</p><h2 id="training-features-title">一处课程空间，<br />连接学习的每一步。</h2></div>
          <p>把课程、测评、素材与反馈放在清晰的学习脉络里。<br className="training-desktop-break" />培训师专注组织，学员安心投入。</p>
        </div>
        <div className="training-feature-grid">
          {trainingFeatures.map(({ slug, title, Icon, marker, description, tags }) => <Link className="training-feature-card" key={slug} to={`/features/${slug}`} aria-label={`${title}，查看功能介绍`}>
            <span className="training-feature-top"><Icon size={28} strokeWidth={1.4} aria-hidden="true" /><span>{marker}</span></span>
            <h3>{title}</h3><p>{description}</p>
            <span className="training-feature-tags">{tags.map(tag => <span key={tag}>{tag}</span>)}</span>
            <span className="training-feature-more">查看功能<ArrowRight size={17} aria-hidden="true" /></span>
          </Link>)}
        </div>
      </section>

      <section className="training-portal-section training-learning-path" id="training-journey" aria-labelledby="training-journey-title">
        <div className="training-portal-section-heading">
          <div><p className="training-portal-kicker">循序而行，学有所获</p><h2 id="training-journey-title">每一步，都有清晰的方向。</h2></div>
          <p>从加入一门课程，到回看一次反馈，<br className="training-desktop-break" />让学习的开始、过程与回应自然衔接。</p>
        </div>
        <ol className="training-learning-steps">{learningSteps.map(({ title, description }, index) => <li key={title}>
          <span className="training-learning-number">0{index + 1}</span><h3>{title}</h3><p>{description}</p>
        </li>)}</ol>
      </section>

      <section className="training-portal-start" aria-labelledby="training-start-title">
        <div><p className="training-portal-kicker">{trainingWelcomeCopy.footer}</p><h2 id="training-start-title">下一段学习，从这里开始。</h2><p>已有账号，直接进入学习空间；初次使用，请准备好课程码或培训师注册码。</p></div>
        <div className="training-portal-start-actions">
          <Link className="training-portal-login training-portal-login--primary" to={authLink('/login')}>进入学习空间<ArrowRight size={17} aria-hidden="true" /></Link>
          <Link className="training-portal-start-register" to={authLink('/register')}>使用注册码注册<ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      </section>
      <footer className="training-portal-footer">
        <span>© {new Date().getFullYear()} Huitraining</span>
        <nav className="training-portal-footer-links" aria-label="Training 页脚导航">
          {adminOrigin && <a href={`${adminOrigin}/admin/login?returnTo=%2Fadmin%2Ftraining`}>Training 管理员入口<ArrowRight size={14} aria-hidden="true" /></a>}
          <a href="#training-top">回到顶部<ArrowDown size={14} aria-hidden="true" /></a>
        </nav>
      </footer>
    </div>
  </div>
}
