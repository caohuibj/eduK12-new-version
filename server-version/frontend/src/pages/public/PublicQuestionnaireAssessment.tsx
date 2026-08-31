import React, { useCallback, useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Spin, message, Progress, Card, Button, Input, Result } from 'antd'
import { CheckCircle, FileText, Layers } from 'lucide-react'
import { createPublicCapabilityClient } from '../../api/publicCapabilityClient'
import { readQuestionnaireResumeToken } from '../../utils/questionnaireResume'
import { normalizeApiError } from '../../utils/normalizeApiError'
import { useRunnerSaveState } from '../../hooks/useRunnerSaveState'
import { checkpointScheduler, CheckpointTransportError } from '../../services/persistence/checkpointScheduler'
import type { CheckpointBatch } from '../../services/persistence/checkpointTypes'
import { useCheckpointLifecycle } from '../../services/persistence/flushLifecycle'
import { runWithCompletionRetry } from '../../services/completionRetry'

type ResponseValue = string | number

interface ScaleRunnerItem {
  content: string
  itemCode: string
  type: string
  required: boolean
  sortOrder: number
  responseSetKey: string
  randomizeOptions: boolean
  options: Array<{ value: ResponseValue; label: string }>
}

interface FormOption {
  value: string
  label: string
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
  options: FormOption[] | string | null
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
  }
  currentFormItem: FormItem | null
  currentScale: (Scale & { scaleAssessmentId: string }) | null
  contentItems: ContentItem[]
  totalItems: number
  sessionId: string
  currentFormAnswerRevision?: number | null
}

interface QuestionnaireCheckpointPayload {
  formItemId: string
  action: 'answer' | 'skip'
  value?: string
  expectedRevision: number
}

interface QuestionnaireScaleCheckpointPayload {
  scaleAssessmentId: string
  itemCode: string
  responseValue: ResponseValue
  responseTimeMs: number
  expectedRevision: number
}

const parseFormOptions = (options: FormItem['options']): FormOption[] => {
  if (Array.isArray(options)) return options
  if (typeof options !== 'string') return []

  try {
    const parsed: unknown = JSON.parse(options)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((option): option is FormOption => (
      Boolean(option)
      && typeof option === 'object'
      && typeof (option as FormOption).value === 'string'
      && typeof (option as FormOption).label === 'string'
    ))
  } catch {
    return []
  }
}

