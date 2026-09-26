import type { ReportingSourceSummary } from '../../api/reporting'
const families:Record<string,string>={SCALE:'量表',COGNITIVE:'认知任务',BUNDLE:'综合测评',SITUATIONAL:'情境测评'}
export function measurementLabel(source:ReportingSourceSummary) {
  const key=source.resource.key
  const name=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(key)?source.runName:key.replace(/_/g,' ')
  return `${name} · ${families[source.resource.family] || '测量'}`
}
export function resourceLabel(sources:ReportingSourceSummary[],key:string) {
  const source=sources.find(s=>`${s.resource.family}/${s.resource.key}`===key)
  return source?measurementLabel(source):'测量项目'
}
