import { useEffect } from 'react'
import { ArrowLeft, ArrowRight, Check, type LucideIcon } from 'lucide-react'
import './feature-guide.css'

export type FeatureGuideContent = {
  path: string; title: string; description: string; icon: LucideIcon
  headline: string; introduction: string; audience: string
  capabilities: { title: string; text: string }[]
  steps: { title: string; text: string }[]
  outputs: string[]; boundaries: string[]; entryHint: string
}

/** Public content only: no session, organization, participant or report reads. */
export function FeatureGuide({ feature, features, product, homeAnchor, entryHref }: {
  feature: FeatureGuideContent; features: readonly FeatureGuideContent[]
  product: 'School' | 'Teacher'; homeAnchor: string; entryHref: string
}) {
  useEffect(() => {
    const previous = document.title
    document.title = `${feature.title} | ${product}`
    return () => { document.title = previous }
  }, [feature.title, product])
  const Icon = feature.icon
  return <article className={`public-feature-guide public-feature-guide--${product.toLowerCase()}`}>
    <a className="guide-back" href={`/#${homeAnchor}`}><ArrowLeft size={16} aria-hidden="true"/>返回 {product} 首页</a>
    <nav className="guide-navigation" aria-label={`${product} 功能介绍`}>{features.map(item =>
      <a key={item.path} href={item.path} aria-current={item.path === feature.path ? 'page' : undefined}>{item.title}</a>,
    )}</nav>
    <header className="guide-hero">
      <div><p className="guide-kicker">{product} / {feature.title}</p><h1>{feature.headline}</h1><p className="guide-introduction">{feature.introduction}</p></div>
      <aside className="guide-audience"><Icon size={32} strokeWidth={1.4} aria-hidden="true"/><h2>适合谁，在何时使用</h2><p>{feature.audience}</p></aside>
    </header>
    <nav className="guide-contents" aria-label="本页内容"><a href="#guide-capabilities">可以做什么</a><a href="#guide-workflow">如何开始</a><a href="#guide-results">产出与边界</a></nav>
    <section id="guide-capabilities" className="guide-section" aria-labelledby="guide-capabilities-title">
      <p className="guide-kicker">把需求落到具体功能</p><h2 id="guide-capabilities-title">可以做什么</h2>
      <div className="guide-capabilities">{feature.capabilities.map((item, index) => <section key={item.title}><span className="guide-number">0{index + 1}</span><h3>{item.title}</h3><p>{item.text}</p></section>)}</div>
    </section>
    <section id="guide-workflow" className="guide-section" aria-labelledby="guide-workflow-title">
      <p className="guide-kicker">从了解，到一次实际参与</p><h2 id="guide-workflow-title">如何开始</h2>
      <ol className="guide-workflow">{feature.steps.map((item, index) => <li key={item.title}><span className="guide-number">0{index + 1}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></li>)}</ol>
    </section>
    <section id="guide-results" className="guide-section guide-results" aria-labelledby="guide-results-title">
      <div><p className="guide-kicker">完成之后</p><h2 id="guide-results-title">留下什么，如何理解</h2><ul>{feature.outputs.map(text => <li key={text}><Check size={17} aria-hidden="true"/><span>{text}</span></li>)}</ul></div>
      <aside><h3>使用时需要了解</h3>{feature.boundaries.map(text => <p key={text}>{text}</p>)}</aside>
    </section>
    <footer className="guide-entry"><div><p className="guide-kicker">找到你的操作入口</p><h2>在自己的空间继续</h2><p>{feature.entryHint}</p></div><a className="guide-primary" href={entryHref}>进入 {product}<ArrowRight size={18} aria-hidden="true"/></a></footer>
    <a className="guide-back" href={`/#${homeAnchor}`}><ArrowLeft size={16} aria-hidden="true"/>返回首页，了解其他模块</a>
  </article>
}