const PublicQuestionnaireAssessment: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<QuestionnaireAssessmentData | null>(null)
  // 问卷的 currentIndex 表示整体内容位置；量表内部必须使用独立索引。
  const [scaleIndex, setScaleIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ResponseValue>>({})
  const [formAnswer, setFormAnswer] = useState<string | string[]>('')
  const [submitting, setSubmitting] = useState(false)
  const [answersLoading, setAnswersLoading] = useState(false)
  const [recoveryState, setRecoveryState] = useState<'recovering' | 'ready' | 'recoverFailed' | 'retrying'>('recovering')
  const [runnerError, setRunnerError] = useState<string | null>(null)
  const formAnswerRevisionsRef = useRef<Record<string, number>>({})
  const scaleAnswerRevisionsRef = useRef<Record<string, number>>({})
  const { saving: savingAnswer, savingRef: savingAnswerRef, runSave } = useRunnerSaveState()

  const questionnaireCheckpointTransport = useCallback(async (batch: CheckpointBatch<QuestionnaireCheckpointPayload>) => {
    try {
      const response = await createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId))
        .patch<{ acceptedIds?: string[]; acceptedSequences?: number[] }>(`/assessments/${batch.scopeId}/form-answers/batch`, {
          checkpointSequence: batch.records[batch.records.length - 1]?.sequence,
          answers: batch.records.map((record) => ({
            ...record.payload,
            checkpointId: record.id,
            checkpointSequence: record.sequence,
          })),
        })
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
  }, [sessionId, token])

  const scaleCheckpointTransport = useCallback(async (batch: CheckpointBatch<QuestionnaireScaleCheckpointPayload>) => {
    try {
      const response = await createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId))
        .patch<{ acceptedIds?: string[]; acceptedSequences?: number[] }>(`/assessments/${batch.scopeId}/answers/batch`, {
          checkpointSequence: batch.records[batch.records.length - 1]?.sequence,
          answers: batch.records.map((record) => ({
            ...record.payload,
            checkpointId: record.id,
            checkpointSequence: record.sequence,
          })),
        })
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
  }, [sessionId, token])

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

  useCheckpointLifecycle(flushCheckpoints, Boolean(data))

  const freezeContextBeforeScale = async (): Promise<{ status: 'frozen'; frozenAt: string }> => {
    const result = await createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId))
      .post<{ status: 'frozen'; frozenAt: string }>(`/assessments/${sessionId}/context/freeze`, {})
    if (!result.data) throw new Error('人口学上下文冻结失败')
    return result.data
  }
  
  // 记录当前题目开始显示的时间
  const itemStartTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (sessionId) {
      fetchAssessment()
    } else {
      // A public runner cannot recover without the session locator. Keep the
      // state explicit so a malformed/deep link never remains in an endless
      // loading state or renders an empty answer set.
      setLoading(false)
      setRecoveryState('recoverFailed')
      setRunnerError('缺少测评会话，请从问卷链接重新进入')
    }
  }, [sessionId])

  // 切换题目时重置计时器
  useEffect(() => {
    itemStartTimeRef.current = Date.now()
  }, [scaleIndex])

  const fetchAssessment = async (retry = false) => {
    try {
      setLoading(true)
      setRecoveryState(retry ? 'retrying' : 'recovering')
      setRunnerError(null)
      
      const result = await runWithCompletionRetry(() => createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId))
        .get<QuestionnaireAssessmentData>(`/assessments/${sessionId}`))
      
      if (result.data.questionnaireAssessment.status === 'COMPLETED') {
        // 已完成，跳转到结果页
        navigate(`/public/questionnaire/${token}/result?sessionId=${sessionId}`)
        return
      }

      let nextData = result.data as QuestionnaireAssessmentData
      formAnswerRevisionsRef.current = nextData.currentFormItem
        ? { [nextData.currentFormItem.id]: nextData.currentFormAnswerRevision ?? 0 }
        : {}
      const questionnaireScopeId = sessionId || nextData.questionnaireAssessment.id
      registerQuestionnairePersistence(questionnaireScopeId)
      void checkpointScheduler.flush('questionnaire', questionnaireScopeId).catch((err) => {
        setRunnerError(normalizeApiError(err).message)
      })
      const currentScaleAssessmentId = nextData.currentScale?.scaleAssessmentId
      if (currentScaleAssessmentId) {
        registerScalePersistence(currentScaleAssessmentId)
        const frozen = await freezeContextBeforeScale()
        nextData = {
          ...nextData,
          questionnaireAssessment: {
            ...nextData.questionnaireAssessment,
            context: { status: 'frozen', frozenAt: frozen.frozenAt },
          },
        }
        await fetchExistingAnswers(currentScaleAssessmentId)
      }
      setData(nextData)
      setRecoveryState('ready')
      
      // 根据当前项类型处理
      if (nextData.currentFormItem) {
        // 当前是表单题目
        setFormAnswer('')
      } else if (nextData.currentScale?.scaleAssessmentId) {
        // 当前是量表；答案已在恢复状态切换为 ready 之前载入。
      }
      
    } catch (err) {
      console.error('获取测评失败', err)
      setRecoveryState('recoverFailed')
      setRunnerError(normalizeApiError(err).message)
    } finally {
      setLoading(false)
    }
  }

  const fetchExistingAnswers = async (assessmentId: string) => {
    registerScalePersistence(assessmentId)
    setAnswersLoading(true)
    try {
      const result = await createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId))
        .get<{ answers?: Array<{ itemCode: string; responseValue: ResponseValue; revision?: number }> }>(`/assessments/${sessionId}/scale/${assessmentId}`)
      const existingAnswers: Record<string, ResponseValue> = {}
      const revisions: Record<string, number> = {}
      for (const answer of result.data.answers ?? []) {
        existingAnswers[answer.itemCode] = answer.responseValue
        revisions[answer.itemCode] = answer.revision ?? 0
      }
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
    } catch (err) {
      console.error('获取已有答案失败', err)
      setRecoveryState('recoverFailed')
      setRunnerError(normalizeApiError(err).message)
      throw err
    } finally {
      setAnswersLoading(false)
    }
  }

  // 处理量表题目答案选择
  const handleSelectAnswer = async (value: ResponseValue) => {
    if (!data?.currentScale || savingAnswerRef.current || submitting || recoveryState !== 'ready') return

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
            scaleAssessmentId: data.currentScale!.scaleAssessmentId,
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
      console.error('提交答案失败', err)
      setRunnerError(normalizeApiError(err).message)
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
    if (!data?.currentFormItem || submitting || savingAnswerRef.current || recoveryState !== 'ready') return

    const formItem = data.currentFormItem
    // 必填验证：字符串类型检查trim，数组类型检查长度
    const isEmpty = Array.isArray(formAnswer) 
      ? formAnswer.length === 0 
      : !formAnswer.trim()
    
    if (action === 'answer' && isEmpty) {
      const warning = formItem.required ? '此题为必填项' : '请填写答案或选择跳过'
      message.warning(warning)
      setRunnerError(warning)
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
        scopeId: sessionId || data.questionnaireAssessment.id,
        payload: {
          formItemId: formItem.id,
          expectedRevision: data.currentFormAnswerRevision ?? 0,
          ...(action === 'skip' ? { action: 'skip' as const } : { action: 'answer' as const, value: valueToSubmit }),
        },
      }, questionnaireCheckpointTransport, { maxBatchSize: 10, maxWaitMs: 12000 })
      setData((previous) => previous
        ? { ...previous, currentFormAnswerRevision: (previous.currentFormAnswerRevision ?? 0) + 1 }
        : previous)
      await checkpointScheduler.flush('questionnaire', sessionId || data.questionnaireAssessment.id)
      const pending = await checkpointScheduler.pending('questionnaire', sessionId || data.questionnaireAssessment.id)
      if (pending.length > 0) throw new Error('表单答案仍在同步，请稍后重试')
      await checkpointScheduler.purgeExpired('questionnaire', sessionId || data.questionnaireAssessment.id)

      // 进入下一个内容项
      await moveToNextItem()
      setRunnerError(null)
    } catch (err: any) {
      const normalized = normalizeApiError(err)
      setRunnerError(normalized.message)
      message.error(normalized.message)
    } finally {
      savingAnswerRef.current = false
      setSubmitting(false)
    }
  }

  // 完成量表并进入下一项
  const handleCompleteScale = async () => {
    if (!data?.currentScale || submitting || savingAnswerRef.current || recoveryState !== 'ready') return

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
      await createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId))
        .post(`/assessments/${sessionId}/scale/complete`, {
          scaleAssessmentId: data.currentScale.scaleAssessmentId,
        })

      // 进入下一个内容项
      await moveToNextItem()
    } catch (err: any) {
      const normalized = normalizeApiError(err)
      setRunnerError(normalized.message)
      message.error(normalized.message)
    } finally {
      savingAnswerRef.current = false
      setSubmitting(false)
    }
  }

  // 移动到下一个内容项
  const moveToNextItem = async () => {
    setRecoveryState('recovering')
    try {
      // 重新获取测评状态
      const result = await runWithCompletionRetry(() => createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId))
        .get<QuestionnaireAssessmentData>(`/assessments/${sessionId}`))
      
      if (result.data.questionnaireAssessment.status === 'COMPLETED' ||
          result.data.questionnaireAssessment.currentIndex >= result.data.totalItems) {
        // 所有内容完成
        await checkpointScheduler.purgeExpired('questionnaire', result.data.questionnaireAssessment.id)
        await runWithCompletionRetry(() => createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId))
          .post(`/assessments/${sessionId}/complete`))
        navigate(`/public/questionnaire/${token}/result?sessionId=${sessionId}`)
      } else {
        // 切换到下一个内容项
        let nextData = result.data as QuestionnaireAssessmentData
        const nextScaleAssessmentId = nextData.currentScale?.scaleAssessmentId
        if (nextScaleAssessmentId) {
          registerScalePersistence(nextScaleAssessmentId)
          const frozen = await freezeContextBeforeScale()
          nextData = {
            ...nextData,
            questionnaireAssessment: {
              ...nextData.questionnaireAssessment,
              context: { status: 'frozen', frozenAt: frozen.frozenAt },
            },
          }
          await fetchExistingAnswers(nextScaleAssessmentId)
        }
        setData(nextData)
        setRecoveryState('ready')
        setScaleIndex(0)
        if (!nextData.currentScale?.scaleAssessmentId) setAnswers({})
        setFormAnswer('')

        if (nextData.currentFormItem) {
          // 下一项是表单题目
          setFormAnswer('')
        } else if (nextData.currentScale?.scaleAssessmentId) {
          // 下一项是量表；答案已在切换到 ready 之前载入。
        }
      }
    } catch (err) {
      console.error('切换测评题目失败', err)
      setRecoveryState('recoverFailed')
      setRunnerError(normalizeApiError(err).message)
      throw err
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spin size="large" tip="正在加载测评..." />
      </div>
    )
  }

  if (recoveryState === 'recoverFailed' && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Result
          status="error"
          title="恢复测评失败"
          subTitle={runnerError || '无法恢复当前测评状态，请重试'}
          extra={<Button type="primary" onClick={() => void fetchAssessment(true)}>重试</Button>}
        />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Result
          status="error"
          title="测评不存在"
          subTitle="该测评已失效或已过期"
        />
      </div>
    )
  }

  const runnerBusy = submitting || savingAnswer || answersLoading || recoveryState !== 'ready'

  // 渲染表单题目
  if (data.currentFormItem) {
    const formItem = data.currentFormItem
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          {runnerError && <p role="alert" className="mb-4 text-sm text-red-600">{runnerError}</p>}
          {recoveryState === 'recoverFailed' && (
            <div role="alert" className="mb-4 flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>恢复失败，暂时不能继续作答。</span>
              <Button size="small" onClick={() => void fetchAssessment(true)}>重试</Button>
            </div>
          )}
          {/* 整体进度 */}
          <Card className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">
                进度：{data.questionnaireAssessment.currentIndex + 1} / {data.totalItems}
              </span>
              <span className="flex items-center gap-1 text-gray-600">
                <FileText className="w-4 h-4" />
                表单题目
              </span>
            </div>
            <Progress 
              percent={((data.questionnaireAssessment.currentIndex + 1) / data.totalItems) * 100}
              showInfo={false}
            />
          </Card>

          {/* 表单内容 */}
          <Card className="shadow-lg mb-4">
            <h3 className="text-xl font-medium mb-6">
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
            </h3>

            {formItem.type === 'fill_blank' && (
              <Input
                value={formAnswer}
                onChange={(e) => setFormAnswer(e.target.value)}
                disabled={runnerBusy}
                placeholder={formItem.placeholder || '请输入'}
                size="large"
              />
            )}

            {formItem.type === 'text_input' && (
              <Input.TextArea
                value={formAnswer}
                onChange={(e) => setFormAnswer(e.target.value)}
                disabled={runnerBusy}
                placeholder={formItem.placeholder || '请输入'}
                rows={5}
                size="large"
              />
            )}

            {formItem.type === 'year_month' && (
              <Input
                type="month"
                value={typeof formAnswer === 'string' ? formAnswer : ''}
                onChange={(e) => setFormAnswer(e.target.value)}
                disabled={runnerBusy}
                size="large"
              />
            )}

            {formItem.contextKey && (
              <p className="text-sm text-gray-500 mt-3">此字段用于本次问卷的测评参考；进入量表后将冻结，并由同一问卷中的后续量表共享。</p>
            )}

            {formItem.type === 'single_choice' && (
              <div className="space-y-3">
                {(() => {
                  // 解析 options（兼容字符串和数组）
                  const options = parseFormOptions(formItem.options)
                  
                  return options.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFormAnswer(option.value)}
                      disabled={runnerBusy}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                        formAnswer === option.value
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))
                })()}
              </div>
            )}

            {formItem.type === 'multiple_choice' && (
              <div className="space-y-3">
                {(() => {
                  // 解析 options（兼容字符串和数组）
                  const options = parseFormOptions(formItem.options)
                  
                  return options.map((option) => {
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
                  })
                })()}
              </div>
            )}
          </Card>

          {/* 提交按钮 */}
          <div className="flex justify-end">
            <Button
              type="primary"
              size="large"
              onClick={() => void handleFormSubmit()}
              loading={submitting}
              disabled={runnerBusy || (formItem.required && (Array.isArray(formAnswer) ? formAnswer.length === 0 : !formAnswer.trim()))}
              icon={<CheckCircle className="w-4 h-4 mr-1" />}
            >
              {submitting ? '提交中...' : '提交并继续'}
            </Button>
            {!formItem.required && !formItem.contextKey && (
              <Button
                className="ml-3"
                onClick={() => void handleFormSubmit('skip')}
                disabled={runnerBusy}
              >
                跳过
              </Button>
            )}
          </div>

          {/* 内容导航 */}
          <Card className="mt-6">
            <div className="text-sm text-gray-600 mb-3">内容导航</div>
            <div className="flex flex-wrap gap-2">
              {data.contentItems.map((item, idx) => (
                <button
                  key={item.id}
                  className={`w-10 h-10 rounded text-sm font-medium transition-colors ${
                    idx === data.questionnaireAssessment.currentIndex
                      ? 'bg-blue-500 text-white'
                      : item.completed
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    )
  }

  // 渲染量表题目
  if (!data.currentScale) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Result
          status="error"
          title="测评已结束"
          subTitle="该测评已失效或已过期"
        />
      </div>
    )
  }

  const items = data.currentScale.definition.items
  const currentItem = items[scaleIndex]

  const handleAnswer = async (value: number | string) => {
    try {
      await handleSelectAnswer(value)
    } catch (err: any) {
      message.error(err.message || '提交失败')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {runnerError && <p role="alert" className="mb-4 text-sm text-red-600">{runnerError}</p>}
        {recoveryState === 'recoverFailed' && (
          <div role="alert" className="mb-4 flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>恢复失败，暂时不能继续作答。</span>
            <Button size="small" onClick={() => void fetchAssessment(true)}>重试</Button>
          </div>
        )}
        {/* 进度条 */}
        <Card className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600">
              <Layers className="w-4 h-4 inline mr-1" />
              量表：{data.currentScale.name}
            </span>
            <span className="text-gray-600">
              整体进度：{data.questionnaireAssessment.currentIndex + 1} / {data.totalItems}
            </span>
          </div>
          <Progress 
            percent={((data.questionnaireAssessment.currentIndex + 1) / data.totalItems) * 100}
            showInfo={false}
          />
        </Card>

        {/* 题目卡片 */}
        <Card className="shadow-lg">
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-500 text-sm">
                第 {scaleIndex + 1} / {items.length} 题
              </span>
            </div>

            <h3 className="text-xl font-medium mb-8">
              {currentItem.content}
            </h3>

            {/* 答题区域 */}
            <div className="space-y-3">
              {currentItem.options.map((option) => (
                <button
                  key={`${typeof option.value}:${String(option.value)}`}
                  onClick={() => void handleAnswer(option.value)}
                  disabled={runnerBusy}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    answers[currentItem.itemCode] === option.value
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 导航按钮 */}
          <div className="flex justify-between mt-8">
            <Button
              onClick={handlePrevious}
              disabled={scaleIndex === 0 || runnerBusy}
            >
              上一题
            </Button>
            
            {scaleIndex === items.length - 1 ? (
              <Button
                type="primary"
                onClick={handleCompleteScale}
                loading={submitting}
                disabled={runnerBusy}
                icon={<CheckCircle className="w-4 h-4 mr-1" />}
              >
                {submitting ? '提交中...' : `完成量表${data.questionnaireAssessment.currentIndex + 1 < data.totalItems ? '（进入下一个内容）' : '（完成测评）'}`}
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={handleNext}
                disabled={runnerBusy}
              >
                下一题
              </Button>
            )}
          </div>

          {/* 题目导航 */}
          <Card className="mt-6 bg-gray-50">
            <div className="text-sm text-gray-600 mb-3">题目导航</div>
            <div className="flex flex-wrap gap-2">
              {items.map((item, index) => (
                <button
                  key={item.itemCode}
                  onClick={() => setScaleIndex(index)}
                  disabled={runnerBusy}
                  className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                    scaleIndex === index
                      ? 'bg-blue-500 text-white'
                      : answers[item.itemCode] !== undefined
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </Card>
        </Card>
      </div>
    </div>
  )
}

export default PublicQuestionnaireAssessment
