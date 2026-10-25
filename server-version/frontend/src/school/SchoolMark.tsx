import a1Emblem from './huischool-a1-emblem.svg'
import schoolWordmark from './huischool-wordmark.svg'
import schoolHomeWordmark from './school-home-wordmark.svg'

/** Preserve the approved A1 artwork; the two-line wordmark is outlined SVG. */
export function HuischoolA1Emblem({ className }: { className: string }) {
  return <img className={className} src={a1Emblem} alt="" aria-hidden="true"/>
}
export function SchoolMark({ home = false }: { home?: boolean } = {}) {
  return <div className="hs-brand" aria-label="School @eduk12.top">
    <HuischoolA1Emblem className="hs-brand-icon"/>
    <svg className="hs-brand-wordmark" viewBox="0 0 400 150" width="135" height="51"
      role="img" aria-label="School @eduk12.top" focusable="false"
      style={{ color: 'var(--hs-brand-ink, var(--hs-ink, #204c38))' }}>
      <use href={`${home ? schoolHomeWordmark : schoolWordmark}#school-wordmark`}/>
    </svg>
  </div>
}
export function SchoolHeroMark() {
  return <div className="hs-hero-brand-art" aria-hidden="true"><HuischoolA1Emblem className="hs-hero-brand-icon"/></div>
}
