import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { productOrigins, SURVEY_ADMIN_PATH } from '../products/origins'
import { SurveyAppearance } from './SurveyAppearance'

/** Opt into Survey presentation only for its existing administrator destination. */
export function SurveyAdminAppearance({ children }: { children: ReactNode }) {
  const location = useLocation()
  const survey = productOrigins() && new URLSearchParams(location.search).get('returnTo') === SURVEY_ADMIN_PATH
  if (!survey) return <>{children}</>
  return <SurveyAppearance>{children}</SurveyAppearance>
}
