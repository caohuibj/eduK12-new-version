// Run synchronously while parsing <head>, before loading React or product chunks.
// Keep this same-origin script external to respect the production script-src policy.
(() => {
  const hostname = window.location.hostname.toLowerCase().replace(/\.$/, '')
  const development = document.currentScript?.dataset.development === 'true'
  const productOrigin = ['training.eduk12.top', 'survey.eduk12.top'].includes(hostname)
    || (development && ['localhost', '127.0.0.1', 'training.localhost', 'survey.localhost'].includes(hostname))
  const surveyAdminEntry = productOrigin
    && ['/admin/login', '/admin/security/enroll'].includes(window.location.pathname)
    && new URLSearchParams(window.location.search).get('returnTo') === '/admin/survey-researchers'
  const survey = hostname === 'survey.eduk12.top' || (development && hostname === 'survey.localhost') || surveyAdminEntry
  document.title = survey ? 'Research' : '慧育空间'
  const icon = document.head.querySelector('link[rel="icon"]')
  if (icon) icon.setAttribute('href', survey ? '/survey/huisurvey-w2-emblem.svg' : '/vite.svg')
})()
