import { useEffect, useRef, useState } from 'react'
import type { ReportVisibility } from '../../api/scaleComponentImport'
import { governedRequest } from '../../api/surveyGovernance'
import { ResearchFormEditor } from '../../survey/ResearchFormEditor'
import type { FormDraft } from '../../survey/builder.types'
import { ScaleComponentReportPresentation } from './ScaleComponentReportEditor'

type Audience = keyof ReportVisibility['audiences']
type DataCeiling = Omit<ReportVisibility, 'audiences'> & {
  audiences: Partial<Record<Audience, {
    rawAnswers: boolean; itemScores: false; methods: boolean; resultQualityDetails: false
  }>>
}
type FormReport = { title?: string; artworkKey?: string; limitations: string[]; blocks: { type: 'TEXT'; text: string }[] }
type Content = {
  schemaVersion: 1; toolKey: string; version: string; title: string; definition: FormDraft;
  dataCeiling: DataCeiling; statement: string; classificationTags: string[]; reference: Record<string, unknown>
}
type Preview = { previewHash: string; definition: FormDraft; effectiveDisclosure: { audiences: Partial<Record<Audience, {
  rawAnswers: boolean; educationalContent: boolean; artwork: boolean
}>> }; blockers: string[] }
type Revision = {
  base: { releaseId: string; hash: string }; content: Content;
  report: { version: string; template: FormReport; reportVisibility?: ReportVisibility } | null;
}

const request = <T,>(path: string, body?: unknown) => governedRequest<T>('survey-tools', '/form-templates' + path, body)
const audiences = { respondent: '作答者', subject: '被测者', teacher: '教师', researcher: '研究者' } as const
const blankPolicy = (version: string) => ({ schemaVersion: 1 as const, policyVersion: version, unknownAudience: 'DENY' as const, audiences: {} })
const emptyDefinition = (): FormDraft => ({ schemaVersion: 2, pages: [] })
const defaultContent = (): Content => ({
  schemaVersion: 1, toolKey: '', version: '1.0.0', title: '', definition: emptyDefinition(),
  dataCeiling: blankPolicy('1.0.0'), statement: '', classificationTags: [], reference: {},
})
const versionPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9_-]*)*$/

