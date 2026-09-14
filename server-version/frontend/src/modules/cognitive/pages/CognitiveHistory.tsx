import React, { useEffect, useState } from 'react'
import { ArrowLeft, History } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DiscoveryCard, PageHeader, ProductPage, ProductStatus } from '../../../components/product-ui'
import { cognitiveApi } from '../api'
import type { CognitiveHistoryItem } from '../types'

const qualityLabel = (state: CognitiveHistoryItem['qualityState']) => (
  state === 'interpretable'
    ? '数据质量：可解释'
    : state === 'limited'
      ? '数据质量：受限解释'
      : '数据质量：无效，暂不解释'
)

const CognitiveHistory: React.FC = () => {
  const [items, setItems] = useState<CognitiveHistoryItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await cognitiveApi.getHistory(page, 20)
        if (response.code === 0 && response.data) {
          setItems(response.data.list)
          setTotalPages(response.data.totalPages)
          setHasMore(response.data.hasMore)
        } else {
          setError(response.message || '获取历史记录失败')
        }
      } catch (err) {
        setError((err as { message?: string }).message || '获取历史记录失败')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [page])

  return (
    <ProductPage width="assessment">
      <PageHeader
        title="认知测评历史"
        description={(
          <>
            <p>历史记录按服务器分页读取，每条记录直接打开对应的冻结结果。</p>
            <p className="mt-1 text-xs">重复测验可能因为熟悉任务而产生变化；反应速度还可能受到设备和输入方式影响。</p>
          </>
        )}
        actions={(
          <Link to="/student/cognitive" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 no-underline hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回认知测评
          </Link>
        )}
      />

      {loading ? (
        <ProductStatus kind="pending" title="正在加载认知测评历史" announce="polite">正在读取第 {page} 页记录。</ProductStatus>
      ) : error ? (
        <ProductStatus kind="error" title="认知测评历史加载失败" announce="assertive">{error}</ProductStatus>
      ) : items.length === 0 ? (
        <ProductStatus kind="info" title="暂无已完成的认知测评">
          完成认知任务后，对应结果会出现在这里。
        </ProductStatus>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <DiscoveryCard
              key={item.sessionId}
              to={`/student/cognitive/sessions/${item.sessionId}/result`}
              title={item.title}
              ariaLabel={`${item.title}，查看尝试 ${item.attemptNo} 的结果`}
              leading={(
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <History className="h-5 w-5" />
                </span>
              )}
              status={(
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {item.score === null ? '查看结果' : `得分 ${Math.round(item.score)}`}
                </span>
              )}
              description={qualityLabel(item.qualityState)}
              meta={(
                <>
                  <span>{item.testType} / {item.engineVersion}</span>
                  <span>尝试 #{item.attemptNo}</span>
                  <span>{item.finishedAt ? new Date(item.finishedAt).toLocaleString('zh-CN') : '完成时间未知'}</span>
                </>
              )}
            />
          ))}
        </div>
      )}

      {!loading && !error && totalPages > 1 ? (
        <nav aria-label="认知测评历史分页" className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-slate-600">
          <button type="button" className="btn-secondary min-h-11" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>
            上一页
          </button>
          <span>第 {page} / {totalPages} 页</span>
          <button type="button" className="btn-secondary min-h-11" disabled={!hasMore} onClick={() => setPage((current) => current + 1)}>
            下一页
          </button>
        </nav>
      ) : null}
    </ProductPage>
  )
}

export default CognitiveHistory
