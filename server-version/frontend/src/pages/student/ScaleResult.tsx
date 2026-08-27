import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { ArrowLeft } from 'lucide-react'
import ScaleUnitReportCard from '../../modules/reporting/ScaleUnitReportCard'
import type { ScaleResultV2, ScaleUnitReport } from '../../modules/reporting/types'

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
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(true)
  const [assessment, setAssessment] = useState<Assessment | null>(null)

  useEffect(() => {
    fetchResult()
  }, [assessmentId])

  const fetchResult = async () => {
    try {
      const response = await apiClient.get<Assessment>(`/scales/assessments/${assessmentId}`)
      if (response.code === 0 && response.data) {
        setAssessment(response.data)
      }
    } catch (err) {
      console.error('获取测评结果失败', err)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}分${seconds}秒`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">测评结果不存在</p>
        <Link to="/student/scales" className="text-primary mt-4 inline-block">
          返回量表列表
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/student/scales')}
          className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回列表
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{assessment.scale.name}</h1>
        <p className="text-gray-600 mt-1">测评报告</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-6 text-sm text-gray-500 flex-wrap">
          {assessment.completedAt && <span>完成时间: {new Date(assessment.completedAt).toLocaleString('zh-CN')}</span>}
          {assessment.totalTime != null && <span>用时: {formatTime(assessment.totalTime)}</span>}
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <ScaleUnitReportCard report={toScaleUnitReport(assessment)} />
      </div>
    </div>
  )
}

export default ScaleResult
