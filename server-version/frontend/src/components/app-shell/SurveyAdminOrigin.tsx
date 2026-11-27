import { useEffect, type ReactNode } from 'react'
import { standardAssignmentReturnTo } from '../../admin/standardAssignmentTarget'
import { productOrigins, SURVEY_ADMIN_PATH } from '../../products/origins'
import { surveyAppearanceFromSearch, surveyAppearanceHref } from '../../survey/survey-appearance-links'

/** Choose the final cookie host before mounting credentials or governance requests.
 * Preserve a validated assignment target and appearance hint on the fixed destination. */
export default function SurveyAdminOrigin({ children, login = false }: { children: ReactNode; login?: boolean }) {
  const origins = productOrigins()
  const requested = new URLSearchParams(window.location.search).get('returnTo')
  const linked = standardAssignmentReturnTo(requested)
  const returnTo = linked?.startsWith(SURVEY_ADMIN_PATH+'?') ? linked : requested === SURVEY_ADMIN_PATH || requested === '/admin/training' ? requested : '/users'
  const tool = standardAssignmentReturnTo(SURVEY_ADMIN_PATH+window.location.search)
  const destination = origins ? origins.admin + (login ? `/admin/login?returnTo=${encodeURIComponent(returnTo)}` : tool??SURVEY_ADMIN_PATH) : null
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
