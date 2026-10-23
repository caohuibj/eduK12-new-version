import type { ComponentProps } from 'react'
import type AuthShell from '../components/auth/AuthShell'
import { productOrigins } from '../products/origins'
import { SurveyPublicHeader } from './SurveyLanding'
import { SurveyEntryPanel } from './SurveyEntryPanel'
import { useSurveyAppearance } from './SurveyAppearance'
import { surveyAppearanceHref } from './survey-appearance-links'

/** Same public entry surfaces as researcher login; authentication stays in the caller. */
export default function SurveyAdminEntryShell({ title, description, children, backTo, backLabel }: ComponentProps<typeof AuthShell>) {
  const origins = productOrigins()
  const { mode } = useSurveyAppearance()
  const home = origins ? surveyAppearanceHref(origins.survey + '/', mode) : '/'
  return <div className="survey-entry survey-admin-entry">
    <a className="survey-skip-link" href="#survey-entry-content">跳至主要内容</a>
    <SurveyPublicHeader entry surveyOrigin={origins?.survey}/>
    <main className="survey-entry-main" id="survey-entry-content" tabIndex={-1}>
      <SurveyEntryPanel title={title} intro={description} backTo={backTo ?? home} backLabel={backLabel ?? '返回首页'} audience="admin">
        {children}
      </SurveyEntryPanel>
    </main>
  </div>
}
