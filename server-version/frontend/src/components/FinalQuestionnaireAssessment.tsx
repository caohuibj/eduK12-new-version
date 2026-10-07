import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Layers, Save } from 'lucide-react'
import { sessionFetch } from '../api/client'
import { AssessmentShell } from './assessment-shell'
import { checkpointId } from '../services/persistence/checkpointTypes'
import {
  createFinalDraftMeta,
  finalDraftStore,
  type FinalDraftMeta,
} from '../services/persistence/finalDraftStore'
import { runFinalDraftCapacityRetry } from '../services/persistence/finalDraftCapacityRetry'
import { recordFinalSubmissionFailure } from '../services/persistence/finalSubmissionFailure'
import { normalizeApiError } from '../utils/normalizeApiError'
import { readQuestionnaireResumeTokenForSession } from '../utils/questionnaireResume'
import type { ApiResponse } from '../types'
import AssessmentImageGate from '../modules/assessment-media/AssessmentImageGate'
import FormOptionVideoGroupGate from '../modules/assessment-media/FormOptionVideoGroupGate'
import ScaleFormVideoGate from '../modules/assessment-media/ScaleFormVideoGate'
import { assessmentImageItems, assessmentOptionImageItems } from '../modules/assessment-media/adapter'
import { formOptionVideoPresentations, scaleItemVideoPresentation } from '../modules/assessment-media/video-adapter'
import { requestAssessmentVideoCapabilities } from '../modules/assessment-media/video-capability-client'
import FormPlayer from './questionnaire/FormPlayer'
import ScalePlayer from './questionnaire/ScalePlayer'
import useLocalDraftSaveQueue from './questionnaire/useLocalDraftSaveQueue'
import {
  QuestionnaireRequiredVideoCompletionError,
  assertFormItemRequiredVideosComplete,
  assertScaleRequiredVideosComplete,
  formItemVideoSlotPrefix,
  scaleItemVideoSlotKey,
} from './questionnaire/requiredViewing'
import {
  SCALE_DEVICE_INPUT_PROVENANCE_METADATA_KEY,
  resolveScaleDeviceInputProvenance,
  readScaleDeviceInputProvenance,
  type DeviceInputProvenanceV1,
} from '../modules/scale/device-input-provenance'

type ResponseValue = string | number
type FormValue = string | string[] | null
type FormOption = { value: string; label: string; images?: unknown; video?: unknown }

export interface FinalQuestionnaireFormSection {
  id: string
  title: string
  description: string | null
  position: number
  contextSection: boolean
  definitionHash: string
  status: string
  submittedAt: string | null
  items: Array<{
    id: string
    formItemId: string
    type: 'fill_blank' | 'single_choice' | 'multiple_choice' | 'text_input' | 'year_month' | string
    label: string
    placeholder: string | null
    options: FormOption[] | string | null
    required: boolean
    contextKey: string | null
    value: FormValue
  }>
}

export interface FinalQuestionnaireScale {
  id: string
  name: string
  instruction: string | null
  scaleAssessmentId: string
  definitionHash: string
  deviceInputProvenance?: DeviceInputProvenanceV1
  definition: {
    schemaVersion: 2
    respondentType: string
    display: { randomizeItems: boolean }
    items: Array<{
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
    }>
  }
}

export interface FinalQuestionnaireData {
  questionnaireAssessment: {
    id: string
    status: string
    progress: number
    currentIndex: number
    deliveryMode: 'FINAL_ONLY' | 'LEGACY'
    attemptEpoch: number
    context?: { status: 'collecting' | 'frozen'; frozenAt: string | null; snapshotHash?: string | null }
  }
  questionnaire?: { id: string; name: string; instruction: string | null }
  definitionHash?: string
  contextSnapshotHash?: string | null
  currentFormSection: FinalQuestionnaireFormSection | null
  currentScale: FinalQuestionnaireScale | null
  totalItems: number
  contentItems: Array<{ type: 'scale' | 'form-section'; position: number; id: string; label: string; completed: boolean; index: number }>
  units?: Array<{ type: 'SCALE' | 'FORM_SECTION'; id: string; position: number; label: string; completed: boolean; index: number }>
  formSections?: FinalQuestionnaireFormSection[]
  sessionId?: string
}

