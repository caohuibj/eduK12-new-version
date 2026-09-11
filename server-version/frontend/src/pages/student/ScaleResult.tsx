import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import { ArrowLeft, Clock, FileText } from 'lucide-react'
import ScaleUnitReportCard from '../../modules/reporting/ScaleUnitReportCard'
import type { ScaleResultV2, ScaleUnitReport } from '../../modules/reporting/types'
import { ProductPage, ProductPageHeader, ProductStatus, ProductSurface } from '../../components/product/ProductPage'

export interface Assessment {
  id: string
  status: string
  result?: ScaleResultV2 | null
  decryptError?: boolean
  startedAt: string
  completedAt: string | null
  totalTime: number | null
  scale: {
    id: string
    code: string | null
    name: string
    description: string | null
  }
}

export const toScaleUnitReport = (value: Assessment): ScaleUnitReport => {
  const disclaimer = value.result?.disclaimer ?? '量表结果仅反映本次作答，不构成医学诊断或人口常模。'
  return {
    itemId: value.id,
    type: 'SCALE',
    kind: 'scale',
    scaleId: value.scale.id,
    scaleCode: value.scale.code,
    label: value.scale.name,
    scaleName: value.scale.name,
    result: value.result ?? null,
    quality: value.result?.quality ?? null,
    scores: value.result?.scores ?? [],
    references: value.result?.references ?? [],
    interpretations: value.result?.interpretations ?? [],
    caveats: value.result?.caveats ?? [],
    disclaimer,
    completedAt: value.completedAt,
    totalTime: value.totalTime,
    method: value.result?.method ?? null,
    ...(value.decryptError ? { decryptError: true } : {}),
  }
}

const ScaleResult: React.FC = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>()
  const [loading, setLoading] = useState(true)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchResult = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await apiClient.get<Assessment>(`/scales/assessments/${assessmentId}`)
      if (response.code !== 0 || !response.data) {
        throw new Error(response.message || '测评报告加载失败')
      }
      setAssessment(response.data)
    } catch (err) {
      console.error('获取测评结果失败', err)
      setLoadError(err instanceof Error ? err.message : '测评报告加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchResult()
  }, [assessmentId])

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}分${seconds}秒`
  }

  if (loading) {
    return (
      <ProductPage width="report">
        <ProductPageHeader title="测评报告" description="正在读取已经提交的量表结果。" />
        <ProductSurface className="flex min-h-64 items-center justify-center p-6 text-sm text-gray-500">
          正在加载报告…
        </ProductSurface>
      </ProductPage>
    )
  }

  if (loadError) {
    return (
      <ProductPage width="report">
        <ProductPageHeader title="测评报告" description="报告暂时无法读取，但这不代表测评没有提交成功。" />
        <ProductStatus tone="danger" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void fetchResult()}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-red-300 bg-white px-4 font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            重新加载
          </button>
        </ProductStatus>
        <Link to="/student/scales" className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-gray-600 hover:text-gray-900">
          <ArrowLeft className="mr-1.5 h-4 w-4" />返回量表列表
        </Link>
      </ProductPage>
    )
  }

  if (!assessment) {
    return (
      <ProductPage width="report">
        <ProductPageHeader title="测评报告" description="没有找到可展示的报告记录。" />
        <ProductSurface className="px-6 py-12 text-center">
          <FileText className="mx-auto mb-4 h-10 w-10 text-gray-400" />
          <p className="text-sm text-gray-600">测评结果不存在或当前账户无法访问。</p>
          <Link to="/student/scales" className="mt-5 inline-flex min-h-11 items-center font-medium text-primary hover:underline">
            返回量表列表
          </Link>
        </ProductSurface>
      </ProductPage>
    )
  }

  return (
    <ProductPage width="report">
      <Link
        to="/student/scales"
        className="mb-5 inline-flex min-h-11 items-center text-sm font-medium text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />返回量表列表
      </Link>

      <ProductPageHeader
        eyebrow="已完成"
        title={assessment.scale.name}
        description="以下内容基于本次已经提交的作答结果。请结合报告中的适用范围与限制理解结果。"
      />

      <ProductSurface className="mb-5 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500">
          {assessment.completedAt && (
            <span>完成时间：{new Date(assessment.completedAt).toLocaleString('zh-CN')}</span>
          )}
          {assessment.totalTime != null && (
            <span className="inline-flex items-center"><Clock className="mr-1.5 h-4 w-4" />用时：{formatTime(assessment.totalTime)}</span>
          )}
        </div>
      </ProductSurface>

      <ProductSurface className="p-5 sm:p-6">
        <ScaleUnitReportCard report={toScaleUnitReport(assessment)} />
      </ProductSurface>
    </ProductPage>
  )
}

export default ScaleResult
