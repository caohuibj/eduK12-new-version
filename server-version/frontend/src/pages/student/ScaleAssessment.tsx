import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { normalizeApiError } from '../../utils/normalizeApiError'
import { useRunnerSaveState } from '../../hooks/useRunnerSaveState'
import { checkpointScheduler, CheckpointTransportError } from '../../services/persistence/checkpointScheduler'
import type { CheckpointBatch } from '../../services/persistence/checkpointTypes'
import { useCheckpointLifecycle } from '../../services/persistence/flushLifecycle'
import { checkpointId } from '../../services/persistence/checkpointTypes'
import { createFinalDraftMeta, finalDraftStore } from '../../services/persistence/finalDraftStore'
import { runFinalDraftCapacityRetry } from '../../services/persistence/finalDraftCapacityRetry'
import {
  SCALE_DEVICE_INPUT_PROVENANCE_METADATA_KEY,
  readScaleDeviceInputProvenance,
  resolveScaleDeviceInputProvenance,
  type DeviceInputProvenanceV1,
} from '../../modules/scale/device-input-provenance'

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
  const [scale, setScale] = useState<Scale | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ResponseValue>>({})
  const answerRevisionsRef = useRef<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [completionNotice, setCompletionNotice] = useState<string | null>(null)
  const [requiresRestart, setRequiresRestart] = useState(false)
  const itemStartTimeRef = useRef<number>(Date.now())
  const scaleDeviceInputProvenanceRef = useRef<DeviceInputProvenanceV1 | null>(null)
  const { saving: savingAnswer, savingRef: savingAnswerRef, runSave } = useRunnerSaveState()

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
    itemStartTimeRef.current = Date.now()
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
        console.error('开始测评失败', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void startAssessment()
    return () => { cancelled = true }
  }, [registerScalePersistence, scaleId])

  const handleSelectAnswer = async (value: ResponseValue) => {
    if (!scale || !assessment || savingAnswerRef.current || submitting) return
    const items = scale.definition.items
    const itemIndex = currentIndex
    const item = items[itemIndex]
    if (!item) return
    const responseTimeMs = Date.now() - itemStartTimeRef.current
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
        const response = await runFinalDraftCapacityRetry({
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-500">加载中...</div></div>
  if (!scale || !assessment) return <div className="text-center py-12"><p className="text-gray-500">量表不存在、未发布或尚未安装有效定义</p></div>

  if (assessment.status === 'COMPLETED') return <div className="text-center py-12"><CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" /><p className="text-gray-700 mb-4">量表测评已完成</p><button onClick={() => navigate(`/student/scales/result/${assessment.id}`)} className="btn-primary">查看结果</button></div>

  if (assessment.deliveryMode === 'LEGACY') {
    return <div className="max-w-xl mx-auto rounded-lg border border-amber-200 bg-amber-50 p-6 text-center"><h1 className="text-xl font-semibold text-amber-900 mb-2">这是旧版进行中的量表</h1><p className="text-sm text-amber-800 mb-5">旧版答案仍可读取，但不能继续写入。重启会保留历史记录，并创建新的整份提交测评。</p>{completionNotice && <p role="alert" className="mb-4 text-sm text-red-600">{completionNotice}</p>}<button onClick={() => void restartLegacyAttempt()} disabled={submitting} className="btn-primary">{submitting ? '重启中...' : '重启并继续作答'}</button></div>
  }

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
      {requiresRestart && <div className="mb-4 flex items-center justify-between gap-3 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><span>本地答案已保留。当前量表版本已变化，请重启后继续。</span><button type="button" onClick={() => void restartLegacyAttempt()} disabled={submitting} className="btn-primary whitespace-nowrap">重启并继续</button></div>}
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
          <button onClick={() => void handleComplete()} disabled={submitting || savingAnswer || requiresRestart} className="flex items-center px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"><CheckCircle className="w-5 h-5 mr-1" />{submitting ? '提交中...' : '完成测评'}</button>
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
