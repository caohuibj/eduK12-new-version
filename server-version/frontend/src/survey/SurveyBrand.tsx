import './survey-landing.css'

/** Existing W2 vector emblem with outlined two-line lettering, independent of installed fonts. */
export function SurveyBrand({href='/'}:{href?:string}) {
  return <a className="survey-brand" href={href} aria-label="Research 首页">
    <img className="survey-brand__emblem" src="/survey/huisurvey-w2-emblem.svg" alt="" width="216" height="184" />
    <img className="survey-brand__wordmark survey-brand__wordmark--light" src="/survey/research-wordmark.svg" alt="Research @eduk12.top" width="517" height="190" />
    <img className="survey-brand__wordmark survey-brand__wordmark--dark" src="/survey/research-wordmark-dark.svg" alt="Research @eduk12.top" width="517" height="190" />
  </a>
}
