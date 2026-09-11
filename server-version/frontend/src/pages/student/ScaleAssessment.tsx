import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient, { sessionFetch } from '../../api/client'
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { normalizeApiError } from '../../utils/normalizeApiError'
import { useRunnerSaveState } from '../../hooks/useRunnerSaveState'
import { checkpointScheduler, CheckpointTransportError } from '../../services/persistence/checkpointScheduler'
import type { CheckpointBatch } from '../../services/persistence/checkpointTypes'
import { useCheckpointLifecycle } from '../../services/persistence/flushLifecycle'
import { checkpointId } from '../../services/persistence/checkpointTypes'
import { createFinalDraftMeta, finalDraftStore } from '../../services/persistence/finalDraftStore'
import { runFinalDraftCapacityRetry } from '../../services/persistence/finalDraftCapacityRetry'
import AssessmentImageGate from '../../modules/assessment-media/AssessmentImageGate'
import ScaleFormVideoGate from '../../modules/assessment-media/ScaleFormVideoGate'
import { assessmentImageItems } from '../../modules/assessment-media/adapter'
import { scaleItemVideoPresentation } from '../../modules/assessment-media/video-adapter'
import type { AssessmentVideoCapabilitySources } from '../../modules/assessment-media/types'
import {
  SCALE_DEVICE_INPUT_PROVENANCE_METADATA_KEY,
  readScaleDeviceInputProvenance,
  resolveScaleDeviceInputProvenance,
  type DeviceInputProvenanceV1,
} from '../../modules/scale/device-input-provenance'
import { elapsedScaleResponseTimeMs, readScaleTimingNow } from '../../modules/scale/response-timing'
import { ProductPage, ProductPageHeader, ProductStatus, ProductSurface } from '../../components/product/ProductPage'

type ResponseValue = string | number

interface ScaleRunnerItem {
  itemCode: string
  content: string
  type: string
  required: boolean
  sortOrder: number
  responseSetKey: string
  randomizeOptions: boolean
  images?: unknown
  video?: unknown
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
  definitionHash?: string
}

interface Assessment {
  id: string
  status: string
  progress: number
  answers: Array<{ itemCode: string; responseValue: ResponseValue; revision?: number }>
  deliveryMode?: 'FINAL_ONLY' | 'LEGACY'
  attemptEpoch?: number
  definitionHash?: string | null
  contextSnapshotHash?: string | null
  deviceInputProvenance?: DeviceInputProvenanceV1
}

interface ScaleCheckpointPayload {
  itemCode: string
  responseValue: ResponseValue
  responseTimeMs: number
  expectedRevision: number
}

const valueKey = (value: ResponseValue) => `${typeof value}:${String(value)}`

const isFinalAttemptConflict = (error: unknown) => {
  const value = error as { status?: number; statusCode?: number; code?: number | string }
  const code = String(value?.code ?? '')
  return value?.status === 409
    || value?.statusCode === 409
    || code === '409'
    || code === 'FINAL_DRAFT_IDENTITY_CONFLICT'
    || code === 'STALE_ATTEMPT'
    || code === 'DEFINITION_MISMATCH'
    || code === 'SUBMISSION_PAYLOAD_CONFLICT'
}

