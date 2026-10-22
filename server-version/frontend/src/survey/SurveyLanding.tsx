import { SurveyBrand } from './SurveyBrand'
import { surveyFeatures } from './survey-features'
import './survey-landing.css'
import { surveyAdminLoginUrl } from '../products/origins'

export function SurveyPublicHeader({signedIn=false}:{signedIn?:boolean}) {
  const adminUrl=surveyAdminLoginUrl()
  return <header className="survey-landing-header">
    <SurveyBrand />
    <nav aria-label="研究平台导航"><a href="/#survey-features">产品功能</a>
      <a href={signedIn?'/workspace':'/login'}>{signedIn?'研究工作台':'研究者入口'}</a>
      {adminUrl&&<a className="survey-admin-entry-link" href={adminUrl}>管理员入口</a>}</nav>
  </header>
}

export function SurveyLanding({ signedIn = false }: { signedIn?: boolean }) {
  return <div className="survey-landing">
    <a className="survey-skip-link" href="#survey-intro">跳至主要内容</a>
    <SurveyPublicHeader signedIn={signedIn}/>
    <main className="survey-landing-main" id="survey-intro" tabIndex={-1}>
      <div className="survey-landing-copy">
        <h1><span>风过有迹，</span><span>细微可察。</span></h1>
        <p><span>从问题出发，</span><span>在数据中寻找理解的线索。</span></p>
        <p className="survey-landing-summary">编制研究工具，安排参与采集，整理研究数据。</p>
        <a className="survey-enter" href={signedIn ? '/workspace' : '/login'}>
          <span>{signedIn ? '进入研究工作台' : '研究者登录'}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
      <div className="survey-landing-art" aria-hidden="true">
        <img src="/survey/wind-observation.webp"
          srcSet="/survey/wind-observation-small.webp 768w, /survey/wind-observation.webp 1536w"
          sizes="(max-width: 600px) 266vw, (max-width: 1000px) 170vw, 112vw"
          width="1536" height="1024" alt="" loading="eager" fetchPriority="high" decoding="async" />
      </div>
      <section className="survey-feature-strip" id="survey-features" aria-label="了解研究平台" tabIndex={-1}>
        {surveyFeatures.map(({ path, title, description, icon: Icon }) =>
          <a className="survey-feature-link" href={path} key={path}>
            <Icon size={25} strokeWidth={1.4} aria-hidden="true" />
            <div><h2>{title}</h2><p>{description}</p></div>
            <span className="survey-feature-arrow" aria-hidden="true">↗</span>
          </a>,
        )}
      </section>
    </main>
    <footer className="survey-landing-footer">心理与教育测量研究平台</footer>
  </div>
}
