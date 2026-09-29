import React, { useCallback, useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { ChevronLeft, ChevronRight, CheckCircle, FileText, Layers } from 'lucide-react'
import { normalizeApiError } from '../../utils/normalizeApiError'
import { useRunnerSaveState } from '../../hooks/useRunnerSaveState'
import { checkpointScheduler, CheckpointTransportError } from '../../services/persistence/checkpointScheduler'
import type { CheckpointBatch } from '../../services/persistence/checkpointTypes'
import { useCheckpointLifecycle } from '../../services/persistence/flushLifecycle'
import { runWithCompletionRetry } from '../../services/completionRetry'
import FinalQuestionnaireAssessment, { type FinalQuestionnaireData } from '../../components/FinalQuestionnaireAssessment'

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

// 表单题目类型
interface FormItem {
  id: string
  type: 'fill_blank' | 'single_choice' | 'multiple_choice' | 'text_input' | 'year_month'
  label: string
  placeholder: string | null
  required: boolean
  position: number
  options: Array<{ value: string; label: string }> | null
  contextKey?: string | null
}

// 内容项类型
interface ContentItem {
  type: 'form' | 'scale'
  position: number
  id: string
  label: string
  completed: boolean
}

interface QuestionnaireAssessmentData {
  questionnaireAssessment: {
    id: string
    status: string
    progress: number
    currentIndex: number
    context?: { status: 'collecting' | 'frozen'; frozenAt: string | null }
    deliveryMode?: 'FINAL_ONLY' | 'LEGACY'
    attemptEpoch?: number
  }
  currentFormItem: FormItem | null
  currentScale: (Scale & { scaleAssessmentId: string; definitionHash?: string }) | null
  totalItems: number
  contentItems: Array<ContentItem | { type: 'form-section'; position: number; id: string; label: string; completed: boolean }>
  scaleAssessments?: Array<{ id: string; scaleId: string }>
  currentFormAnswerRevision?: number | null
  currentFormSection?: FinalQuestionnaireData['currentFormSection']
  definitionHash?: string
  contextSnapshotHash?: string | null
  units?: FinalQuestionnaireData['units']
  formSections?: FinalQuestionnaireData['formSections']
  sessionId?: string
}

interface QuestionnaireCheckpointPayload {
  formItemId: string
  action: 'answer' | 'skip'
  value?: string
  expectedRevision: number
}

interface QuestionnaireScaleCheckpointPayload {
  itemCode: string
  responseValue: ResponseValue
  responseTimeMs: number
  expectedRevision: number
}

const QuestionnaireAssessment: React.FC = () => {
  const { questionnaireId } = useParams<{ questionnaireId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<QuestionnaireAssessmentData | null>(null)
  // 问卷的 currentIndex 表示整体内容位置；量表内部必须使用独立索引。
  const [scaleIndex, setScaleIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ResponseValue>>({})
  const [formAnswer, setFormAnswer] = useState<string | string[]>('')
  const [submitting, setSubmitting] = useState(false)
  const [runnerError, setRunnerError] = useState<string | null>(null)
  const [answersLoading, setAnswersLoading] = useState(false)
  const [answersLoadFailed, setAnswersLoadFailed] = useState(false)
  const formAnswerRevisionsRef = useRef<Record<string, number>>({})
  const scaleAnswerRevisionsRef = useRef<Record<string, number>>({})
  const { saving: savingAnswer, savingRef: savingAnswerRef, runSave } = useRunnerSaveState()

  const questionnaireCheckpointTransport = useCallback(async (batch: CheckpointBatch<QuestionnaireCheckpointPayload>) => {
    try {
      const response = await apiClient.patch<{ acceptedIds?: string[]; acceptedSequences?: number[] }>(
        `/questionnaires/assessments/${batch.scopeId}/form-answers/batch`,
        {
          checkpointSequence: batch.records[batch.records.length - 1]?.sequence,
          answers: batch.records.map((record) => ({
            ...record.payload,
            checkpointId: record.id,
            checkpointSequence: record.sequence,
          })),
        },
      )
      if (response.code !== 0) throw new CheckpointTransportError(response.message || '提交表单答案失败', { code: response.code, retryable: false })
      return response.data || {}
    } catch (error) {
      if (error instanceof CheckpointTransportError) throw error
      const normalized = normalizeApiError(error)
      throw new CheckpointTransportError(normalized.message, {
        status: normalized.status ?? undefined,
        code: normalized.code ?? undefined,
        retryable: normalized.retryable,
        retryAfterMs: normalized.retryAfterMs ?? undefined,
      })
    }
  }, [])

  const scaleCheckpointTransport = useCallback(async (batch: CheckpointBatch<QuestionnaireScaleCheckpointPayload>) => {
    try {
      const response = await apiClient.patch<{ acceptedIds?: string[]; acceptedSequences?: number[] }>(
        `/scales/assessments/${batch.scopeId}/answers/batch`,
        {
          checkpointSequence: batch.records[batch.records.length - 1]?.sequence,
          answers: batch.records.map((record) => ({
            ...record.payload,
            checkpointId: record.id,
            checkpointSequence: record.sequence,
          })),
        },
      )
      if (response.code !== 0) throw new CheckpointTransportError(response.message || '提交量表答案失败', { code: response.code, retryable: false })
      return response.data || {}
    } catch (error) {
      if (error instanceof CheckpointTransportError) throw error
      const normalized = normalizeApiError(error)
      throw new CheckpointTransportError(normalized.message, {
        status: normalized.status ?? undefined,
        code: normalized.code ?? undefined,
        retryable: normalized.retryable,
        retryAfterMs: normalized.retryAfterMs ?? undefined,
      })
    }
  }, [])

  const registerQuestionnairePersistence = useCallback((assessmentId: string) => {
    checkpointScheduler.register('questionnaire', assessmentId, questionnaireCheckpointTransport, {
      maxBatchSize: 10,
      maxWaitMs: 12000,
      onError: (error) => setRunnerError(normalizeApiError(error).message),
    })
  }, [questionnaireCheckpointTransport])

  const registerScalePersistence = useCallback((assessmentId: string) => {
    checkpointScheduler.register('scale', assessmentId, scaleCheckpointTransport, {
      maxBatchSize: 10,
      maxWaitMs: 12000,
      onError: (error) => setRunnerError(normalizeApiError(error).message),
    })
  }, [scaleCheckpointTransport])

  const flushCheckpoints = useCallback(async () => {
    await checkpointScheduler.flushAll()
  }, [])

  useCheckpointLifecycle(flushCheckpoints, Boolean(data) && data?.questionnaireAssessment.deliveryMode !== 'FINAL_ONLY')

  const freezeContextBeforeScale = async (assessmentId: string) => {
    const response = await apiClient.post<{ status: 'frozen'; frozenAt: string }>(`/questionnaires/assessments/${assessmentId}/context/freeze`)
    if (response.code !== 0 || !response.data) throw new Error(response.message || '人口学上下文冻结失败')
    return response.data
  }
  
  // 记录当前题目开始显示的时间
  const itemStartTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    startAssessment()
  }, [questionnaireId])

  // 切换题目时重置计时器
  useEffect(() => {
    itemStartTimeRef.current = Date.now()
  }, [scaleIndex])

  const startAssessment = async () => {
    try {
      // 先检查是否已经完成过该问卷
      const availableResponse = await apiClient.get<{ list: Array<{ id: string; completed: boolean; inProgress?: boolean; assessmentId: string | null }> }>('/questionnaires/available')
      if (availableResponse.code === 0) {
        const existingRecord = availableResponse.data.list.find(q => q.id === questionnaireId)
        // An active attempt is authoritative even when a prior completed
        // attempt is also present; the POST below resumes that active row.
        if (existingRecord && !existingRecord.inProgress && existingRecord.completed && existingRecord.assessmentId) {
          // 已完成，直接跳转到结果页
          navigate(`/student/questionnaires/result/${existingRecord.assessmentId}`)
          return
        }
      }

      const response = await runWithCompletionRetry(() => apiClient.post<QuestionnaireAssessmentData>(
        `/questionnaires/${questionnaireId}/assessments`
      ))

      if (response.code === 0) {
        const questionnaireAssessmentId = response.data.questionnaireAssessment.id
        formAnswerRevisionsRef.current = response.data.currentFormItem
          ? { [response.data.currentFormItem.id]: response.data.currentFormAnswerRevision ?? 0 }
          : {}
        if (response.data.questionnaireAssessment.deliveryMode === 'FINAL_ONLY') {
          setData(response.data)
          if (response.data.questionnaireAssessment.status === 'COMPLETED') {
            navigate(`/student/questionnaires/result/${response.data.questionnaireAssessment.id}`)
          }
          return
        }
        registerQuestionnairePersistence(questionnaireAssessmentId)
        void checkpointScheduler.flush('questionnaire', questionnaireAssessmentId).catch((err) => {
          setRunnerError(normalizeApiError(err).message)
        })
        // 如果测评已完成，跳转到结果页
        if (response.data.questionnaireAssessment.status === 'COMPLETED') {
          navigate(`/student/questionnaires/result/${response.data.questionnaireAssessment.id}`)
          return
        }
        
        // 如果问卷已完成（所有内容为空），完成问卷并跳转
        if (response.data.contentItems?.length === 0 || 
            response.data.questionnaireAssessment.currentIndex >= response.data.totalItems) {
          await runWithCompletionRetry(() => apiClient.post(`/questionnaires/assessments/${response.data.questionnaireAssessment.id}/complete`))
          navigate(`/student/questionnaires/result/${response.data.questionnaireAssessment.id}`)
          return
        }

        let nextData = response.data
        if (response.data.currentScale?.scaleAssessmentId) {
          registerScalePersistence(response.data.currentScale.scaleAssessmentId)
          const frozen = await freezeContextBeforeScale(response.data.questionnaireAssessment.id)
          nextData = {
            ...response.data,
            questionnaireAssessment: {
              ...response.data.questionnaireAssessment,
              context: { status: 'frozen', frozenAt: frozen.frozenAt },
            },
          }
        }
        setData(nextData)
        
        // 根据当前项类型处理
        if (nextData.currentFormItem) {
          // 当前是表单题目
          setFormAnswer('')
        } else if (nextData.currentScale?.scaleAssessmentId) {
          // 当前是量表
          fetchExistingAnswers(nextData.currentScale.scaleAssessmentId)
        }
      }
    } catch (err) {
      setRunnerError(normalizeApiError(err).message)
      console.error('开始问卷测评失败', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchExistingAnswers = async (assessmentId: string) => {
    try {
      registerScalePersistence(assessmentId)
      setAnswersLoading(true)
      setAnswersLoadFailed(false)
      const response = await apiClient.get(`/scales/assessments/${assessmentId}`)
      if (response.code !== 0) throw new Error(response.message || '获取已有答案失败')
      if (response.data.answers) {
        const existingAnswers: Record<string, ResponseValue> = {}
        const revisions: Record<string, number> = {}
        response.data.answers.forEach((a: any) => {
          existingAnswers[a.itemCode] = a.responseValue
          revisions[a.itemCode] = a.revision ?? 0
        })
        const pending = await checkpointScheduler.pending('scale', assessmentId)
        pending.forEach((record) => {
          const payload = record.payload as QuestionnaireScaleCheckpointPayload
          existingAnswers[payload.itemCode] = payload.responseValue
          revisions[payload.itemCode] = Math.max(
            revisions[payload.itemCode] ?? 0,
            (payload.expectedRevision ?? revisions[payload.itemCode] ?? 0) + 1,
          )
        })
        scaleAnswerRevisionsRef.current = revisions
        setAnswers(existingAnswers)
      }
    } catch (err) {
      setAnswersLoadFailed(true)
      setRunnerError(normalizeApiError(err).message)
      console.error('获取已有答案失败', err)
    } finally {
      setAnswersLoading(false)
    }
  }

  // 处理量表题目答案选择
  const handleSelectAnswer = async (value: ResponseValue) => {
    if (!data?.currentScale || savingAnswerRef.current || submitting) return

    const items = data.currentScale.definition.items
    const item = items[scaleIndex]
    if (!item) return

    // 计算作答时间（毫秒）
    const responseTime = Date.now() - itemStartTimeRef.current

    try {
      await runSave(async () => {
        await checkpointScheduler.enqueue({
          scopeType: 'scale',
          scopeId: data.currentScale!.scaleAssessmentId,
          payload: {
            itemCode: item.itemCode,
            responseValue: value,
            responseTimeMs: responseTime,
            expectedRevision: scaleAnswerRevisionsRef.current[item.itemCode] ?? 0,
          },
        }, scaleCheckpointTransport, { maxBatchSize: 10, maxWaitMs: 12000 })
        scaleAnswerRevisionsRef.current[item.itemCode] = (scaleAnswerRevisionsRef.current[item.itemCode] ?? 0) + 1
        setAnswers((previous) => ({ ...previous, [item.itemCode]: value }))
        setRunnerError(null)
        if (scaleIndex < items.length - 1) {
          setScaleIndex((index) => index === scaleIndex ? index + 1 : index)
        }
      })
    } catch (err) {
      setRunnerError(normalizeApiError(err).message)
      console.error('提交答案失败', err)
    }
  }

  const handlePrevious = () => {
    if (scaleIndex > 0) {
      setScaleIndex((index) => index - 1)
    }
  }

  const handleNext = () => {
    const items = data?.currentScale?.definition.items || []
    if (data && scaleIndex < items.length - 1) {
      setScaleIndex((index) => index + 1)
    }
  }

  // 提交表单答案并进入下一项
  const handleFormSubmit = async (action: 'answer' | 'skip' = 'answer') => {
    if (!data?.currentFormItem || submitting || savingAnswerRef.current) return

    const formItem = data.currentFormItem
    // 必填验证：字符串类型检查trim，数组类型检查长度
    const isEmpty = Array.isArray(formAnswer) 
      ? formAnswer.length === 0 
      : !formAnswer.trim()

    if (action === 'answer' && isEmpty) {
      setRunnerError(formItem.required ? '此题为必填项' : '请填写答案或选择跳过')
      return
    }
    if (action === 'skip' && (formItem.required || formItem.contextKey)) return
    savingAnswerRef.current = true

    try {
      setSubmitting(true)

      // 处理多选题答案格式：数组转JSON字符串
      const valueToSubmit: string = Array.isArray(formAnswer) 
        ? JSON.stringify(formAnswer) 
        : formAnswer
      
      await checkpointScheduler.enqueue({
        scopeType: 'questionnaire',
        scopeId: data.questionnaireAssessment.id,
        payload: {
          formItemId: formItem.id,
          expectedRevision: data.currentFormAnswerRevision ?? 0,
          ...(action === 'skip' ? { action: 'skip' as const } : { action: 'answer' as const, value: valueToSubmit }),
        },
      }, questionnaireCheckpointTransport, { maxBatchSize: 10, maxWaitMs: 12000 })
      setData((previous) => previous
        ? { ...previous, currentFormAnswerRevision: (previous.currentFormAnswerRevision ?? 0) + 1 }
        : previous)
      await checkpointScheduler.flush('questionnaire', data.questionnaireAssessment.id)
      const pending = await checkpointScheduler.pending('questionnaire', data.questionnaireAssessment.id)
      if (pending.length > 0) throw new Error('表单答案仍在同步，请稍后重试')
      await checkpointScheduler.purgeExpired('questionnaire', data.questionnaireAssessment.id)

      // 进入下一个内容项
      await moveToNextItem()
      setRunnerError(null)
    } catch (err: any) {
      setRunnerError(normalizeApiError(err).message)
    } finally {
      savingAnswerRef.current = false
      setSubmitting(false)
    }
  }

  // 完成量表并进入下一项
  const handleCompleteScale = async () => {
    if (!data?.currentScale || submitting || savingAnswerRef.current) return

    const items = data.currentScale.definition.items
    const unanswered = items.filter((item) => item.required && answers[item.itemCode] === undefined)
    if (unanswered.length > 0) {
      const firstMissingIndex = items.findIndex((item) => item.required && answers[item.itemCode] === undefined)
      if (firstMissingIndex >= 0) setScaleIndex(firstMissingIndex)
      setRunnerError(`还有 ${unanswered.length} 道必答题未作答，请完成后再提交`)
      return
    }
    setRunnerError(null)
    savingAnswerRef.current = true

    try {
      setSubmitting(true)
      await checkpointScheduler.flush('scale', data.currentScale.scaleAssessmentId)
      const pending = await checkpointScheduler.pending('scale', data.currentScale.scaleAssessmentId)
      if (pending.length > 0) throw new Error('量表答案仍在同步，请稍后重试')
      await checkpointScheduler.purgeExpired('scale', data.currentScale.scaleAssessmentId)
      // 完成当前量表
      const response = await apiClient.post(`/scales/assessments/${data.currentScale.scaleAssessmentId}/complete`)
      if (response.code !== 0) throw new Error(response.message || '提交失败')

      // 进入下一个内容项
      await moveToNextItem()
    } catch (err: any) {
      setRunnerError(normalizeApiError(err).message)
    } finally {
      savingAnswerRef.current = false
      setSubmitting(false)
    }
  }

  // 移动到下一个内容项
  const moveToNextItem = async () => {
    if (!data) return

    // 重新获取测评状态
    const statusResponse = await runWithCompletionRetry(() => apiClient.get<QuestionnaireAssessmentData>(
      `/questionnaires/assessments/${data.questionnaireAssessment.id}`
    ))

    if (statusResponse.code !== 0 || !statusResponse.data) {
      throw new Error(statusResponse.message || '获取测评状态失败')
    }

    const qa = statusResponse.data.questionnaireAssessment

    if (qa.status === 'COMPLETED' || qa.currentIndex >= statusResponse.data.totalItems) {
      // 所有内容完成
      await checkpointScheduler.purgeExpired('questionnaire', data.questionnaireAssessment.id)
      const completionResponse = await runWithCompletionRetry(() => apiClient.post(`/questionnaires/assessments/${data.questionnaireAssessment.id}/complete`))
      if (completionResponse.code !== 0) throw new Error(completionResponse.message || '完成测评失败')
      navigate(`/student/questionnaires/result/${data.questionnaireAssessment.id}`)
    } else {
      // 切换到下一项
      let nextData = statusResponse.data
      if (statusResponse.data.currentScale?.scaleAssessmentId) {
        registerScalePersistence(statusResponse.data.currentScale.scaleAssessmentId)
        const frozen = await freezeContextBeforeScale(data.questionnaireAssessment.id)
        nextData = {
          ...statusResponse.data,
          questionnaireAssessment: {
            ...statusResponse.data.questionnaireAssessment,
            context: { status: 'frozen', frozenAt: frozen.frozenAt },
          },
        }
      }
      setData(nextData)
      setScaleIndex(0)
      if (!nextData.currentScale?.scaleAssessmentId) setAnswers({})
      setFormAnswer('')

      if (nextData.currentFormItem) {
        // 下一项是表单题目
        setFormAnswer('')
      } else if (nextData.currentScale?.scaleAssessmentId) {
        // 下一项是量表
        fetchExistingAnswers(nextData.currentScale.scaleAssessmentId)
      }
    }
  }

  const reloadFinalAttempt = async () => {
    if (!data) return
    const response = await runWithCompletionRetry(() => apiClient.get<QuestionnaireAssessmentData>(
      `/questionnaires/assessments/${data.questionnaireAssessment.id}`,
    ))
    if (response.code !== 0 || !response.data) throw new Error(response.message || '获取问卷状态失败')
    setData(response.data)
  }

  const restartLegacyAttempt = async () => {
    if (!data) return
    try {
      setSubmitting(true)
      const response = await apiClient.post(`/questionnaires/assessments/${data.questionnaireAssessment.id}/restart`, {})
      if (response.code !== 0) throw new Error(response.message || '重启问卷测评失败')
      window.location.reload()
    } catch (err) {
      setRunnerError(normalizeApiError(err).message)
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

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">问卷不存在或未发布</p>
      </div>
    )
  }

  if (data.questionnaireAssessment.status === 'COMPLETED') {
    return (
      <div className="text-center py-12">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <p className="text-gray-700 mb-4">问卷测评已完成</p>
        <button onClick={() => navigate(`/student/questionnaires/result/${data.questionnaireAssessment.id}`)} className="btn-primary">查看结果</button>
      </div>
    )
  }

  if (data.questionnaireAssessment.deliveryMode === 'LEGACY') {
    return (
      <div className="max-w-xl mx-auto rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <h1 className="text-xl font-semibold text-amber-900 mb-2">这是旧版进行中的问卷</h1>
        <p className="text-sm text-amber-800 mb-5">旧版答案仍可用于查看和报告，但不能继续写入。重启会保留历史记录，并创建新的整段提交测评。</p>
        {runnerError && <p role="alert" className="mb-4 text-sm text-red-600">{runnerError}</p>}
        <button onClick={() => void restartLegacyAttempt()} disabled={submitting} className="btn-primary">{submitting ? '重启中...' : '重启并继续作答'}</button>
      </div>
    )
  }

  if (data.questionnaireAssessment.deliveryMode === 'FINAL_ONLY') {
    return (
      <FinalQuestionnaireAssessment
        data={data as unknown as FinalQuestionnaireData}
        post={(path, body) => apiClient.post(path, body)}
        onReload={reloadFinalAttempt}
        onExit={() => navigate('/student')}
        onCompleted={() => navigate(`/student/questionnaires/result/${data.questionnaireAssessment.id}`)}
        onRestart={restartLegacyAttempt}
      />
    )
  }

  const runnerBusy = submitting || savingAnswer || answersLoading || answersLoadFailed

  // 渲染表单题目
  if (data.currentFormItem) {
    const formItem = data.currentFormItem
    return (
      <div className="max-w-2xl mx-auto">
        {runnerError && <p role="alert" className="mb-4 text-sm text-red-600">{runnerError}</p>}
        {/* 整体进度 */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>整体进度：{data.questionnaireAssessment.currentIndex + 1} / {data.totalItems}</span>
            <span className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              表单题目
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${((data.questionnaireAssessment.currentIndex + 1) / data.totalItems) * 100}%` }}
            />
          </div>
        </div>

        {/* 表单内容 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            {formItem.label}
            <span className="ml-2 text-sm font-normal">
              {formItem.required ? (
                <span className="text-red-500">【必答】</span>
              ) : (
                <span className="text-gray-400">【选答】</span>
              )}
            </span>
            <span className="ml-2 text-sm font-normal text-gray-500">
              【{formItem.type === 'fill_blank' ? '填空' : 
                  formItem.type === 'single_choice' ? '单选' : 
                  formItem.type === 'multiple_choice' ? '多选' : 
                  formItem.type === 'text_input' ? '长文本' :
                  formItem.type === 'year_month' ? '年月' : '未知'}】
            </span>
          </h2>

          {formItem.type === 'fill_blank' && (
            <input
              type="text"
              value={formAnswer}
              onChange={(e) => setFormAnswer(e.target.value)}
              disabled={runnerBusy}
              placeholder={formItem.placeholder || '请输入'}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-action focus:border-action"
            />
          )}

          {formItem.type === 'text_input' && (
            <textarea
              value={formAnswer}
              onChange={(e) => setFormAnswer(e.target.value)}
              disabled={runnerBusy}
              placeholder={formItem.placeholder || '请输入'}
              rows={5}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-action focus:border-action"
            />
          )}

          {formItem.type === 'year_month' && (
            <input
              type="month"
              value={typeof formAnswer === 'string' ? formAnswer : ''}
              onChange={(e) => setFormAnswer(e.target.value)}
              disabled={runnerBusy}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-action focus:border-action"
            />
          )}

          {formItem.contextKey && (
            <p className="text-sm text-gray-500 mt-3">此字段用于本次问卷的测评参考；进入量表后将冻结，并由同一问卷中的后续量表共享。</p>
          )}

          {formItem.type === 'single_choice' && (
            <div className="space-y-3">
              {(formItem.options || []).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormAnswer(option.value)}
                  disabled={runnerBusy}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    formAnswer === option.value
                      ? 'border-action bg-action/5 text-action'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {formItem.type === 'multiple_choice' && (
            <div className="space-y-3">
              {(formItem.options || []).map((option) => {
                const currentAnswers = Array.isArray(formAnswer) ? formAnswer : []
                const isSelected = currentAnswers.includes(option.value)
                
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      if (runnerBusy) return
                      if (isSelected) {
                        setFormAnswer(currentAnswers.filter(v => v !== option.value))
                      } else {
                        setFormAnswer([...currentAnswers, option.value])
                      }
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      readOnly 
                      className="mr-2"
                    />
                    {option.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 导航 */}
        <div className="flex justify-end">
          <button
            onClick={() => void handleFormSubmit()}
            disabled={runnerBusy || (formItem.required && (Array.isArray(formAnswer) ? formAnswer.length === 0 : !formAnswer.trim()))}
            className="flex items-center px-6 py-2 bg-action text-white rounded-lg hover:bg-action/90 disabled:opacity-50"
          >
            <CheckCircle className="w-5 h-5 mr-1" />
            {submitting ? '提交中...' : '提交并继续'}
          </button>
          {!formItem.required && !formItem.contextKey && (
            <button
              type="button"
              onClick={() => void handleFormSubmit('skip')}
              disabled={runnerBusy}
              className="ml-3 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg disabled:opacity-50"
            >
              跳过
            </button>
          )}
        </div>

        {/* 内容导航 */}
        <div className="mt-6 bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-3">内容导航</div>
          <div className="flex flex-wrap gap-2">
            {data.contentItems.map((item, index) => (
              <div
                key={`${item.type}-${item.id}`}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm ${
                  index === data.questionnaireAssessment.currentIndex
                    ? 'bg-action text-white'
                    : item.completed
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {item.type === 'form' ? (
                  <FileText className="w-3 h-3" />
                ) : (
                  <Layers className="w-3 h-3" />
                )}
                {index + 1}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // 渲染量表题目
  if (data.currentScale) {
    const items = data.currentScale.definition.items
    if (items.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-500">量表题目加载失败</p>
        </div>
      )
    }

    const currentItem = items[scaleIndex]
    const selectedValue = currentItem ? answers[currentItem.itemCode] : undefined
    const scaleProgress = Math.round((Object.keys(answers).length / items.length) * 100)

    return (
      <div className="max-w-2xl mx-auto">
        {runnerError && <p role="alert" className="mb-4 text-sm text-red-600">{runnerError}</p>}
        {answersLoadFailed && data.currentScale?.scaleAssessmentId && (
          <button
            type="button"
            className="mb-4 px-3 py-1.5 text-sm border border-gray-300 rounded"
            onClick={() => void fetchExistingAnswers(data.currentScale!.scaleAssessmentId)}
          >
            重试加载答案
          </button>
        )}
        {/* 整体进度 */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>整体进度：{data.questionnaireAssessment.currentIndex + 1} / {data.totalItems}</span>
            <span className="flex items-center gap-1">
              <Layers className="w-4 h-4" />
              {data.currentScale.name}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${((data.questionnaireAssessment.currentIndex + scaleProgress / 100) / data.totalItems) * 100}%` }}
            />
          </div>
        </div>

        {/* 当前量表进度 */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>当前量表进度</span>
            <span>{Object.keys(answers).length} / {items.length}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-action h-2 rounded-full transition-all"
              style={{ width: `${scaleProgress}%` }}
            />
          </div>
        </div>

        {/* 题目 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="text-sm text-gray-500 mb-2">
            第 {scaleIndex + 1} 题 / 共 {items.length} 题
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            {currentItem?.content}
          </h2>

          {/* 选项 */}
          <div className="space-y-3">
            {(currentItem?.options || []).map((option) => (
              <button
                key={`${typeof option.value}:${String(option.value)}`}
                onClick={() => void handleSelectAnswer(option.value)}
                disabled={runnerBusy}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  selectedValue === option.value
                    ? 'border-action bg-action/5 text-action'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* 导航 */}
        <div className="flex justify-between">
          <button
            onClick={handlePrevious}
            disabled={scaleIndex === 0 || runnerBusy}
            className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            上一题
          </button>

          {scaleIndex === items.length - 1 ? (
            <button
              onClick={handleCompleteScale}
              disabled={runnerBusy}
              className="flex items-center px-6 py-2 bg-action text-white rounded-lg hover:bg-action/90 disabled:opacity-50"
            >
              <CheckCircle className="w-5 h-5 mr-1" />
              {submitting ? '提交中...' : '完成量表'}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={runnerBusy}
              className="flex items-center px-4 py-2 bg-action text-white rounded-lg hover:bg-action/90"
            >
              下一题
              <ChevronRight className="w-5 h-5 ml-1" />
            </button>
          )}
        </div>

        {/* 题目导航 */}
        <div className="mt-6 bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-3">题目导航</div>
          <div className="flex flex-wrap gap-2">
            {items.map((item, index) => (
              <button
                key={item.itemCode}
                onClick={() => setScaleIndex(index)}
                disabled={runnerBusy}
                className={`w-8 h-8 rounded text-sm font-medium ${
                  scaleIndex === index
                    ? 'bg-action text-white'
                    : answers[item.itemCode] !== undefined
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

  return (
    <div className="text-center py-12">
      <p className="text-gray-500">加载失败</p>
    </div>
  )
}

export default QuestionnaireAssessment
