import type { ReactNode } from 'react'
import AuthenticatorHelp from '../components/auth/AuthenticatorHelp'

export function SurveyEntryPanel({ title, intro, children, backTo = '/', backLabel = '返回首页', audience = 'researcher' }: {
  title: string
  intro?: string
  children: ReactNode
  backTo?: string
  backLabel?: string
  audience?: 'researcher' | 'admin'
}) {
  return <section className="survey-entry-panel">
    <a className="survey-back" href={backTo}>{backLabel}</a>
    <div className="survey-entry-heading"><h1>{title}</h1><AuthenticatorHelp audience={audience}/></div>
    {intro && <p className="survey-entry-intro">{intro}</p>}
    {children}
  </section>
}
