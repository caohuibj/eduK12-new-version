import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SchoolApp from './school/SchoolApp'
import SurveyApp from './survey/SurveyApp'
import { isSurveyHost } from './survey/context'
import { isSchoolHost } from './school/context'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isSchoolHost() ? <SchoolApp /> : isSurveyHost() ? <SurveyApp /> : <App />}
  </React.StrictMode>,
)
