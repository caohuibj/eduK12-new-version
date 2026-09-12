import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient, { sessionFetch } from '../../api/client'
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { ActionBar, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
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
import { requiredVideoCompletionFromMeta } from '../../modules/assessment-media/required-video-completion'
import { scaleItemVideoPresentation } from '../../modules/assessment-media/video-adapter'
import type { AssessmentVideoCapabilitySources } from '../../modules/assessment-media/types'
import {
  SCALE_DEVICE_INPUT_PROVENANCE_METADATA_KEY,
  readScaleDeviceInputProvenance,
  resolveScaleDeviceInputProvenance,
  type DeviceInputProvenanceV1,
} from '../../modules/scale/device-input-provenance'
import { elapsedScaleResponseTimeMs, readScaleTimingNow } from '../../modules/scale/response-timing'

type ResponseValue = string | number

type ScaleFinalPayload = {
  submissionId: string
  attemptEpoch: number
  definitionHash: string
  contextSnapshotHash?: string
  answers: Array<{ itemCode: string; responseValue: ResponseValue; responseTimeMs?: number }>
  deviceInputProvenance?: DeviceInputProvenanceV1
}

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

type SubmissionLockReason = 'sealed' | 'legacy-pending' | null

class ScaleVideoCompletionRequiredError extends Error {
  readonly itemCode: string

  constructor(itemCode: string) {
    super('该题包含必看视频。请从头以 1× 完整观看视频后再提交测评。')
    this.name = 'ScaleVideoCompletionRequiredError'
    this.itemCode = itemCode
  }
}

const valueKey = (value: ResponseValue) => `${typeof value}:${String(value)}`
const scaleVideoSlotKey = (itemCode: string) => `scale-item:${itemCode}:video`

const scaleVideoCompletionIdentity = (draftKey: string, item: ScaleRunnerItem) => {
  const presentation = scaleItemVideoPresentation(item)
  if (!presentation) return null
  return {
    draftKey,
    slotKey: scaleVideoSlotKey(item.itemCode),
    assetId: presentation.video.assetId,
    contentHash: presentation.video.contentHash,
  }
}

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
  const [scale, setScale] = useState<Scale | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ResponseValue>>({})
  const answerRevisionsRef = useRef<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submissionLocked, setSubmissionLocked] = useState(false)
  const [submissionLockReason, setSubmissionLockReason] = useState<SubmissionLockReason>(null)
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
      try {
        const response = await apiClient.post<{ assessment: Assessment; scale: Scale & { definitionHash?: string } }>(`/scales/${scaleId}/assessments`)
        if (cancelled || response.code !== 0 || !response.data) return
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
            await finalDraftStore.delete(`scale:${nextAssessment.id}`).catch(() => undefined)
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
          if (!storedProvenance && nextMeta.status === 'DRAFT' && !nextMeta.sealedSubmission) {
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
          const locked = nextMeta.status !== 'DRAFT' || Boolean(nextMeta.sealedSubmission)
          setSubmissionLocked(locked)
          setSubmissionLockReason(locked ? (nextMeta.sealedSubmission ? 'sealed' : 'legacy-pending') : null)
          return
        }
        setSubmissionLocked(false)
        setSubmissionLockReason(null)
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
        setCompletionNotice(normalizeApiError(err).message)
        console.error('开始测评失败', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void startAssessment()
    return () => { cancelled = true }
  }, [navigate, registerScalePersistence, scaleId])

  const handleSelectAnswer = async (value: ResponseValue) => {
    if (!scale || !assessment || savingAnswerRef.current || submitting || submissionLocked) return
    const items = scale.definition.items
    const item = items[currentIndex]
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
    if (unanswered.length > 0 && !submissionLocked) {
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
        const sealed = await finalDraftStore.sealForSubmission<ScaleFinalPayload>(draftKey, (snapshot) => {
          const answerMap = new Map(snapshot.answers.map((answer) => {
            const value = answer.value as { responseValue?: ResponseValue; responseTimeMs?: number } | ResponseValue
            const stored = typeof value === 'object' && value !== null && 'responseValue' in value
              ? value as { responseValue?: ResponseValue; responseTimeMs?: number }
              : { responseValue: value as ResponseValue }
            return [answer.itemKey, stored] as const
          }))
          const missingStored = scale.definition.items.filter((item) => (
            item.required && answerMap.get(item.itemCode)?.responseValue === undefined
          ))
          if (missingStored.length > 0) {
            throw new Error(`还有 ${missingStored.length} 道必答题尚未保存，请确认最后一次作答已完成本地保存`)
          }
          const missingVideo = scale.definition.items.find((item) => {
            if (answerMap.get(item.itemCode)?.responseValue === undefined) return false
            const identity = scaleVideoCompletionIdentity(draftKey, item)
            return Boolean(identity && !requiredVideoCompletionFromMeta(snapshot.meta, identity))
          })
          if (missingVideo) throw new ScaleVideoCompletionRequiredError(missingVideo.itemCode)

          const finalAnswers = scale.definition.items
            .filter((item) => answerMap.get(item.itemCode)?.responseValue !== undefined)
            .map((item) => {
              const value = answerMap.get(item.itemCode)!
              return {
                itemCode: item.itemCode,
                responseValue: value.responseValue as ResponseValue,
                ...(value.responseTimeMs === undefined ? {} : { responseTimeMs: value.responseTimeMs }),
              }
            })
          const provenance = readScaleDeviceInputProvenance(snapshot.meta.instrumentMetadata)
            ?? scaleDeviceInputProvenanceRef.current
          return {
            submissionId: snapshot.meta.submissionId,
            attemptEpoch: snapshot.meta.attemptEpoch,
            definitionHash: snapshot.meta.definitionHash,
            ...(snapshot.meta.contextSnapshotHash ? { contextSnapshotHash: snapshot.meta.contextSnapshotHash } : {}),
            answers: finalAnswers,
            ...(provenance ? { deviceInputProvenance: provenance } : {}),
          }
        })
        if (!sealed) throw new Error('本地量表草稿不存在，请重启测评')
        setSubmissionLocked(true)
        setSubmissionLockReason('sealed')
        await runFinalDraftCapacityRetry({
          onRetry: async ({ error }) => {
            await finalDraftStore.setStatus(draftKey, 'RETRY_PENDING', {
              code: String((error as any)?.code || 'ASSESSMENT_SUBMIT_BUSY'),
              message: normalizeApiError(error).message,
            }).catch(() => null)
            setCompletionNotice('提交繁忙，正在自动重试…')
          },
          operation: async () => {
            const next = await apiClient.post(`/scales/assessments/${assessment.id}/submit`, sealed.payload)
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
      if (assessment.deliveryMode === 'FINAL_ONLY') {
        const draftKey = `scale:${assessment.id}`
        const currentMeta = await finalDraftStore.get(draftKey).catch(() => null)
        if (currentMeta?.sealedSubmission) {
          setSubmissionLocked(true)
          setSubmissionLockReason('sealed')
          const terminal = await apiClient.get<Assessment>(`/scales/assessments/${assessment.id}`).catch(() => null)
          if (terminal?.code === 0 && terminal.data?.status === 'COMPLETED') {
            await finalDraftStore.setStatus(draftKey, 'COMPLETED').catch(() => undefined)
            await finalDraftStore.delete(draftKey).catch(() => undefined)
            navigate(`/student/scales/result/${assessment.id}`, { replace: true })
            return
          }
        }
      }
      if (err instanceof ScaleVideoCompletionRequiredError) {
        const videoIndex = scale.definition.items.findIndex((item) => item.itemCode === err.itemCode)
        if (videoIndex >= 0) setCurrentIndex(videoIndex)
      }
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
        <ProductStatus kind="pending" title="正在准备量表" announce="polite">正在加载冻结题目与本地作答状态。</ProductStatus>
      </ProductPage>
    )
  }

  if (!scale || !assessment) {
    return (
      <ProductPage width="assessment">
        <ProductStatus kind="error" title="无法开始量表">量表不存在、未发布或尚未安装有效定义。</ProductStatus>
      </ProductPage>
    )
  }

  if (assessment.status === 'COMPLETED') {
    return (
      <ProductPage width="reading">
        <ProductStatus
          kind="success"
          title="量表测评已完成"
          actions={<ProductButton variant="primary" onClick={() => navigate(`/student/scales/result/${assessment.id}`)}>查看结果</ProductButton>}
        >
          本次测评已有权威结果，不会重新创建提交。
        </ProductStatus>
      </ProductPage>
    )
  }

  if (assessment.deliveryMode === 'LEGACY') {
    return (
      <ProductPage width="reading">
        <ProductStatus
          kind="warning"
          title="这是旧版进行中的量表"
          actions={<ProductButton variant="primary" onClick={() => void restartLegacyAttempt()} disabled={submitting}>{submitting ? '重启中…' : '重启并继续作答'}</ProductButton>}
        >
          旧版答案仍可读取，但不能继续写入。重启会保留历史记录，并创建新的整份提交测评。
        </ProductStatus>
        {completionNotice ? <div className="mt-4"><ProductStatus kind="error" title="重启失败" announce="assertive">{completionNotice}</ProductStatus></div> : null}
      </ProductPage>
    )
  }

  const items = scale.definition.items
  if (items.length === 0) {
    return (
      <ProductPage width="assessment">
        <ProductStatus kind="error" title="量表题目加载失败">冻结定义中没有可作答题目。</ProductStatus>
      </ProductPage>
    )
  }

  const currentItem = items[currentIndex]
  const selectedValue = currentItem ? answers[currentItem.itemCode] : undefined
  const answeredCount = items.filter((item) => answers[item.itemCode] !== undefined).length
  const progress = Math.round((answeredCount / items.length) * 100)
  const imageItems = assessmentImageItems(currentItem.images)
  const videoPresentation = scaleItemVideoPresentation(currentItem)
  const draftKey = `scale:${assessment.id}`
  const requiredViewing = videoPresentation && !submissionLocked
    ? { draftKey, slotKey: scaleVideoSlotKey(currentItem.itemCode) }
    : undefined
  const answerControlsDisabled = savingAnswer || submitting || submissionLocked

  return (
    <ProductPage width="assessment" data-scale-reference-journey>
      <header className="mb-6 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500">心理测评</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-900">{scale.name}</h1>
          </div>
          {scale.estimatedTime ? <p className="text-sm text-slate-500 sm:text-right">预计约 {scale.estimatedTime} 分钟</p> : null}
        </div>
        {scale.instruction ? <p className="max-w-prose whitespace-pre-wrap text-sm text-slate-600">{scale.instruction}</p> : null}
      </header>

      <section aria-label="答题进度" className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-4 text-sm text-slate-600">
          <span>答题进度</span>
          <span>{answeredCount} / {items.length}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="量表答题进度" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={answeredCount}>
          <div className="h-full rounded-full bg-blue-700 transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} />
        </div>
      </section>

      {submissionLockReason === 'sealed' ? (
        <div className="mb-4">
          <ProductStatus kind="pending" title="提交内容已封存">
            答案已经锁定。若上一次网络结果不明确，“重新核对提交”只会重放同一份 FINAL，不会重新生成答案或视频状态。
          </ProductStatus>
        </div>
      ) : null}
      {submissionLockReason === 'legacy-pending' ? (
        <div className="mb-4">
          <ProductStatus kind="warning" title="检测到旧版未确认提交">
            当前答案已锁定，系统不会根据页面状态重新生成 FINAL。请核对服务器状态或重启测评。
          </ProductStatus>
        </div>
      ) : null}
      {completionNotice ? (
        <div className="mb-4">
          <ProductStatus kind={submitting ? 'pending' : 'error'} title={submitting ? '正在处理提交' : '需要处理'} announce={submitting ? 'polite' : 'assertive'}>
            {completionNotice}
          </ProductStatus>
        </div>
      ) : null}
      {requiresRestart ? (
        <div className="mb-4">
          <ProductStatus
            kind="warning"
            title="量表版本已变化"
            actions={<ProductButton variant="primary" onClick={() => void restartLegacyAttempt()} disabled={submitting}>重启并继续</ProductButton>}
          >
            本地答案仍保留在旧尝试中。需要创建新的冻结尝试后继续作答。
          </ProductStatus>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby={`scale-question-${currentItem.itemCode}`}>
        <div className="mb-5">
          <p className="text-sm font-medium text-slate-500">第 {currentIndex + 1} 题 / 共 {items.length} 题</p>
          <h2 id={`scale-question-${currentItem.itemCode}`} className="mt-2 text-lg font-semibold leading-relaxed text-slate-900">{currentItem.content}</h2>
        </div>

        <AssessmentImageGate items={imageItems} loadAsset={loadAssessmentImage} disabled={savingAnswer || submitting} ariaLabel={`${currentItem.content} 视觉内容`}>
          <ScaleFormVideoGate
            presentation={videoPresentation}
            loadSources={() => loadAssessmentVideo(currentItem.itemCode)}
            ariaLabel={`${currentItem.content} 视频内容`}
            requiredViewing={requiredViewing}
          >
            <fieldset disabled={answerControlsDisabled} className="space-y-3">
              <legend className="sr-only">{currentItem.content}</legend>
              {currentItem.options.map((option) => {
                const checked = selectedValue === option.value
                return (
                  <label
                    key={valueKey(option.value)}
                    className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-700 has-[:focus-visible]:ring-offset-2 ${checked ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400'} ${answerControlsDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`scale-${assessment.id}-${currentItem.itemCode}`}
                      checked={checked}
                      onChange={() => void handleSelectAnswer(option.value)}
                      disabled={answerControlsDisabled}
                      className="mt-1 h-5 w-5 shrink-0 accent-blue-700"
                    />
                    <span className="min-w-0 flex-1 leading-relaxed">{option.label}</span>
                  </label>
                )
              })}
            </fieldset>
          </ScaleFormVideoGate>
        </AssessmentImageGate>

        <p className="mt-4 min-h-6 text-sm text-slate-500" role="status" aria-live="polite">
          {savingAnswer ? '正在保存本题到本机…' : selectedValue !== undefined ? '本题答案已保存到本机，可继续或返回修改。' : videoPresentation && !submissionLocked ? '完整观看视频后选择一个答案。' : '请选择一个答案。'}
        </p>
      </section>

      <ActionBar className="mt-5 justify-between">
        <ProductButton onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0 || savingAnswer || submitting}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          上一题
        </ProductButton>
        {currentIndex === items.length - 1 ? (
          <ProductButton variant="primary" onClick={() => void handleComplete()} disabled={submitting || savingAnswer || requiresRestart}>
            <CheckCircle className="h-5 w-5" aria-hidden="true" />
            {submitting ? '提交中…' : submissionLocked ? '重新核对提交' : '完成测评'}
          </ProductButton>
        ) : (
          <ProductButton variant="primary" onClick={() => setCurrentIndex((index) => Math.min(items.length - 1, index + 1))} disabled={savingAnswer || submitting}>
            下一题
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </ProductButton>
        )}
      </ActionBar>

      <nav aria-label="题目导航" className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-slate-600">题目导航</p>
        <div className="flex flex-wrap gap-2">
          {items.map((item, index) => {
            const current = currentIndex === index
            const answered = answers[item.itemCode] !== undefined
            return (
              <button
                key={item.itemCode}
                type="button"
                onClick={() => setCurrentIndex(index)}
                disabled={savingAnswer || submitting}
                aria-current={current ? 'step' : undefined}
                aria-label={`第 ${index + 1} 题${answered ? '，已作答' : '，未作答'}`}
                className={`min-h-11 min-w-11 rounded-lg border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60 ${current ? 'border-blue-700 bg-blue-700 text-white' : answered ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-700'}`}
              >
                {index + 1}
              </button>
            )
          })}
        </div>
      </nav>
    </ProductPage>
  )
}

export default ScaleAssessment
