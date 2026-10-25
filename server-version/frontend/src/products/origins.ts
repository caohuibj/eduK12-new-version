import { isLoopbackSurveyDevelopment } from './development-entry'
import { TRAINING_HOST } from '../training/context'
import { SURVEY_HOST } from '../survey/context'

export const SURVEY_ADMIN_PATH = '/admin/survey-researchers'
type ProductOrigins = { admin: string; survey: string }
const currentOrigin = () => typeof window === 'undefined' ? '' : window.location.origin

/** Presentation links only. Never infer authorization, trust arbitrary Host values,
 * or copy cookies/credentials between product origins. */
export function productOrigins(origin = currentOrigin(), development = import.meta.env.DEV): ProductOrigins | null {
  try {
    const url = new URL(origin)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) return null
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (host === TRAINING_HOST || host === SURVEY_HOST)
      return { admin: `https://${TRAINING_HOST}`, survey: `https://${SURVEY_HOST}` }
    if (development && ['localhost', '127.0.0.1', 'training.localhost', 'survey.localhost'].includes(host)) {
      const suffix = url.port ? `:${url.port}` : ''
      return {
        admin: `${url.protocol}//${host === '127.0.0.1' ? host : 'localhost'}${suffix}`,
        survey: isLoopbackSurveyDevelopment(host, development) ? url.origin : `${url.protocol}//survey.localhost${suffix}`,
      }
    }
  } catch { /* Unsupported origins must not silently send a local capability to production. */ }
  return null
}
export function surveyAdminLoginUrl(origin?: string, development?: boolean): string | null {
  const origins = productOrigins(origin, development)
  return origins ? `${origins.admin}/admin/login?returnTo=${encodeURIComponent(SURVEY_ADMIN_PATH)}` : null
}
export function surveyInvitationUrl(kind: 'claim' | 'reset-password', token: string, origin?: string, development?: boolean): string | null {
  const origins = productOrigins(origin, development)
  return origins && token ? `${origins.survey}/${kind}#token=${encodeURIComponent(token)}` : null
}

/** The API returns the canonical production URL. Accept only that fixed contract,
 * then display the matching environment's URL for display, clipboard and QR. */
export function surveyRecruitmentUrl(value: string, origin?: string, development?: boolean): string | null {
  const origins = productOrigins(origin, development)
  if (!origins) return null
  try {
    const url = new URL(value)
    if (url.origin !== `https://${SURVEY_HOST}` || url.username || url.password || url.search ||
      !/^\/r\/[a-zA-Z0-9_-]+$/.test(url.pathname) || !/^#entry=[a-zA-Z0-9_-]+$/.test(url.hash)) return null
    return origins.survey + url.pathname + url.hash
  } catch { return null }
}
