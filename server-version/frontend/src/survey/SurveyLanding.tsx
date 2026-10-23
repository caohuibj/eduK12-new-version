import { ArrowRight, ArrowUpRight, Check, ChevronDown } from 'lucide-react'
import { SurveyAppearanceControl, useSurveyAppearance } from './SurveyAppearance'
import { surveyAppearanceHref } from './survey-appearance-links'
import { SurveyBrand } from './SurveyBrand'
import { surveyFeatures, surveyResearchFlow } from './survey-features'
import './survey-landing.css'
import './survey-public-pages.css'
import { surveyAdminLoginUrl } from '../products/origins'

export function SurveyPublicHeader({ signedIn = false, entry = false, surveyOrigin }: { signedIn?: boolean; entry?: boolean; surveyOrigin?: string }) {
  const { mode } = useSurveyAppearance()
  const adminUrl = surveyAdminLoginUrl()
  const surveyHref = (path: string) => surveyOrigin ? surveyAppearanceHref(surveyOrigin + path, mode) : path
  return <header className={'survey-landing-header'+(entry?' survey-entry-public-header':'')}>
    <SurveyBrand href={surveyHref('/')}/>
    <nav aria-label="研究平台导航">
      {entry && <a href={surveyHref('/')}>首页</a>}
      <a href={surveyHref('/#survey-features')}>产品功能</a>
      <a href={surveyHref('/#survey-workflow')}>研究流程</a>
      {adminUrl && <a href={surveyAppearanceHref(adminUrl, mode)}>管理员入口</a>}
      {!entry && <a className="survey-public-login" href={signedIn ? '/workspace' : '/login'}>
        {signedIn ? '研究工作台' : '研究者入口'}<ArrowUpRight size={15} aria-hidden="true"/>
      </a>}
    </nav>
    <SurveyAppearanceControl/>
  </header>
}

export function SurveyPublicFooter() {
  const { mode } = useSurveyAppearance()
  const adminUrl = surveyAdminLoginUrl()
  return <footer className="survey-landing-footer">
    <div><strong>Research <span>@eduk12.top</span></strong><p>心理与教育测量研究平台</p></div>
    <div className="survey-public-footer-links">
      <a href="/#survey-features">了解平台</a>
      {adminUrl && <a href={surveyAppearanceHref(adminUrl, mode)}>管理员入口<ArrowUpRight size={14} aria-hidden="true"/></a>}
    </div>
  </footer>
}

export function SurveyLanding({ signedIn = false }: { signedIn?: boolean }) {
  return <div className="survey-landing">
    <a className="survey-skip-link" href="#survey-intro">跳至主要内容</a>
    <SurveyPublicHeader signedIn={signedIn}/>
    <main className="survey-landing-main" id="survey-intro" tabIndex={-1}>
      <section className="survey-public-hero" aria-labelledby="survey-public-title">
        <div className="survey-landing-copy">
          <p className="survey-public-eyebrow"><span/>让研究有序发生</p>
          <h1 id="survey-public-title"><span>风过有迹，</span><span>细微可察。</span></h1>
          <p className="survey-public-lead"><span>从问题出发，</span><span>在数据中寻找理解的线索。</span></p>
          <p className="survey-landing-summary">从独立工具编制、多波次采集，到私有报告与受控导出，连接研究的每一个阶段。</p>
          <div className="survey-public-hero-actions">
            <a className="survey-enter" href={signedIn ? '/workspace' : '/login'}>
              {signedIn ? '进入研究工作台' : '研究者登录'}<ArrowRight size={18} aria-hidden="true"/>
            </a>
            <a className="survey-public-text-link" href="#survey-features">了解平台<ChevronDown size={16} aria-hidden="true"/></a>
          </div>
          <p className="survey-public-access"><Check size={14} aria-hidden="true"/>研究者邀请开通 · 双因素验证登录</p>
        </div>
      </section>

      <section className="survey-public-features" id="survey-features" aria-labelledby="survey-features-title" tabIndex={-1}>
        <div className="survey-public-section-heading">
          <div><p className="survey-public-eyebrow">围绕研究的四个环节</p><h2 id="survey-features-title">从一个问题，到完整的研究过程。</h2></div>
          <p>工具、参与和数据，在同一个研究语境里衔接。</p>
        </div>
        <div className="survey-feature-strip">
          {surveyFeatures.map(({ path, title, description, tags, icon: Icon }, index) =>
            <a className="survey-feature-link" href={path} key={path}>
              <div className="survey-feature-card-top"><Icon size={24} strokeWidth={1.5} aria-hidden="true"/><span>0{index + 1}</span></div>
              <h3>{title}</h3><p>{description}</p>
              <ul>{tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
              <span className="survey-feature-card-bottom">了解{title}<ArrowUpRight size={17} aria-hidden="true"/></span>
            </a>,
          )}
        </div>
      </section>

      <section className="survey-public-workflow" id="survey-workflow" aria-labelledby="survey-workflow-title" tabIndex={-1}>
        <div className="survey-public-section-heading">
          <div><p className="survey-public-eyebrow">清晰的工作方式</p><h2 id="survey-workflow-title">每一步，都为下一步做好准备。</h2></div>
          <p>先把工具做好，再让研究有序展开。</p>
        </div>
        <ol className="survey-public-flow">{surveyResearchFlow.map((step, index) =>
          <li key={step.path}><a href={step.path}><span className="survey-public-flow-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p><ArrowRight size={17} aria-hidden="true"/></a></li>,
        )}</ol>
      </section>

      <section className="survey-public-principles" aria-labelledby="survey-principles-title">
        <div><p className="survey-public-eyebrow">认真对待每一份回答</p><h2 id="survey-principles-title">清楚的边界，<br/>也是研究的一部分。</h2><p>从参与说明到数据使用，让研究者与参与者都知道正在发生什么。</p></div>
        <dl>
          <div><dt>知情参与</dt><dd>先说明研究用途、采集方式与关联方式，再由参与者决定是否作答。</dd></div>
          <div><dt>版本可追溯</dt><dd>研究选用具体修订，发布时固定内容，让工具变化与采集依据保持清晰。</dd></div>
          <div><dt>按权限使用</dt><dd>私有工具、素材与项目数据各有管理范围；敏感导出需再次确认身份。</dd></div>
        </dl>
      </section>

      <section className="survey-public-faq" aria-labelledby="survey-faq-title">
        <div className="survey-public-section-heading"><div><p className="survey-public-eyebrow">开始之前</p><h2 id="survey-faq-title">你可能想了解</h2></div></div>
        <details><summary>如何开通研究者账号？<ChevronDown size={18} aria-hidden="true"/></summary><p>研究者目前通过管理员邀请开通。领取邀请后完成账号激活和验证器绑定，之后使用密码与动态验证码登录研究工作台。</p></details>
        <details><summary>哪些工具可以自己编制？<ChevronDown size={18} aria-hidden="true"/></summary><p>目前支持表单、量表和普通组合问卷的自主编制。认知测验与 SJT 使用已有的受控模板和授权范围，暂不开放研究者自建。<a href="/features/research-tools">了解研究工具<ArrowRight size={14} aria-hidden="true"/></a></p></details>
        <details><summary>参与者需要注册平台账号吗？<ChevronDown size={18} aria-hidden="true"/></summary><p>通常不需要。参与者通过具体研究提供的邀请链接进入，阅读研究说明与知情同意后开始作答。恢复入口和波次关联方式由研究设置决定。</p></details>
      </section>
    </main>
    <SurveyPublicFooter/>
  </div>
}
