import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { normalizeApiError } from '../../utils/normalizeApiError'
import { useRunnerSaveState } from '../../hooks/useRunnerSaveState'

type ResponseValue = string | number

interface ScaleRunnerItem {
  itemCode: string
  content: string
  type: string
  required: boolean
  sortOrder: number
  responseSetKey: string
  randomizeOptions: boolean
  options: Array<{ value: ResponseValue; label: string }>
}

interface Scale {
  id: string
  name: string
  instruction: string | null
  estimatedTime: number | null
  definition: {
    schemaVersion: 2
    respondentType: string
    display: { randomizeItems: boolean }
    items: ScaleRunnerItem[]
  }
}

interface Assessment {
  id: string
  status: string
  progress: number
  answers: Array<{ itemCode: string; responseValue: ResponseValue }>
}

const valueKey = (value: ResponseValue) => `${typeof value}:${String(value)}`

const ScaleAssessment: React.FC = () => {
  const { scaleId } = useParams<{ scaleId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState<Scale | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ResponseValue>>({})
  const [submitting, setSubmitting] = useState(false)
  const [completionNotice, setCompletionNotice] = useState<string | null>(null)
  const itemStartTimeRef = useRef<number>(Date.now())
  const { saving: savingAnswer, savingRef: savingAnswerRef, runSave } = useRunnerSaveState()

  useEffect(() => {
    itemStartTimeRef.current = Date.now()
  }, [currentIndex])

  useEffect(() => {
    let cancelled = false
    const startAssessment = async () => {
      try {
        const response = await apiClient.post<{ assessment: Assessment; scale: Scale }>(`/scales/${scaleId}/assessments`)
        if (cancelled || response.code !== 0 || !response.data) return
        setAssessment(response.data.assessment)
        setScale(response.data.scale)
        const existingAnswers: Record<string, ResponseValue> = {}
        response.data.assessment.answers?.forEach((answer) => { existingAnswers[answer.itemCode] = answer.responseValue })
        setAnswers(existingAnswers)
      } catch (err) {
        console.error('开始测评失败', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void startAssessment()
    return () => { cancelled = true }
  }, [scaleId])

  const handleSelectAnswer = async (value: ResponseValue) => {
    if (!scale || !assessment || savingAnswerRef.current || submitting) return
    const items = scale.definition.items
    const itemIndex = currentIndex
    const item = items[itemIndex]
    if (!item) return
    const responseTimeMs = Date.now() - itemStartTimeRef.current
    try {
      await runSave(async () => {
        const response = await apiClient.patch(`/scales/assessments/${assessment.id}/answers`, {
          itemCode: item.itemCode,
          responseValue: value,
          responseTimeMs,
        })
        if (response.code !== 0) throw new Error(response.message || '提交答案失败')
        setAnswers((previous) => ({ ...previous, [item.itemCode]: value }))
        if (itemIndex < items.length - 1) {
          setCurrentIndex((index) => index === itemIndex ? itemIndex + 1 : index)
        }
        setCompletionNotice(null)
      })
    } catch (err) {
      const normalized = normalizeApiError(err)
      setCompletionNotice(normalized.message)
      console.error('提交答案失败', err)
    }
  }

  const handleComplete = async () => {
    if (!assessment || !scale || savingAnswerRef.current) return
    const unanswered = scale.definition.items.filter((item) => item.required && answers[item.itemCode] === undefined)
    if (unanswered.length > 0) {
      const firstMissingIndex = scale.definition.items.findIndex((item) => item.required && answers[item.itemCode] === undefined)
      if (firstMissingIndex >= 0) setCurrentIndex(firstMissingIndex)
      setCompletionNotice(`还有 ${unanswered.length} 道必答题未作答，请完成后再提交`)
      return
    }
    setCompletionNotice(null)
    try {
      setSubmitting(true)
      const response = await apiClient.post(`/scales/assessments/${assessment.id}/complete`)
      if (response.code !== 0) throw new Error(response.message || '提交失败')
      navigate(`/student/scales/result/${assessment.id}`)
    } catch (err) {
      setCompletionNotice(normalizeApiError(err).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-500">加载中...</div></div>
  if (!scale || !assessment) return <div className="text-center py-12"><p className="text-gray-500">量表不存在、未发布或尚未安装有效定义</p></div>

  const items = scale.definition.items
  if (items.length === 0) return <div className="text-center py-12"><p className="text-gray-500">量表题目加载失败</p></div>
  const currentItem = items[currentIndex]
  const selectedValue = currentItem ? answers[currentItem.itemCode] : undefined
  const answeredCount = Object.keys(answers).length
  const progress = Math.round((answeredCount / items.length) * 100)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2"><span>答题进度</span><span>{answeredCount} / {items.length}</span></div>
        <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
      </div>
      {completionNotice && <p role="alert" className="mb-4 text-sm text-red-600">{completionNotice}</p>}
      {scale.instruction && <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap">{scale.instruction}</p>}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="text-sm text-gray-500 mb-2">第 {currentIndex + 1} 题 / 共 {items.length} 题</div>
        <h2 className="text-lg font-medium text-gray-900 mb-6">{currentItem.content}</h2>
        <div className="space-y-3">
          {currentItem.options.map((option) => (
            <button
              key={valueKey(option.value)}
              onClick={() => void handleSelectAnswer(option.value)}
              disabled={savingAnswer || submitting}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors disabled:cursor-wait disabled:opacity-60 ${selectedValue === option.value ? 'border-primary bg-primary/5 text-primary' : 'border-gray-300 hover:border-gray-400'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-between">
        <button onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0 || savingAnswer || submitting} className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"><ChevronLeft className="w-5 h-5 mr-1" />上一题</button>
        {currentIndex === items.length - 1 ? (
          <button onClick={() => void handleComplete()} disabled={submitting || savingAnswer} className="flex items-center px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"><CheckCircle className="w-5 h-5 mr-1" />{submitting ? '提交中...' : '完成测评'}</button>
        ) : (
          <button onClick={() => setCurrentIndex((index) => Math.min(items.length - 1, index + 1))} disabled={savingAnswer || submitting} className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">下一题<ChevronRight className="w-5 h-5 ml-1" /></button>
        )}
      </div>
      <div className="mt-6 bg-white rounded-lg shadow p-4">
        <div className="text-sm text-gray-600 mb-3">题目导航</div>
        <div className="flex flex-wrap gap-2">
          {items.map((item, index) => (
          <button key={item.itemCode} onClick={() => setCurrentIndex(index)} disabled={savingAnswer || submitting} className={`w-8 h-8 rounded text-sm font-medium disabled:cursor-wait disabled:opacity-60 ${currentIndex === index ? 'bg-primary text-white' : answers[item.itemCode] !== undefined ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{index + 1}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ScaleAssessment