const ScaleAssessment: React.FC = () => {
  const { scaleId } = useParams<{ scaleId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scale, setScale] = useState<Scale | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ResponseValue>>({})
  const answerRevisionsRef = useRef<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [completionNotice, setCompletionNotice] = useState<string | null>(null)
  const [requiresRestart, setRequiresRestart] = useState(false)
  const itemStartTimeRef = useRef<number>(readScaleTimingNow())
  const scaleDeviceInputProvenanceRef = useRef<DeviceInputProvenanceV1 | null>(null)
  const { saving: savingAnswer, savingRef: savingAnswerRef, runSave } = useRunnerSaveState()

  const loadAssessmentImage = useCallback(async (assetId: string): Promise<Blob> => {
    if (!assessment) throw new Error('量表冻结测评尚未创建')
    const response = await sessionFetch(`/api/scales/assessments/${assessment.id}/assets/${assetId}`)
    if (!response.ok) throw new Error(`视觉内容加载失败 (${response.status})`)
    return response.blob()
  }, [assessment])

  const loadAssessmentVideo = useCallback(async (itemCode: string): Promise<AssessmentVideoCapabilitySources> => {
    if (!assessment) throw new Error('量表冻结测评尚未创建')
    const response = await apiClient.post<AssessmentVideoCapabilitySources>(
      `/scales/assessments/${assessment.id}/items/${encodeURIComponent(itemCode)}/video-capability`,
      {},
    )
    if (response.code !== 0 || !response.data) throw new Error(response.message || '视频授权失败')
    return response.data
  }, [assessment])

  const scaleCheckpointTransport = useCallback(async (batch: CheckpointBatch<ScaleCheckpointPayload>) => {
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
          ...(scaleDeviceInputProvenanceRef.current
            ? { deviceInputProvenance: scaleDeviceInputProvenanceRef.current }
            : {}),
        },
      )
      if (response.code !== 0) {
        throw new CheckpointTransportError(response.message || '提交答案失败', { code: response.code, retryable: false })
      }
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

  const registerScalePersistence = useCallback((assessmentId: string) => {
    checkpointScheduler.register('scale', assessmentId, scaleCheckpointTransport, {
      maxBatchSize: 10,
      maxWaitMs: 12000,
      onError: (error) => setCompletionNotice(normalizeApiError(error).message),
    })
  }, [scaleCheckpointTransport])

  const flushScaleCheckpoints = useCallback(async () => {
    if (!assessment) return
    await checkpointScheduler.flush('scale', assessment.id)
  }, [assessment])

  useCheckpointLifecycle(flushScaleCheckpoints, Boolean(assessment) && assessment?.deliveryMode !== 'FINAL_ONLY')

  useEffect(() => {
    itemStartTimeRef.current = readScaleTimingNow()
  }, [currentIndex])

  useEffect(() => {
    let cancelled = false
    const startAssessment = async () => {
      setLoadError(null)
      try {
        const response = await apiClient.post<{ assessment: Assessment; scale: Scale & { definitionHash?: string } }>(`/scales/${scaleId}/assessments`)
        if (cancelled) return
        if (response.code !== 0 || !response.data) throw new Error(response.message || '量表测评加载失败')
        const nextAssessment = response.data.assessment
        setAssessment(nextAssessment)
        setScale(response.data.scale)
        const existingAnswers: Record<string, ResponseValue> = {}
        const revisions: Record<string, number> = {}
        nextAssessment.answers?.forEach((answer) => {
          existingAnswers[answer.itemCode] = answer.responseValue
          revisions[answer.itemCode] = answer.revision ?? 0
        })
        if (nextAssessment.deliveryMode === 'FINAL_ONLY') {
          if (nextAssessment.status === 'COMPLETED') {
            navigate(`/student/scales/result/${nextAssessment.id}`)
            return
          }
          const definitionHash = response.data.scale.definitionHash || nextAssessment.definitionHash
          if (!definitionHash) throw new Error('量表缺少冻结定义，请重启后重试')
          const draftKey = `scale:${nextAssessment.id}`
          const nextMeta = await finalDraftStore.ensure(createFinalDraftMeta({
            draftKey,
            instrument: 'scale',
            attemptId: nextAssessment.id,
            attemptEpoch: nextAssessment.attemptEpoch ?? 1,
            definitionHash,
            contextSnapshotHash: nextAssessment.contextSnapshotHash ?? null,
            deliveryMode: 'final_only',
            submissionId: checkpointId(),
          }))
          const storedProvenance = readScaleDeviceInputProvenance(nextMeta.instrumentMetadata)
          const provenance = resolveScaleDeviceInputProvenance({
            metadata: nextMeta.instrumentMetadata,
            serverValue: nextAssessment.deviceInputProvenance,
            existing: scaleDeviceInputProvenanceRef.current,
          })
          scaleDeviceInputProvenanceRef.current = provenance
          if (!storedProvenance) {
            await finalDraftStore.setInstrumentMetadata(draftKey, {
              [SCALE_DEVICE_INPUT_PROVENANCE_METADATA_KEY]: provenance,
            }).catch(() => null)
          }
          const localAnswers = await finalDraftStore.listAnswers(draftKey)
          localAnswers.forEach((answer) => {
            const value = answer.value as { responseValue?: ResponseValue } | ResponseValue
            existingAnswers[answer.itemKey] = typeof value === 'object' && value !== null && 'responseValue' in value
              ? value.responseValue as ResponseValue
              : value as ResponseValue
          })
          answerRevisionsRef.current = revisions
          setAnswers(existingAnswers)
          return
        }
        scaleDeviceInputProvenanceRef.current = resolveScaleDeviceInputProvenance({
          serverValue: nextAssessment.deviceInputProvenance,
          existing: scaleDeviceInputProvenanceRef.current,
        })
        registerScalePersistence(nextAssessment.id)
        const pending = await checkpointScheduler.pending('scale', nextAssessment.id)
        pending.forEach((record) => {
          const payload = record.payload as ScaleCheckpointPayload
          existingAnswers[payload.itemCode] = payload.responseValue
          revisions[payload.itemCode] = Math.max(
            revisions[payload.itemCode] ?? 0,
            (payload.expectedRevision ?? revisions[payload.itemCode] ?? 0) + 1,
          )
        })
        answerRevisionsRef.current = revisions
        setAnswers(existingAnswers)
        void checkpointScheduler.flush('scale', nextAssessment.id).catch((err) => {
          if (!cancelled) setCompletionNotice(normalizeApiError(err).message)
        })
      } catch (err) {
        if (isFinalAttemptConflict(err)) setRequiresRestart(true)
        if (!cancelled) setLoadError(normalizeApiError(err).message)
        console.error('开始测评失败', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void startAssessment()
    return () => { cancelled = true }
  }, [navigate, registerScalePersistence, scaleId])

  const handleSelectAnswer = async (value: ResponseValue) => {
    if (!scale || !assessment || savingAnswerRef.current || submitting) return
    const items = scale.definition.items
    const itemIndex = currentIndex
    const item = items[itemIndex]
    if (!item) return
    const responseTimeMs = elapsedScaleResponseTimeMs(itemStartTimeRef.current, readScaleTimingNow())
    try {
      await runSave(async () => {
        if (assessment.deliveryMode === 'FINAL_ONLY') {
          await finalDraftStore.putAnswer({
            draftKey: `scale:${assessment.id}`,
            itemKey: item.itemCode,
            value: { responseValue: value, responseTimeMs },
            updatedAt: Date.now(),
          })
          setAnswers((previous) => ({ ...previous, [item.itemCode]: value }))
          if (itemIndex < items.length - 1) {
            setCurrentIndex((index) => index === itemIndex ? itemIndex + 1 : index)
          }
          setCompletionNotice(null)
          return
        }
        await checkpointScheduler.enqueue({
          scopeType: 'scale',
          scopeId: assessment.id,
          payload: {
            itemCode: item.itemCode,
            responseValue: value,
            responseTimeMs,
            expectedRevision: answerRevisionsRef.current[item.itemCode] ?? 0,
          },
        }, scaleCheckpointTransport, { maxBatchSize: 10, maxWaitMs: 12000 })
        answerRevisionsRef.current[item.itemCode] = (answerRevisionsRef.current[item.itemCode] ?? 0) + 1
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
      if (assessment.deliveryMode === 'FINAL_ONLY') {
        const draftKey = `scale:${assessment.id}`
        const meta = await finalDraftStore.get(draftKey)
        if (!meta) throw new Error('本地量表草稿不存在，请重启测评')
        const localAnswers = await finalDraftStore.listAnswers(draftKey)
        const answerMap = new Map(localAnswers.map((answer) => {
          const value = answer.value as { responseValue?: ResponseValue; responseTimeMs?: number } | ResponseValue
          const stored = typeof value === 'object' && value !== null && 'responseValue' in value
            ? value as { responseValue?: ResponseValue; responseTimeMs?: number }
            : { responseValue: value as ResponseValue }
          return [answer.itemKey, stored] as const
        }))
        const finalAnswers = scale.definition.items
          .filter((item) => answerMap.has(item.itemCode))
          .map((item) => {
            const value = answerMap.get(item.itemCode)!
            return {
              itemCode: item.itemCode,
              responseValue: value.responseValue as ResponseValue,
              ...(value.responseTimeMs === undefined ? {} : { responseTimeMs: value.responseTimeMs }),
            }
          })
        await finalDraftStore.setStatus(draftKey, 'SUBMITTING')
        await runFinalDraftCapacityRetry({
          onRetry: async ({ error }) => {
            await finalDraftStore.setStatus(draftKey, 'RETRY_PENDING', {
              code: String((error as any)?.code || 'ASSESSMENT_SUBMIT_BUSY'),
              message: normalizeApiError(error).message,
            }).catch(() => null)
            setCompletionNotice('提交繁忙，正在自动重试…')
          },
          operation: async () => {
            const next = await apiClient.post(`/scales/assessments/${assessment.id}/submit`, {
              submissionId: meta.submissionId,
              attemptEpoch: meta.attemptEpoch,
              definitionHash: meta.definitionHash,
              ...(meta.contextSnapshotHash ? { contextSnapshotHash: meta.contextSnapshotHash } : {}),
              answers: finalAnswers,
              ...(scaleDeviceInputProvenanceRef.current
                ? { deviceInputProvenance: scaleDeviceInputProvenanceRef.current }
                : {}),
            })
            if (next.code !== 0) {
              const conflict = String(next.code) === '409' || String(next.code) === 'STALE_ATTEMPT' || String(next.code) === 'SUBMISSION_PAYLOAD_CONFLICT'
              await finalDraftStore.setStatus(draftKey, conflict ? 'CONFLICT' : 'RETRY_PENDING', { code: String(next.code), message: next.message })
              const submitError = new Error(next.message || '量表提交失败') as Error & { status?: number; code?: number | string }
              submitError.code = next.code
              if (typeof next.code === 'number') submitError.status = next.code
              if (next.code === 'ASSESSMENT_SUBMIT_BUSY' || next.code === 'COMPLETION_BUSY') submitError.status = 503
              throw submitError
            }
            return next
          },
        })
        await finalDraftStore.setStatus(draftKey, 'COMPLETED')
        await finalDraftStore.delete(draftKey)
        navigate(`/student/scales/result/${assessment.id}`)
        return
      }
      await checkpointScheduler.flush('scale', assessment.id)
      const pending = await checkpointScheduler.pending('scale', assessment.id)
      if (pending.length > 0) throw new Error('答案仍在同步，请稍后重试')
      await checkpointScheduler.purgeExpired('scale', assessment.id)
      const response = await apiClient.post(`/scales/assessments/${assessment.id}/complete`)
      if (response.code !== 0) throw new Error(response.message || '提交失败')
      navigate(`/student/scales/result/${assessment.id}`)
    } catch (err) {
      if (isFinalAttemptConflict(err)) setRequiresRestart(true)
      setCompletionNotice(normalizeApiError(err).message)
    } finally {
      setSubmitting(false)
    }
  }

  const restartLegacyAttempt = async () => {
    if (!assessment) return
    try {
      setSubmitting(true)
      const response = await apiClient.post(`/scales/assessments/${assessment.id}/restart`, {})
      if (response.code !== 0) throw new Error(response.message || '重启量表测评失败')
      window.location.reload()
    } catch (err) {
      setCompletionNotice(normalizeApiError(err).message)
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <ProductPage width="assessment">
        <ProductPageHeader title="量表测评" description="正在准备本次测评与已保存的作答进度。" />
        <ProductSurface className="flex min-h-64 items-center justify-center p-6 text-sm text-gray-500">
          正在加载测评…
        </ProductSurface>
      </ProductPage>
    )
  }

  if (loadError || !scale || !assessment) {
    return (
      <ProductPage width="assessment">
        <ProductPageHeader title="量表测评" description="当前无法进入这次测评。" />
        <ProductStatus tone="danger">
          {loadError || '量表不存在、未发布或尚未安装有效定义'}
        </ProductStatus>
        <button
          type="button"
          onClick={() => navigate('/student/scales')}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          返回量表列表
        </button>
      </ProductPage>
    )
  }

  if (assessment.status === 'COMPLETED') {
    return (
      <ProductPage width="assessment">
        <ProductSurface className="px-6 py-10 text-center">
          <CheckCircle className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
          <h1 className="text-xl font-semibold text-gray-950">量表测评已完成</h1>
          <p className="mt-2 text-sm text-gray-600">服务器已经确认本次测评完成，可以直接查看结果。</p>
          <button
            type="button"
            onClick={() => navigate(`/student/scales/result/${assessment.id}`)}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            查看结果
          </button>
        </ProductSurface>
      </ProductPage>
    )
  }

  if (assessment.deliveryMode === 'LEGACY') {
    return (
      <ProductPage width="assessment">
        <ProductPageHeader title="继续量表测评" description="这是一份旧版进行中的记录，需要先创建新的整份提交测评才能继续作答。" />
        <ProductStatus tone="warning" className="mb-5">
          旧版答案仍可读取。重启会保留历史记录，并创建新的测评尝试。
        </ProductStatus>
        {completionNotice && <ProductStatus tone="danger" className="mb-5">{completionNotice}</ProductStatus>}
        <button
          type="button"
          onClick={() => void restartLegacyAttempt()}
          disabled={submitting}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? '重启中…' : '重启并继续作答'}
        </button>
      </ProductPage>
    )
  }

  const items = scale.definition.items
  if (items.length === 0) {
    return (
      <ProductPage width="assessment">
        <ProductPageHeader title={scale.name} description="当前测评没有可展示的题目。" />
        <ProductStatus tone="danger">量表题目加载失败</ProductStatus>
      </ProductPage>
    )
  }

  const currentItem = items[currentIndex]
  const selectedValue = currentItem ? answers[currentItem.itemCode] : undefined
  const answeredCount = Object.keys(answers).length
  const progress = Math.round((answeredCount / items.length) * 100)
  const imageItems = assessmentImageItems(currentItem.images)
  const videoPresentation = scaleItemVideoPresentation(currentItem)

  return (
    <ProductPage width="assessment">
      <ProductPageHeader
        eyebrow="量表测评"
        title={scale.name}
        description={scale.instruction || '请按当前实际情况选择最符合你的答案。'}
      />

      <div className="mb-6" aria-label={`已完成 ${answeredCount} / ${items.length} 题`}>
        <div className="mb-2 flex items-center justify-between gap-4 text-sm text-gray-600">
          <span>已完成</span>
          <span className="font-medium text-gray-900">{answeredCount} / {items.length} 题</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
          <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {savingAnswer && (
        <ProductStatus tone="info" className="mb-4">
          正在保存本题回答…
        </ProductStatus>
      )}
      {completionNotice && <ProductStatus tone="danger" className="mb-4">{completionNotice}</ProductStatus>}
      {requiresRestart && (
        <ProductStatus tone="warning" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>本地答案已保留。当前量表版本已变化，请重启后继续。</span>
          <button
            type="button"
            onClick={() => void restartLegacyAttempt()}
            disabled={submitting}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white px-4 font-medium text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            重启并继续
          </button>
        </ProductStatus>
      )}

      <AssessmentImageGate
        items={imageItems}
        loadAsset={loadAssessmentImage}
        disabled={savingAnswer || submitting}
        ariaLabel={`${currentItem.content} 视觉内容`}
      >
        <ScaleFormVideoGate
          presentation={videoPresentation}
          loadSources={() => loadAssessmentVideo(currentItem.itemCode)}
          ariaLabel={`${currentItem.content} 视频内容`}
        >
          <ProductSurface className="mb-5 p-5 sm:p-6">
            <div className="mb-2 text-sm font-medium text-gray-500">第 {currentIndex + 1} 题 / 共 {items.length} 题</div>
            <h2 className="mb-6 text-lg font-semibold leading-7 text-gray-950">{currentItem.content}</h2>
            <div className="space-y-3">
              {currentItem.options.map((option) => {
                const selected = selectedValue === option.value
                return (
                  <button
                    key={valueKey(option.value)}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => void handleSelectAnswer(option.value)}
                    disabled={savingAnswer || submitting}
                    className={`min-h-11 w-full rounded-xl border px-4 py-3 text-left text-sm leading-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${selected ? 'border-primary bg-primary/5 font-medium text-primary' : 'border-gray-300 bg-white text-gray-800 hover:border-gray-400 hover:bg-gray-50'}`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </ProductSurface>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
              disabled={currentIndex === 0 || savingAnswer || submitting}
              className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <ChevronLeft className="mr-1 h-5 w-5" />上一题
            </button>
            {currentIndex === items.length - 1 ? (
              <button
                type="button"
                onClick={() => void handleComplete()}
                disabled={submitting || savingAnswer || requiresRestart}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50"
              >
                <CheckCircle className="mr-1.5 h-5 w-5" />{submitting ? '提交中…' : '完成测评'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentIndex((index) => Math.min(items.length - 1, index + 1))}
                disabled={savingAnswer || submitting}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
              >
                下一题<ChevronRight className="ml-1 h-5 w-5" />
              </button>
            )}
          </div>
        </ScaleFormVideoGate>
      </AssessmentImageGate>

      <ProductSurface className="mt-6 p-4 sm:p-5">
        <div className="mb-3 text-sm font-medium text-gray-700">题目导航</div>
        <div className="flex flex-wrap gap-2">
          {items.map((item, index) => {
            const isCurrent = currentIndex === index
            const isAnswered = answers[item.itemCode] !== undefined
            return (
              <button
                key={item.itemCode}
                type="button"
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`第 ${index + 1} 题${isAnswered ? '，已作答' : '，未作答'}`}
                onClick={() => setCurrentIndex(index)}
                disabled={savingAnswer || submitting}
                className={`h-11 w-11 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${isCurrent ? 'bg-primary text-white' : isAnswered ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {index + 1}
              </button>
            )
          })}
        </div>
      </ProductSurface>
    </ProductPage>
  )
}

export default ScaleAssessment
