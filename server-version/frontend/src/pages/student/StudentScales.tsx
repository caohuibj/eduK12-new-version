import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { CheckCircle, ChevronRight, Clock, FileText, PlayCircle } from 'lucide-react'
import { ProductPage, ProductPageHeader, ProductStatus, ProductSurface } from '../../components/product/ProductPage'

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

const destinationForScale = (scale: Scale) => {
  if (scale.inProgress) return `/student/scales/${scale.id}`
  if (scale.completed && scale.assessmentId) return `/student/scales/result/${scale.assessmentId}`
  return `/student/scales/${scale.id}`
}

const actionLabelForScale = (scale: Scale) => {
  if (scale.inProgress) return '继续作答'
  if (scale.completed && scale.assessmentId) return '查看结果'
  return '开始测评'
}

const StudentScales: React.FC = () => {
  const [scales, setScales] = useState<Scale[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchScales = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await apiClient.get<{ list: Scale[] }>('/scales/available')
      if (response.code !== 0 || !response.data) {
        throw new Error(response.message || '量表列表加载失败')
      }
      setScales(response.data.list)
    } catch (err) {
      console.error('获取量表列表失败', err)
      setLoadError(err instanceof Error ? err.message : '量表列表加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchScales()
  }, [])

  if (loading) {
    return (
      <ProductPage width="report">
        <ProductPageHeader title="量表测评" description="查看可用量表，并从上次进度继续或查看已经完成的结果。" />
        <ProductSurface className="flex min-h-64 items-center justify-center p-6 text-sm text-gray-500">
          正在加载量表…
        </ProductSurface>
      </ProductPage>
    )
  }

  return (
    <ProductPage width="report">
      <ProductPageHeader
        title="量表测评"
        description="查看可用量表，并从上次进度继续或查看已经完成的结果。"
      />

      {loadError && (
        <ProductStatus tone="danger" className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void fetchScales()}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-red-300 bg-white px-4 font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            重新加载
          </button>
        </ProductStatus>
      )}

      {!loadError && scales.length === 0 ? (
        <ProductSurface className="px-6 py-12 text-center">
          <FileText className="mx-auto mb-4 h-10 w-10 text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900">暂无可用量表</h2>
          <p className="mt-2 text-sm text-gray-500">有新的测评可用时，会显示在这里。</p>
        </ProductSurface>
      ) : !loadError ? (
        <div className="grid gap-4">
          {scales.map((scale) => {
            const destination = destinationForScale(scale)
            const actionLabel = actionLabelForScale(scale)
            return (
              <ProductSurface key={scale.id} className="overflow-hidden transition-shadow hover:shadow-md">
                <Link
                  to={destination}
                  className="group block rounded-xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-gray-950">{scale.name}</h2>
                        {scale.inProgress && (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                            <PlayCircle className="mr-1 h-3.5 w-3.5" />进行中
                          </span>
                        )}
                        {scale.completed && !scale.inProgress && (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            <CheckCircle className="mr-1 h-3.5 w-3.5" />已完成
                          </span>
                        )}
                      </div>

                      {scale.description && (
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">{scale.description}</p>
                      )}

                      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-500">
                        <span className="inline-flex items-center">
                          <FileText className="mr-1.5 h-4 w-4" />
                          {scale.itemCount} 道题目
                        </span>
                        {scale.estimatedTime && (
                          <span className="inline-flex items-center">
                            <Clock className="mr-1.5 h-4 w-4" />
                            约 {scale.estimatedTime} 分钟
                          </span>
                        )}
                        {scale.course && <span>来自课程：{scale.course.title}</span>}
                      </div>

                      <div className="mt-5 text-sm font-medium text-primary">{actionLabel}</div>
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </Link>
              </ProductSurface>
            )
          })}
        </div>
      ) : null}
    </ProductPage>
  )
}

export default StudentScales
