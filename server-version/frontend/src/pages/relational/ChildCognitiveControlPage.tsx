import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { relationalApi, type TeacherRoster } from '../../api/relational'
import { ProductPage, PageHeader, ProductButton, ProductStatus } from '../../components/product-ui'
import BundleReport, { type BundleReportData } from '../bundle/BundleReport'

const base = '/child-cognitive-control'
async function request<T = any>(url: string, body?: unknown): Promise<T> {
  const r = body === undefined ? await api.get<T>(url) : await api.post<T>(url, body)
  if (r.code !== 0) throw new Error(r.message)
  return r.data
}
type Task = { assignmentId: string; episodeId: string; subjectName?: string; respondentType: 'SELF'|'PARENT'|'TEACHER'; status: string; consentRequired: boolean }
type Template = { id: string; name: string; courseId: string; courseTitle: string; respondentType: string }
const roleName = { SELF: '儿童任务', PARENT: '家长观察', TEACHER: '教师观察' }

export default function ChildCognitiveControlPage() {
  const { user } = useAuth(), navigate = useNavigate(), teacher = user?.role === 'TEACHER'
  const [tasks, setTasks] = useState<Task[]>([]), [rounds, setRounds] = useState<any[]>([])
  const [options, setOptions] = useState<{ templates: Template[]; reports: any[] }>({ templates: [], reports: [] })
  const [taskId, setTaskId] = useState(''), [subjectId, setSubjectId] = useState(''), [parentId, setParentId] = useState('')
  const [parentSource, setParentSource] = useState(''), [teacherSource, setTeacherSource] = useState('')
  const [roster, setRoster] = useState<TeacherRoster | null>(null), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false), [report, setReport] = useState<BundleReportData | null>(null)
  const [reportUrl, setReportUrl] = useState('')
  const requestRef = useRef({ payload: '', id: '' }), reportRequests = useRef(new Map<string,string>())
  const selectedTask = options.templates.find(t => t.id === taskId)
  const student = roster?.roster.find(s => s.studentUserId === subjectId)
  const sources = options.templates.filter(t => t.courseId === selectedTask?.courseId)
  const reload = useCallback(async () => {
    const next = await request<Task[]>(base + '/tasks'); setTasks(next)
    if (teacher) { const [choices, rows] = await Promise.all([request<typeof options>(base + '/options'), request<any[]>(base + '/rounds')]); setOptions(choices); setRounds(rows) }
  }, [teacher])
  useEffect(() => { let active = true; void reload().catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [reload])
  useEffect(() => {
    let active = true; setRoster(null); setSubjectId(''); setParentId(''); setParentSource(''); setTeacherSource(''); setReport(null)
    if (selectedTask) void relationalApi.teacherRoster(selectedTask.courseId).then(r => { if (active) setRoster(r) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [selectedTask?.courseId, taskId])
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function issue() {
    const roles = [...(parentSource ? ['parent'] : []), ...(teacherSource ? ['teacher'] : [])]
    const target = options.reports.find(r => r.bundleKey === 'child_cognitive_control_' + roles.join('_') + '_zh_cn')
    if (!target || !subjectId || !taskId || parentSource && !parentId) throw new Error('请选择儿童、任务和对应的观察配置；报告版本需已由管理员发布。')
    const payload = { subjectUserId: subjectId, taskCompositeId: taskId, reportBundleKey: target.bundleKey, reportBundleVersion: target.bundleVersion,
      ...(parentSource ? { parent: { userId: parentId, compositeId: parentSource } } : {}), ...(teacherSource ? { teacherObserverCompositeId: teacherSource } : {}) }
    const fingerprint = JSON.stringify(payload)
    if (requestRef.current.payload !== fingerprint) requestRef.current = { payload: fingerprint, id: crypto.randomUUID() }
    await request(base + '/rounds', { ...payload, requestId: requestRef.current.id })
    requestRef.current = { payload: '', id: '' }; setMessage('已分别分配儿童任务和成人观察表。'); await reload()
  }
  async function collect(id: string) {
    setReport(null); setReportUrl('')
    if (!reportRequests.current.has(id)) reportRequests.current.set(id, crypto.randomUUID())
    const r = await request(base + '/rounds/' + id + '/report', { requestId: reportRequests.current.get(id) })
    if (r.status === 'WAITING') { setMessage('本轮仍有任务或观察表未完成，已完成结果会保留。'); return }
    setReport(r); setReportUrl(base + '/reports/' + r.analysisId)
  }
  const select = (label: string, value: string, change: (v:string) => void, choices: Array<{id:string;name:string}>) => <label className="block">{label}<select className="input w-full" value={value} onChange={e => change(e.target.value)}><option value="">请选择</option>{choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  return <ProductPage width="reading">
    <PageHeader title="儿童认知控制与日常观察" description="孩子完成认知任务，家长或教师描述日常行为；从不同情境获得互补线索。" />
    <p className="text-sm text-gray-600">任务指标与观察均分分别阅读，不合成能力分或IQ。4–5岁、6–8岁和9–12岁的任务适配证据需分别积累；可运行不等于已验证。</p>
    {error && <ProductStatus kind="error" title="操作未完成">{error}</ProductStatus>}
    {message && <ProductStatus kind="info" title="本轮进度">{message}</ProductStatus>}
    {teacher && <section className="card space-y-4 p-5" aria-label="分配儿童跨方法评估">
      <h2 className="font-semibold">分配一轮评估</h2>
      {select('儿童任务', taskId, setTaskId, options.templates.filter(t => t.respondentType === 'SELF').map(t => ({ id: t.id, name: t.courseTitle + ' · ' + t.name })))}
      {select('儿童', subjectId, v => { setSubjectId(v); setParentId('') }, (roster?.roster ?? []).map(s => ({ id: s.studentUserId, name: s.displayName })))}
      {select('家长观察表（可选）', parentSource, setParentSource, sources.filter(t => t.respondentType === 'PARENT'))}
      {parentSource && select('已关联家长', parentId, setParentId, (student?.approvedParents ?? []).map(p => ({ id: p.parentUserId, name: p.displayName })))}
      {select('由我填写的教师观察表（可选）', teacherSource, setTeacherSource, sources.filter(t => t.respondentType === 'TEACHER'))}
      <p className="text-sm text-gray-600">至少选择一种成人观察。两种都选时分别保留结果；家长接受既有分享同意后才能开始。</p>
      <ProductButton disabled={busy || !subjectId || !taskId || !parentSource && !teacherSource} onClick={() => void run(issue)}>分别分配</ProductButton>
      {!options.templates.length && <p>目前没有已发布的课程组件，请先在固定测评包中准备儿童任务及观察配置。</p>}
    </section>}
    <section className="space-y-3" aria-label="我的儿童评估任务"><h2 className="font-semibold">由我完成的部分</h2>
      {!tasks.length && <p>暂无分配到你的任务。</p>}
      {tasks.map(task => <article className="card p-4 space-y-2" key={task.assignmentId}>
        <h3>{roleName[task.respondentType]}{task.subjectName ? ' · ' + task.subjectName : ''}</h3>
        {task.respondentType === 'SELF' ? <p>请由孩子本人操作，成人可以协助理解说明。</p> : <p>请描述你实际观察到的儿童行为，无需替孩子完成认知任务。</p>}
        {task.consentRequired && <ProductButton disabled={busy} onClick={() => void run(async () => { await request(base + '/assignments/' + task.assignmentId + '/consent', {}); await reload() })}>同意分享给分配教师并继续</ProductButton>}
        {!task.consentRequired && ['OPEN','STARTED'].includes(task.status) && <ProductButton disabled={busy} onClick={() => void run(async () => { const r = await request(base + '/assignments/' + task.assignmentId + '/start', {}); navigate('/relational/attempts/' + r.attemptId + '?returnTo=%2Frelational%2Fchild-control') })}>{task.status === 'STARTED' ? '继续' : '开始'}</ProductButton>}
        {task.status === 'COMPLETED' && <ProductButton disabled={busy} onClick={() => void run(async () => { const url = base + '/assignments/' + task.assignmentId + '/report'; setReport(null); setReportUrl(''); const r = await request<BundleReportData>(url); if (r.status === 'READY' || r.status === 'UNAVAILABLE') { setReport(r); setReportUrl(url) } else setMessage('作答已保存，报告正在生成；稍后可再次读取。') })}>查看本部分报告</ProductButton>}
      </article>)}
    </section>
    {teacher && <section className="space-y-3" aria-label="儿童评估轮次"><h2 className="font-semibold">我分配的评估</h2>{rounds.map(round => <article className="card p-4" key={round.id}><h3>{round.subject?.nickname || round.subject?.username || '儿童评估'}</h3><p>{new Date(round.createdAt).toLocaleString()} · 已完成 {round.relationalAssignments.filter((a:any) => a.status === 'COMPLETED').length}/{round.relationalAssignments.length}</p><ProductButton disabled={busy} onClick={() => void run(() => collect(round.id))}>读取本轮联合报告</ProductButton></article>)}</section>}
    {report && <BundleReport report={report} attemptId="" staff={false} reload={() => void run(async () => setReport(await request(reportUrl)))} downloadReport={() => request<BundleReportData>(reportUrl)} />}
    <Link to="/relational/tasks">返回关系测评</Link>
  </ProductPage>
}
