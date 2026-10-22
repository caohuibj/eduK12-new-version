import { useEffect, useState } from 'react'
import apiClient from '../api/client'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'
import './training-checkin-schedules.css'

type Schedule = { id: string; title: string; intervalDays: number; durationHours: number; nextPublishAt: string | null; endsAt: string | null; active: boolean; publishedCount: number; timezone: string }
const date = (value: string, timezone: string) => new Date(value).toLocaleString('zh-CN', { timeZone: timezone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function TrainingCheckinSchedules({ courseId }: { courseId: string }) {
  const [rows, setRows] = useState<Schedule[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState<string | null>(null)
  const { confirm, feedback } = useStaffFeedback()
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setRows([])
    void apiClient.get<{ list: Schedule[] }>('/checkins/schedules?courseId=' + encodeURIComponent(courseId)).then(response => {
      if (response.code !== 0) throw new Error(response.message || '读取失败')
      if (active) setRows(response.data.list)
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '读取失败') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [courseId, revision])
  const stop = async (row: Schedule) => {
    if (!await confirm({ title: `停止「${row.title}」的周期发布？`, body: '停止后不再生成新的打卡；已发布的打卡、截止时间和提交记录保留。', confirmLabel: '停止后续发布' })) return
    setBusy(row.id); setError('')
    try {
      const response = await apiClient.post('/checkins/schedules/' + encodeURIComponent(row.id) + '/stop')
      if (response.code !== 0) throw new Error(response.message || '停止失败')
      setRevision(value => value + 1)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '停止失败，请重试') }
    finally { setBusy(null) }
  }
  if (!error && rows.length === 0) return null
  return <section className="training-checkin-schedules" aria-label="周期打卡任务">
    <header><h2>周期打卡</h2><span>{loading ? '正在读取…' : `${rows.filter(row => row.active).length} 个进行中`}</span></header>
    {error && <p role="alert">{error} <button type="button" onClick={() => setRevision(value => value + 1)}>重试</button></p>}
    {rows.map(row => <article key={row.id}><div><h3>{row.title}<span>{row.active ? '进行中' : '已停止 / 已结束'}</span></h3><p>每 {row.intervalDays % 7 === 0 ? `${row.intervalDays / 7} 周` : `${row.intervalDays} 天`} · 每期 {row.durationHours} 小时 · 已发布 {row.publishedCount} 期</p><p>{row.active && row.nextPublishAt ? `下次：${date(row.nextPublishAt, row.timezone)}（${row.timezone}）` : '后续发布已结束'}{row.endsAt && ` · 结束：${date(row.endsAt, row.timezone)}`}</p></div>{row.active && <button type="button" disabled={busy !== null} onClick={() => void stop(row)}>{busy === row.id ? '停止中…' : '停止后续发布'}</button>}</article>)}
    {feedback}
  </section>
}
