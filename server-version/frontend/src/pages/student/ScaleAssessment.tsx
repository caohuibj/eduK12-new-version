import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react'

interface ScaleItem {
  id: string
  itemCode: string
  content: string
  type: string
  reverse: boolean
  options: Array<{ value: number; label: string }> | null
}

interface ScaleLabel {
  value: number
  label: string
}

interface Scale {
  id: string
  name: string
  instruction: string | null
  estimatedTime: number | null
  config: {
    points?: number
    labels?: ScaleLabel[]
  } | null
  items: ScaleItem[]
}

interface Assessment {
  id: string
  status: string
  progress: number
  answers: Array<{
    itemId: string
    value: number
  }>
}

const ScaleAssessment: React.FC = () => {
  const { scaleId } = useParams<{ scaleId: string }>()
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState<Scale | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  
  // 记录当前题目开始显示的时间
  const itemStartTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    startAssessment()
  }, [scaleId])

  // 切换题目时重置计时器
  useEffect(() => {
    itemStartTimeRef.current = Date.now()
  }, [currentIndex])

  const startAssessment = async () => {
    try {
      const response = await apiClient.post<{
        assessment: Assessment
        scale: Scale
      }>(`/scales/${scaleId}/assessments`)
      
      if (response.code === 0) {
        setAssessment(response.data.assessment)
        setScale(response.data.scale)
        
        // 恢复已有答案
        const existingAnswers: Record<string, number> = {}
        ;(response.data.assessment.answers || []).forEach((a: any) => {
          existingAnswers[a.itemId] = a.value
        })
        setAnswers(existingAnswers)
      }
    } catch (err) {
      console.error('开始测评失败', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectAnswer = async (value: number) => {
    if (!scale || !assessment) return

    const items = scale.items || []
    const item = items[currentIndex]
    if (!item) return

    // 计算作答时间（毫秒）
    const responseTime = Date.now() - itemStartTimeRef.current

    // 更新本地状态
    setAnswers({ ...answers, [item.id]: value })
    
    // 提交答案（包含作答时间）
    try {
      await apiClient.patch(`/scales/assessments/${assessment.id}/answers`, {
        itemId: item.id,
        value,
        responseTime,
      })
    } catch (err) {
      console.error('提交答案失败', err)
    }
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const handleNext = () => {
    const items = scale?.items || []
    if (scale && currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const handleComplete = async () => {
    if (!assessment) return
    
    // 检查是否所有必答题都已回答
    const items = scale?.items || []
    const unanswered = items.filter((item) => !answers[item.id])
    if (unanswered.length > 0) {
      if (!confirm(`还有 ${unanswered.length} 道题目未作答，确定要提交吗？`)) {
        return
      }
    }
    
    try {
      setSubmitting(true)
      const response = await apiClient.post(`/scales/assessments/${assessment.id}/complete`)
      if (response.code === 0) {
        navigate(`/student/scales/result/${assessment.id}`)
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (!scale || !assessment) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">量表不存在或未发布</p>
      </div>
    )
  }

  // 防御性检查：确保 items 存在且为数组
  const items = scale.items || []
  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">量表题目加载失败，请刷新页面重试</p>
      </div>
    )
  }

  const currentItem = items[currentIndex]
  const selectedValue = answers[currentItem?.id]
  const progress = Math.round((Object.keys(answers).length / items.length) * 100)

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>答题进度</span>
          <span>{Object.keys(answers).length} / {items.length}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="text-sm text-gray-500 mb-2">
          第 {currentIndex + 1} 题 / 共 {items.length} 题
        </div>
        <h2 className="text-lg font-medium text-gray-900 mb-6">
          {currentItem?.content}
        </h2>

        {/* Options */}
        <div className="space-y-3">
          {(scale.config?.labels || currentItem?.options || [])?.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelectAnswer(option.value)}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                selectedValue === option.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <span className="font-medium">{option.value}.</span> {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          上一题
        </button>

        {currentIndex === items.length - 1 ? (
          <button
            onClick={handleComplete}
            disabled={submitting}
            className="flex items-center px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            <CheckCircle className="w-5 h-5 mr-1" />
            {submitting ? '提交中...' : '完成测评'}
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            下一题
            <ChevronRight className="w-5 h-5 ml-1" />
          </button>
        )}
      </div>

      {/* Question navigator */}
      <div className="mt-6 bg-white rounded-lg shadow p-4">
        <div className="text-sm text-gray-600 mb-3">题目导航</div>
        <div className="flex flex-wrap gap-2">
          {items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setCurrentIndex(index)}
              className={`w-8 h-8 rounded text-sm font-medium ${
                currentIndex === index
                  ? 'bg-primary text-white'
                  : answers[item.id]
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ScaleAssessment
