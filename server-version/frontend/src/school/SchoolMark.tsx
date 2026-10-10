import a1Emblem from './huischool-a1-emblem.svg'
import a1Wordmark from './huischool-wordmark.svg'

/** A1 emblem traced from the approved original; existing Baskerville wordmark outlined as SVG. Both have transparent negative space.
 * Original source retained in huischool-a1-source.png; unrelated B3/W2 artwork is untouched.
 */
export function HuischoolA1Emblem({ className }: { className: string }) {
  return <img className={className} src={a1Emblem} alt="" aria-hidden="true"/>
}
export function SchoolMark() {
  return <div className="hs-brand" aria-label="Huischool">
    <HuischoolA1Emblem className="hs-brand-icon"/>
    <img className="hs-brand-wordmark" src={a1Wordmark} alt="Huischool"/>
  </div>
}
export function SchoolHeroMark() {
  return <div className="hs-hero-brand-art" aria-hidden="true"><HuischoolA1Emblem className="hs-hero-brand-icon"/></div>
}
