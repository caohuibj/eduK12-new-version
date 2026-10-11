import { useState } from 'react'
import { ArrowRight, ArrowUpRight, ChevronRight, Compass, BookOpen, Check, UsersRound, Leaf } from 'lucide-react'
import { schoolFeatures } from './school-features'
import { schoolTopics } from './school-topic-content'
import campusArtwork from './huischool-campus-sunlight.png'
import './school-topics.css'

export function SchoolFeaturePage({ path }: { path: string }) {
  const topic = schoolTopics[path]
  const feature = schoolFeatures.find(item => item.path === path)
  const [roleIndex, setRoleIndex] = useState(0)
  if (!topic || !feature) return null
  const role = topic.roles[roleIndex]
  const Icon = feature.icon
  return <article className={`hs-topic hs-topic-${topic.theme}`}>
    <div className="hs-topic-container">
      <nav className="hs-topic-breadcrumb" aria-label="面包屑">
        <a href="/">首页</a><ChevronRight size={14} aria-hidden="true" /><a href="/#hs-features">成长支持</a>
        <ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{feature.title}</span>
      </nav>
      <header className="hs-topic-hero">
        <div className="hs-topic-hero-copy">
          <p className="hs-topic-eyebrow"><Icon size={18} aria-hidden="true" />{feature.title}</p>
          <h1>{topic.headline.map(line => <span key={line}>{line}</span>)}</h1>
          <p className="hs-topic-intro">{topic.intro}</p>
          <div className="hs-topic-actions"><a className="hs-topic-button hs-topic-button-primary" href="#support">探索支持方向 <ArrowRight size={17} aria-hidden="true" /></a>
            <a className="hs-topic-button" href="#participate">找到我的参与路径</a></div>
          <p className="hs-topic-hero-note">{topic.eyebrow}</p>
        </div>
        <figure className="hs-topic-art">
          <img src={campusArtwork} width="1536" height="1024" alt="温暖阳光下，学生们坐在草地上，树木和校园环绕身旁。" />
          <figcaption><span className="hs-topic-art-icon"><Leaf size={22} aria-hidden="true" /></span><span>阳光校园 · 自然成长<small>{topic.promise}</small></span></figcaption>
        </figure>
      </header>
      <nav className="hs-topic-section-nav" aria-label="本页内容">
        <a href="#support">支持方向</a><a href="#methods">理解方法</a><a href="#practice">日常实践</a><a href="#participate">参与路径</a><a href="#availability">服务进展</a>
      </nav>
      <section className="hs-topic-section" id="support" tabIndex={-1} aria-labelledby="support-title">
        <div className="hs-topic-section-heading"><p className="hs-topic-eyebrow">01 / 成长支持</p><h2 id="support-title">不止了解现状，更关心接下来的支持</h2><p>{topic.serviceIntro}</p></div>
        <div className="hs-topic-services">{topic.services.map((card, index) => <div className="hs-topic-service" key={card.title}>
          <div className="hs-topic-card-top"><span className="hs-topic-number">0{index + 1}</span><span className="hs-topic-tag">{card.tag}</span></div>
          <h3>{card.title}</h3><p>{card.text}</p>
        </div>)}</div>
      </section>
      <section className="hs-topic-section hs-topic-method-section" id="methods" tabIndex={-1} aria-labelledby="methods-title">
        <div className="hs-topic-section-heading"><p className="hs-topic-eyebrow">02 / 理解方法</p><h2 id="methods-title">{topic.methodTitle}</h2><p>{topic.methodIntro}</p></div>
        <div className="hs-topic-methods">{topic.methods.map(card => <div className="hs-topic-method" key={card.title}><p className="hs-topic-method-label">{card.tag}</p><h3>{card.title}</h3><p>{card.text}</p></div>)}</div>
        <p className="hs-topic-method-note"><Compass size={20} aria-hidden="true" />{topic.methodNote}</p>
      </section>
      <section className="hs-topic-section" id="practice" tabIndex={-1} aria-labelledby="practice-title">
        <div className="hs-topic-section-heading"><p className="hs-topic-eyebrow">03 / 日常实践</p><h2 id="practice-title">从一个小行动开始</h2><p>把理念带回真实的生活。下面是教育性实践提示，可按自己的情境选择；无需提交个人信息。</p></div>
        <div className="hs-topic-practices">{topic.practices.map((practice, index) => <details className="hs-topic-practice" key={practice.title} open={index === 0 ? true : undefined}>
          <summary><span><small>{practice.audience}</small><strong>{practice.title}</strong></span><span className="hs-topic-disclosure" aria-hidden="true">+</span></summary>
          <ol>{practice.steps.map(step => <li key={step}>{step}</li>)}</ol>
        </details>)}</div>
      </section>
      <section className="hs-topic-section hs-topic-participation" id="participate" tabIndex={-1} aria-labelledby="participate-title">
        <div className="hs-topic-section-heading"><p className="hs-topic-eyebrow">04 / 一起参与</p><h2 id="participate-title">不同角色，同一个成长方向</h2><p>选择你的角色，了解可以从哪里开始。课程、评估与培训安排仍以学校实际开放为准。</p></div>
        <div className="hs-topic-role-picker" role="group" aria-label="选择参与角色">{topic.roles.map((item, index) => <button type="button" key={item.name} aria-pressed={roleIndex === index} aria-controls="hs-topic-role-content" onClick={() => setRoleIndex(index)}>{item.name}</button>)}</div>
        <div className="hs-topic-role-content" id="hs-topic-role-content" aria-live="polite" aria-atomic="true">
          <div><p className="hs-topic-eyebrow"><UsersRound size={17} aria-hidden="true" />{role.name}的参与路径</p><h3>{role.title}</h3><p>{role.text}</p></div>
          <ol>{role.steps.map(step => <li key={step}><Check size={16} aria-hidden="true" /><span>{step}</span></li>)}</ol>
        </div>
        <div className="hs-topic-account-row"><p>已有校园账号，或已收到学校的注册码？</p><a href="/login">校园账号登录 <ArrowRight size={16} aria-hidden="true" /></a><a href="/register">使用注册码注册 <ArrowRight size={16} aria-hidden="true" /></a></div>
      </section>
      <section className="hs-topic-section hs-topic-availability" id="availability" tabIndex={-1} aria-labelledby="availability-title">
        <div className="hs-topic-section-heading"><p className="hs-topic-eyebrow">05 / 服务进展</p><h2 id="availability-title">了解方向，也了解当前开放边界</h2></div>
        <div className="hs-topic-status-grid"><div><span className="hs-topic-tag">当前平台入口</span><h3>校园登录与注册码注册</h3><p>沿用校园账号入口。登录后的可用任务与资源，由学校安排和账号权限决定。</p></div>
          <div><span className="hs-topic-tag">正在规划</span><h3>专题课程、资料与培训</h3><p>本页展示服务方向与教育性内容。正式课程包、资源库及培训仍需审核与安排。</p></div>
          <div><span className="hs-topic-tag">尚未开放</span><h3>正式量表与常模</h3><p>后台尚未导入量表与常模。本页不提供测评分数、学校统计或治疗效果承诺。</p></div></div>
      </section>
      <section className="hs-topic-section hs-topic-faq" aria-labelledby="faq-title"><div className="hs-topic-section-heading"><p className="hs-topic-eyebrow">常见问题</p><h2 id="faq-title">加入之前，你可能想了解</h2></div>
        {topic.questions.map(question => <details key={question.title}><summary>{question.title}<ChevronRight size={18} aria-hidden="true" /></summary><p>{question.text}</p></details>)}
        {topic.sources.length > 0 && <div className="hs-topic-sources"><BookOpen size={17} aria-hidden="true" /><span>方法参考</span>{topic.sources.map(source => <a href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.title}<ArrowUpRight size={14} aria-hidden="true" /><span className="hs-visually-hidden">（在新窗口打开）</span></a>)}</div>}
      </section>
      <aside className="hs-topic-related" aria-labelledby="related-title"><h2 id="related-title">继续探索成长支持</h2><p className="hs-project-links"><a href="/about">了解 Huischool</a><a href="/join">了解项目校合作 <ArrowRight size={17} aria-hidden="true" /></a></p><div>{schoolFeatures.filter(item => item.path !== path).map(({ path: href, title, icon: RelatedIcon }) => <a key={href} href={href}><RelatedIcon size={20} aria-hidden="true" /><span>{title}</span><ArrowRight size={17} aria-hidden="true" /></a>)}</div></aside>
    </div>
  </article>
}
