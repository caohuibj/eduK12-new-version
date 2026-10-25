import teacherWordmark from './teacher-wordmark.svg'
import teacherHomeWordmark from './teacher-home-wordmark.svg'

/** The approved B3 emblem and font-independent two-line Teacher identity. */
export default function TeacherBrand({ home = false }: { home?: boolean } = {}) {
  return <div className="ht-brand" aria-label="Teacher @eduk12.top">
    <img className="ht-brand-symbol ht-brand-b3" src="/huiteacher/huiteacher-b3-emblem.svg"
      width="56" height="64" alt="" aria-hidden="true"/>
    <svg className="ht-brand-wordmark" viewBox="0 0 400 150" width="144" height="54"
      role="img" aria-label="Teacher @eduk12.top" focusable="false"
      style={{ display: 'block', maxWidth: '100%', height: 'auto', color: 'var(--ht-brand-ink, var(--ht-copper, #8b573e))' }}>
      <use href={`${home ? teacherHomeWordmark : teacherWordmark}#teacher-wordmark`}/>
    </svg>
  </div>
}
