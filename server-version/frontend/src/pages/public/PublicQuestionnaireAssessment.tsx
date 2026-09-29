import React, { useCallback, useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { CheckCircle, FileText, Layers } from 'lucide-react'
import { createPublicCapabilityClient } from '../../api/publicCapabilityClient'
import { readQuestionnaireResumeToken, saveQuestionnaireResumeToken } from '../../utils/questionnaireResume'
import { normalizeApiError } from '../../utils/normalizeApiError'
import { useRunnerSaveState } from '../../hooks/useRunnerSaveState'
import { checkpointScheduler, CheckpointTransportError } from '../../services/persistence/checkpointScheduler'
import type { CheckpointBatch } from '../../services/persistence/checkpointTypes'
import { useCheckpointLifecycle } from '../../services/persistence/flushLifecycle'
import { runWithCompletionRetry } from '../../services/completionRetry'
import FinalQuestionnaireAssessment, { type FinalQuestionnaireData } from '../../components/FinalQuestionnaireAssessment'

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
  definitionHash?: string
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
    deliveryMode?: 'FINAL_ONLY' | 'LEGACY'
    attemptEpoch?: number
  }
  currentFormItem: FormItem | null
  currentScale: (Scale & { scaleAssessmentId: string; definitionHash?: string }) | null
  contentItems: Array<ContentItem | { type: 'form-section'; position: number; id: string; label: string; completed: boolean }>
  totalItems: number
  sessionId: string
  currentFormAnswerRevision?: number | null
  currentFormSection?: FinalQuestionnaireData['currentFormSection']
  definitionHash?: string
  contextSnapshotHash?: string | null
  units?: FinalQuestionnaireData['units']
  formSections?: FinalQuestionnaireData['formSections']
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

  useCheckpointLifecycle(flushCheckpoints, Boolean(data) && data?.questionnaireAssessment.deliveryMode !== 'FINAL_ONLY')

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
      if (nextData.questionnaireAssessment.deliveryMode === 'FINAL_ONLY') {
        setData(nextData)
        setRecoveryState('ready')
        return
      }
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

  const reloadFinalAttempt = async () => {
    if (!sessionId) return
    const result = await runWithCompletionRetry(() => createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId))
      .get<QuestionnaireAssessmentData>(`/assessments/${sessionId}`))
    if (!result.data) throw new Error(result.message || '获取问卷状态失败')
    setData(result.data)
    setRecoveryState('ready')
  }

  const restartLegacyAttempt = async () => {
    if (!sessionId || !token) return
    try {
      setRecoveryState('retrying')
      const client = createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId))
      const response = await client.post<{ sessionId: string; resumeToken: string | null }>(`/assessments/${sessionId}/restart`, {})
      if (response.code !== 0 || !response.data) throw new Error(response.message || '重启问卷测评失败')
      if (response.data.resumeToken) saveQuestionnaireResumeToken(token, response.data.sessionId, response.data.resumeToken)
      navigate(`/public/questionnaire/${token}/assessment?sessionId=${response.data.sessionId}`)
    } catch (err) {
      setRecoveryState('recoverFailed')
      setRunnerError(normalizeApiError(err).message)
    }
  }

  if (loading) {
    return (
      <ProductPage width="assessment" className="hui-public-questionnaire-runner hui-public-runner--centered">
        <ProductStatus kind="pending" title="正在加载测评" announce="polite">
          正在恢复本次匿名问卷状态。
        </ProductStatus>
      </ProductPage>
    )
  }

  if (recoveryState === 'recoverFailed' && !data) {
    return (
      <ProductPage width="assessment" className="hui-public-questionnaire-runner hui-public-runner--centered">
        <ProductStatus
          kind="error"
          title="恢复测评失败"
          announce="assertive"
          actions={<ProductButton variant="primary" onClick={() => void fetchAssessment(true)}>重试</ProductButton>}
        >
          {runnerError || '无法恢复当前测评状态，请重试'}
        </ProductStatus>
      </ProductPage>
    )
  }

  if (!data) {
    return (
      <ProductPage width="assessment" className="hui-public-questionnaire-runner hui-public-runner--centered">
        <ProductStatus kind="error" title="测评不存在">该测评已失效或已过期。</ProductStatus>
      </ProductPage>
    )
  }

  if (data.questionnaireAssessment.status === 'COMPLETED') {
    return (
      <ProductPage width="assessment" className="hui-public-questionnaire-runner hui-public-runner--centered">
        <ProductStatus
          kind="success"
          title="问卷测评已完成"
          actions={<ProductButton variant="primary" onClick={() => navigate(`/public/questionnaire/${token}/result?sessionId=${sessionId}`)}>查看结果</ProductButton>}
        >
          本次匿名问卷已提交。
        </ProductStatus>
      </ProductPage>
    )
  }

  if (data.questionnaireAssessment.deliveryMode === 'LEGACY') {
    return (
      <ProductPage width="assessment" className="hui-public-questionnaire-runner hui-public-runner--centered">
        <ProductStatus
          kind="warning"
          title="这是旧版进行中的问卷"
          actions={(
            <ProductButton
              variant="primary"
              disabled={recoveryState === 'retrying'}
              onClick={() => void restartLegacyAttempt()}
            >
              {recoveryState === 'retrying' ? '正在重启…' : '重启并继续作答'}
            </ProductButton>
          )}
        >
          {runnerError || '旧版答案仍可读取，但不能继续写入。重启会保留历史记录，并创建新的整段提交测评。'}
        </ProductStatus>
      </ProductPage>
    )
  }

  if (data.questionnaireAssessment.deliveryMode === 'FINAL_ONLY' && sessionId) {
    return (
      <FinalQuestionnaireAssessment
        data={data as unknown as FinalQuestionnaireData}
        publicMode
        post={(path, body) => createPublicCapabilityClient(readQuestionnaireResumeToken(token, sessionId)).post(path, body)}
        onReload={reloadFinalAttempt}
        onExit={() => navigate(`/public/questionnaire/${token}`)}
        onCompleted={() => navigate(`/public/questionnaire/${token}/result?sessionId=${sessionId}`)}
        onRestart={restartLegacyAttempt}
      />
    )
  }

  const runnerBusy = submitting || savingAnswer || answersLoading || recoveryState !== 'ready'
  const overallProgress = Math.max(0, Math.min(100, ((data.questionnaireAssessment.currentIndex + 1) / Math.max(1, data.totalItems)) * 100))

  if (data.currentFormItem) {
    const formItem = data.currentFormItem
    const answerEmpty = Array.isArray(formAnswer) ? formAnswer.length === 0 : !formAnswer.trim()
    return (
      <ProductPage width="assessment" className="hui-public-questionnaire-runner">
        <PageHeader
          title="匿名问卷"
          description="答案会在当前匿名会话内保存；请按题目提示完成当前内容。"
        />

        {runnerError && (
          <ProductStatus kind="error" title="当前操作未完成" announce="assertive">
            {runnerError}
          </ProductStatus>
        )}
        {recoveryState === 'recoverFailed' && (
          <ProductStatus
            kind="warning"
            title="恢复失败，暂时不能继续作答"
            actions={<ProductButton onClick={() => void fetchAssessment(true)}>重试</ProductButton>}
          >
            已保留当前页面内容；恢复成功后再继续。
          </ProductStatus>
        )}

        <section className="hui-public-runner-progress" aria-label="问卷整体进度">
          <div className="hui-public-runner-progress__meta">
            <span>进度 {data.questionnaireAssessment.currentIndex + 1} / {data.totalItems}</span>
            <span><FileText size={15} aria-hidden="true" />表单题目</span>
          </div>
          <div
            className="hui-public-runner-progress__track"
            role="progressbar"
            aria-label="问卷整体进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(overallProgress)}
          >
            <span style={{ width: `${overallProgress}%` }} />
          </div>
        </section>

        <section className="hui-public-runner-card" aria-labelledby="public-form-question">
          <div className="hui-public-runner-question-meta">
            <span>{formItem.required ? '必答' : '选答'}</span>
            <span>{formItem.type === 'fill_blank' ? '填空' :
              formItem.type === 'single_choice' ? '单选' :
              formItem.type === 'multiple_choice' ? '多选' :
              formItem.type === 'text_input' ? '长文本' :
              formItem.type === 'year_month' ? '年月' : '题目'}</span>
          </div>
          <h1 id="public-form-question" className="hui-public-runner-question">{formItem.label}</h1>

          {formItem.type === 'fill_blank' && (
            <input
              value={typeof formAnswer === 'string' ? formAnswer : ''}
              onChange={(event) => setFormAnswer(event.target.value)}
              disabled={runnerBusy}
              placeholder={formItem.placeholder || '请输入'}
              className="hui-public-runner-input"
            />
          )}

          {formItem.type === 'text_input' && (
            <textarea
              value={typeof formAnswer === 'string' ? formAnswer : ''}
              onChange={(event) => setFormAnswer(event.target.value)}
              disabled={runnerBusy}
              placeholder={formItem.placeholder || '请输入'}
              rows={5}
              className="hui-public-runner-input"
            />
          )}

          {formItem.type === 'year_month' && (
            <input
              type="month"
              value={typeof formAnswer === 'string' ? formAnswer : ''}
              onChange={(event) => setFormAnswer(event.target.value)}
              disabled={runnerBusy}
              className="hui-public-runner-input"
            />
          )}

          {formItem.contextKey && (
            <p className="hui-public-runner-note">此字段用于本次问卷的测评参考；进入量表后将冻结，并由同一问卷中的后续量表共享。</p>
          )}

          {formItem.type === 'single_choice' && (
            <div className="hui-public-runner-options">
              {parseFormOptions(formItem.options).map((option) => {
                const selected = formAnswer === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFormAnswer(option.value)}
                    disabled={runnerBusy}
                    className={`hui-public-runner-option${selected ? ' hui-public-runner-option--selected' : ''}`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          )}

          {formItem.type === 'multiple_choice' && (
            <div className="hui-public-runner-options">
              {parseFormOptions(formItem.options).map((option) => {
                const currentAnswers = Array.isArray(formAnswer) ? formAnswer : []
                const selected = currentAnswers.includes(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      if (runnerBusy) return
                      setFormAnswer(selected
                        ? currentAnswers.filter((value) => value !== option.value)
                        : [...currentAnswers, option.value])
                    }}
                    disabled={runnerBusy}
                    className={`hui-public-runner-option hui-public-runner-option--multiple${selected ? ' hui-public-runner-option--selected' : ''}`}
                  >
                    <span className="hui-public-runner-option__check" aria-hidden="true">{selected ? '✓' : ''}</span>
                    {option.label}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <div className="hui-public-runner-actions">
          <ProductButton
            variant="primary"
            onClick={() => void handleFormSubmit()}
            disabled={runnerBusy || (formItem.required && answerEmpty)}
          >
            <CheckCircle size={16} aria-hidden="true" />
            {submitting ? '提交中...' : '提交并继续'}
          </ProductButton>
          {!formItem.required && !formItem.contextKey && (
            <ProductButton onClick={() => void handleFormSubmit('skip')} disabled={runnerBusy}>跳过</ProductButton>
          )}
        </div>

        <section className="hui-public-runner-nav" aria-label="内容导航">
          <span className="hui-public-runner-nav__label">内容导航</span>
          <div>
            {data.contentItems.map((item, index) => (
              <span
                key={item.id}
                aria-current={index === data.questionnaireAssessment.currentIndex ? 'step' : undefined}
                className={`hui-public-runner-nav__item${index === data.questionnaireAssessment.currentIndex ? ' is-current' : item.completed ? ' is-complete' : ''}`}
              >
                {index + 1}
              </span>
            ))}
          </div>
        </section>
      </ProductPage>
    )
  }

  if (!data.currentScale) {
    return (
      <ProductPage width="assessment" className="hui-public-questionnaire-runner hui-public-runner--centered">
        <ProductStatus kind="error" title="测评已结束">该测评已失效或已过期。</ProductStatus>
      </ProductPage>
    )
  }

  const items = data.currentScale.definition.items
  const currentItem = items[scaleIndex]

  const handleAnswer = async (value: number | string) => {
    try {
      await handleSelectAnswer(value)
    } catch (err) {
      setRunnerError(err instanceof Error ? err.message : '提交失败')
    }
  }

  return (
    <ProductPage width="assessment" className="hui-public-questionnaire-runner">
      <PageHeader
        title={data.currentScale.name}
        description="请根据当前题目选择最符合实际情况的答案。"
      />

      {runnerError && (
        <ProductStatus kind="error" title="当前操作未完成" announce="assertive">
          {runnerError}
        </ProductStatus>
      )}
      {recoveryState === 'recoverFailed' && (
        <ProductStatus
          kind="warning"
          title="恢复失败，暂时不能继续作答"
          actions={<ProductButton onClick={() => void fetchAssessment(true)}>重试</ProductButton>}
        >
          已保留当前页面内容；恢复成功后再继续。
        </ProductStatus>
      )}

      <section className="hui-public-runner-progress" aria-label="问卷整体进度">
        <div className="hui-public-runner-progress__meta">
          <span><Layers size={15} aria-hidden="true" />量表</span>
          <span>整体进度 {data.questionnaireAssessment.currentIndex + 1} / {data.totalItems}</span>
        </div>
        <div
          className="hui-public-runner-progress__track"
          role="progressbar"
          aria-label="问卷整体进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(overallProgress)}
        >
          <span style={{ width: `${overallProgress}%` }} />
        </div>
      </section>

      <section className="hui-public-runner-card" aria-labelledby="public-scale-question">
        <div className="hui-public-runner-question-meta">
          <span>第 {scaleIndex + 1} / {items.length} 题</span>
        </div>
        <h1 id="public-scale-question" className="hui-public-runner-question">{currentItem.content}</h1>

        <div className="hui-public-runner-options">
          {currentItem.options.map((option) => {
            const selected = answers[currentItem.itemCode] === option.value
            return (
              <button
                key={`${typeof option.value}:${String(option.value)}`}
                type="button"
                aria-pressed={selected}
                onClick={() => void handleAnswer(option.value)}
                disabled={runnerBusy}
                className={`hui-public-runner-option${selected ? ' hui-public-runner-option--selected' : ''}`}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="hui-public-runner-question-actions">
          <ProductButton onClick={handlePrevious} disabled={scaleIndex === 0 || runnerBusy}>上一题</ProductButton>
          {scaleIndex === items.length - 1 ? (
            <ProductButton variant="primary" onClick={() => void handleCompleteScale()} disabled={runnerBusy}>
              <CheckCircle size={16} aria-hidden="true" />
              {submitting ? '提交中...' : `完成量表${data.questionnaireAssessment.currentIndex + 1 < data.totalItems ? '（进入下一个内容）' : '（完成测评）'}`}
            </ProductButton>
          ) : (
            <ProductButton variant="primary" onClick={handleNext} disabled={runnerBusy}>下一题</ProductButton>
          )}
        </div>
      </section>

      <section className="hui-public-runner-nav" aria-label="题目导航">
        <span className="hui-public-runner-nav__label">题目导航</span>
        <div>
          {items.map((item, index) => (
            <button
              key={item.itemCode}
              type="button"
              aria-label={`第 ${index + 1} 题`}
              aria-current={scaleIndex === index ? 'step' : undefined}
              onClick={() => setScaleIndex(index)}
              disabled={runnerBusy}
              className={`hui-public-runner-nav__item${scaleIndex === index ? ' is-current' : answers[item.itemCode] !== undefined ? ' is-complete' : ''}`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </section>
    </ProductPage>
  )
}

export default PublicQuestionnaireAssessment
