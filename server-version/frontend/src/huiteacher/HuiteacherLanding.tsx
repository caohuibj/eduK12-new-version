import type { ProductTheme } from '../components/product-theme/useProductTheme'
import { teacherFeatures } from './teacher-features'

function Arrow() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
}

export function HuiteacherLanding({ onEnter, theme = 'light' }: { onEnter: () => void; theme?: ProductTheme }) {
  const artwork=theme === 'dark' ? 'educator-journal-moonlight' : 'educator-journal'
  return <>
    <section className="ht-journal" aria-labelledby="ht-journal-title">
      <div className="ht-journal-copy">
        <span className="ht-journal-rule" aria-hidden="true"/>
        <h1 id="ht-journal-title"><span>从每一次思考，</span><span>走向更好的教育。</span></h1>
        <p>在日常实践中，看见成长的方向。</p>
        <div className="ht-journal-actions">
          <button type="button" className="ht-primary" onClick={onEnter}>进入 Teacher <Arrow/></button>
          <a className="ht-learn" href="#ht-features">了解平台 <Arrow/></a>
        </div>
      </div>
      <figure className="ht-journal-art">
        <img className="ht-journal-image" src={`/huiteacher/${artwork}.webp`}
          srcSet={`/huiteacher/${artwork}-small.webp 768w, /huiteacher/${artwork}.webp 1536w`}
          sizes="(max-width: 600px) 1100px, 100vw"
          width="1536" height="1024" fetchPriority="high" decoding="async"
          alt={theme === 'dark' ? '月光落在展开的工作手记上，书页里的教室窗外挂着月亮，一旁是铜杏色笔记本。' : '阳光落在展开的工作手记上，书页留着教室观察的铅笔速写，一旁是浅杏色笔记本。'}/>
      </figure>
      <section className="ht-feature-strip" id="ht-features" aria-label="教师发展与学校改进" tabIndex={-1}>
        {teacherFeatures.map(({title,description,icon:Icon,path},index)=><a className="ht-feature" href={path} key={path}
          aria-labelledby={`ht-feature-title-${index}`} aria-describedby={`ht-feature-desc-${index}`}>
          <Icon size={29} strokeWidth={1.5} aria-hidden="true"/>
          <h2 id={`ht-feature-title-${index}`}>{title}</h2>
          <p id={`ht-feature-desc-${index}`}>{description}</p>
        </a>)}
      </section>
    </section>

  </>
}
