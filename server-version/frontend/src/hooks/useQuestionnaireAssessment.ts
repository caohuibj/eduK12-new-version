import { useState, useEffect } from 'react'

interface UseQuestionnaireAssessmentResult {
  loading: boolean
  currentScale: any
  currentIndex: number
  totalScales: number
  scaleAssessment: any
  items: any[]
  answers: Record<string, any>
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, any>>>
  progress: number
  submitAnswer: (itemId: string, value: number | string) => Promise<void>
  recordStartTime: (itemId: string) => void
  completeScaleAndFetchNext: () => Promise<void>
  completeAssessment: () => Promise<void>
  isCompleted: boolean
}

export function useQuestionnaireAssessment(
  token?: string,
  sessionId?: string | null
): UseQuestionnaireAssessmentResult {
  const [loading, setLoading] = useState(true)
  const [questionnaire, setQuestionnaire] = useState<any>(null)
  const [currentScale, setCurrentScale] = useState<any>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [scaleAssessment, setScaleAssessment] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [answerTimestamps, setAnswerTimestamps] = useState<Record<string, number>>({})
  const [progress, setProgress] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)

  useEffect(() => {
    if (sessionId) {
      fetchAssessment()
    }
  }, [sessionId])

  const fetchAssessment = async () => {
    try {
      setLoading(true)
      
      const response = await fetch(`/api/public/assessments/${sessionId}`)
      
      if (!response.ok) {
        throw new Error('获取测评失败')
      }

      const data = await response.json()
      
      setQuestionnaire(data.data.questionnaire)
      setCurrentIndex(data.data.questionnaireAssessment?.currentScaleIndex || 0)
      setProgress(data.data.questionnaireAssessment?.progress || 0)
      setIsCompleted(data.data.questionnaireAssessment?.status === 'COMPLETED')
      
      if (data.data.currentScale) {
        setCurrentScale(data.data.currentScale)
        setItems(data.data.currentScale.items || [])
        
        // 设置量表测评信息
        if (data.data.currentScale.scaleAssessmentId) {
          setScaleAssessment({ id: data.data.currentScale.scaleAssessmentId })
        }
        
        // 从 assessment 中恢复已有答案
        if (data.data.currentScale.assessment?.answers) {
          const existingAnswers: Record<string, any> = {}
          data.data.currentScale.assessment.answers.forEach((a: any) => {
            existingAnswers[a.itemId] = a.value
          })
          setAnswers(existingAnswers)
        }
      }
      
    } catch (err) {
      console.error('获取测评失败', err)
    } finally {
      setLoading(false)
    }
  }

  const submitAnswer = async (itemId: string, value: number | string) => {
      // 计算作答时间（毫秒）
      const now = Date.now()
      const startTime = answerTimestamps[itemId] || now
      const responseTime = now - startTime

      const response = await fetch(`/api/public/assessments/${sessionId}/answers`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scaleAssessmentId: scaleAssessment.id,
          itemId,
          value,
          responseTime
        })
      })

      if (!response.ok) {
        throw new Error('提交答案失败')
      }

      // 更新本地状态
      setAnswers(prev => ({
        ...prev,
        [itemId]: value
      }))
  }

  // 记录开始作答时间
  const recordStartTime = (itemId: string) => {
    setAnswerTimestamps(prev => ({
      ...prev,
      [itemId]: Date.now()
    }))
  }

  // 完成当前量表并获取下一个量表
  const completeScaleAndFetchNext = async () => {
      // 1. 完成当前量表
      const response = await fetch(`/api/public/assessments/${sessionId}/scale/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scaleAssessmentId: scaleAssessment.id
        })
      })

      if (!response.ok) {
        throw new Error('完成量表失败')
      }

      // 2. 获取问卷测评状态
      const statusResponse = await fetch(`/api/public/assessments/${sessionId}`)
      if (!statusResponse.ok) {
        throw new Error('获取状态失败')
      }

      const statusData = await statusResponse.json()
      const qa = statusData.data?.questionnaireAssessment
      const totalScales = statusData.data?.questionnaire?.totalScales || 0

      // 3. 判断是否所有量表都已完成
      if (qa?.status === 'COMPLETED' ||
          statusData.data?.currentScale === null ||
          (qa?.currentScaleIndex !== undefined && qa.currentScaleIndex >= totalScales)) {
        // 所有量表完成，调用问卷完成接口
        const completeResponse = await fetch(`/api/public/assessments/${sessionId}/complete`, {
          method: 'POST'
        })

        if (!completeResponse.ok) {
          throw new Error('完成测评失败')
        }

        setIsCompleted(true)
        setProgress(100)
        setCurrentScale(null)
      } else {
        // 还有量表未完成，更新状态
        setQuestionnaire(statusData.data.questionnaire)
        setCurrentIndex(qa?.currentScaleIndex || 0)
        setProgress(qa?.progress || 0)
        setIsCompleted(qa?.status === 'COMPLETED')

        if (statusData.data.currentScale) {
          setCurrentScale(statusData.data.currentScale)
          setItems(statusData.data.currentScale.items || [])

          if (statusData.data.currentScale.scaleAssessmentId) {
            setScaleAssessment({ id: statusData.data.currentScale.scaleAssessmentId })
          }

          if (statusData.data.currentScale.assessment?.answers) {
            const existingAnswers: Record<string, any> = {}
            statusData.data.currentScale.assessment.answers.forEach((a: any) => {
              existingAnswers[a.itemId] = a.value
            })
            setAnswers(existingAnswers)
          }
        }
      }
  }

  const completeAssessment = async () => {
      const response = await fetch(`/api/public/assessments/${sessionId}/complete`, {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('完成测评失败')
      }

      setIsCompleted(true)
      setProgress(100)
  }

  return {
    loading,
    currentScale,
    currentIndex,
    totalScales: questionnaire?.totalScales || 0,
    scaleAssessment,
    items,
    answers,
    setAnswers,
    progress,
    submitAnswer,
    recordStartTime,
    completeScaleAndFetchNext,
    completeAssessment,
    isCompleted
  }
}
