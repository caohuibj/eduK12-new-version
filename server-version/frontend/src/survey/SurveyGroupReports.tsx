import {groupHistoryQuery,mergeGroupHistory,type GroupHistoryCursor} from '../modules/reporting/group-history'
import {GroupLongitudinalPanel} from '../modules/reporting/GroupLongitudinalPanel'
import { useEffect, useRef, useState } from 'react'
import { TaskGroupReport, type TaskGroupArtifact } from '../modules/reporting/TaskGroupReport'

type Tool = { instrumentKey: string; title: string; kind: string }
type Pointer = { artifactId: string; generatedAt: string }
type Request = <T>(path: string, method?: string, body?: unknown) => Promise<T>

export function SurveyGroupReports({ projectId, waveId, request }: { projectId: string; waveId: string; request: Request }) {
  const [catalog, setCatalog] = useState<{ tools: Tool[]; artifacts: Pointer[]; nextCursor?:GroupHistoryCursor|null } | null>(null)
  const [tool, setTool] = useState(''), [report, setReport] = useState<TaskGroupArtifact | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const epoch = useRef(0)
  useEffect(() => { epoch.current++; setCatalog(null); setReport(null); setTool(''); setError(''); setBusy(false); return () => { epoch.current++ } }, [projectId, waveId])
  const base = `/projects/${encodeURIComponent(projectId)}/analytics/waves/${encodeURIComponent(waveId)}/group-reports`
  async function run(fn: (current: () => boolean) => Promise<void>,keepReport=false) {
    const id = ++epoch.current; const current = () => id === epoch.current
    setBusy(true); setError(''); if(!keepReport)setReport(null)
    try { await fn(current) } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : '群体报告操作未完成') }
    finally { if (current()) setBusy(false) }
  }
  const read = (artifactId: string) => run(async current => {
    const artifact = await request<TaskGroupArtifact>(`${base}/${encodeURIComponent(artifactId)}`)
    if (current()) setReport(artifact)
  })
  return <><section aria-label="单次群体报告" className="survey-card">
    <h3>单次群体报告</h3><p>选择当前波次中的具体工具生成报告。打开已生成版本直接读取快照；新答卷需主动生成更新版。</p>
    <button type="button" className="btn-secondary" disabled={busy || !waveId} onClick={() => void run(async current => {
      const result = await request<{ tools: Tool[]; artifacts: Pointer[]; nextCursor?:GroupHistoryCursor|null }>(base)
      if (!current()) return
      setCatalog(result); setTool(result.tools[0]?.instrumentKey ?? '')
      if (result.artifacts[0]) {
        const artifact = await request<TaskGroupArtifact>(`${base}/${result.artifacts[0].artifactId}`)
        if (current()) setReport(artifact)
      }
    })}>打开群体报告</button>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">正在读取或生成群体报告…</p>}
    {catalog && <><label>叶工具<select aria-label="群体报告工具" value={tool} disabled={busy} onChange={event => setTool(event.target.value)}>
      {catalog.tools.map(value => <option key={value.instrumentKey} value={value.instrumentKey}>{value.title} · {value.kind}</option>)}</select></label>
      <p>人群：本波次全部合格已完成答卷。</p>
      <button type="button" className="btn-primary" disabled={busy || !tool} onClick={() => void run(async current => {
        const artifact = await request<TaskGroupArtifact>(base, 'POST', { instrumentKey: tool })
        if (current()) { setReport(artifact); setCatalog(previous => previous ? { ...previous, artifacts: [{ artifactId: artifact.artifactId, generatedAt: artifact.generatedAt }, ...previous.artifacts] } : previous) }
      })}>生成更新版报告</button>
      {catalog.artifacts.length > 0 && <label>已生成版本<select aria-label="群体报告版本" value={report?.artifactId ?? ''} disabled={busy} onChange={event => { if (event.target.value) void read(event.target.value) }}>
        <option value="">选择已生成版本</option>{catalog.artifacts.map(value => <option key={value.artifactId} value={value.artifactId}>{new Date(value.generatedAt).toLocaleString('zh-CN')} · {value.artifactId.slice(0, 8)}</option>)}</select></label>}
      {catalog.nextCursor&&<button type="button" disabled={busy} onClick={()=>void run(async current=>{
        const next=await request<{artifacts:Pointer[];nextCursor:GroupHistoryCursor|null}>(base+'/history'+groupHistoryQuery(catalog.nextCursor!))
        if(current())setCatalog(previous=>previous?{...previous,nextCursor:next.nextCursor,artifacts:mergeGroupHistory(previous.artifacts,next.artifacts)}:previous)
      },true)}>加载更早的群体版本</button>}
    </>}
    {report && <TaskGroupReport key={report.artifactId} artifact={report} />}
  </section><GroupLongitudinalPanel key={base+'-longitudinal'} base={`/projects/${encodeURIComponent(projectId)}/analytics/waves/${encodeURIComponent(waveId)}/group-longitudinal`} request={request}/></>
}
