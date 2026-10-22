import { SurveyPublicHeader } from './SurveyLanding'
import type { SurveyFeature } from './survey-features'

export function SurveyFeaturePage({ feature, signedIn }: { feature: SurveyFeature; signedIn: boolean }) {
  const Icon = feature.icon
  return <div className="survey-feature-page">
    <a className="survey-skip-link" href="#survey-feature-content">跳至主要内容</a>
    <SurveyPublicHeader signedIn={signedIn}/>
    <main id="survey-feature-content" className="survey-feature-content" tabIndex={-1}>
      <a className="survey-back" href="/#survey-features">返回平台介绍</a>
      <Icon size={36} strokeWidth={1.4} aria-hidden="true" />
      <h1>{feature.title}</h1>
      <p className="survey-feature-intro">{feature.introduction}</p>
      <ul>{feature.points.map(point => <li key={point}>{point}</li>)}</ul>
      <p className="survey-feature-note">{feature.note}</p>
      <a className="survey-enter" href={signedIn ? '/workspace' : '/login'}>
        {signedIn ? '进入研究工作台' : '研究者登录'}<span aria-hidden="true">→</span>
      </a>
    </main>
  </div>
}
