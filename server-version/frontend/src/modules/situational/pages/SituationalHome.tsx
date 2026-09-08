import React, { useEffect, useState } from 'react'
import { ArrowRight, Clock3, History, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { situationalApi } from '../api'
import type { SituationalInstrument } from '../types'
import { situationalErrorMessage } from '../draft'

const instrumentTitle = (instrument: SituationalInstrument): string => (
  instrument.report.interpretations[0]?.headline
  || instrument.key.replace(/[-_]/g, ' ')
)

const SituationalHome: React.FC = () => {
  const [instruments, setInstruments] = useState<SituationalInstrument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void situationalApi.listInstruments()
      .then((response) => {
        if (cancelled) return
        if (response.code !== 0) throw Object.assign(new Error(response.message), { code: response.code })
        setInstruments(response.data?.list ?? [])
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
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-indigo-700 to-violet-700 p-6 text-white shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <div className="mb-3 flex items-center gap-2 text-indigo-100"><Sparkles className="h-5 w-5" /><span className="text-sm font-medium">Situational Text Pilot</span></div>
          <h1 className="text-2xl font-bold sm:text-3xl">情境化测评</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-indigo-100">通过一组文字情境，记录你在具体任务中的反应选择。结果属于试点阶段的描述性反馈，不是诊断或常模比较。</p>
        </div>
        <Link to="/student/situational/history" className="inline-flex items-center gap-2 self-start rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 sm:self-auto"><History className="h-4 w-4" />测评历史</Link>
      </div>

      {loading && <div className="rounded-xl bg-white p-10 text-center text-gray-500 shadow-sm">加载可用题包…</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>}
      {!loading && !error && instruments.length === 0 && (
        <div className="rounded-xl bg-white p-10 text-center text-gray-500 shadow-sm">当前没有可用的已发布试点题包。</div>
      )}
      {!loading && !error && instruments.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {instruments.map((instrument) => (
            <Link
              key={`${instrument.key}:${instrument.version}`}
              to={`/student/situational/${encodeURIComponent(instrument.key)}`}
              className="group rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Sparkles className="h-6 w-6" /></div>
                <ArrowRight className="h-5 w-5 text-gray-300 transition group-hover:translate-x-1 group-hover:text-indigo-600" />
              </div>
              <h2 className="mt-5 text-lg font-semibold text-gray-900">{instrumentTitle(instrument)}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
                <span>版本 {instrument.version}</span>
                <span>{instrument.definition.scenes.length} 个情境</span>
                <span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4" />文字版</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-gray-600">{instrument.report.limitations[0] || '试点阶段结果仅用于描述当前情境任务中的反应模式。'}</p>
              <div className="mt-5 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">PILOT · reference NONE</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default SituationalHome

