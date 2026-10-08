import TrainingBrand from './TrainingBrand'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthLinks } from '../components/app-shell/useAuthLinks'

/** Purely decorative, lightweight hand-drawn ink sketch; never inside a timed runner. */
function StudySketch() {
  return <svg className="training-study-sketch" viewBox="0 0 440 355" fill="none" aria-hidden="true">
    <path d="M30 299c87 6 174 9 274 2m-257 9c83 4 154 4 238-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".35" />
    <path d="M85 221c21-12 47-18 73-12 18 4 40 16 62 19 22-10 51-13 75-5l1 70c-24-9-50-5-75 7-25-12-58-14-80-6L85 221Z" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M218 229v71M109 230c25-4 47 2 71 11m-70 8c24-4 46 2 68 11m-65 8c22-4 44 2 65 9m56-35c14-6 34-8 46-6m-44 22c17-7 31-9 45-7m-42 23c20-7 33-8 45-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".52"/>
    <path d="M269 133c-4-26 0-43 18-51 23-9 42 8 44 27 3 27-20 42-33 40" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    <path d="M276 89c11-22 44-18 52 6-19-3-39-8-52-6Z" fill="currentColor" opacity=".22"/>
    <path d="M292 152c-20 4-31 26-44 52m44-52c30 3 45 31 58 61m-58-61 6 39-18 22m-6-23-16 25" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M295 193 252 234m69-44 16 35" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
    <path d="M355 295c-2-35 3-76 5-112m0 82c-18-11-32-29-35-50m36 27c17-9 33-27 35-51m-34 34c-8-12-10-24-10-39" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
    <path d="M326 211c1-15-9-28-24-30 0 18 9 29 24 30Zm40 9c8-19 23-27 39-24-5 17-19 25-39 24Zm-9-41c-11-16-12-32-2-44 12 16 13 31 2 44Z" fill="currentColor" opacity=".32"/>
    <path d="M52 112c40-36 88-38 131-6m-98 4c25-12 48-13 70-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".17"/>
    <circle cx="120" cy="91" r="18" stroke="currentColor" strokeWidth="1.8" opacity=".21"/>
  </svg>
}

export default function TrainingPortal() {
  const authLink = useAuthLinks()
  return <div className="training-portal">
    <header className="training-portal-header">
      <TrainingBrand />
      <span className="training-portal-edition">纸墨 · 见山</span>
    </header>
    <section className="training-portal-main" aria-labelledby="training-title">
      <div className="training-portal-copy">
        <p className="training-eyebrow">一段学习 · 一程生长</p>
        <h1 id="training-title">学有所思，<br />行有所获。</h1>
        <p className="training-portal-description">在这里，安静地开始一门课程。<br />作业、打卡与测评，都循着学习的节奏展开。</p>
        <nav className="training-role-links" aria-label="选择培训身份">
          <Link className="training-role-link" to={authLink('/student/login')}><span><strong>我是学员</strong><small>加入课程，继续学习</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link className="training-role-link" to={authLink('/teacher/account-login')}><span><strong>我是培训师</strong><small>创建课程，组织培训</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
        </nav>
      </div>
      <div className="training-sketch-panel"><StudySketch /><span className="training-sketch-caption">读 · 思 · 行</span></div>
    </section>
    <footer className="training-portal-footer"><span>Huisurvey Training</span><span>学习，始于当下。</span></footer>
  </div>
}
