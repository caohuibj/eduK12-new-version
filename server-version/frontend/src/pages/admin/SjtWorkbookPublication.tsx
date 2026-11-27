import { useRef, useState } from 'react'
import { sessionFetch } from '../../api/client'
import type { ReportVisibility } from '../../api/scaleComponentImport'
import { governedRequest, type GovernedItem } from '../../api/surveyGovernance'
import { ReportTemplateFields, type ReportTemplateDefinition } from '../../modules/assessment-core/report/ReportTemplateFields'
import { ScaleComponentReportPresentation } from './ScaleComponentReportEditor'

type Workbook = {
  instrumentKey: string
  instrumentVersion: string
  title: string
  metrics: Array<{ metricKey: string; label: string }>
}
type Preview = { title: string; contentVersion: string; releaseVersion: string; reportVersion: string; metricKeys: string[] }
const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const initialVisibility: ReportVisibility = {
  schemaVersion: 1, unknownAudience: 'DENY', policyVersion: '1.0.0',
  audiences: { researcher: { numericScores: true, references: false, scoreDerivedLabels: false,
    individualInterpretations: false, educationalContent: true, artwork: false } },
}

export function SjtWorkbookPublication({ onSaved }: { onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File>()
  const [workbook, setWorkbook] = useState<Workbook>()
  const [releaseVersion, setReleaseVersion] = useState('')
  const [reportVersion, setReportVersion] = useState('1.0.0')
  const [report, setReport] = useState<ReportTemplateDefinition>({ blocks: [], limitations: [] })
  const [visibility, setVisibility] = useState(initialVisibility)
  const [statement, setStatement] = useState('')
  const [preview, setPreview] = useState<{ candidate: string; result: Preview }>()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef<{ candidate: string; requestId: string } | undefined>(undefined)
  const candidate = JSON.stringify({
    template: workbook, releaseVersion, reportVersion, reportTemplate: report,
    reportVisibility: { ...visibility, policyVersion: reportVersion }, statement,
  })
  const ready = Boolean(workbook && version.test(releaseVersion) && version.test(reportVersion) && statement.trim())
  const approvedPreview = preview?.candidate === candidate ? preview.result : undefined

  async function loadWorkbook() {
    if (!file || busy) return
    setBusy(true)
    setMessage('')
    setPreview(undefined)
    setWorkbook(undefined)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await sessionFetch('/api/situational/authoring/validate', { method: 'POST', body: form })
      const body = await response.json() as { code: number; message?: string; data?: { template: Workbook } }
      if (!response.ok || body.code !== 0 || !body.data?.template) throw new Error(body.message || '工作簿读取失败')
      const next = body.data.template
      setWorkbook(next)
      setReleaseVersion(next.instrumentVersion)
      setReport({ title: next.title, blocks: next.metrics.map(m => ({
        type: 'METRIC', metricKey: m.metricKey, label: m.label, display: 'RAW',
      })), limitations: [] })
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '工作簿读取失败')
    } finally {
      setBusy(false)
    }
  }

  async function request(save: boolean) {
    if (busy || !ready || save && !approvedPreview) return
    setBusy(true)
    setMessage('')
    try {
      if (pending.current?.candidate !== candidate) pending.current = { candidate, requestId: crypto.randomUUID() }
      const body = { ...JSON.parse(candidate), requestId: pending.current.requestId }
      if (save) {
        await governedRequest<GovernedItem>('survey-tools', '/original-sjt/workbook/submit', body)
        setPreview(undefined)
        setMessage('已提交平台审核。审核和试运行通过后即可用于 Survey。')
        await onSaved()
      } else {
        const result = await governedRequest<Preview>('survey-tools', '/original-sjt/workbook/preview', body)
        setPreview({ candidate, result })
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '未能完成平台操作')
    } finally {
      setBusy(false)
    }
  }

  return <details className="sys-panel sys-compose">
    <summary>导入 SJT 标准工作簿</summary>
    <div className="sys-form">
      <p>报告仅向获授权的研究者展示。只改报告时可继续使用同一工作簿，填写新的发布版本和报告版本。</p>
      <label>Excel 工作簿<input type="file" accept=".xlsx" disabled={busy} onChange={e => {
        setFile(e.target.files?.[0]); setWorkbook(undefined); setPreview(undefined)
      }}/></label>
      <button type="button" disabled={!file || busy} onClick={() => void loadWorkbook()}>读取工作簿</button>
      {workbook && <fieldset disabled={busy}>
        <legend>{workbook.title}</legend>
        <p>工具 {workbook.instrumentKey} · 题本 {workbook.instrumentVersion}</p>
        <label>发布版本<input value={releaseVersion} onChange={e => setReleaseVersion(e.target.value)}/></label>
        <label>报告版本<input value={reportVersion} onChange={e => setReportVersion(e.target.value)}/></label>
        <label>内容与素材授权声明<textarea maxLength={2000} value={statement} onChange={e => setStatement(e.target.value)}/></label>
        <ReportTemplateFields template={report} metricKeys={workbook.metrics.map(metric => metric.metricKey)}
          onChange={setReport} allowReferenceBlocks={false}/>
        <ScaleComponentReportPresentation version={reportVersion} visibility={visibility}
          artworkKey={report.artworkKey} onArtworkChange={artworkKey => setReport(current => ({ ...current, artworkKey: artworkKey || undefined }))}
          onVisibilityChange={setVisibility} visibleAudiences={['researcher']}
          capabilities={['numericScores','individualInterpretations','educationalContent','artwork']} disabled={busy}/>
        <button type="button" disabled={!ready || busy} onClick={() => void request(false)}>核对并预览发布内容</button>
        {approvedPreview && <p role="status">题本 {approvedPreview.contentVersion} · 报告 {approvedPreview.reportVersion} · {approvedPreview.metricKeys.length} 个指标</p>}
        <button type="button" disabled={!approvedPreview || busy} onClick={() => void request(true)}>提交平台审核</button>
      </fieldset>}
      {message && <p role="status">{message}</p>}
    </div>
  </details>
}
