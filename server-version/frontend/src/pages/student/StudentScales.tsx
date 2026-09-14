import React, { useEffect, useState } from 'react'
import apiClient from '../../api/client'
import { CheckCircle, Clock, FileText } from 'lucide-react'
import { DiscoveryCard, PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'

interface Scale {
  id: string
  code: string
  name: string
  description: string | null
  estimatedTime: number | null
  course: {
    id: string
    title: string
  } | null
  itemCount: number
  completed: boolean
  inProgress?: boolean
  completedAt: string | null
  assessmentId: string | null
  activeAttempt?: { id: string; startedAt: string; progress: number } | null
  latestCompletedAttempt?: { id: string; completedAt: string | null } | null
  attemptCount?: number
  retakeAllowed?: boolean
}

const scaleDestination = (scale: Scale) => (
  scale.completed && !scale.inProgress && scale.assessmentId
    ? `/student/scales/result/${scale.assessmentId}`
    : `/student/scales/${scale.id}`
)

const StudentScales: React.FC = () => {
  const [scales, setScales] = useState<Scale[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void fetchScales()
  }, [])

  const fetchScales = async () => {
    try {
      setLoadError(null)
      const response = await apiClient.get<{ list: Scale[] }>('/scales/available')
      if (response.code === 0) {
        setScales(response.data.list)
      } else {
        setLoadError(response.message || '无法加载可用量表')
      }
    } catch (err) {
      console.error('获取量表列表失败', err)
      setLoadError(err instanceof Error ? err.message : '无法加载可用量表')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <ProductPage width="assessment">
        <ProductStatus kind="pending" title="正在加载心理测评" announce="polite">正在核对可用量表与当前尝试状态。</ProductStatus>
      </ProductPage>
    )
  }

  return (
    <ProductPage width="assessment">
      <PageHeader title="心理测评" description="完成已发布的心理量表；进行中的测评会从当前本地尝试继续。" />

      {loadError ? (
        <ProductStatus kind="error" title="量表列表加载失败" announce="assertive">{loadError}</ProductStatus>
      ) : scales.length === 0 ? (
        <ProductStatus kind="info" title="暂无可用的心理量表">
          当有适用于你的已发布量表后，会显示在这里。
        </ProductStatus>
      ) : (
        <div className="grid gap-4">
          {scales.map((scale) => (
            <DiscoveryCard
              key={scale.id}
              to={scaleDestination(scale)}
              title={scale.name}
              ariaLabel={`${scale.name}${scale.inProgress ? '，继续作答' : scale.completed ? '，查看结果' : '，开始测评'}`}
              status={scale.inProgress ? (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">进行中</span>
              ) : scale.completed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  已完成
                </span>
              ) : undefined}
              description={scale.description}
              meta={(
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    {scale.itemCount} 道题目
                  </span>
                  {scale.estimatedTime ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      约 {scale.estimatedTime} 分钟
                    </span>
                  ) : null}
                  {scale.course ? <span>课程：{scale.course.title}</span> : null}
                </>
              )}
              notice={scale.inProgress && scale.activeAttempt ? '已有进行中的尝试，进入后继续当前本地作答。' : undefined}
            />
          ))}
        </div>
      )}
    </ProductPage>
  )
}

export default StudentScales
