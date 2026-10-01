import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { cognitiveRunnerEntries } from '../../frontend/src/modules/cognitive/generated/runners'
import CognitiveV2ReportCard from '../../frontend/src/modules/cognitive/CognitiveV2ReportCard'
import CognitiveProfessionalReports from '../../frontend/src/modules/cognitive/CognitiveProfessionalReports'
import { cognitiveApi } from '../../frontend/src/modules/cognitive/api'
import { AssessmentShell } from '../../frontend/src/components/assessment-shell'
import type { CognitiveV2Report } from '../../frontend/src/modules/cognitive/types'
import { matrixSequence } from '../../frontend/src/modules/cognitive/tasks/shared/prng'

const corpus = JSON.parse(document.getElementById('review-corpus')!.textContent!) as Array<{ key: string; label: string; report: CognitiveV2Report }>
const seeds = JSON.parse(document.getElementById('review-seeds')!.textContent!) as Array<{ testType: string; scoringVersion: string; configVersion: string; config: Record<string, unknown> }>

;(window as any).reviewMatrixPracticeOptions = matrixSequence('matrix-practice-v1', 6).slice(0, 4).map(item => item.correctOption)

const entries = cognitiveRunnerEntries.filter(entry => entry.testType !== 'fake')
const demo = corpus.find(item => item.key === 'reaction-valid')!
const reportId = (n: number) => `CR-${String(n).repeat(24)}`
cognitiveApi.professionalReports = async () => ({ code: 0, data: { assignmentId: 'review-local', assignmentTitle: '示范：简单反应时 · A班', total: 2, offset: 0, nextOffset: null, records: [1, 2].map(n => ({ label: `${reportId(n)} · 尝试 1`, reportId: reportId(n), finishedAt: `2026-10-01T08:3${n - 1}:00Z`, report: demo.report, references: [], unavailableReason: null })) } }) as any

function App() {
  const [mode, setMode] = useState('runner')
  const [task, setTask] = useState(entries[0].testType)
  const [reportKey, setReportKey] = useState('reaction-valid')
  const [legacy, setLegacy] = useState(false)
  const entry = entries.find(item => item.testType === task)!
  const seed = seeds.find(item => item.testType === task && item.scoringVersion === entry.scoringVersion) ?? seeds.find(item => item.testType === task)!
  const item = corpus.find(item => item.key === reportKey)!
  const report = structuredClone(item.report)
  if (legacy) { delete (report.reading as any).popular; delete (report.reading as any).professional }
  const Runner = entry.RunnerComponent
  return <><nav id="review-controls" data-report-screen-only style={{ padding: 12, display: 'flex', gap: 12, flexWrap: 'wrap', background: '#e8edf2' }}>
    <label>场景 <select aria-label="场景" value={mode} onChange={e => setMode(e.target.value)}><option value="runner">测验界面</option><option value="report">个体报告</option><option value="teacher">后台阅读器</option></select></label>
    <label>测验 <select aria-label="测验" value={task} onChange={e => setTask(e.target.value)}>{entries.map(item => <option value={item.testType} key={item.testType}>{item.name}</option>)}</select></label>
    <label>样本 <select aria-label="样本" value={reportKey} onChange={e => setReportKey(e.target.value)}>{corpus.map(item => <option value={item.key} key={item.key}>{item.label}</option>)}</select></label>
    <label><input type="checkbox" aria-label="旧分层格式" checked={legacy} onChange={e => setLegacy(e.target.checked)} />旧分层格式（同一份合成结果）</label>
  </nav><main id="review-content" style={{ padding: mode === 'runner' ? 0 : 16, maxWidth: 1100, margin: '0 auto' }}>
    {mode === 'runner' ? <AssessmentShell title={entry.name} progress={{ kind: 'phase', phase: '任务进行中', detail: '合成配置，仅检查视觉和练习；不记录真实答案。', label: '任务进度' }}><div data-cognitive-task-root="true"><Runner key={task} taskContext={{ sessionId: 'review-local', testType: task, engineVersion: entry.engineVersion, scoringVersion: entry.scoringVersion, configVersion: seed?.configVersion ?? 'review', config: seed?.config ?? {}, attemptNo: 1, randomSeed: 'review-local-fixed' }} trialIndex={0} onTrialComplete={async () => true} onTaskComplete={async () => {}} /></div></AssessmentShell>
      : mode === 'report' ? <CognitiveV2ReportCard report={report as any} attemptNo={1} finishedAt="2026-10-01T08:30:00Z" anonymousCode="DEMO-2026-0001" />
      : <div className="cognitive-staff-report-open"><div data-report-screen-only>示范任务编辑区</div><CognitiveProfessionalReports assignmentId="review-local" /></div>}
  </main></>
}
createRoot(document.getElementById('root')!).render(<App />)
