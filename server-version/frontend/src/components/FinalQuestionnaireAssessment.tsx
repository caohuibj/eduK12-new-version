import React, { useEffect, useRef, useState } from 'react'
import { CheckCircle, ChevronLeft, ChevronRight, FileText, Layers, Save } from 'lucide-react'
import { checkpointId } from '../services/persistence/checkpointTypes'
import {
  createFinalDraftMeta,
  finalDraftStore,
  type FinalDraftMeta,
} from '../services/persistence/finalDraftStore'
import { runFinalDraftCapacityRetry } from '../services/persistence/finalDraftCapacityRetry'
import { normalizeApiError } from '../utils/normalizeApiError'
import type { ApiResponse } from '../types'
import {
  SCALE_DEVICE_INPUT_PROVENANCE_METADATA_KEY,
  resolveScaleDeviceInputProvenance,
  readScaleDeviceInputProvenance,
  type DeviceInputProvenanceV1,
} from '../modules/scale/device-input-provenance'

type ResponseValue = string | number
type FormValue = string | string[] | null

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
    options: Array<{ value: string; label: string }> | string | null
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

const parseOptions = (options: FinalQuestionnaireFormSection['items'][number]['options']) => {
  if (Array.isArray(options)) return options
  if (typeof options !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(options)
    return Array.isArray(parsed)
      ? parsed.filter((option): option is { value: string; label: string } => Boolean(option) && typeof option === 'object' && typeof (option as any).value === 'string' && typeof (option as any).label === 'string')
      : []
  } catch {
    return []
  }
}

const isEmpty = (value: FormValue | undefined) => value === null || value === undefined || (Array.isArray(value) ? value.length === 0 : !String(value).trim())

const finalErrorStatus = (error: unknown) => {
  const normalized = normalizeApiError(error)
  const code = String(normalized.code ?? '')
  return normalized.status === 409 || code === '409' || code === 'STALE_ATTEMPT' || code === 'DEFINITION_MISMATCH' || code === 'SUBMISSION_PAYLOAD_CONFLICT'
    ? 'CONFLICT' as const
    : 'RETRY_PENDING' as const
}

