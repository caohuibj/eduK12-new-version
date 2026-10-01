import { useId } from 'react'
import type { CognitiveV2Report } from './types'
import CognitiveReportVisual from './CognitiveReportVisual'
import './cognitive-report-reading.css'
import './cognitive-report-audiences.css'

/** Editorial vector diagrams explain a process; they never depict individual ability. */
function ProcessDiagram({ scene, step }: { scene: string; step: number }) {
  return <svg viewBox="0 0 240 120" aria-hidden="true">
    <path d="M22 100h196" stroke="#dce6eb" strokeWidth="2" />
    {scene === 'signal' ? <>
      <circle cx="100" cy="52" r="25" fill={step === 0 ? '#168b83' : '#e0efeb'} />
      <circle cx="100" cy="52" r="7" fill={step === 0 ? '#fff' : '#168b83'} />
      {step === 0 ? <path d="M100 13v-7M64 28l-6-5M136 28l6-5" stroke="#14304a" strokeWidth="3" />
        : step === 1 ? <><path d="M144 52h40m-9-9l9 9-9 9" stroke="#14304a" strokeWidth="3" fill="none" /><circle cx="57" cy="52" r="10" fill="#d5a24b" /></>
          : <><path d="M135 45l23 39 3-15 15-5-41-19" fill="#14304a" /><path d="M166 32h28m-28 9h20" stroke="#168b83" strokeWidth="3" /></>}
    </> : scene === 'sequence' ? <>
      {[0, 1, 2].map(i => <g key={i}><rect x={42 + i * 55} y={step === 1 ? 35 + i * 5 : 37} width="42" height="45" rx="6" fill={i === step ? '#168b83' : '#e0efeb'} /><text x={63 + i * 55} y="65" textAnchor="middle" fontSize="18" fill={i === step ? '#fff' : '#14304a'}>{i + 1}</text></g>)}
      <path d="M48 21h133m-7-6l7 6-7 6" stroke="#d5a24b" strokeWidth="2" fill="none" />
    </> : scene === 'stop' ? <>
      <path d="M36 61h68m-9-9l9 9-9 9" stroke="#14304a" strokeWidth="3" fill="none" />
      {step === 0 ? <circle cx="151" cy="60" r="23" fill="#168b83" /> : step === 1 ? <><rect x="126" y="36" width="49" height="49" rx="8" fill="#fbefda" /><path d="M145 45v29m12-29v29" stroke="#ae7723" strokeWidth="7" /></> : <><path d="M118 61l27-22m-27 22l27 22" stroke="#168b83" strokeWidth="3" /><circle cx="158" cy="33" r="13" fill="#e0efeb" /><rect x="146" y="72" width="24" height="24" rx="4" fill="#fbefda" /></>}
    </> : <>
      <circle cx="60" cy="45" r="16" fill="#e0efeb" /><rect x="44" y="72" width="31" height="18" rx="3" fill="#d5a24b" />
      <path d="M94 61h42m-9-8l9 8-9 8" stroke="#14304a" strokeWidth="3" fill="none" />
      {step === 1 ? <path d="M157 32h30v54h-30" stroke="#168b83" strokeWidth="3" fill="none" /> : <><circle cx="176" cy="45" r="15" fill="#168b83" /><rect x="160" y="71" width="31" height="18" rx="3" fill="#d5a24b" /></>}
    </>}
  </svg>
}