async function readWorkbook(file: File) {
  if (file.size > 64000) throw new Error('Excel 文件最大 64 KB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export default function OriginalFormTemplate({ revisionSource, onSaved }: { revisionSource: { id: string } | null; onSaved: () => Promise<void> }) {
  const [content, setContent] = useState(defaultContent)
  const [base, setBase] = useState<Revision['base']>()
  const [releaseKey, setReleaseKey] = useState('1.0.0')
  const [reportVersion, setReportVersion] = useState('1.0.0')
  const [reportText, setReportText] = useState('')
  const [artworkKey, setArtworkKey] = useState('')
  const [visibility, setVisibility] = useState<ReportVisibility>(() => blankPolicy('1.0.0'))
  const [format, setFormat] = useState<'TEXT' | 'CSV' | 'XLSX'>('CSV')
  const [importText, setImportText] = useState('')
  const [file, setFile] = useState<File>()
  const [importPreview, setImportPreview] = useState<FormDraft | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const currentPreview = useRef<{ requestId: string } | null>(null)
  const details = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (!revisionSource) return
    let active = true
    if (details.current) details.current.open = true
    setBusy(true)
    setMessage('')
    void request<Revision>('/' + encodeURIComponent(revisionSource.id) + '/revision').then(revision => {
      if (!active) return
      setBase(revision.base)
      setContent(revision.content)
      setReleaseKey('')
      setReportVersion('')
      setReportText(revision.report?.template.blocks.map(block => block.text).join('\n\n') ?? '')
      setArtworkKey(revision.report?.template.artworkKey ?? '')
      setVisibility(revision.report?.reportVisibility ?? blankPolicy(''))
      setImportPreview(null)
      setPreview(null)
      currentPreview.current = null
      setMessage('已复制冻结题本。只改说明时保留题本版本，填写新发布版本和报告版本。')
    }).catch(error => {
      if (active) setMessage(error instanceof Error ? error.message : '不能复制此版本')
    }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [revisionSource])

  function invalidate() {
    setPreview(null)
    currentPreview.current = null
  }
  function changeContent(overrides: Partial<Content>) {
    setContent(old => ({ ...old, ...overrides }))
    invalidate()
  }
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try { await action() }
    catch (error) { setMessage(error instanceof Error ? error.message : '操作失败，请核对当前状态') }
    finally { setBusy(false) }
  }
  const checkImport = () => run(async () => {
    const input = format === 'XLSX' && file ? await readWorkbook(file) : importText
    const checked = await request<{ definition: FormDraft | null; issues: { line: number; message: string }[] }>('/import-preview',
      { format, content: input, batchId: crypto.randomUUID() })
    setImportPreview(checked.definition)
    setMessage(checked.issues.length ? checked.issues.map(issue => '第 ' + issue.line + ' 行 ' + issue.message).join('；') : '模板通过预览，可以载入编辑器。')
  })
  const build = (requestId: string) => ({
    requestId, releaseKey, ...(base ? { base } : {}),
    content: { ...content, dataCeiling: { ...content.dataCeiling, policyVersion: content.version } },
    report: {
      schemaVersion: 1, toolKey: content.toolKey, version: reportVersion, contentVersion: content.version,
      reportVisibility: { ...visibility, policyVersion: reportVersion },
      template: { title: content.title, limitations: [], blocks: reportText.trim() ? [{ type: 'TEXT', text: reportText.trim() }] : [],
        ...(artworkKey.trim() ? { artworkKey: artworkKey.trim() } : {}) },
    },
  })
  const checkTemplate = () => run(async () => {
    const requestId = crypto.randomUUID()
    const payload = build(requestId)
    const next = await request<Preview>('/preview', payload)
    currentPreview.current = { requestId }
    setPreview(next)
  })
  const submitTemplate = () => run(async () => {
    const checked = currentPreview.current
    if (!checked || !preview || preview.blockers.length) return
    await request('/submissions', { ...build(checked.requestId), expectedPreviewHash: preview.previewHash })
    setMessage('已提交冻结版本。请在审批列表核对、通过操作验证后批准上线。')
    invalidate()
    await onSaved()
  })

  return <details className="sys-panel sys-compose" ref={details}>
    <summary>编制标准表单模板</summary>
    <div className="sys-form">
      <fieldset disabled={busy}>
        <legend>导入题目</legend>
        <label>模板格式<select value={format} onChange={event => {
          setFormat(event.target.value as typeof format); setImportPreview(null)
        }}><option value="CSV">CSV</option><option value="TEXT">纯文本</option><option value="XLSX">Excel</option></select></label>
        <p>CSV 和 Excel 使用 type、prompt、required、options 等列。多个选项用 || 分隔。</p>
        {format==='XLSX' ? <label>上传 Excel<input type="file" accept=".xlsx" onChange={event => {
          setFile(event.target.files?.[0]); setImportPreview(null)
        }}/></label> : <label>模板内容<textarea maxLength={200000} value={importText} onChange={event => {
          setImportText(event.target.value); setImportPreview(null)
        }}/></label>}
        <button type="button" disabled={format==='XLSX'?!file:!importText.trim()} onClick={() => void checkImport()}>预览导入</button>
        {importPreview&&<button type="button" onClick={() => {
          if (content.definition.pages.some(page => page.questions.length) && !window.confirm('用导入题目替换当前编辑内容？')) return
          changeContent({ definition: importPreview }); setImportPreview(null)
        }}>载入编辑器（{importPreview.pages.reduce((n, page) => n + page.questions.length, 0)} 题）</button>}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>题本和完成说明</legend>
        <label>工具系列编号<input value={content.toolKey} disabled={!!base} onChange={event => changeContent({ toolKey: event.target.value })}/></label>
        <label>名称<input value={content.title} onChange={event => changeContent({ title: event.target.value })}/></label>
        <label>发布版本<input value={releaseKey} onChange={event => { setReleaseKey(event.target.value); invalidate() }}/></label>
        <label>题本版本<input value={content.version} onChange={event => changeContent({ version: event.target.value })}/></label>
        <label>报告版本<input value={reportVersion} onChange={event => { setReportVersion(event.target.value); invalidate() }}/></label>
        <label>内容来源及使用说明<textarea value={content.statement} maxLength={2000} onChange={event => changeContent({ statement: event.target.value })}/></label>
        <ResearchFormEditor value={content.definition} onChange={definition => changeContent({ definition })}/>
        <label>完成说明<textarea value={reportText} maxLength={20000} onChange={event => { setReportText(event.target.value); invalidate() }}/></label>
        <fieldset><legend>题本原始作答上限</legend>{(Object.entries(audiences) as [Audience, string][]).map(([audience, label]) =>
          <label key={audience}><input type="checkbox" checked={content.dataCeiling.audiences[audience]?.rawAnswers ?? false}
            onChange={event => changeContent({ dataCeiling: { ...content.dataCeiling,
              audiences: { ...content.dataCeiling.audiences, [audience]: { rawAnswers: event.target.checked, methods: false, itemScores: false, resultQualityDetails: false } },
            } })}/>{label}可以读取原始作答</label>)}</fieldset>
        <ScaleComponentReportPresentation version={reportVersion} visibility={visibility} artworkKey={artworkKey}
          onArtworkChange={key => { setArtworkKey(key); invalidate() }} disabled={busy}
          capabilities={['educationalContent','artwork']} onVisibilityChange={next => { setVisibility(next); invalidate() }}/>
      </fieldset>
      <button type="button" disabled={busy||!content.title.trim()||!content.statement.trim()||!content.toolKey.trim()||
        ![releaseKey, content.version, reportVersion].every(version => versionPattern.test(version))}
        onClick={() => void checkTemplate()}>核对字段与披露范围</button>
      {message&&<p role="status">{message}</p>}
      {preview&&<section aria-label="冻结版本预览">
        <h3>冻结版本预览</h3>
        {preview.blockers.map(blocker => <p role="alert" key={blocker}>{blocker}</p>)}
        <ul>{preview.definition.pages.flatMap(page => page.questions.map(question => <li key={question.itemKey}>{question.prompt}</li>))}</ul>
        <ul>{(Object.entries(audiences) as [Audience, string][]).map(([audience, label]) => {
          const allowed=preview.effectiveDisclosure.audiences[audience]
          return <li key={audience}>{label} · 原始作答 {allowed?.rawAnswers?'允许':'关闭'} · 完成说明 {allowed?.educationalContent?'允许':'关闭'} · 配图 {allowed?.artwork?'允许':'关闭'}</li>
        })}</ul>
        <button type="button" disabled={busy||preview.blockers.length>0} onClick={() => void submitTemplate()}>提交审核</button>
      </section>}
    </div>
  </details>
}
