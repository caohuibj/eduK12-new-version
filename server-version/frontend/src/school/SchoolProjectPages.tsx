import type { ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, BookOpen, ChevronRight, Compass, Leaf, Sprout, UsersRound } from 'lucide-react'
import { schoolFeatures } from './school-features'
import { schoolContactCards, schoolCooperationPolicy, schoolResearchReferences } from './school-project-content'
import campusArtwork from './huischool-campus-sunlight.png'
import './school-topics.css'
import './school-project-pages.css'

function SectionHeading({ number, title, children }: { number: string; title: string; children?: ReactNode }) {
  return <div className="hs-topic-section-heading"><p className="hs-topic-eyebrow">{number}</p><h2>{title}</h2>{children && <p>{children}</p>}</div>
}
function ProjectHero({ join }: { join: boolean }) {
  return <>
    <nav className="hs-topic-breadcrumb" aria-label="面包屑"><a href="/">首页</a><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{join ? '立即加入' : '了解更多'}</span></nav>
    <header className="hs-topic-hero hs-project-hero">
      <div>
        <p className="hs-topic-eyebrow"><Leaf size={18} aria-hidden="true" />{join ? 'Huischool · 项目校合作计划' : 'About Huischool · 科学研究与教育实践'}</p>
        <h1>{join ? <><span>让更好的成长支持，</span><span>在校园里真实发生。</span></> : <><span>让科学走近教育，</span><span>让成长获得支持。</span></>}</h1>
        <p className="hs-topic-intro">{join ? '每一所学校，都有自己的成长故事。我们期待与重视学生身心健康、学习体验和校园氛围的学校携手，把科学研究与日常教育实践连接起来。' : '从理解一个学生，到支持一个班级，再到改善一所学校的成长环境。我们关注真实的校园生活，将心理与教育研究、专业学习和实践支持连接起来。'}</p>
        <div className="hs-topic-actions"><a className="hs-topic-button hs-topic-button-primary" href={join ? '#cooperation' : '#directions'}>{join ? '了解项目校合作' : '探索四大专题'}<ArrowRight size={17} aria-hidden="true" /></a><a className="hs-topic-button" href={join ? '#contact' : '#research'}>{join ? '查看联系区域' : '了解研究与实践'}</a></div>
        <p className="hs-topic-hero-note">{join ? '合作意向交流 · 具体合作以正式确认为准' : '科学支持 · 专业陪伴 · 健康成长'}</p>
      </div>
      <figure className="hs-topic-art hs-project-art"><img src={campusArtwork} width="1536" height="1024" fetchPriority="high" alt="阳光穿过树冠，学生们坐在草地上，远处是明亮的校园。" /><figcaption><span className="hs-topic-art-icon"><Sprout size={22} aria-hidden="true" /></span><span>阳光校园 · 自然成长<small>{join ? '让每一份支持，贴近学校的真实需要' : '把成长放回生活，把支持带进校园'}</small></span></figcaption></figure>
    </header>
  </>
}
function PracticeSteps({ join }: { join: boolean }) {
  const steps = join ? [
    ['了解需求', '倾听学校，明确优先关注的成长议题。'], ['共同设计', '结合校情，确认合作方向与实施条件。'], ['专业支持', '按约定安排资源、学习与教师支持。'], ['实践应用', '在获准范围内，把支持带入日常。'], ['阶段复盘', '回顾经验与反馈，共同调整下一步。'],
  ] : [
    ['了解需求', '从师生真实经历与学校情境出发。'], ['共同设计', '与学校、教师及相关参与者讨论目标。'], ['实践支持', '连接专业学习与课堂、关系和校园生活。'], ['评估改进', '在获准范围内收集反馈，持续调整实践。'],
  ]
  return <ol className={`hs-project-steps${join ? ' hs-project-five-steps' : ''}`}>{steps.map(([title, text], i) => <li key={title}><span className="hs-project-step-number">0{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div>{i < steps.length - 1 && <ArrowRight size={18} aria-hidden="true" />}</li>)}</ol>
}
function ProjectLinks({ about }: { about: boolean }) {
  return <aside className="hs-project-next"><div><p className="hs-topic-eyebrow">一起，为更好的校园创造可能</p><h2>{about ? '让支持从这里开始。' : '想先多了解一些？'}</h2><p>{about ? '从学校的真实需要出发，共同探索适合的合作方向。' : '了解我们的项目理念、研究依据与四个成长支持专题。'}</p></div><a className="hs-topic-button hs-topic-button-primary" href={about ? '/join' : '/about'}>{about ? '了解项目校合作' : '了解 Huischool'}<ArrowRight size={18} aria-hidden="true" /></a></aside>
}

export function SchoolJoinPage() {
  const values = [
    { icon: Compass, title: '科学理解学生', text: '从心理健康、学习状态与校园体验出发，以多元证据理解学生的真实需要。' },
    { icon: BookOpen, title: '专业成长支持', text: '围绕 ACT、DNA-V、学习动机、考试调适与 SEL，探索适合不同角色的学习和实践资源。' },
    { icon: UsersRound, title: '共同改善校园环境', text: '关注课堂互动、同伴关系与家校社沟通，让成长支持融入每天的校园生活。' },
    { icon: Sprout, title: '参与研究创新', text: '与研究团队共同探索适合学校的支持方案，以审慎、可验证的方式积累实践经验。' },
  ]
  return <article className="hs-topic hs-project hs-project-join"><div className="hs-topic-container">
    <ProjectHero join />
    <nav className="hs-topic-section-nav" aria-label="本页内容"><a href="#values">合作价值</a><a href="#cooperation">合作流程</a><a href="#policy">拟议政策</a><a href="#contact">联系区域</a></nav>
    <section className="hs-topic-section" id="values" tabIndex={-1} aria-label="合作价值"><SectionHeading number="01 / 一起成长" title="为什么成为 Huischool 项目校？">以学校需要为起点，连接理解、支持、实践与研究。</SectionHeading><div className="hs-topic-services">{values.map(({ icon: Icon, title, text }) => <div className="hs-topic-service" key={title}><span className="hs-project-value-icon"><Icon size={24} aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></div>)}</div></section>
    <section className="hs-topic-section" id="cooperation" tabIndex={-1} aria-label="合作流程"><SectionHeading number="02 / 合作路径" title="从一次倾听，到持续的支持">学校可从四个专题中选择合适的方向，合作内容按实际准备情况共同确认。</SectionHeading><PracticeSteps join /><p className="hs-project-note">可能的合作内容包括需求讨论、教育资源、教师培训、家校社沟通与校园活动。正式测评、常模及个体报告须另行完成科学与准入审核。</p><a className="hs-project-text-link" href="/about#directions">了解四个合作方向 <ArrowRight size={17} aria-hidden="true" /></a></section>
    <section className="hs-topic-section hs-project-policy" id="policy" tabIndex={-1} aria-label="拟议招募政策"><SectionHeading number="03 / 参与条件" title="项目校招募政策"><span className="hs-project-policy-status">{schoolCooperationPolicy.status}</span></SectionHeading><p className="hs-project-policy-intro">{schoolCooperationPolicy.intro}</p><dl className="hs-project-policy-grid">{schoolCooperationPolicy.items.map(item => <div key={item.title}><dt>{item.title}</dt><dd>{item.text}</dd></div>)}</dl><p className="hs-project-boundary"><Leaf size={20} aria-hidden="true" /><span>合作意向不等于真实学校或未成年人 Pilot 已获准入。涉及研究与测评的实施，须另行完成必要审核和正式批准。</span></p></section>
    <section className="hs-topic-section hs-project-contact" id="contact" tabIndex={-1} aria-label="联系区域"><SectionHeading number="04 / 期待相遇" title="期待与你，共建更好的校园。">欢迎学校负责人、教育工作者与研究伙伴交流需求。正式联系渠道将在确认后补充。</SectionHeading><div className="hs-project-contact-grid">{schoolContactCards.map(card => <div className="hs-project-contact-card" key={card.id}><h3>{card.title}</h3><p>{card.description}</p><div className={`hs-project-qr-frame${card.status === 'placeholder' ? ' hs-project-qr-placeholder' : ''}`}><img src={card.imageSrc} width="200" height="200" loading="lazy" alt={card.status === 'placeholder' ? `${card.title}二维码示意占位，当前无法用于联系` : `${card.title}二维码`} />{card.status === 'placeholder' && <span aria-hidden="true">{card.id === 'inquiry' ? '示意图' : '待替换'}</span>}</div>{card.status === 'placeholder' && <p className="hs-project-contact-status"><strong>示意 / 待替换</strong><span>当前无法用于联系</span></p>}</div>)}</div><p className="hs-project-note">两张二维码均待正式确认，当前页面不收集或提交合作信息。</p><div className="hs-topic-account-row"><p>已有校园账号或学校注册码？</p><a href="/login">校园账号登录 <ArrowRight size={16} aria-hidden="true" /></a><a href="/register">使用注册码注册 <ArrowRight size={16} aria-hidden="true" /></a></div></section>
    <ProjectLinks about={false} />
  </div></article>
}

export function SchoolAboutPage() {
  return <article className="hs-topic hs-project hs-project-about"><div className="hs-topic-container">
    <ProjectHero join={false} />
    <nav className="hs-topic-section-nav" aria-label="本页内容"><a href="#directions">四大专题</a><a href="#research">研究依据</a><a href="#references">项目资料</a><a href="#workflow">工作方式</a></nav>
    <section className="hs-topic-section" id="directions" tabIndex={-1} aria-label="四大专题"><SectionHeading number="01 / 成长的不同侧面" title="四个方向，连接完整的成长支持">Huischool 希望连接科研与学校实践，把理解、专业学习和日常支持放在同一条路径上。</SectionHeading><div className="hs-project-directions">{schoolFeatures.map(({ path, title, description, icon: Icon }, i) => <a href={path} key={path}><span className="hs-project-value-icon"><Icon size={25} aria-hidden="true" /></span><div><h3>{title}</h3><p>{description}</p><small>{['心理健康教育 · ACT · DNA-V', '学习动机 · 学习信念 · 考试调适', '有效沟通 · 相互理解 · 协同支持', 'SEL · 校园关系 · 整校实践'][i]}</small></div><ArrowRight size={19} aria-hidden="true" /></a>)}</div></section>
    <section className="hs-topic-section hs-project-research" id="research" tabIndex={-1} aria-label="研究与方法依据"><SectionHeading number="02 / 有依据，也有边界" title="为什么选择这些研究与实践方向？">以下文献与指南是领域依据，解释我们的工作方向；不代表 Huischool 已取得对应效果。</SectionHeading><div className="hs-project-research-grid">{schoolResearchReferences.map(ref => <div className="hs-project-research-card" key={ref.url}><span className="hs-topic-tag">{ref.label}</span><h3>{ref.title}</h3><p>{ref.text}</p><p className="hs-project-source">{ref.citation}</p><p className="hs-project-limit">{ref.limit}</p><a href={ref.url} target="_blank" rel="noreferrer">{ref.link}<ArrowUpRight size={16} aria-hidden="true" /><span className="hs-visually-hidden">（在新窗口打开）</span></a></div>)}</div></section>
    <section className="hs-topic-section" id="references" tabIndex={-1} aria-label="项目资料预留区域"><SectionHeading number="03 / 逐步积累，审慎公开" title="项目资料与实践记录">经核实并获准公开的资料，将在这里逐步呈现。</SectionHeading><div className="hs-project-reference-grid"><section className="hs-project-reference" aria-labelledby="hs-experts-title"><UsersRound size={28} aria-hidden="true" /><h3 id="hs-experts-title">项目专家与合作伙伴</h3><p>资料待补充</p><span>经确认与授权后，公开专家及合作伙伴资料。</span></section><section className="hs-project-reference" aria-labelledby="hs-results-title"><BookOpen size={28} aria-hidden="true" /><h3 id="hs-results-title">项目实践与研究成果</h3><p>资料待补充</p><span>经核实后，公开实践案例、研究成果及其适用边界。</span></section></div></section>
    <section className="hs-topic-section" id="workflow" tabIndex={-1} aria-label="实践工作流程"><SectionHeading number="04 / 从理解到行动" title="我们如何开展工作？">让学校、教师、家长和专业团队共同参与，围绕真实需要形成可持续的支持。</SectionHeading><PracticeSteps join={false} /><p className="hs-project-note">具体资源与实施安排以正式确认为准；涉及未成年人研究、测评和数据使用时，须先完成相应审核与准入。</p></section>
    <ProjectLinks about />
  </div></article>
}