export default function CognitiveMagazineReport({ report, attemptNo, finishedAt }: { report: CognitiveV2Report; attemptNo?: number; finishedAt?: string | null }) {
  const id = useId()
  const reading = report.reading!
  const popular = reading.popular!
  const state = reading.interpretation.state
  const metrics = [...report.headline, ...report.user]
  const limitations = state === 'withheld' ? '这次先保留记录，不急着下结论' : state === 'qualified' ? '这次记录有些情况，需要一起看' : '你这次留下的记录'
  return <article className="cognitive-reading cognitive-magazine" aria-label={`${report.title}科普报告`}>
    <header className="cognitive-magazine__masthead"><strong>认知探索 <span>COGNITIVE NOTES</span></strong><span>个体报告 · {report.title}{attemptNo != null ? ` · 第 ${attemptNo} 次` : ''}</span></header>
    <div className="cognitive-magazine__body">
      <div className="cognitive-magazine__cover"><p className="cognitive-magazine__eyebrow">一次作答，一次关于自己的发现</p><h1>{reading.title}</h1><p>{popular.takeaway}</p><button type="button" onClick={() => window.print()} data-report-screen-only>打印这份报告</button></div>
      <section className={`cognitive-magazine__result cognitive-magazine__result--${state}`} aria-label="本次反馈"><p className="cognitive-magazine__eyebrow">{limitations}</p><h2>{state === 'withheld' ? '有些关键记录还不够完整。这次先保留尝试，再看看任务操作和作答环境。' : reading.feedback.summary}</h2>{state !== 'available' && reading.interpretation.reasons.length > 0 && <p>需要一起看：{reading.interpretation.reasons.join('、')}。这不能说明原因，更不代表你有某种问题。</p>}</section>
      <p className="cognitive-magazine__scope" role="note">{report.method.profile === 'experience' ? '本次是简短体验，记录较少，只用于理解这次任务。' : ''}这是一份关于本次作答的记录，不是给你定级。同龄人排名、诊断和职业适合度，都不能由这个小任务得出。</p>
      {metrics.length > 0 && <section className="cognitive-magazine__metrics" aria-label="本次记录">{metrics.map(metric => <div key={metric.key}><p>{popular.metricHelp[metric.key]?.label ?? metric.participantLabel ?? metric.label}</p><strong>{metric.formatted}</strong><p>{popular.metricHelp[metric.key]?.explanation ?? metric.explanation}</p></div>)}</section>}
      <section className="cognitive-magazine__concept" aria-labelledby={`${id}-concept`}><p className="cognitive-magazine__eyebrow">概念小读本</p><h2 id={`${id}-concept`}>{popular.conceptTitle}</h2><p>{popular.concept}</p><ol className="cognitive-magazine__story">{popular.frames.map((frame, index) => <li key={frame.title}><ProcessDiagram scene={popular.scene} step={index} /><div><span>0{index + 1}</span><h3>{frame.title}</h3><p>{frame.text}</p></div></li>)}</ol><p className="cognitive-magazine__diagram-note">图解解释任务过程，与你的分数或能力等级无关。</p></section>
      {reading.visuals.length > 0 && <section aria-label="作答记录图"><p className="cognitive-magazine__eyebrow">回到你的这次作答</p>{reading.visuals.map((visual, index) => <CognitiveReportVisual visual={visual} key={`${visual.kind}-${index}`} />)}</section>}
      <aside className="cognitive-magazine__example"><p className="cognitive-magazine__eyebrow">认知与日常</p><h2>{popular.exampleTitle}</h2><p>{popular.example}</p><small>{popular.boundary}</small></aside>
      <div className="cognitive-magazine__closing"><section><p className="cognitive-magazine__eyebrow">带走一句话</p><blockquote>{popular.takeaway}</blockquote><p>一次记录，帮助你理解过程；认识自己，需要更多情境和时间。</p></section><section><h2>接下来，可以这样做</h2><p>{reading.feedback.nextStep}</p></section></div>
      <details className="cognitive-magazine__notes"><summary>查看本次任务的阅读说明</summary><p>设备、操作方式、任务理解和当时状态可能影响记录。</p>{reading.caveats.map(caveat => <p key={caveat}>{caveat}</p>)}<p>呈现 {reading.presentationVersion} · 报告规则 {reading.reportVersion}{finishedAt && Number.isFinite(Date.parse(finishedAt)) ? ` · 完成于 ${new Date(finishedAt).toLocaleString('zh-CN')}` : ''}</p></details>
      <section className="cognitive-magazine__print-notes"><h2>本次记录的阅读依据</h2><p>设备、操作方式、任务理解和当时状态可能影响记录。</p>{reading.caveats.map(caveat => <p key={caveat}>{caveat}</p>)}<p>呈现 {reading.presentationVersion} · 报告规则 {reading.reportVersion}</p></section>
    </div><footer className="cognitive-magazine__footer">认知探索 · 用科学的眼光，读懂这一次</footer>
  </article>
}
