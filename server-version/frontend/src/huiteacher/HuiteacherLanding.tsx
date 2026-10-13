import { useRef, useState } from 'react'
import { NotebookPen, School, ScanEye, Sprout } from 'lucide-react'

/* Summarized from the implemented Teacher workspaces on main, not the future product roadmap. */
const features=[
  {title:'教师成长',description:'在实践中看见成长',Icon:NotebookPen,
    detail:'通过自主测评、评价任务与个人反馈，回顾日常实践。',note:'使用自己的教育账号，进入教师成长空间。'},
  {title:'学校改进',description:'让共同改进有方向',Icon:School,
    detail:'组织调查、活动评价与群体反馈，支持学校共同改进。',note:'学校管理功能由已开通的产品与本人授权决定。'},
  {title:'实践观察',description:'留下观察与专业反馈',Icon:ScanEye,
    detail:'在课堂、会议与教研中，记录事实观察与专业意见。',note:'专家以活动邀请参与，私人反思由本人保留。'},
  {title:'持续改进',description:'让目标走向行动',Icon:Sprout,
    detail:'从反馈出发，设定目标、记录行动，再次回顾进展。',note:'在已获授权的任务或实践活动中延续成长。'},
]
function Arrow() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
}

export function HuiteacherLanding({ onEnter }: { onEnter: () => void }) {
  const about=useRef<HTMLDialogElement>(null)
  const aboutTitle=useRef<HTMLHeadingElement>(null)
  const [feature,setFeature]=useState(features[0])
  const openFeature=(next:typeof features[number])=>{
    setFeature(next);about.current?.showModal();aboutTitle.current?.focus()
  }
  return <>
    <section className="ht-journal" aria-labelledby="ht-journal-title">
      <div className="ht-journal-copy">
        <span className="ht-journal-rule" aria-hidden="true"/>
        <h1 id="ht-journal-title"><span>从每一次思考，</span><span>走向更好的教育。</span></h1>
        <p>在日常实践中，看见成长的方向。</p>
        <div className="ht-journal-actions">
          <button type="button" className="ht-primary" onClick={onEnter}>进入 Huiteacher <Arrow/></button>
          <a className="ht-learn" href="#ht-features">了解平台 <Arrow/></a>
        </div>
      </div>
      <figure className="ht-journal-art">
        <img className="ht-journal-image" src="/huiteacher/educator-journal.webp"
          srcSet="/huiteacher/educator-journal-small.webp 768w, /huiteacher/educator-journal.webp 1536w"
          sizes="(max-width: 600px) 1100px, 100vw"
          width="1536" height="1024" fetchPriority="high" decoding="async"
          alt="阳光落在展开的工作手记上，书页留着教室观察的铅笔速写，一旁是浅杏色笔记本。"/>
      </figure>
      <section className="ht-feature-strip" id="ht-features" aria-label="教师发展与学校改进" tabIndex={-1}>
        {features.map(({title,description,Icon},index)=><button className="ht-feature" type="button" key={title}
          onClick={()=>openFeature(features[index])} aria-labelledby={`ht-feature-title-${index}`} aria-describedby={`ht-feature-desc-${index}`}>
          <Icon size={29} strokeWidth={1.5} aria-hidden="true"/>
          <h2 id={`ht-feature-title-${index}`}>{title}</h2>
          <p id={`ht-feature-desc-${index}`}>{description}</p>
        </button>)}
      </section>
    </section>
    <dialog className="ht-about" ref={about} aria-labelledby="ht-about-title"
      onClick={event=>{if(event.target===event.currentTarget)about.current?.close()}}>
      <div className="ht-about-inner">
        <button type="button" className="ht-about-close" onClick={()=>about.current?.close()} aria-label="关闭平台介绍">×</button>
        <h2 id="ht-about-title" ref={aboutTitle} tabIndex={-1}>{feature.title}</h2>
        <p>{feature.detail}</p>
        <p className="ht-about-note">{feature.note}</p>
        <button type="button" className="ht-primary" onClick={()=>{about.current?.close();onEnter()}}>进入 Huiteacher <Arrow/></button>
      </div>
    </dialog>
  </>
}
