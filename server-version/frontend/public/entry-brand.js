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
  const trainingHost = hostname === 'training.eduk12.top' || (development && hostname === 'training.localhost')
  const isTrainingAdminPath = value => ['/admin/training', '/admin/training/accounts', '/admin/training/courses', '/admin/training/resources', '/admin/training/profile'].includes(value.replace(/\/$/, ''))
  const trainingAdminPage = !survey && productOrigin && isTrainingAdminPath(window.location.pathname)
  const trainingAdminEntry = trainingAdminPage
    || (productOrigin && ['/admin/login', '/admin/security/enroll'].includes(window.location.pathname)
      && isTrainingAdminPath(new URLSearchParams(window.location.search).get('returnTo') || ''))
  const training = trainingHost || trainingAdminEntry
  if (training && !survey) {
    let mode = 'auto'
    try { mode = localStorage.getItem('training:appearance:boot:v1') || 'auto' } catch { /* Use the local clock when storage is unavailable. */ }
    const hour = new Date().getHours()
    const theme = mode === 'dark' || (mode !== 'light' && (hour < 7 || hour >= 19)) ? 'dark' : 'light'
    document.documentElement.dataset.trainingEntry = 'true'
    document.documentElement.dataset.trainingTheme = theme
  }
  document.title = survey ? 'Research' : training ? 'Training' : '慧育空间'
  const icon = document.head.querySelector('link[rel="icon"]')
  if (icon) icon.setAttribute('href', survey ? '/survey/huisurvey-w2-emblem.svg' : training ? '/training/favicon.svg?v=20261023-compact' : '/vite.svg')
})()
