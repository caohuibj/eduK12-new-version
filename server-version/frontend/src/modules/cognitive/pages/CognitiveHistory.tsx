import React, { useEffect, useState } from 'react'
import { ArrowLeft, History } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cognitiveApi } from '../api'
import type { CognitiveHistoryItem } from '../types'

const CognitiveHistory: React.FC = () => {
  const navigate = useNavigate()
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
        }
        else setError(response.message || '获取历史记录失败')
      } catch (err) {
        setError((err as { message?: string }).message || '获取历史记录失败')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [page])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>
  if (error) return <div className="card p-8 text-center text-red-500">{error}</div>

  return (
    <div>
      <button onClick={() => navigate('/student/cognitive')} className="flex items-center text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> 返回认知测评
      </button>
      <div className="flex items-center space-x-2 mb-6">
        <History className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-gray-800">测评历史</h1>
      </div>
      <p className="text-xs text-gray-400 mb-5">
        重复测验可能因为熟悉任务而产生一定变化；反应速度还可能受到设备和输入方式影响。
      </p>
      {items.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">暂无已完成的认知测评</div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <button
              type="button"
              key={item.sessionId}
              onClick={() => navigate(`/student/cognitive/sessions/${item.sessionId}/result`)}
              className="card p-5 text-left hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-800">{item.title}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {item.testType} / {item.engineVersion} · 尝试 #{item.attemptNo}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    {item.finishedAt ? new Date(item.finishedAt).toLocaleString('zh-CN') : '完成时间未知'}
                  </p>
                </div>
                  <div className="text-2xl font-bold text-primary">{Math.round(item.score)}</div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                {item.qualityState === 'interpretable' ? '数据质量：可解释' : '数据质量：不足以稳定解释'}
              </p>
            </button>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6 text-sm text-gray-500">
          <button type="button" className="btn-secondary" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>
            上一页
          </button>
          <span>第 {page} / {totalPages} 页</span>
          <button type="button" className="btn-secondary" disabled={!hasMore} onClick={() => setPage((current) => current + 1)}>
            下一页
          </button>
        </div>
      )}
    </div>
  )
}

export default CognitiveHistory
