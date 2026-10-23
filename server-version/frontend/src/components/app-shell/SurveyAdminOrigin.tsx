import { useEffect, type ReactNode } from 'react'
import { productOrigins, SURVEY_ADMIN_PATH } from '../../products/origins'

/** Choose the final cookie host before mounting credentials or governance requests.
 * A fixed destination intentionally discards source query strings and fragments. */
export default function SurveyAdminOrigin({ children, login = false }: { children: ReactNode; login?: boolean }) {
  const origins = productOrigins()
  const requested = new URLSearchParams(window.location.search).get('returnTo')
  const returnTo = requested === SURVEY_ADMIN_PATH || requested === '/admin/training' ? requested : '/users'
  const destination = origins ? origins.admin + (login ? `/admin/login?returnTo=${encodeURIComponent(returnTo)}` : SURVEY_ADMIN_PATH) : null
  const move = Boolean(origins && origins.admin !== window.location.origin)
  useEffect(() => {
    if (move && destination) window.location.replace(destination)
  }, [move, destination])
  if (!origins) return <p role="alert">当前地址不支持 Survey 管理入口，请使用已配置的管理站点。</p>
  if (move) return <p role="status">正在转到管理入口；如未登录，请在该站点重新登录。</p>
  return <>{children}</>
}
