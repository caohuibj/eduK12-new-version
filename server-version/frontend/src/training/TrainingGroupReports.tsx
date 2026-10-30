import './training-group-reports.css'
import { useEffect, useRef, useState } from 'react'
import apiClient from '../api/client'
import { TaskGroupReport, type TaskGroupArtifact } from '../modules/reporting/TaskGroupReport'

type Pointer = {artifactId: string; taskId: string; generatedAt: string}
type Index = {tasks: Array<{id: string; name: string}>; artifacts: Pointer[]}
type Tool = {key: string; kind: string; title: string; source: {taskId: string; publication: string; configDigest: string | null; variantKey: string | null; materialGroupKey?: string}}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = body === undefined ? await apiClient.get<T>(path) : await apiClient.post<T>(path, body)
  if (response.code !== 0 || !response.data) throw new Error(response.message || '群体报告操作未完成')
  return response.data
}
const toolKey = (tool: Tool) => JSON.stringify([tool.key, tool.source.publication, tool.source.configDigest, tool.source.variantKey, tool.source.materialGroupKey ?? null])

export function TrainingGroupReports({courseId}: {courseId: string}) {
  const [index, setIndex] = useState<Index | null>(null), [tools, setTools] = useState<Tool[]>([])
  const [taskId, setTaskId] = useState(''), [selectedTool, setSelectedTool] = useState('')
  const [artifact, setArtifact] = useState<TaskGroupArtifact | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const epoch = useRef(0), base = `/courses/${encodeURIComponent(courseId)}/training-group-reports`
  useEffect(() => {epoch.current++; setIndex(null); setTools([]); setTaskId(''); setSelectedTool(''); setArtifact(null); setError(''); setBusy(false); return () => {epoch.current++}}, [courseId])
  async function run(fn: (current: () => boolean) => Promise<void>) {
    const generation = ++epoch.current, current = () => generation === epoch.current
    setBusy(true); setError('')
    try {await fn(current)} catch (cause) {if (current()) {setArtifact(null); setError(cause instanceof Error ? cause.message : '群体报告操作未完成')}}
    finally {if (current()) setBusy(false)}
  }
  const read = (pointer: Pointer) => run(async current => {
    const result = await request<TaskGroupArtifact>(`${base}/${encodeURIComponent(pointer.taskId)}/${encodeURIComponent(pointer.artifactId)}`)
    if (current()) setArtifact(result)
  })
  return <section className="training-group-reports" aria-label="Training 单次群体报告"><h2>单次群体报告</h2>
    <p>选择一次任务中的具体工具及其冻结版本，生成全部合格作答的统计快照。新作答需主动生成更新版。</p>
    <button type="button" disabled={busy} onClick={() => void run(async current => {
      const result = await request<Index>(base)
      if (current()) {setIndex(result); setTaskId(result.tasks[0]?.id ?? ''); setTools([]); setSelectedTool('')}
      if (result.artifacts[0]) {const pointer = result.artifacts[0]; const report = await request<TaskGroupArtifact>(`${base}/${pointer.taskId}/${pointer.artifactId}`); if (current()) setArtifact(report)}
    })}>打开群体报告</button>
    {busy && <p role="status">正在读取或生成报告…</p>}{error && <p role="alert">{error}</p>}
    {index && <><label>任务<select aria-label="群体报告任务" value={taskId} disabled={busy} onChange={event => {setTaskId(event.target.value); setTools([]); setSelectedTool('')}}>
      {index.tasks.map(task => <option key={task.id} value={task.id}>{task.name}</option>)}</select></label>
      <button type="button" disabled={busy || !taskId} onClick={() => void run(async current => {
        const result = await request<{tools: Tool[]}>(`${base}/sources/${encodeURIComponent(taskId)}`)
        if (current()) {setTools(result.tools); setSelectedTool(result.tools[0] ? toolKey(result.tools[0]) : '')}
      })}>选择工具与版本</button>
      {tools.length > 0 && <><label>工具与版本<select aria-label="群体报告工具" value={selectedTool} disabled={busy} onChange={event => setSelectedTool(event.target.value)}>
        {tools.map(tool => <option key={toolKey(tool)} value={toolKey(tool)}>{tool.title} · {tool.kind}{tool.source.variantKey ? ` · 分卷 ${tool.source.variantKey}` : ''}{tool.source.materialGroupKey ? ` · 材料 ${tool.source.materialGroupKey}` : ''}</option>)}</select></label>
        <p>人群：本任务、所选版本的全部合格已完成作答。</p>
        <button type="button" disabled={busy || !selectedTool} onClick={() => void run(async current => {
          const tool = tools.find(tool => toolKey(tool) === selectedTool)!
          const {taskId: selectedTask, publication, configDigest, variantKey, materialGroupKey} = tool.source
          const result = await request<TaskGroupArtifact>(base, {taskId: selectedTask, toolKey: tool.key, publication, configDigest, variantKey, ...(materialGroupKey === undefined ? {} : {materialGroupKey})})
          if (current()) {setArtifact(result); setIndex(previous => previous ? {...previous, artifacts: [{taskId: selectedTask, artifactId: result.artifactId, generatedAt: result.generatedAt}, ...previous.artifacts]} : previous)}
        })}>生成更新版报告</button></>}
      {tools.length === 0 && <p>点击“选择工具与版本”载入所选任务的可统计叶工具；自由文本不自动汇总。</p>}
      {index.artifacts.length > 0 && <label>已生成版本<select aria-label="群体报告版本" disabled={busy} value={artifact?.artifactId ?? ''} onChange={event => {const pointer = index.artifacts.find(row => row.artifactId === event.target.value); if (pointer) void read(pointer)}}>
        <option value="">选择已生成版本</option>{index.artifacts.map(pointer => <option key={pointer.artifactId} value={pointer.artifactId}>{index.tasks.find(task => task.id === pointer.taskId)?.name} · {new Date(pointer.generatedAt).toLocaleString('zh-CN')} · {pointer.artifactId.slice(0,8)}</option>)}</select></label>}
    </>}
    {artifact && <TaskGroupReport key={artifact.artifactId} artifact={artifact} />}
  </section>
}
