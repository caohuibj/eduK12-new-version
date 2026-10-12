import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SchoolApp from './school/SchoolApp'
import HuiteacherApp from './huiteacher/HuiteacherApp'
import SurveyApp from './survey/SurveyApp'
import SurveyPublicApp from './survey/SurveyPublicApp'
import { isSurveyHost } from './survey/context'
import { isSchoolHost } from './school/context'
import { isHuiteacherHost } from './huiteacher/context'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isHuiteacherHost() ? <HuiteacherApp /> : isSchoolHost() ? <SchoolApp /> : isSurveyHost() ? (window.location.pathname.startsWith('/r/') ? <SurveyPublicApp /> : <SurveyApp />) : <App />}
  </React.StrictMode>,
)
