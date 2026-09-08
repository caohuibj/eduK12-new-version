import React, { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, Clock3, History, Loader2, Sparkles, TriangleAlert } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { situationalApi } from '../api'
import { situationalErrorMessage } from '../draft'
import type { SituationalAttemptResponse } from '../types'

const SituationalHistory: React.FC = () => {
  const navigate = useNavigate()
  const [rows, setRows] = useState<SituationalAttemptResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void situationalApi.history()
      .then((response) => {
        if (response.code !== 0) throw Object.assign(new Error(response.message), { code: response.code })
        if (!cancelled) setRows(response.data?.list ?? [])
      })
      .catch((reason) => {
        if (!cancelled) setError(situationalErrorMessage(reason))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4"><div><div className="flex items-center gap-2 text-indigo-700"><History className="h-5 w-5" /><span className="text-sm font-medium">记录</span></div><h1 className="mt-1 text-2xl font-bold text-gray-900">情境测评历史</h1><p className="mt-1 text-sm text-gray-500">历史结果读取服务器保存的终态记录，不会用当前题包重新评分。</p></div><Link to="/student/situational" className="hidden rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 sm:inline-flex">开始新测评</Link></div>
      {loading && <div className="flex min-h-[240px] items-center justify-center text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载历史…</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><TriangleAlert className="mb-2 h-5 w-5" />{error}</div>}
      {!loading && !error && rows.length === 0 && <div className="rounded-xl bg-white p-10 text-center text-gray-500 shadow-sm"><Sparkles className="mx-auto mb-3 h-8 w-8 text-gray-300" />还没有情境测评记录。</div>}
      {!loading && !error && rows.length > 0 && <div className="space-y-3">{rows.map((row) => { const completed = row.attempt.status === 'COMPLETED'; const metric = row.result?.metrics.find((item) => item.role === 'primary'); return <button key={row.attemptId} type="button" onClick={() => navigate(completed ? `/student/situational/attempts/${row.attemptId}/result` : `/student/situational/${encodeURIComponent(row.attempt.instrumentKey)}`)} className="group flex w-full items-center justify-between gap-4 rounded-xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-100 transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500"><div className="flex min-w-0 items-start gap-4"><div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${completed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{completed ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}</div><div className="min-w-0"><h2 className="truncate font-semibold text-gray-900">{row.instrument.report.interpretations[0]?.headline || row.attempt.instrumentKey}</h2><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500"><span>版本 {row.attempt.instrumentVersion}</span><span>{new Date(row.attempt.startedAt).toLocaleString('zh-CN')}</span><span>{completed ? '已完成' : '进行中'}</span></div>{completed && metric && <p className="mt-3 text-sm text-gray-700">{metric.label}：<strong>{metric.value === null ? '暂不可计算' : metric.value.toFixed(metric.displayPrecision)}</strong></p>}</div></div><ArrowRight className="h-5 w-5 shrink-0 text-gray-300 transition group-hover:translate-x-1 group-hover:text-indigo-600" /></button> })}</div>}
      <Link to="/student/situational" className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 sm:hidden">开始新测评</Link>
    </div>
  )
}

export default SituationalHistory


