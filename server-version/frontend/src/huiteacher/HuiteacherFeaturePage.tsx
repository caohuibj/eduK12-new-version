import { FeatureGuide, type FeatureGuideContent } from '../components/public-guides/FeatureGuide'
import { ProductThemeControl } from '../components/product-theme/ProductThemeControl'
import { useProductTheme } from '../components/product-theme/useProductTheme'
import TeacherBrand from './TeacherBrand'
import { teacherFeatures } from './teacher-features'

export function HuiteacherFeaturePage({ feature }: { feature: FeatureGuideContent }) {
  const appearance = useProductTheme('teacher')
  return <div className="ht-app ht-app-public" data-theme={appearance.theme}>
    <a className="ht-skip-link" href="#ht-guide-main">跳到主要内容</a>
    <header className="ht-topbar ht-guide-topbar"><a href="/" aria-label="Teacher 首页"><TeacherBrand/></a>
      <nav aria-label="产品导航"><a href="/">首页</a><a href="/login">登录</a><ProductThemeControl appearance={appearance} product="Teacher"/></nav>
    </header>
    <main id="ht-guide-main" tabIndex={-1}><FeatureGuide feature={feature} features={teacherFeatures} product="Teacher" homeAnchor="ht-features" entryHref="/login"/></main>
    <footer className="ht-footer">Teacher · 教师发展与学校改进</footer>
  </div>
}
