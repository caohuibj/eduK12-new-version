import { isSurveyHost } from './survey/context'
import { isSchoolHost } from './school/context'
import { isHuiteacherHost } from './huiteacher/context'

// Host selection is presentation only; existing backend authorization is unchanged.
// Keep imports inside the chosen branch so unrelated products do not block startup.
export function loadProductApp(
  hostname = window.location.hostname,
  pathname = window.location.pathname,
) {
  if (isHuiteacherHost(hostname)) return import('./huiteacher/HuiteacherApp')
  if (isSchoolHost(hostname)) return import('./school/SchoolApp')
  if (isSurveyHost(hostname)) {
    return pathname.startsWith('/r/') ? import('./survey/SurveyPublicApp') : import('./survey/SurveyApp')
  }
  return import('./App')
}
