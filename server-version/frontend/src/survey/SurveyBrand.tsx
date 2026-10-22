import './survey-landing.css'

/** W2 source-art vector trace; provenance distinguishes it from an original SVG master. */
export function SurveyBrand({href='/'}:{href?:string}) {
  return <a className="survey-brand" href={href} aria-label="Huisurvey 首页">
    <img src="/survey/huisurvey-w2-emblem.svg" alt="" width="216" height="184" />
    <span>Huisurvey</span>
  </a>
}