export interface FinalQuestionnaireAssessmentProps {
  data: FinalQuestionnaireData
  publicMode?: boolean
  post: (path: string, body: unknown) => Promise<ApiResponse<unknown>>
  onReload: () => Promise<void>
  onExit: () => void
  onCompleted: () => void
  onRestart?: () => Promise<void> | void
}

const parseOptions = (options: FinalQuestionnaireFormSection['items'][number]['options']): FormOption[] => {
  if (Array.isArray(options)) return options
  if (typeof options !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(options)
    return Array.isArray(parsed)
      ? parsed.filter((option): option is FormOption => Boolean(option) && typeof option === 'object' && typeof (option as any).value === 'string' && typeof (option as any).label === 'string')
      : []
  } catch {
    return []
  }
}

const isEmpty = (value: FormValue | undefined) => value === null || value === undefined || (Array.isArray(value) ? value.length === 0 : !String(value).trim())

const apiResponseError = (response: ApiResponse<unknown>) => {
  const error = new Error(response.message || '提交失败') as Error & { status?: number; code?: number | string }
  error.code = response.code
  if (typeof response.code === 'number') error.status = response.code
  if (response.code === 'ASSESSMENT_SUBMIT_BUSY' || response.code === 'COMPLETION_BUSY') error.status = 503
  if (response.code === 'FORM_ANSWER_INVALID') error.status = 400
  return error
}

const draftKeyFor = (data: FinalQuestionnaireData) => {
  if (data.currentFormSection) return `questionnaire-form-section:${data.questionnaireAssessment.id}:${data.currentFormSection.id}`
  if (data.currentScale) return `questionnaire-scale:${data.currentScale.scaleAssessmentId}`
  return null
}

const ensureDraft = async (data: FinalQuestionnaireData, key: string): Promise<FinalDraftMeta> => {
  const definitionHash = data.currentFormSection?.definitionHash || data.currentScale?.definitionHash
  if (!definitionHash) throw new Error('问卷内容缺少冻结定义，请重启测评')
  return finalDraftStore.ensure(createFinalDraftMeta({
    draftKey: key,
    instrument: data.currentFormSection ? 'questionnaire-form-section' : 'scale',
    attemptId: data.currentFormSection ? data.questionnaireAssessment.id : data.currentScale!.scaleAssessmentId,
    attemptEpoch: data.questionnaireAssessment.attemptEpoch,
    definitionHash,
    contextSnapshotHash: data.contextSnapshotHash ?? data.questionnaireAssessment.context?.snapshotHash ?? null,
    deliveryMode: 'final_only',
    submissionId: checkpointId(),
  }))
}

