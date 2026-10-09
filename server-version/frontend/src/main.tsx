import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SchoolApp from './school/SchoolApp'
import { isSchoolHost } from './school/context'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isSchoolHost() ? <SchoolApp /> : <App />}
  </React.StrictMode>,
)
