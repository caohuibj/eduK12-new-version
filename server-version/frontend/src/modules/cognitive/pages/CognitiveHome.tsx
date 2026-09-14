import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Brain, Clock, History } from 'lucide-react'
import { DiscoveryCard, PageHeader, ProductPage, ProductStatus } from '../../../components/product-ui'
import { cognitiveApi } from '../api'
import type { CognitiveAssignmentSummary } from '../types'

/**
 * Cognitive Home（Stage B v1.1 §17/§23）—— 学生已发布认知测评列表。
 * 只展示安全 metadata，不展示任何敏感字段。
 */

const CognitiveHome: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<CognitiveAssignmentSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchList = async () => {
      try {
        const response = await cognitiveApi.getMyAssignments()
        if (response.code === 0 && response.data) {
          setAssignments(response.data)
        } else {
          setError(response.message || '获取列表失败')
        }
      } catch (err) {
        setError((err as { message?: string }).message || '获取列表失败')
      } finally {
        setLoading(false)
      }
    }
    void fetchList()
  }, [])

  if (loading) {
    return (
      <ProductPage width="assessment">
        <ProductStatus kind="pending" title="正在加载认知测评" announce="polite">正在读取已发布的认知任务。</ProductStatus>
      </ProductPage>
    )
  }

  return (
    <ProductPage width="assessment">
      <PageHeader
        title="认知测评"
        description="选择已发布的认知任务。任务入口会继续使用冻结的测试类型与引擎版本。"
        actions={(
          <Link to="/student/cognitive/history" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 no-underline hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
            <History className="h-4 w-4" aria-hidden="true" />
            查看历史
          </Link>
        )}
      />

      {error ? (
        <ProductStatus kind="error" title="认知测评列表加载失败" announce="assertive">
          {error}。如持续失败，请联系老师。
        </ProductStatus>
      ) : assignments.length === 0 ? (
        <ProductStatus kind="info" title="暂无认知测评任务">
          当老师发布适用于你的认知任务后，会显示在这里。
        </ProductStatus>
      ) : (
        <div className="grid gap-4">
          {assignments.map((item) => (
            <DiscoveryCard
              key={item.id}
              to={`/student/cognitive/assignments/${item.id}`}
              title={item.title}
              ariaLabel={`${item.title}，打开认知测评任务`}
              leading={(
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Brain className="h-6 w-6" />
                </span>
              )}
              status={item.config ? (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                  {item.config.testType} / {item.config.engineVersion}
                </span>
              ) : undefined}
              description={item.instruction}
              meta={(
                <>
                  {item.course ? <span>课程：{item.course.title}</span> : null}
                  {item.dueAt ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      截止：{new Date(item.dueAt).toLocaleString('zh-CN')}
                    </span>
                  ) : null}
                </>
              )}
            />
          ))}
        </div>
      )}
    </ProductPage>
  )
}

export default CognitiveHome