const FinalQuestionnaireAssessment: React.FC<FinalQuestionnaireAssessmentProps> = ({ data, publicMode = false, post, onReload, onExit, onCompleted, onRestart }) => {
  const [sectionIndex, setSectionIndex] = useState(0)
  const [scaleIndex, setScaleIndex] = useState(0)
  const [formValues, setFormValues] = useState<Record<string, FormValue>>({})
  const [scaleValues, setScaleValues] = useState<Record<string, ResponseValue>>({})
  const [meta, setMeta] = useState<FinalDraftMeta | null>(null)
  const [loadingDraft, setLoadingDraft] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requiresRestart, setRequiresRestart] = useState(false)
  const scaleDeviceInputProvenanceRef = useRef<{ scaleId: string; value: DeviceInputProvenanceV1 } | null>(null)

  const currentKey = draftKeyFor(data)
  const { schedule: scheduleLocalSave, flush: flushLocalSaves, status: localSaveStatus } = useLocalDraftSaveQueue(currentKey)
  const currentUnitKey = `${data.questionnaireAssessment.id}:${data.currentFormSection?.id || data.currentScale?.scaleAssessmentId || 'complete'}`
  const currentSection = data.currentFormSection
  const currentScale = data.currentScale
  const currentScaleId = currentScale?.scaleAssessmentId ?? null
  const currentScaleServerProvenanceJson = currentScale?.deviceInputProvenance
    ? JSON.stringify(currentScale.deviceInputProvenance)
    : null
  const draftLocked = Boolean(meta && (meta.status !== 'DRAFT' || meta.sealedSubmission))

  const loadAssessmentImage = useCallback(async (assetId: string): Promise<Blob> => {
    let url: string
    if (currentSection) {
      url = publicMode
        ? `/api/public/assessments/${data.sessionId}/form-sections/${currentSection.id}/assets/${assetId}`
        : `/api/questionnaires/assessments/${data.questionnaireAssessment.id}/form-sections/${currentSection.id}/assets/${assetId}`
    } else if (currentScale) {
      url = publicMode
        ? `/api/public/assessments/${data.sessionId}/scale/${currentScale.scaleAssessmentId}/assets/${assetId}`
        : `/api/questionnaires/assessments/${data.questionnaireAssessment.id}/scales/${currentScale.scaleAssessmentId}/assets/${assetId}`
    } else {
      throw new Error('当前没有可加载视觉内容的冻结单元')
    }
    let response: Response
    if (publicMode) {
      const capability = readQuestionnaireResumeTokenForSession(data.sessionId)
      if (!capability) throw new Error('缺少问卷恢复凭据')
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${capability}` },
        credentials: 'omit',
      })
    } else {
      response = await sessionFetch(url)
    }
    if (!response.ok) throw new Error(`视觉内容加载失败 (${response.status})`)
    return response.blob()
  }, [currentScale, currentSection, data.questionnaireAssessment.id, data.sessionId, publicMode])

  const loadQuestionnaireVideoCapability = useCallback(async (path: string) => {
    if (!publicMode) return requestAssessmentVideoCapabilities(path)
    const capability = readQuestionnaireResumeTokenForSession(data.sessionId)
    if (!capability) throw new Error('缺少问卷恢复凭据')
    return requestAssessmentVideoCapabilities(path, {
      headers: { Authorization: `Bearer ${capability}` },
      credentials: 'omit',
    })
  }, [data.sessionId, publicMode])

  useEffect(() => {
    setSectionIndex(0)
    setScaleIndex(0)
    setError(null)
  }, [currentUnitKey])

  useEffect(() => {
    let cancelled = false
    const loadDraft = async () => {
      setLoadingDraft(true)
      if (!currentKey) {
        if (!cancelled) setLoadingDraft(false)
        return
      }
      if (data.questionnaireAssessment.status === 'COMPLETED') {
        await finalDraftStore.delete(currentKey).catch(() => undefined)
        if (!cancelled) setLoadingDraft(false)
        return
      }
      try {
        const nextMeta = await ensureDraft(data, currentKey)
        if (currentScaleId) {
          const scaleId = currentScaleId
          const storedProvenance = readScaleDeviceInputProvenance(nextMeta.instrumentMetadata)
          const existing = scaleDeviceInputProvenanceRef.current?.scaleId === scaleId
            ? scaleDeviceInputProvenanceRef.current.value
            : null
          const provenance = resolveScaleDeviceInputProvenance({
            metadata: nextMeta.instrumentMetadata,
            serverValue: currentScaleServerProvenanceJson ? JSON.parse(currentScaleServerProvenanceJson) : undefined,
            existing,
          })
          scaleDeviceInputProvenanceRef.current = { scaleId, value: provenance }
          if (!storedProvenance && nextMeta.status === 'DRAFT' && !nextMeta.sealedSubmission) {
            await finalDraftStore.setInstrumentMetadata(currentKey, {
              [SCALE_DEVICE_INPUT_PROVENANCE_METADATA_KEY]: provenance,
            }).catch(() => null)
          }
        }
        const answers = await finalDraftStore.listAnswers(currentKey)
        if (cancelled) return
        const nextForm: Record<string, FormValue> = {}
        const nextScale: Record<string, ResponseValue> = {}
        answers.forEach((answer) => {
          if (currentSection) nextForm[answer.itemKey] = answer.value as FormValue
          else {
            const stored = answer.value as { responseValue?: ResponseValue } | ResponseValue
            nextScale[answer.itemKey] = typeof stored === 'object' && stored !== null && 'responseValue' in stored
              ? stored.responseValue as ResponseValue
              : stored as ResponseValue
          }
        })
        setMeta(nextMeta)
        setFormValues(nextForm)
        setScaleValues(nextScale)
        setRequiresRestart(nextMeta.status === 'CONFLICT')
        if (nextMeta.status === 'CONFLICT') {
          setError(nextMeta.errorMessage || '本地草稿与当前测评版本不一致，请重新开始测评')
        } else if (nextMeta.status !== 'DRAFT') {
          setError(nextMeta.sealedSubmission
            ? '当前单元已有一份已封存提交；再次提交只会重放相同内容。'
            : '检测到旧版未确认提交；请先核对服务器终态，不能重新生成提交内容。')
        } else {
          setError(null)
        }
      } catch (cause) {
        if (!cancelled) {
          setRequiresRestart((cause as { code?: string })?.code === 'FINAL_DRAFT_IDENTITY_CONFLICT')
          setError(normalizeApiError(cause).message)
        }
      } finally {
        if (!cancelled) setLoadingDraft(false)
      }
    }
    void loadDraft()
    return () => { cancelled = true }
  }, [currentKey, currentUnitKey, currentSection, currentScaleId, currentScaleServerProvenanceJson, data])

  useEffect(() => {
    if (data.questionnaireAssessment.status === 'COMPLETED') onCompleted()
  }, [data.questionnaireAssessment.status, onCompleted])

  const contextText = data.questionnaireAssessment.context?.status === 'frozen'
    ? '上下文已冻结，后续模块将使用同一份快照。'
    : currentSection?.contextSection
      ? '这是首个上下文区段；提交后会冻结本次测评上下文。'
      : '当前答案只保存在本地草稿中。'

  const saveFormValue = (itemId: string, value: FormValue) => {
    if (!currentKey || submitting || draftLocked) return
    setError(null)
    setFormValues((previous) => ({ ...previous, [itemId]: value }))
    void scheduleLocalSave(`form:${itemId}`, async () => {
      await finalDraftStore.putAnswer({ draftKey: currentKey, itemKey: itemId, value, updatedAt: Date.now() })
    })
  }

  const saveScaleValue = (itemCode: string, value: ResponseValue) => {
    if (!currentKey || submitting || draftLocked) return
    setError(null)
    setScaleValues((previous) => ({ ...previous, [itemCode]: value }))
    void scheduleLocalSave(`scale:${itemCode}`, async () => {
      await finalDraftStore.putAnswer({ draftKey: currentKey, itemKey: itemCode, value: { responseValue: value }, updatedAt: Date.now() })
    })
  }

  const flushOrShowError = async () => {
    try {
      await flushLocalSaves()
      return true
    } catch (cause) {
      setError(`本机保存失败：${normalizeApiError(cause).message}`)
      return false
    }
  }

  const goToFormIndex = async (nextIndex: number) => {
    if (!(await flushOrShowError())) return
    setSectionIndex(Math.max(0, Math.min(currentSection ? currentSection.items.length - 1 : 0, nextIndex)))
  }

  const goToScaleIndex = async (nextIndex: number) => {
    if (!(await flushOrShowError())) return
    setScaleIndex(Math.max(0, Math.min(currentScale ? currentScale.definition.items.length - 1 : 0, nextIndex)))
  }

  const exitAfterFlush = async () => {
    if (!(await flushOrShowError())) return
    onExit()
  }

  const recordSubmissionFailure = async (draftKey: string, cause: unknown) => {
    const nextMeta = await recordFinalSubmissionFailure(draftKey, cause, meta?.submissionId).catch(() => finalDraftStore.get(draftKey)).catch(() => meta ? ({ ...meta, status: 'RETRY_PENDING' as const }) : null)
    if (nextMeta) setMeta(nextMeta)
    setRequiresRestart(nextMeta?.status === 'CONFLICT')
    setError(normalizeApiError(cause).message)
  }

  const submitSection = async () => {
    if (!currentSection || !currentKey || !meta || submitting) return
    if (!(await flushOrShowError())) return
    const missing = currentSection.items.filter((item) => item.required && isEmpty(formValues[item.id]))
    if (missing.length > 0) {
      setSectionIndex(Math.max(0, currentSection.items.findIndex((item) => item.required && isEmpty(formValues[item.id]))))
      setError(`还有 ${missing.length} 个必填字段未完成`)
      return
    }
    try {
      setSubmitting(true)
      setError(null)
      const sealed = await finalDraftStore.sealForSubmission(currentKey, (snapshot) => {
        const answerMap = new Map(snapshot.answers.map((answer) => [answer.itemKey, answer.value as FormValue] as const))
        const missingStored = currentSection.items.filter((item) => item.required && isEmpty(answerMap.get(item.id)))
        if (missingStored.length > 0) throw new Error(`还有 ${missingStored.length} 个必填字段尚未保存，请确认后再提交`)
        currentSection.items.forEach((item) => {
          assertFormItemRequiredVideosComplete({
            meta: snapshot.meta,
            draftKey: currentKey,
            itemId: item.id,
            options: item.options,
          })
        })
        return {
          submissionId: snapshot.meta.submissionId,
          attemptEpoch: snapshot.meta.attemptEpoch,
          definitionHash: snapshot.meta.definitionHash,
          contextSnapshotHash: snapshot.meta.contextSnapshotHash,
          answers: currentSection.items.map((item) => ({ formItemId: item.id, value: answerMap.get(item.id) ?? null })),
        }
      })
      if (!sealed) throw new Error('本地问卷区段草稿不存在，请重新加载')
      await runFinalDraftCapacityRetry({
        onRetry: async ({ error }) => {
          await finalDraftStore.setStatus(currentKey, 'RETRY_PENDING', {
            code: String((error as any)?.code || 'ASSESSMENT_SUBMIT_BUSY'),
            message: normalizeApiError(error).message,
          }).catch(() => null)
          setError('提交繁忙，正在自动重试…')
        },
        operation: async () => {
          const next = await post(publicMode
            ? `/assessments/${data.sessionId}/form-sections/${currentSection.id}/submit`
            : `/questionnaires/assessments/${data.questionnaireAssessment.id}/form-sections/${currentSection.id}/submit`, sealed.payload)
          if (next.code !== 0) throw apiResponseError(next)
          return next
        },
      })
      await finalDraftStore.setStatus(currentKey, 'COMPLETED')
      await finalDraftStore.delete(currentKey)
      await onReload()
    } catch (cause) {
      if (cause instanceof QuestionnaireRequiredVideoCompletionError) {
        const nextIndex = currentSection.items.findIndex((item) => item.id === cause.itemKey)
        if (nextIndex >= 0) setSectionIndex(nextIndex)
      }
      await recordSubmissionFailure(currentKey, cause)
    } finally {
      setSubmitting(false)
    }
  }

  const submitScale = async () => {
    if (!currentScale || !currentKey || !meta || submitting) return
    if (!(await flushOrShowError())) return
    const missing = currentScale.definition.items.filter((item) => item.required && scaleValues[item.itemCode] === undefined)
    if (missing.length > 0) {
      setScaleIndex(Math.max(0, currentScale.definition.items.findIndex((item) => item.required && scaleValues[item.itemCode] === undefined)))
      setError(`还有 ${missing.length} 道必答题未作答`)
      return
    }
    try {
      setSubmitting(true)
      setError(null)
      const sealed = await finalDraftStore.sealForSubmission(currentKey, (snapshot) => {
        const answerMap = new Map(snapshot.answers.map((answer) => {
          const stored = answer.value as { responseValue?: ResponseValue } | ResponseValue
          return [answer.itemKey, typeof stored === 'object' && stored !== null && 'responseValue' in stored
            ? stored.responseValue
            : stored] as const
        }))
        const missingStored = currentScale.definition.items.filter((item) => item.required && answerMap.get(item.itemCode) === undefined)
        if (missingStored.length > 0) throw new Error(`还有 ${missingStored.length} 道必答题尚未保存，请确认后再提交`)
        assertScaleRequiredVideosComplete({
          meta: snapshot.meta,
          draftKey: currentKey,
          items: currentScale.definition.items,
        })
        const provenance = readScaleDeviceInputProvenance(snapshot.meta.instrumentMetadata)
        return {
          submissionId: snapshot.meta.submissionId,
          attemptEpoch: snapshot.meta.attemptEpoch,
          definitionHash: snapshot.meta.definitionHash,
          contextSnapshotHash: snapshot.meta.contextSnapshotHash,
          answers: currentScale.definition.items
            .filter((item) => answerMap.get(item.itemCode) !== undefined)
            .map((item) => ({ itemCode: item.itemCode, responseValue: answerMap.get(item.itemCode) as ResponseValue })),
          ...(provenance ? { deviceInputProvenance: provenance } : {}),
        }
      })
      if (!sealed) throw new Error('本地问卷量表草稿不存在，请重新加载')
      await runFinalDraftCapacityRetry({
        onRetry: async ({ error }) => {
          await finalDraftStore.setStatus(currentKey, 'RETRY_PENDING', {
            code: String((error as any)?.code || 'ASSESSMENT_SUBMIT_BUSY'),
            message: normalizeApiError(error).message,
          }).catch(() => null)
          setError('提交繁忙，正在自动重试…')
        },
        operation: async () => {
          const next = await post(publicMode
            ? `/assessments/${data.sessionId}/scale/${currentScale.scaleAssessmentId}/submit`
            : `/questionnaires/assessments/${data.questionnaireAssessment.id}/scales/${currentScale.scaleAssessmentId}/submit`, sealed.payload)
          if (next.code !== 0) throw apiResponseError(next)
          return next
        },
      })
      await finalDraftStore.setStatus(currentKey, 'COMPLETED')
      await finalDraftStore.delete(currentKey)
      await onReload()
    } catch (cause) {
      if (cause instanceof QuestionnaireRequiredVideoCompletionError) {
        const nextIndex = currentScale.definition.items.findIndex((item) => item.itemCode === cause.itemKey)
        if (nextIndex >= 0) setScaleIndex(nextIndex)
      }
      await recordSubmissionFailure(currentKey, cause)
    } finally {
      setSubmitting(false)
    }
  }

  const contentUnits = data.units || data.contentItems
  const title = data.questionnaire?.name || '问卷测评'
  const completedUnitCount = contentUnits.filter((unit) => unit.completed).length
  const totalUnitCount = Math.max(contentUnits.length, data.totalItems, 1)
  const submissionStatus = submitting
    ? { state: 'submitting' as const, message: '答案已锁定，正在提交当前单元的同一份 FINAL。' }
    : meta?.status === 'SUBMITTING'
      ? { state: 'reconciling' as const, message: '当前单元已有封存提交，正在等待服务器终态确认。' }
      : meta?.status === 'RETRY_PENDING'
        ? { state: 'pending' as const, message: meta.errorMessage || '提交状态尚未确认；答案保持锁定，后续只重放同一份封存内容。' }
        : meta?.status === 'COMPLETED'
          ? { state: 'committed' as const, message: '服务器已确认当前单元的权威结果。' }
          : { state: 'ready' as const }
  const recoveryState = requiresRestart || meta?.status === 'CONFLICT'
    ? { state: 'blocked' as const, message: '本地草稿已保留。当前测评版本已变化，需要重启后继续。' }
    : { state: 'none' as const }

  if (loadingDraft) return <div className="flex items-center justify-center h-64 text-gray-500">正在恢复本地草稿...</div>
  if (data.questionnaireAssessment.status === 'COMPLETED') return null

  return (
    <AssessmentShell
      title={title}
      eyebrow="问卷测评"
      instructions={(
        <div className="space-y-2">
          {data.questionnaire?.instruction ? <p>{data.questionnaire.instruction}</p> : null}
          <p>{contextText} 页面刷新或离线时会从 IndexedDB 恢复。</p>
        </div>
      )}
      progress={{ kind: 'count', completed: completedUnitCount, total: totalUnitCount, label: '问卷单元进度' }}
      saveStatus={localSaveStatus}
      submissionStatus={submissionStatus}
      recoveryState={recoveryState}
      actions={(
        <button type="button" onClick={() => void exitAfterFlush()} className="btn-secondary min-h-11">
          <Save className="w-4 h-4 inline mr-1" />保存并退出
        </button>
      )}
      navigation={(
        <section aria-label="提交单元" className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-600">提交单元</p>
          <div className="flex flex-wrap gap-2">
            {contentUnits.map((unit) => (
              <span
                key={`${unit.type}-${unit.id}`}
                className={`rounded px-3 py-1 text-sm ${unit.completed ? 'bg-green-100 text-green-700' : unit.index === data.questionnaireAssessment.currentIndex ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {unit.index + 1}. {unit.label}
              </span>
            ))}
          </div>
        </section>
      )}
    >
      {error ? <p role="alert" className="mb-4 text-sm text-red-700">{error}</p> : null}
      {requiresRestart && onRestart ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>本地草稿已保留。当前测评版本已变化，请重启后继续。</span>
          <button type="button" onClick={() => void onRestart()} disabled={submitting} className="btn-primary min-h-11 whitespace-nowrap">重启并继续</button>
        </div>
      ) : null}

      {currentSection && (
        <div>
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <p className="text-sm text-slate-500"><FileText className="mr-1 inline h-4 w-4" />表单区段</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{currentSection.title}</h2>
            {currentSection.description ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{currentSection.description}</p> : null}
          </div>
          {(() => {
            const item = currentSection.items[sectionIndex]
            if (!item) return currentSection.contextSection
              ? <p role="alert" className="text-amber-800">历史背景信息区段缺少字段。请联系教师发布修复版本后重新开始，已提交记录会保留。</p>
              : <div className="space-y-3"><p className="text-gray-600">此历史区段没有字段。确认后会提交空区段记录并继续。</p><button type="button" className="btn-primary" disabled={submitting || requiresRestart} onClick={() => void submitSection()}>{submitting ? '正在提交…' : '确认并继续'}</button></div>
            const value = formValues[item.id]
            const options = parseOptions(item.options)
            const imageItems = assessmentOptionImageItems(options)
            const videoEntries = formOptionVideoPresentations(options)
            return (
              <AssessmentImageGate items={imageItems} loadAsset={loadAssessmentImage} disabled={submitting} ariaLabel={`${item.label} 选项视觉内容`}>
                <FormOptionVideoGroupGate
                  entries={videoEntries}
                  loadSources={(entry) => loadQuestionnaireVideoCapability(publicMode
                    ? `/api/public/assessments/${encodeURIComponent(data.sessionId || '')}/form-sections/${encodeURIComponent(currentSection.id)}/items/${encodeURIComponent(item.id)}/options/${entry.optionIndex}/video-capability`
                    : `/api/questionnaires/assessments/${encodeURIComponent(data.questionnaireAssessment.id)}/form-sections/${encodeURIComponent(currentSection.id)}/items/${encodeURIComponent(item.id)}/options/${entry.optionIndex}/video-capability`)}
                  requiredViewing={currentKey ? {
                    draftKey: currentKey,
                    slotKeyPrefix: formItemVideoSlotPrefix(item.id),
                  } : undefined}
                >
                  <FormPlayer
                    item={{
                      id: item.id,
                      type: item.type,
                      label: item.label,
                      placeholder: item.placeholder,
                      required: item.required,
                    }}
                    options={options}
                    value={value}
                    disabled={draftLocked || requiresRestart}
                    position={sectionIndex + 1}
                    total={currentSection.items.length}
                    onChange={(nextValue) => saveFormValue(item.id, nextValue)}
                    onPrevious={() => void goToFormIndex(sectionIndex - 1)}
                    onNext={sectionIndex < currentSection.items.length - 1
                      ? () => void goToFormIndex(sectionIndex + 1)
                      : undefined}
                    onSubmit={sectionIndex === currentSection.items.length - 1 ? submitSection : undefined}
                    submitting={submitting}
                  />
                </FormOptionVideoGroupGate>
              </AssessmentImageGate>
            )
          })()}
        </div>
      )}

      {currentScale && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div><p className="text-sm text-slate-500"><Layers className="w-4 h-4 inline mr-1" />量表</p><h2 className="text-xl font-semibold text-slate-900">{currentScale.name}</h2></div>
            <span className="text-sm text-slate-500">题目 {scaleIndex + 1} / {currentScale.definition.items.length}</span>
          </div>
          {currentScale.instruction ? <p className="mb-5 whitespace-pre-wrap text-sm text-slate-600">{currentScale.instruction}</p> : null}
          {(() => {
            const item = currentScale.definition.items[scaleIndex]
            if (!item) return <p className="text-gray-500">量表题目为空。</p>
            const imageItems = assessmentImageItems(item.images)
            const videoPresentation = scaleItemVideoPresentation(item)
            return (
              <AssessmentImageGate items={imageItems} loadAsset={loadAssessmentImage} disabled={submitting} ariaLabel={`${item.content} 视觉内容`}>
                <ScaleFormVideoGate
                  presentation={videoPresentation}
                  loadSources={() => loadQuestionnaireVideoCapability(publicMode
                    ? `/api/public/assessments/${encodeURIComponent(data.sessionId || '')}/scale/${encodeURIComponent(currentScale.scaleAssessmentId)}/items/${encodeURIComponent(item.itemCode)}/video-capability`
                    : `/api/questionnaires/assessments/${encodeURIComponent(data.questionnaireAssessment.id)}/scales/${encodeURIComponent(currentScale.scaleAssessmentId)}/items/${encodeURIComponent(item.itemCode)}/video-capability`)}
                  ariaLabel={`${item.content} 视频内容`}
                  requiredViewing={currentKey ? {
                    draftKey: currentKey,
                    slotKey: scaleItemVideoSlotKey(item.itemCode),
                  } : undefined}
                >
                  <ScalePlayer
                    item={item}
                    value={scaleValues[item.itemCode]}
                    answerDisabled={draftLocked}
                    submitDisabled={requiresRestart}
                    position={scaleIndex + 1}
                    total={currentScale.definition.items.length}
                    onChange={(nextValue) => saveScaleValue(item.itemCode, nextValue)}
                    onPrevious={() => void goToScaleIndex(scaleIndex - 1)}
                    onNext={scaleIndex < currentScale.definition.items.length - 1
                      ? () => void goToScaleIndex(scaleIndex + 1)
                      : undefined}
                    onSubmit={scaleIndex === currentScale.definition.items.length - 1 ? submitScale : undefined}
                    submitting={submitting}
                  />
                </ScaleFormVideoGate>
              </AssessmentImageGate>
            )
          })()}
        </div>
      )}
    </AssessmentShell>
  )
}

export default FinalQuestionnaireAssessment
