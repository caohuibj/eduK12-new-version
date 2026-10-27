import a1Emblem from './huischool-a1-emblem.svg'
import a1EmblemDark from './huischool-a1-emblem-dark.svg'
import schoolWordmark from './school-home-wordmark.svg'
import './school-brand.css'

/** Preserve the approved A1 artwork; the two-line wordmark is outlined SVG. */
export function HuischoolA1Emblem({ className }: { className: string }) {
  return <>
    <img className={`${className} hs-emblem hs-emblem--light`} src={a1Emblem} alt="" aria-hidden="true"/>
    <img className={`${className} hs-emblem hs-emblem--dark`} src={a1EmblemDark} alt="" aria-hidden="true"/>
  </>
}
export function SchoolMark() {
  return <div className="hs-brand" aria-label="School @eduk12.top">
    <HuischoolA1Emblem className="hs-brand-icon"/>
    <svg className="hs-brand-wordmark" viewBox="0 0 400 150" width="135" height="51"
      role="img" aria-label="School @eduk12.top" focusable="false"
      style={{ color: 'var(--hs-brand-ink, var(--hs-ink, #204c38))' }}>
      <use href={`${schoolWordmark}#school-wordmark`}/>
    </svg>
  </div>
}
export function SchoolHeroMark() {
  return <div className="hs-hero-brand-art" aria-hidden="true"><HuischoolA1Emblem className="hs-hero-brand-icon"/></div>
}
