import React, { useEffect, useState } from 'react'
import { CheckCircle2, Clock3, History, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DiscoveryCard, PageHeader, ProductPage, ProductStatus } from '../../../components/product-ui'
import { situationalApi } from '../api'
import { situationalErrorMessage } from '../draft'
import type { SituationalAttemptResponse } from '../types'

const SituationalHistory: React.FC = () => {
  const [rows, setRows] = useState<SituationalAttemptResponse[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void situationalApi.history()
      .then((response) => {
        if (response.code !== 0) throw Object.assign(new Error(response.message), { code: response.code })
        if (!cancelled) {
          setRows(response.data?.list ?? [])
          setTotal(response.data?.total ?? 0)
        }
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
    <ProductPage width="assessment" className="hui-student-page hui-student-history">
      <PageHeader
        title="情境测评历史"
        description="历史结果读取服务器保存的终态记录，不会用当前题包重新评分。当前接口返回服务器提供的历史范围，不在前端切片伪造分页。"
        actions={(
          <Link to="/student/situational" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 no-underline hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            选择测评
          </Link>
        )}
      />

      {loading ? (
        <ProductStatus kind="pending" title="正在加载情境测评历史" announce="polite">正在读取服务器记录。</ProductStatus>
      ) : error ? (
        <ProductStatus kind="error" title="情境测评历史加载失败" announce="assertive">{error}</ProductStatus>
      ) : rows.length === 0 ? (
        <ProductStatus kind="info" title="还没有情境测评记录">
          开始并完成情境测评后，服务器记录会显示在这里。
        </ProductStatus>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">服务器返回 {total} 条记录。</p>
          <div className="grid gap-4">
            {rows.map((row) => {
              const completed = row.attempt.status === 'COMPLETED'
              const metric = row.result?.metrics.find((item) => item.role === 'primary')
              const title = row.instrument.report.interpretations[0]?.headline || row.attempt.instrumentKey
              return (
                <DiscoveryCard
                  key={row.attemptId}
                  to={completed
                    ? `/student/situational/attempts/${row.attemptId}/result`
                    : `/student/situational/${encodeURIComponent(row.attempt.instrumentKey)}`}
                  title={title}
                  ariaLabel={completed ? `${title}，查看已完成结果` : `${title}，继续进行中的测评`}
                  leading={(
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${completed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {completed ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                    </span>
                  )}
                  status={(
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${completed ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                      {completed ? '已完成' : '进行中'}
                    </span>
                  )}
                  description={completed && metric
                    ? `${metric.label}：${metric.value === null ? '暂不可计算' : metric.value.toFixed(metric.displayPrecision)}`
                    : undefined}
                  meta={(
                    <>
                      <span>版本 {row.attempt.instrumentVersion}</span>
                      <span>测评时科研等级：{row.instrument.scientificContext?.scientificMaturity ?? 'PILOT'}</span>
                      <span>{new Date(row.attempt.startedAt).toLocaleString('zh-CN')}</span>
                    </>
                  )}
                  notice={!completed ? '进入后由服务器恢复这一题包的进行中尝试。' : undefined}
                />
              )
            })}
          </div>
        </>
      )}
    </ProductPage>
  )
}

export default SituationalHistory
