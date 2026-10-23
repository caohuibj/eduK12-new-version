import { useEffect, type ReactNode } from 'react'
import { productOrigins, SURVEY_ADMIN_PATH } from '../../products/origins'
import { surveyAppearanceFromSearch, surveyAppearanceHref } from '../../survey/survey-appearance-links'

/** Choose the final cookie host before mounting credentials or governance requests.
 * Only the fixed destination and a validated appearance hint may cross origins. */
export default function SurveyAdminOrigin({ children, login = false }: { children: ReactNode; login?: boolean }) {
  const origins = productOrigins()
  const returnTo = new URLSearchParams(window.location.search).get('returnTo') === SURVEY_ADMIN_PATH ? SURVEY_ADMIN_PATH : '/users'
  const destination = origins ? origins.admin + (login ? `/admin/login?returnTo=${encodeURIComponent(returnTo)}` : SURVEY_ADMIN_PATH) : null
  const appearance = surveyAppearanceFromSearch(window.location.search)
  const target = destination && login && appearance ? surveyAppearanceHref(destination, appearance) : destination
  const move = Boolean(origins && origins.admin !== window.location.origin)
  useEffect(() => {
    if (move && target) window.location.replace(target)
  }, [move, target])
  if (!origins) return <p role="alert">当前地址不支持 Survey 管理入口，请使用已配置的管理站点。</p>
  if (move) return <p role="status">正在转到管理入口；如未登录，请在该站点重新登录。</p>
  return <>{children}</>
}
