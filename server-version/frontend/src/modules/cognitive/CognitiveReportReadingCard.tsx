import { useId, useState } from 'react'
import type { CognitiveV2Report, CognitiveV2ReportMetricView } from './types'
import CognitiveReportVisual from './CognitiveReportVisual'
import './cognitive-report-reading.css'

const label = (metric: CognitiveV2ReportMetricView) => metric.participantLabel ?? metric.label

function TaskIllustration({ kind }: { kind?: 'signal' | 'sequence' | 'stop' | 'rules' }) {
  return <svg aria-hidden="true" className="cognitive-reading__illustration" viewBox="0 0 120 100">
    <rect x="12" y="10" width="96" height="80" rx="24" fill="#edf4ff" />
    {kind === 'sequence' ? <><path d="M31 36h58M31 66h58" stroke="#b0c9eb" strokeWidth="3" />{[0, 1, 2].map(i => <g key={i}><rect x={24 + i * 25} y="29" width="21" height="40" rx="7" fill={i === 1 ? '#168b83' : '#e0f3ee'} /><text x={34 + i * 25} y="55" textAnchor="middle" fontSize="15" fill={i === 1 ? 'white' : '#14304a'}>{i + 1}</text></g>)}</>
      : kind === 'stop' ? <><circle cx="60" cy="50" r="26" fill="#e0f3ee" /><rect x="46" y="36" width="28" height="28" rx="5" fill="#168b83" /><path d="M29 23l-5-5m67 5l5-5" stroke="#7aa0e8" strokeWidth="3" strokeLinecap="round" /></>
        : kind === 'rules' ? <><path d="M35 30h43l-7-7m7 7l-7 7M84 69H41l7-7m-7 7l7 7" stroke="#168b83" strokeWidth="4" fill="none" strokeLinecap="round" /><rect x="24" y="42" width="23" height="23" rx="6" fill="#b0c9eb" /><circle cx="85" cy="47" r="12" fill="#14304a" /></>
          : <><circle cx="60" cy="48" r="24" fill="#e0f3ee" /><circle cx="60" cy="48" r="11" fill="#168b83" /><path d="M77 76L64 55l23 8-8 4-2 9" fill="#14304a" stroke="white" strokeWidth="2" /><path d="M32 29l-5-5m61 5l5-5M60 20v-8" stroke="#7aa0e8" strokeWidth="3" strokeLinecap="round" /></>}
  </svg>
}