const apiResponseError = (response: ApiResponse<unknown>) => {
  const error = new Error(response.message || '提交失败') as Error & { status?: number; code?: number | string }
  error.code = response.code
  if (typeof response.code === 'number') error.status = response.code
  if (response.code === 'ASSESSMENT_SUBMIT_BUSY' || response.code === 'COMPLETION_BUSY') error.status = 503
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
  const currentUnitKey = `${data.questionnaireAssessment.id}:${data.currentFormSection?.id || data.currentScale?.scaleAssessmentId || 'complete'}`
  const currentSection = data.currentFormSection
  const currentScale = data.currentScale

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
      try {
        const nextMeta = await ensureDraft(data, currentKey)
        if (currentScale) {
          const scaleId = currentScale.scaleAssessmentId
          const storedProvenance = readScaleDeviceInputProvenance(nextMeta.instrumentMetadata)
          const existing = scaleDeviceInputProvenanceRef.current?.scaleId === scaleId
            ? scaleDeviceInputProvenanceRef.current.value
            : null
          const provenance = resolveScaleDeviceInputProvenance({
            metadata: nextMeta.instrumentMetadata,
            serverValue: currentScale.deviceInputProvenance,
            existing,
          })
          scaleDeviceInputProvenanceRef.current = { scaleId, value: provenance }
          if (!storedProvenance) {
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
        setError(nextMeta.status === 'CONFLICT' ? (nextMeta.errorMessage || '本地草稿与当前测评版本不一致，请重新开始测评') : null)
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
  }, [currentKey, currentUnitKey, currentSection, data])

  useEffect(() => {
    if (data.questionnaireAssessment.status === 'COMPLETED') onCompleted()
  }, [data.questionnaireAssessment.status, onCompleted])

  const contextText = data.questionnaireAssessment.context?.status === 'frozen'
    ? '上下文已冻结，后续模块将使用同一份快照。'
    : currentSection?.contextSection
      ? '这是首个上下文区段；提交后会冻结本次测评上下文。'
      : '当前答案只保存在本地草稿中。'

  const saveFormValue = async (itemId: string, value: FormValue) => {
    if (!currentKey || submitting) return
    setFormValues((previous) => ({ ...previous, [itemId]: value }))
    try {
      await finalDraftStore.putAnswer({ draftKey: currentKey, itemKey: itemId, value, updatedAt: Date.now() })
      setError(null)
    } catch (cause) {
      setError(normalizeApiError(cause).message)
    }
  }

  const saveScaleValue = async (itemCode: string, value: ResponseValue) => {
    if (!currentKey || submitting) return
    setScaleValues((previous) => ({ ...previous, [itemCode]: value }))
    try {
      await finalDraftStore.putAnswer({ draftKey: currentKey, itemKey: itemCode, value: { responseValue: value }, updatedAt: Date.now() })
      setError(null)
      if (currentScale && scaleIndex < currentScale.definition.items.length - 1) setScaleIndex((index) => index + 1)
    } catch (cause) {
      setError(normalizeApiError(cause).message)
    }
  }

  const submitSection = async () => {
    if (!currentSection || !currentKey || !meta || submitting) return
    const answers = currentSection.items.map((item) => ({ formItemId: item.id, value: formValues[item.id] ?? null }))
    const missing = currentSection.items.filter((item) => item.required && isEmpty(formValues[item.id]))
    if (missing.length > 0) {
      setSectionIndex(Math.max(0, currentSection.items.findIndex((item) => item.required && isEmpty(formValues[item.id]))))
      setError(`还有 ${missing.length} 个必填字段未完成`)
      return
    }
    try {
      setSubmitting(true)
      setError(null)
      await finalDraftStore.setStatus(currentKey, 'SUBMITTING')
      const response = await runFinalDraftCapacityRetry({
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
            : `/questionnaires/assessments/${data.questionnaireAssessment.id}/form-sections/${currentSection.id}/submit`, {
            submissionId: meta.submissionId,
            attemptEpoch: meta.attemptEpoch,
            definitionHash: meta.definitionHash,
            contextSnapshotHash: meta.contextSnapshotHash,
            answers,
            ...(currentScale && scaleDeviceInputProvenanceRef.current?.scaleId === currentScale.scaleAssessmentId
              ? { deviceInputProvenance: scaleDeviceInputProvenanceRef.current.value }
              : {}),
          })
          if (next.code !== 0) throw apiResponseError(next)
          return next
        },
      })
      await finalDraftStore.setStatus(currentKey, 'COMPLETED')
      await finalDraftStore.delete(currentKey)
      await onReload()
    } catch (cause) {
      const status = finalErrorStatus(cause)
      const nextMeta = await finalDraftStore.setStatus(currentKey, status, { code: String((cause as any)?.code || ''), message: normalizeApiError(cause).message }).catch(() => null)
      if (nextMeta) setMeta(nextMeta)
      setRequiresRestart(status === 'CONFLICT')
      setError(normalizeApiError(cause).message)
    } finally {
      setSubmitting(false)
    }
  }

  const submitScale = async () => {
    if (!currentScale || !currentKey || !meta || submitting) return
    const missing = currentScale.definition.items.filter((item) => item.required && scaleValues[item.itemCode] === undefined)
    if (missing.length > 0) {
      setScaleIndex(Math.max(0, currentScale.definition.items.findIndex((item) => item.required && scaleValues[item.itemCode] === undefined)))
      setError(`还有 ${missing.length} 道必答题未作答`)
      return
    }
    const answers = currentScale.definition.items
      .filter((item) => scaleValues[item.itemCode] !== undefined)
      .map((item) => ({ itemCode: item.itemCode, responseValue: scaleValues[item.itemCode] }))
    try {
      setSubmitting(true)
      setError(null)
      await finalDraftStore.setStatus(currentKey, 'SUBMITTING')
      const response = await runFinalDraftCapacityRetry({
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
            : `/questionnaires/assessments/${data.questionnaireAssessment.id}/scales/${currentScale.scaleAssessmentId}/submit`, {
            submissionId: meta.submissionId,
            attemptEpoch: meta.attemptEpoch,
            definitionHash: meta.definitionHash,
            contextSnapshotHash: meta.contextSnapshotHash,
            answers,
          })
          if (next.code !== 0) throw apiResponseError(next)
          return next
        },
      })
      await finalDraftStore.setStatus(currentKey, 'COMPLETED')
      await finalDraftStore.delete(currentKey)
      await onReload()
    } catch (cause) {
      const status = finalErrorStatus(cause)
      const nextMeta = await finalDraftStore.setStatus(currentKey, status, { code: String((cause as any)?.code || ''), message: normalizeApiError(cause).message }).catch(() => null)
      if (nextMeta) setMeta(nextMeta)
      setRequiresRestart(status === 'CONFLICT')
      setError(normalizeApiError(cause).message)
    } finally {
      setSubmitting(false)
    }
  }

  const contentUnits = data.units || data.contentItems
  const title = data.questionnaire?.name || '问卷测评'

  if (loadingDraft) return <div className="flex items-center justify-center h-64 text-gray-500">正在恢复本地草稿...</div>
  if (data.questionnaireAssessment.status === 'COMPLETED') return null

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
          <p className="text-sm text-gray-500">完成单元：{contentUnits.filter((unit) => unit.completed).length} / {data.totalItems}（{data.questionnaireAssessment.progress}%）</p>
        </div>
        <button type="button" onClick={onExit} className="btn-secondary"><Save className="w-4 h-4 inline mr-1" />保存并退出</button>
      </div>
      <p className="text-sm text-gray-500 mb-4">{contextText} 页面刷新或离线时会从 IndexedDB 恢复。</p>
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {requiresRestart && onRestart && <div className="mb-4 flex items-center justify-between gap-3 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><span>本地草稿已保留。当前测评版本已变化，请重启后继续。</span><button type="button" onClick={() => void onRestart()} disabled={submitting} className="btn-primary whitespace-nowrap">重启并继续</button></div>}

      {currentSection && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-5"><div><p className="text-sm text-gray-500"><FileText className="w-4 h-4 inline mr-1" />表单区段</p><h2 className="text-xl font-semibold">{currentSection.title}</h2></div><span className="text-sm text-gray-500">字段 {sectionIndex + 1} / {currentSection.items.length}</span></div>
          {currentSection.description && <p className="text-sm text-gray-600 mb-5 whitespace-pre-wrap">{currentSection.description}</p>}
          {(() => {
            const item = currentSection.items[sectionIndex]
            if (!item) return <p className="text-gray-500">该区段没有字段。</p>
            const value = formValues[item.id]
            const options = parseOptions(item.options)
            return <div>
              <h3 className="text-lg font-medium mb-4">{item.label}{item.required && <span className="text-red-500 text-sm ml-2">必填</span>}</h3>
              {item.type === 'single_choice' && <div className="space-y-2">{options.map((option) => <button type="button" key={option.value} onClick={() => void saveFormValue(item.id, option.value)} disabled={submitting} className={`block w-full text-left border rounded px-4 py-3 ${value === option.value ? 'border-primary bg-primary/5 text-primary' : 'hover:border-gray-400'}`}>{option.label}</button>)}</div>}
              {item.type === 'multiple_choice' && <div className="space-y-2">{options.map((option) => { const values = Array.isArray(value) ? value : []; const selected = values.includes(option.value); return <button type="button" key={option.value} onClick={() => void saveFormValue(item.id, selected ? values.filter((entry) => entry !== option.value) : [...values, option.value])} disabled={submitting} className={`block w-full text-left border rounded px-4 py-3 ${selected ? 'border-primary bg-primary/5 text-primary' : 'hover:border-gray-400'}`}>{selected ? '✓ ' : ''}{option.label}</button> })}</div>}
              {item.type === 'year_month' && <input type="month" value={typeof value === 'string' ? value : ''} onChange={(event) => void saveFormValue(item.id, event.target.value)} disabled={submitting} className="w-full border rounded px-3 py-2" />}
              {(item.type === 'fill_blank' || item.type === 'text_input' || !['single_choice', 'multiple_choice', 'year_month'].includes(item.type)) && <textarea value={typeof value === 'string' ? value : ''} onChange={(event) => void saveFormValue(item.id, event.target.value)} disabled={submitting} placeholder={item.placeholder || '请输入'} className="w-full border rounded px-3 py-2 min-h-32" />}
              <div className="flex justify-between mt-6"><button type="button" onClick={() => setSectionIndex((index) => Math.max(0, index - 1))} disabled={sectionIndex === 0 || submitting} className="btn-secondary"><ChevronLeft className="w-4 h-4 inline" />上一字段</button>{sectionIndex < currentSection.items.length - 1 ? <button type="button" onClick={() => setSectionIndex((index) => Math.min(currentSection.items.length - 1, index + 1))} disabled={submitting} className="btn-secondary">下一字段<ChevronRight className="w-4 h-4 inline" /></button> : <button type="button" onClick={() => void submitSection()} disabled={submitting || requiresRestart} className="btn-primary"><CheckCircle className="w-4 h-4 inline mr-1" />{submitting ? '提交区段中...' : '提交整个区段'}</button>}</div>
            </div>
          })()}
        </div>
      )}

      {currentScale && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-5"><div><p className="text-sm text-gray-500"><Layers className="w-4 h-4 inline mr-1" />量表</p><h2 className="text-xl font-semibold">{currentScale.name}</h2></div><span className="text-sm text-gray-500">题目 {scaleIndex + 1} / {currentScale.definition.items.length}</span></div>
          {currentScale.instruction && <p className="text-sm text-gray-600 mb-5 whitespace-pre-wrap">{currentScale.instruction}</p>}
          {(() => {
            const item = currentScale.definition.items[scaleIndex]
            if (!item) return <p className="text-gray-500">量表题目为空。</p>
            return <div><h3 className="text-lg font-medium mb-5">{item.content}{item.required && <span className="text-red-500 text-sm ml-2">必答</span>}</h3><div className="space-y-2">{item.options.map((option) => <button type="button" key={`${typeof option.value}:${String(option.value)}`} onClick={() => void saveScaleValue(item.itemCode, option.value)} disabled={submitting} className={`block w-full text-left border rounded px-4 py-3 ${scaleValues[item.itemCode] === option.value ? 'border-primary bg-primary/5 text-primary' : 'hover:border-gray-400'}`}>{option.label}</button>)}</div><div className="flex justify-between mt-6"><button type="button" onClick={() => setScaleIndex((index) => Math.max(0, index - 1))} disabled={scaleIndex === 0 || submitting} className="btn-secondary"><ChevronLeft className="w-4 h-4 inline" />上一题</button>{scaleIndex < currentScale.definition.items.length - 1 ? <button type="button" onClick={() => setScaleIndex((index) => index + 1)} disabled={submitting} className="btn-secondary">下一题<ChevronRight className="w-4 h-4 inline" /></button> : <button type="button" onClick={() => void submitScale()} disabled={submitting || requiresRestart} className="btn-primary"><CheckCircle className="w-4 h-4 inline mr-1" />{submitting ? '提交量表中...' : '提交整份量表'}</button>}</div></div>
          })()}
        </div>
      )}

      <div className="mt-5 bg-white rounded shadow p-4"><p className="text-sm text-gray-500 mb-2">提交单元</p><div className="flex flex-wrap gap-2">{contentUnits.map((unit) => <span key={`${unit.type}-${unit.id}`} className={`px-3 py-1 rounded text-sm ${unit.completed ? 'bg-green-100 text-green-700' : unit.index === data.questionnaireAssessment.currentIndex ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>{unit.index + 1}. {unit.label}</span>)}</div></div>
    </div>
  )
}

export default FinalQuestionnaireAssessment
