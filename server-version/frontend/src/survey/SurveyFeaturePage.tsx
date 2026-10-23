import { ArrowLeft, ArrowRight, Check, ClipboardList, FileCheck2, Files, Fingerprint, Layers3, Link2, LockKeyhole } from 'lucide-react'
import { SurveyPublicFooter, SurveyPublicHeader } from './SurveyLanding'
import { surveyFeatures, type SurveyFeature } from './survey-features'

function FeatureIllustration({ feature }: { feature: SurveyFeature }) {
  return <figure className={`survey-public-illustration survey-public-illustration--${feature.key}`}>
    <figcaption><span>功能示意</span><span>RESEARCH / {feature.key.toUpperCase()}</span></figcaption>
    {feature.key === 'projects' ? <div className="survey-preview-project">
      <div className="survey-preview-label"><Layers3 size={17} aria-hidden="true"/>一项研究，连续的观察</div>
      <div className="survey-preview-timeline">
        <div><i/><span>T1 · 初次观察</span><small>准备研究内容</small></div>
        <div><i/><span>T2 · 后续采集</span><small>连接研究内编号</small></div>
        <div><i/><span>T3 · 继续追踪</span><small>保留每次发布版本</small></div>
      </div>
      <p><Fingerprint size={17} aria-hidden="true"/>关联方式事先告知，研究路径有迹可循。</p>
    </div> : feature.key === 'tools' ? <div className="survey-preview-tools">
      <div className="survey-preview-label"><ClipboardList size={17} aria-hidden="true"/>独立的工具集</div>
      {[['表单', '题目与条件显示'], ['量表', '条目、维度与计分'], ['组合问卷', '内容与呈现顺序']].map(([name, detail]) =>
        <div className="survey-preview-tool" key={name}><span><Files size={17} aria-hidden="true"/>{name}</span><small>{detail}</small></div>,
      )}
      <p><FileCheck2 size={17} aria-hidden="true"/>检查与试答 → 完成编制 → 选入研究</p>
    </div> : feature.key === 'participation' ? <div className="survey-preview-participation">
      <div className="survey-preview-label"><Link2 size={17} aria-hidden="true"/>从研究邀请链接开始</div>
      <ol>{['了解这项研究', '阅读并确认知情同意', '填写、检查与正式提交'].map((text, index) =>
        <li key={text}><span>{index + 1}</span><strong>{text}</strong>{index === 1 && <Check size={17} aria-hidden="true"/>}</li>,
      )}</ol>
      <p>先了解，再参与；完成一个工具与整轮提交分别确认。</p>
    </div> : <div className="survey-preview-data">
      <div className="survey-preview-label"><LockKeyhole size={17} aria-hidden="true"/>连同数据的解释一起保存</div>
      <div className="survey-preview-export"><span>CSV</span><div><strong>回答数据</strong><small>实际回答与记录状态</small></div></div>
      <div className="survey-preview-export"><span>CODE</span><div><strong>变量编码字典</strong><small>变量、选项与含义</small></div></div>
      <div className="survey-preview-export"><span>INFO</span><div><strong>Manifest</strong><small>批次与来源说明</small></div></div>
      <p>受控导出 · 身份确认 · 来源可追溯</p>
    </div>}
  </figure>
}

export function SurveyFeaturePage({ feature, signedIn }: { feature: SurveyFeature; signedIn: boolean }) {
  const Icon = feature.icon
  const related = surveyFeatures.find(item => item.path === feature.related)!
  return <div className="survey-feature-page">
    <a className="survey-skip-link" href="#survey-feature-content">跳至主要内容</a>
    <SurveyPublicHeader signedIn={signedIn}/>
    <main id="survey-feature-content" className="survey-feature-content" tabIndex={-1}>
      <div className="survey-feature-breadcrumb"><a className="survey-back" href="/#survey-features"><ArrowLeft size={16} aria-hidden="true"/>返回平台介绍</a><span>产品功能 / {feature.title}</span></div>
      <nav className="survey-feature-nav" aria-label="功能介绍导航">{surveyFeatures.map(item =>
        <a key={item.path} href={item.path} aria-current={item.path === feature.path ? 'page' : undefined}>{item.title}</a>,
      )}</nav>
      <header className="survey-feature-hero">
        <div>
          <p className="survey-public-eyebrow"><Icon size={17} strokeWidth={1.5} aria-hidden="true"/>{feature.title}</p>
          <h1>{feature.introduction}</h1>
          <p className="survey-feature-intro">{feature.overview}</p>
          <ul className="survey-public-tags">{feature.tags.map(tag => <li key={tag}><Check size={14} aria-hidden="true"/>{tag}</li>)}</ul>
        </div>
        <FeatureIllustration feature={feature}/>
      </header>
      <nav className="survey-feature-contents" aria-label="本页内容"><a href="#feature-capabilities">可以做什么</a><a href="#feature-workflow">如何使用</a><a href="#feature-questions">常见问题</a></nav>
      <section className="survey-feature-capabilities" id="feature-capabilities" aria-labelledby="feature-capabilities-title">
        <div className="survey-public-section-heading"><div><p className="survey-public-eyebrow">功能与使用场景</p><h2 id="feature-capabilities-title">可以做什么</h2></div></div>
        <div>{feature.capabilities.map((item, index) => <article key={item.title}><span>0{index + 1}</span><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>
      </section>
      <section className="survey-feature-workflow" id="feature-workflow" aria-labelledby="feature-workflow-title">
        <div className="survey-public-section-heading"><div><p className="survey-public-eyebrow">从这里开始</p><h2 id="feature-workflow-title">如何使用</h2></div></div>
        <ol>{feature.steps.map((step, index) => <li key={step.title}><span>{index + 1}</span><h3>{step.title}</h3><p>{step.body}</p></li>)}</ol>
      </section>
      <section className="survey-public-faq" id="feature-questions" aria-labelledby="feature-questions-title">
        <div className="survey-public-section-heading"><div><p className="survey-public-eyebrow">进一步了解</p><h2 id="feature-questions-title">常见问题</h2></div></div>
        {feature.questions.map(item => <details key={item.question}><summary>{item.question}<ArrowRight size={17} aria-hidden="true"/></summary><p>{item.answer}</p></details>)}
      </section>
      <aside className="survey-feature-note"><LockKeyhole size={18} aria-hidden="true"/><p>{feature.note}</p></aside>
      <div className="survey-feature-next"><a href={related.path}><span>接着了解</span><strong>{related.title}<ArrowRight size={19} aria-hidden="true"/></strong></a><a className="survey-enter" href={signedIn ? '/workspace' : '/login'}>{signedIn ? '进入研究工作台' : '研究者登录'}<ArrowRight size={18} aria-hidden="true"/></a></div>
    </main>
    <SurveyPublicFooter/>
  </div>
}
