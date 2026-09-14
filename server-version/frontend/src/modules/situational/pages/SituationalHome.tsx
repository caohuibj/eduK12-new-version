import React, { useEffect, useState } from 'react'
import { Clock3, History, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DiscoveryCard, PageHeader, ProductPage, ProductStatus } from '../../../components/product-ui'
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
    <ProductPage width="assessment">
      <PageHeader
        title="情境化测评"
        description="通过文字情境记录具体任务中的反应选择。试点结果用于描述当前反应模式，不是诊断或常模比较。"
        actions={(
          <Link to="/student/situational/history" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 no-underline hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
            <History className="h-4 w-4" aria-hidden="true" />
            测评历史
          </Link>
        )}
      />

      {loading ? (
        <ProductStatus kind="pending" title="正在加载情境化测评" announce="polite">正在读取可用的已发布题包。</ProductStatus>
      ) : error ? (
        <ProductStatus kind="error" title="情境化测评列表加载失败" announce="assertive">{error}</ProductStatus>
      ) : instruments.length === 0 ? (
        <ProductStatus kind="info" title="暂无可用的情境化测评">
          当前没有可用的已发布试点题包。
        </ProductStatus>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {instruments.map((instrument) => (
            <DiscoveryCard
              key={`${instrument.key}:${instrument.version}`}
              to={`/student/situational/${encodeURIComponent(instrument.key)}`}
              title={instrumentTitle(instrument)}
              ariaLabel={`${instrumentTitle(instrument)}，打开情境化测评`}
              eyebrow="Situational Text Pilot"
              leading={(
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <Sparkles className="h-6 w-6" />
                </span>
              )}
              status={<span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">PILOT · reference NONE</span>}
              description={instrument.report.limitations[0] || '试点阶段结果仅用于描述当前情境任务中的反应模式。'}
              meta={(
                <>
                  <span>版本 {instrument.version}</span>
                  <span>{instrument.definition.scenes.length} 个情境</span>
                  <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" aria-hidden="true" />文字版</span>
                </>
              )}
            />
          ))}
        </div>
      )}
    </ProductPage>
  )
}

export default SituationalHome
