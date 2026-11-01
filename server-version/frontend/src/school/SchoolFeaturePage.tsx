import { FeatureGuide, type FeatureGuideContent } from '../components/public-guides/FeatureGuide'
import { useProductTheme } from '../components/product-theme/useProductTheme'
import { SchoolPublicHeader } from './SchoolLanding'
import { schoolFeatures } from './school-features'

export function SchoolFeaturePage({ feature }: { feature: FeatureGuideContent }) {
  const appearance = useProductTheme('school')
  return <div className="hs-app" data-theme={appearance.theme}>
    <a className="hs-skip-link" href="#hs-guide-main">跳到主要内容</a>
    <SchoolPublicHeader appearance={appearance} home={false} onHome={() => window.location.assign('/')} onLogin={() => window.location.assign('/login')}
      onRegister={() => window.location.assign('/register')} onExplore={id => window.location.assign(`/#${id}`)}/>
    <main id="hs-guide-main" tabIndex={-1}><FeatureGuide feature={feature} features={schoolFeatures} product="School" homeAnchor="hs-features" entryHref="/login"/></main>
  </div>
}
