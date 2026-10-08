import './training-brand.css'

/** Training entry, authentication and course workspace share one logo. */
export default function TrainingBrand() {
  return <span className="training-wordmark training-wordmark--mountain">
    <svg className="training-brand-icon" viewBox="0 0 95 64" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 58 25 23c4-6 7-6 11 0l9 15V58H3Z" fill="#24483d" />
      <path d="m19 58 17-22 11 15 7-12 16 19H19Z" fill="#8da8a0" />
      <path d="M47 18c0-5 4-9 9-9s9 4 9 9v15l18 25H66L55 44 45 58H34l13-22V18Z" fill="#25473d" />
      <path d="M48 33h17v8H48z" fill="#fcfaf6" />
      <circle cx="81" cy="13" r="9" fill="#b87960" />
    </svg>
    <span>huisurvey</span>
  </span>
}