export default function CognitiveReportReadingCard({ report, references = [], attemptNo, finishedAt, anonymousCode }: {
  report: CognitiveV2Report
  references?: Array<Record<string, unknown>>
  attemptNo?: number
  finishedAt?: string | null
  anonymousCode?: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const reading = report.reading!
  const state = reading.interpretation.state
  const metrics = [...report.headline, ...report.user]
  const details = [...new Map([...metrics, ...report.detail].map(metric => [metric.key, metric])).values()]
  const referenceRows = report.qualityState === 'invalid' ? [] : references.filter(reference => !reading.interpretation.withheldMetricKeys.includes(String(reference.metricKey ?? reference.scoreKey ?? '')))
  const status = state === 'withheld' ? '部分关键指标暂不解释' : state === 'qualified' ? '存在质量限制 · 谨慎阅读' : '记录可用于描述这次任务'
  const date = finishedAt && Number.isFinite(Date.parse(finishedAt)) ? new Date(finishedAt).toLocaleString('zh-CN') : null
  return (
    <article className="cognitive-reading" aria-label={`${report.title}报告`}>
      <header className="cognitive-reading__masthead"><div><span className="cognitive-reading__mark" aria-hidden="true" />认知探索 <span> / 本次任务报告</span></div><p>{report.title} · {report.profileLabel || '认知任务'}{attemptNo != null ? ` · 尝试 ${attemptNo}` : ''}{date ? ` · ${date}` : ''}{anonymousCode ? ` · 匿名编号 ${anonymousCode}` : ''}</p></header>
      <div className="cognitive-reading__body">
        <div className="cognitive-reading__intro"><div><p className="cognitive-reading__eyebrow">看懂一次表现</p><h1>{reading.title}</h1><p>{reading.introduction}</p></div><TaskIllustration kind={reading.illustration} /></div>
        <div className="cognitive-reading__controls" data-report-screen-only><div className="cognitive-reading__views" aria-label="报告阅读层次"><button type="button" aria-pressed={!expanded} onClick={() => setExpanded(false)}>学生 / 家长</button><button type="button" aria-pressed={expanded} aria-controls={`${id}-detail`} aria-expanded={expanded} onClick={() => setExpanded(true)}>详细解读</button></div><button type="button" className="cognitive-reading__print" onClick={() => window.print()}>打印报告</button></div>
        <section className={`cognitive-reading__summary cognitive-reading__summary--${state}`} aria-label="本次反馈"><p className="cognitive-reading__status">{status}</p><h2>{reading.feedback.summary}</h2>{state !== 'available' && reading.interpretation.reasons.length > 0 && <p className="cognitive-reading__reasons">需要留意：{reading.interpretation.reasons.join('、')}。这些提示不能说明原因，也不能用于诊断。</p>}</section>
        {reading.caveats.length > 0 && <aside className="cognitive-reading__caveats" aria-label="协议限制"><h2>阅读前，先了解这些限制</h2>{reading.caveats.map(caveat => <p key={caveat}>{caveat}</p>)}</aside>}
        {metrics.length > 0 && <section className="cognitive-reading__metrics" aria-label="本次记录">{metrics.map(metric => <div key={metric.key} className="cognitive-reading__metric"><p>{label(metric)}</p><strong>{metric.formatted}</strong>{metric.explanation && <small>{metric.explanation}</small>}</div>)}</section>}
        {reading.visuals.map((visual, index) => <CognitiveReportVisual visual={visual} key={`${visual.kind}-${index}`} />)}
        <div className="cognitive-reading__next"><section><p className="cognitive-reading__eyebrow">接下来，可以这样做</p><h2>{state === 'withheld' ? '先确认操作与条件' : '留下一步行动'}</h2><p>{reading.feedback.nextStep}</p></section><section><h2>这份报告可以告诉你什么？</h2><p>{report.disclaimer}</p><p>设备、操作方式和当时状态都可能影响记录。这里不提供同龄排名或稳定能力等级。</p></section></div>
        <section id={`${id}-detail`} hidden={!expanded} className="cognitive-reading__detail" aria-label="详细解读">
          <h2>详细解读 · 先看质量，再读指标</h2><p className="cognitive-reading__method-note">供教师与需要了解依据的读者阅读。这里只包含本次报告已获准展示的数据。</p>
          {details.length > 0 ? <div className="cognitive-reading__table-scroll"><table><thead><tr><th scope="col">指标</th><th scope="col">本次记录</th><th scope="col">阅读依据</th></tr></thead><tbody>{details.map(metric => <tr key={metric.key}><th scope="row">{label(metric)}</th><td>{metric.formatted}</td><td>{metric.explanation || '按当前任务的指标定义记录；不作跨任务能力比较。'}</td></tr>)}</tbody></table></div> : <p>本次没有足够的可解释指标，保留完成和质量记录。</p>}
          {referenceRows.map((reference, index) => <p key={index}>{typeof reference.label === 'string' ? reference.label : '参考信息'}：{typeof reference.disclaimer === 'string' ? reference.disclaimer : typeof reference.unavailableReason === 'string' ? reference.unavailableReason : '请按本次报告的参考适用范围阅读。'}</p>)}
          <p className="cognitive-reading__method-note">协议类型表示任务设计差异，不代表已经具备科研级验证。当前记录不能据此用于临床诊断。</p>
          {reading.methodCaveats?.length ? <div className="cognitive-reading__method-note"><h3>协议依据</h3>{reading.methodCaveats.map(caveat => <p key={caveat}>{caveat}</p>)}</div> : null}
          <p className="cognitive-reading__versions">任务 {report.method.testType} · 引擎 {report.method.engineVersion} · 评分 {report.method.scoringVersion} · 配置 {report.method.configVersion}<br />呈现 {reading.presentationVersion} · 报告规则 {reading.reportVersion}</p>
        </section>
      </div><footer className="cognitive-reading__footer">认知探索 · 看懂一次表现，留下一个行动</footer>
    </article>
  )
}
