import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle, ChevronLeft, ChevronRight, FileText, Layers, Save } from 'lucide-react'
import { sessionFetch } from '../api/client'
import type { ApiResponse } from '../types'
import type { CompositeAttemptState, CompositeCurrentItem } from '../modules/composite/types'
import AssessmentImageGate from '../modules/assessment-media/AssessmentImageGate'
import FormOptionVideoGroupGate from '../modules/assessment-media/FormOptionVideoGroupGate'
import ScaleFormVideoGate from '../modules/assessment-media/ScaleFormVideoGate'
import { assessmentImageItems, assessmentOptionImageItems } from '../modules/assessment-media/adapter'
import { formOptionVideoPresentations, scaleItemVideoPresentation } from '../modules/assessment-media/video-adapter'
import { requestAssessmentVideoCapabilities } from '../modules/assessment-media/video-capability-client'
import { checkpointId } from '../services/persistence/checkpointTypes'
import { createFinalDraftMeta, finalDraftStore, type FinalDraftMeta } from '../services/persistence/finalDraftStore'
import { runFinalDraftCapacityRetry } from '../services/persistence/finalDraftCapacityRetry'
import { normalizeApiError } from '../utils/normalizeApiError'
import {
  SCALE_DEVICE_INPUT_PROVENANCE_METADATA_KEY,
  readScaleDeviceInputProvenance,
  resolveScaleDeviceInputProvenance,
  type DeviceInputProvenanceV1,
} from '../modules/scale/device-input-provenance'

type ResponseValue = string | number
type FormValue = string | string[] | null
type FormOption = { value: string; label: string; images?: unknown; video?: unknown }

export interface FinalCompositeAssessmentProps {
  state: CompositeAttemptState
  publicMode?: boolean
  recoveryToken?: string
  submitFormSection: (attemptId: string, sectionId: string, input: { submissionId: string; attemptEpoch: number; definitionHash: string; contextSnapshotHash?: string | null; answers: Array<{ formItemId: string; value: FormValue }> }) => Promise<ApiResponse<unknown>>
  submitScale: (attemptId: string, itemId: string, input: { submissionId: string; attemptEpoch: number; definitionHash: string; contextSnapshotHash?: string | null; answers: Array<{ itemCode: string; responseValue: ResponseValue; responseTimeMs?: number }>; deviceInputProvenance?: DeviceInputProvenanceV1 }) => Promise<ApiResponse<unknown>>
  onReload: () => Promise<void>
  onExit: () => void
  onCompleted: () => void
  onEnterCognitive: (item: CompositeCurrentItem) => void
  onEnterSituational: (item: CompositeCurrentItem) => void
  onRestart?: () => Promise<void> | void
}

const parseOptions = (options: unknown): FormOption[] => {
  if (Array.isArray(options)) return options.filter((option): option is FormOption => Boolean(option) && typeof option === 'object' && typeof (option as any).value === 'string' && typeof (option as any).label === 'string')
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

const emptyValue = (value: FormValue | undefined) => value === null || value === undefined || (Array.isArray(value) ? value.length === 0 : !String(value).trim())

const responseError = (response: ApiResponse<unknown>) => {
  const error = new Error(response.message || '提交失败') as Error & { status?: number; code?: number | string }
  error.code = response.code
  if (typeof response.code === 'number') error.status = response.code
  if (response.code === 'ASSESSMENT_SUBMIT_BUSY' || response.code === 'COMPLETION_BUSY') error.status = 503
  return error
}

const errorStatus = (error: unknown) => {
  const normalized = normalizeApiError(error)
  const code = String(normalized.code ?? '')
  return normalized.status === 409 || code === '409' || code === 'STALE_ATTEMPT' || code === 'DEFINITION_MISMATCH' || code === 'SUBMISSION_PAYLOAD_CONFLICT'
    ? 'CONFLICT' as const
    : 'RETRY_PENDING' as const
}

const FinalCompositeAssessment: React.FC<FinalCompositeAssessmentProps> = ({ state, publicMode = false, recoveryToken, submitFormSection, submitScale, onReload, onExit, onCompleted, onEnterCognitive, onEnterSituational, onRestart }) => {
  const item = state.currentItem
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

  const isSection = item?.type === 'FORM_SECTION'
  const sectionId = isSection ? item?.formSectionId || item.id : null
  const scaleId = item?.type === 'SCALE' ? item.scaleAssessmentId || null : null
  const draftKey = sectionId
    ? `composite-form-section:${state.id}:${sectionId}`
    : scaleId
      ? `composite-scale:${scaleId}`
      : null
  const unitKey = `${state.id}:${item?.type || 'complete'}:${item?.id || ''}`

  const loadAssessmentImage = useCallback(async (assetId: string): Promise<Blob> => {
    if (!item) throw new Error('当前没有冻结测评单元')
    const prefix = publicMode ? '/api/public/composite-assessments' : '/api/composite-assessments'
    let path: string
    if (item.type === 'FORM_SECTION' && sectionId) {
      path = `${prefix}/attempts/${encodeURIComponent(state.id)}/form-sections/${encodeURIComponent(sectionId)}/assets/${encodeURIComponent(assetId)}/content`
    } else if (item.type === 'SCALE') {
      path = `${prefix}/attempts/${encodeURIComponent(state.id)}/items/${encodeURIComponent(item.id)}/scale/assets/${encodeURIComponent(assetId)}/content`
    } else {
      throw new Error('当前单元不支持视觉内容')
    }
    const publicCapability = recoveryToken || (typeof window === 'undefined' ? '' : window.sessionStorage.getItem(`composite:recovery:attempt:${state.id}`) || '')
    if (publicMode && !publicCapability) throw new Error('缺少综合测评恢复凭据')
    const response = await sessionFetch(path, publicMode ? { headers: { 'X-Recovery-Token': publicCapability } } : undefined)
    if (!response.ok) throw new Error(`视觉内容加载失败 (${response.status})`)
    return response.blob()
  }, [item, publicMode, recoveryToken, sectionId, state.id])

  const loadCompositeVideoCapability = useCallback(async (path: string) => {
    if (!publicMode) return requestAssessmentVideoCapabilities(path)
    const publicCapability = recoveryToken || (typeof window === 'undefined' ? '' : window.sessionStorage.getItem(`composite:recovery:attempt:${state.id}`) || '')
    if (!publicCapability) throw new Error('缺少综合测评恢复凭据')
    return requestAssessmentVideoCapabilities(path, { headers: { 'X-Recovery-Token': publicCapability } })
  }, [publicMode, recoveryToken, state.id])

  useEffect(() => {
    setSectionIndex(0)
    setScaleIndex(0)
    setError(null)
  }, [unitKey])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadingDraft(true)
      if (!draftKey || !item) {
        if (!cancelled) setLoadingDraft(false)
        return
      }
      if (state.status === 'COMPLETED') {
        await finalDraftStore.delete(draftKey).catch(() => undefined)
        if (!cancelled) setLoadingDraft(false)
        return
      }
      try {
        const definitionHash = item.definitionHash
        if (!definitionHash) throw new Error('综合测评内容缺少冻结定义，请重启测评')
        const nextMeta = await finalDraftStore.ensure(createFinalDraftMeta({
          draftKey,
          instrument: sectionId ? 'composite-form-section' : 'scale',
          attemptId: sectionId ? state.id : scaleId!,
          attemptEpoch: state.attemptEpoch ?? 1,
          definitionHash,
          contextSnapshotHash: state.contextSnapshotHash ?? state.context?.snapshotHash ?? null,
          deliveryMode: 'final_only',
          submissionId: checkpointId(),
        }))
        if (scaleId) {
          const storedProvenance = readScaleDeviceInputProvenance(nextMeta.instrumentMetadata)
          const existing = scaleDeviceInputProvenanceRef.current?.scaleId === scaleId
            ? scaleDeviceInputProvenanceRef.current.value
            : null
          const provenance = resolveScaleDeviceInputProvenance({
            metadata: nextMeta.instrumentMetadata,
            serverValue: item.deviceInputProvenance,
            existing,
          })
          scaleDeviceInputProvenanceRef.current = { scaleId, value: provenance }
          if (!storedProvenance && nextMeta.status === 'DRAFT' && !nextMeta.sealedSubmission) {
            await finalDraftStore.setInstrumentMetadata(draftKey, {
              [SCALE_DEVICE_INPUT_PROVENANCE_METADATA_KEY]: provenance,
            }).catch(() => null)
          }
        }
        let storedAnswers = await finalDraftStore.listAnswers(draftKey)
        if (nextMeta.status === 'DRAFT' && storedAnswers.length === 0) {
          if (sectionId) {
            const restored = item.formAnswers || item.answers || []
            for (const answer of restored as any[]) {
              if (!answer.formItemId) continue
              await finalDraftStore.putAnswer({
                draftKey,
                itemKey: answer.formItemId,
                value: answer.value ?? null,
                updatedAt: Date.now(),
              })
            }
          } else {
            for (const answer of (item.answers || []) as any[]) {
              if (!answer.itemCode || answer.responseValue === undefined) continue
              await finalDraftStore.putAnswer({
                draftKey,
                itemKey: answer.itemCode,
                value: { responseValue: answer.responseValue },
                updatedAt: Date.now(),
              })
            }
          }
          storedAnswers = await finalDraftStore.listAnswers(draftKey)
        }
        if (cancelled) return
        const nextForm: Record<string, FormValue> = {}
        const nextScale: Record<string, ResponseValue> = {}
        storedAnswers.forEach((answer) => {
          if (sectionId) nextForm[answer.itemKey] = answer.value as FormValue
          else {
            const value = answer.value as { responseValue?: ResponseValue } | ResponseValue
            nextScale[answer.itemKey] = typeof value === 'object' && value !== null && 'responseValue' in value
              ? value.responseValue as ResponseValue
              : value as ResponseValue
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
    void load()
    return () => { cancelled = true }
  }, [draftKey, unitKey, item, sectionId, scaleId, state.id, state.status, state.attemptEpoch, state.contextSnapshotHash, state.context?.snapshotHash])

  useEffect(() => {
    if (state.status === 'COMPLETED') onCompleted()
  }, [state.status, onCompleted])

  const saveForm = async (itemId: string, value: FormValue) => {
    if (!draftKey || submitting) return
    setFormValues((previous) => ({ ...previous, [itemId]: value }))
    try {
      await finalDraftStore.putAnswer({ draftKey, itemKey: itemId, value, updatedAt: Date.now() })
      setError(null)
    } catch (cause) {
      setError(normalizeApiError(cause).message)
    }
  }

  const saveScale = async (itemCode: string, value: ResponseValue) => {
    if (!draftKey || submitting) return
    setScaleValues((previous) => ({ ...previous, [itemCode]: value }))
    try {
      await finalDraftStore.putAnswer({ draftKey, itemKey: itemCode, value: { responseValue: value }, updatedAt: Date.now() })
      setError(null)
      if (item?.scale?.definition?.items && scaleIndex < item.scale.definition.items.length - 1) setScaleIndex((index) => index + 1)
    } catch (cause) {
      setError(normalizeApiError(cause).message)
    }
  }

  const submitSection = async () => {
    if (!item || item.type !== 'FORM_SECTION' || !sectionId || !draftKey || !meta || submitting) return
    const formAnswers = item.formAnswers || (item.answers || []).filter((answer) => Boolean(answer.formItemId)).map((answer) => ({
      formItemId: answer.formItemId!,
      type: answer.type || 'text_input',
      label: answer.label || '',
      placeholder: answer.placeholder || null,
      options: answer.options || null,
      required: true,
      contextKey: answer.contextKey || null,
      value: answer.value ?? null,
    }))
    const missing = formAnswers.filter((answer) => answer.required && emptyValue(formValues[answer.formItemId]))
    if (missing.length > 0) {
      setSectionIndex(Math.max(0, formAnswers.findIndex((answer) => answer.required && emptyValue(formValues[answer.formItemId]))))
      setError(`还有 ${missing.length} 个必填字段未完成`)
      return
    }
    try {
      setSubmitting(true)
      setError(null)
      const sealed = await finalDraftStore.sealForSubmission(draftKey, (snapshot) => {
        const answerMap = new Map(snapshot.answers.map((answer) => [answer.itemKey, answer.value as FormValue] as const))
        const missingStored = formAnswers.filter((answer) => answer.required && emptyValue(answerMap.get(answer.formItemId)))
        if (missingStored.length > 0) throw new Error(`还有 ${missingStored.length} 个必填字段尚未保存，请确认后再提交`)
        return {
          submissionId: snapshot.meta.submissionId,
          attemptEpoch: snapshot.meta.attemptEpoch,
          definitionHash: snapshot.meta.definitionHash,
          contextSnapshotHash: snapshot.meta.contextSnapshotHash,
          answers: formAnswers.map((answer) => ({ formItemId: answer.formItemId, value: answerMap.get(answer.formItemId) ?? null })),
        }
      })
      if (!sealed) throw new Error('本地综合表单草稿不存在，请重新加载')
      await runFinalDraftCapacityRetry({
        onRetry: async ({ error }) => {
          await finalDraftStore.setStatus(draftKey, 'RETRY_PENDING', {
            code: String((error as any)?.code || 'ASSESSMENT_SUBMIT_BUSY'),
            message: normalizeApiError(error).message,
          }).catch(() => null)
          setError('提交繁忙，正在自动重试…')
        },
        operation: async () => {
          const next = await submitFormSection(state.id, sectionId, sealed.payload)
          if (next.code !== 0) throw responseError(next)
          return next
        },
      })
      await finalDraftStore.setStatus(draftKey, 'COMPLETED')
      await finalDraftStore.delete(draftKey)
      await onReload()
    } catch (cause) {
      const status = errorStatus(cause)
      const nextMeta = await finalDraftStore.setStatus(draftKey, status, { code: String((cause as any)?.code || ''), message: normalizeApiError(cause).message }).catch(() => null)
      if (nextMeta) setMeta(nextMeta)
      setRequiresRestart(status === 'CONFLICT')
      setError(normalizeApiError(cause).message)
    } finally {
      setSubmitting(false)
    }
  }

  const submitScaleNow = async () => {
    if (!item || item.type !== 'SCALE' || !item.scaleAssessmentId || !draftKey || !meta || submitting) return
    const items = item.scale?.definition?.items || []
    const missing = items.filter((question) => question.required && scaleValues[question.itemCode] === undefined)
    if (missing.length > 0) {
      setScaleIndex(Math.max(0, items.findIndex((question) => question.required && scaleValues[question.itemCode] === undefined)))
      setError(`还有 ${missing.length} 道必答题未作答`)
      return
    }
    try {
      setSubmitting(true)
      setError(null)
      const sealed = await finalDraftStore.sealForSubmission(draftKey, (snapshot) => {
        const answerMap = new Map(snapshot.answers.map((answer) => {
          const value = answer.value as { responseValue?: ResponseValue } | ResponseValue
          return [answer.itemKey, typeof value === 'object' && value !== null && 'responseValue' in value
            ? value.responseValue
            : value] as const
        }))
        const missingStored = items.filter((question) => question.required && answerMap.get(question.itemCode) === undefined)
        if (missingStored.length > 0) throw new Error(`还有 ${missingStored.length} 道必答题尚未保存，请确认后再提交`)
        const deviceInputProvenance = readScaleDeviceInputProvenance(snapshot.meta.instrumentMetadata)
        return {
          submissionId: snapshot.meta.submissionId,
          attemptEpoch: snapshot.meta.attemptEpoch,
          definitionHash: snapshot.meta.definitionHash,
          contextSnapshotHash: snapshot.meta.contextSnapshotHash,
          answers: items
            .filter((question) => answerMap.get(question.itemCode) !== undefined)
            .map((question) => ({ itemCode: question.itemCode, responseValue: answerMap.get(question.itemCode) as ResponseValue })),
          ...(deviceInputProvenance ? { deviceInputProvenance } : {}),
        }
      })
      if (!sealed) throw new Error('本地综合量表草稿不存在，请重新加载')
      await runFinalDraftCapacityRetry({
        onRetry: async ({ error }) => {
          await finalDraftStore.setStatus(draftKey, 'RETRY_PENDING', {
            code: String((error as any)?.code || 'ASSESSMENT_SUBMIT_BUSY'),
            message: normalizeApiError(error).message,
          }).catch(() => null)
          setError('提交繁忙，正在自动重试…')
        },
        operation: async () => {
          const next = await submitScale(state.id, item.id, sealed.payload)
          if (next.code !== 0) throw responseError(next)
          return next
        },
      })
      await finalDraftStore.setStatus(draftKey, 'COMPLETED')
      await finalDraftStore.delete(draftKey)
      await onReload()
    } catch (cause) {
      const status = errorStatus(cause)
      const nextMeta = await finalDraftStore.setStatus(draftKey, status, { code: String((cause as any)?.code || ''), message: normalizeApiError(cause).message }).catch(() => null)
      if (nextMeta) setMeta(nextMeta)
      setRequiresRestart(status === 'CONFLICT')
      setError(normalizeApiError(cause).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingDraft) return <div className="flex items-center justify-center h-64 text-gray-500">正在恢复本地草稿...</div>
  if (state.status === 'COMPLETED') return null

  const units = state.units || state.items
  const contextText = state.context?.status === 'frozen' ? '上下文已冻结，后续模块共享同一快照。' : '答案只保存在本地草稿中，完成单元时一次提交。'
  const scaleItems = item?.type === 'SCALE'
    ? (item.scale?.definition?.items || []) as Array<(NonNullable<NonNullable<CompositeCurrentItem['scale']>['definition']>['items'][number]) & { images?: unknown; video?: unknown }>
    : []

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4"><div><h1 className="text-2xl font-bold text-gray-800">{state.name}</h1><p className="text-sm text-gray-500">完成单元：{state.completedItems} / {state.totalItems}（{state.progress}%）</p></div><button type="button" onClick={onExit} className="btn-secondary"><Save className="w-4 h-4 inline mr-1" />保存并退出</button></div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-4"><div className="bg-primary h-2 rounded-full" style={{ width: `${state.progress}%` }} /></div>
      {publicMode && recoveryToken && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-4">匿名恢复凭证已保存；请继续保管。</p>}
      <p className="text-sm text-gray-500 mb-4">{contextText} 浏览器重开后可以继续恢复。</p>
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {requiresRestart && onRestart && <div className="mb-4 flex items-center justify-between gap-3 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><span>本地草稿已保留。当前测评版本已变化，请重启后继续。</span><button type="button" onClick={() => void onRestart()} disabled={submitting} className="btn-primary whitespace-nowrap">重启并继续</button></div>}

      {item?.type === 'COGNITIVE' && <div className="card p-8 text-center"><h2 className="text-xl font-semibold mb-3">{units[state.currentIndex]?.label || '认知任务'}</h2><p className="text-gray-600 mb-6">认知测验会逐试次写入本地，完成时一次提交全部试次。</p><button type="button" onClick={() => onEnterCognitive(item)} className="btn-primary">开始/继续认知任务</button></div>}

      {item?.type === 'SITUATIONAL' && <div className="card p-8 text-center"><h2 className="text-xl font-semibold mb-3">{units[state.currentIndex]?.label || '文字情境测评'}</h2><p className="text-gray-600 mb-6">进入文字情境测评后，答案只在本地保留，完成时一次提交冻结结果。</p><button type="button" onClick={() => onEnterSituational(item)} className="btn-primary">开始/继续文字情境测评</button></div>}

      {item?.type === 'FORM_SECTION' && <div className="bg-white rounded-lg shadow p-6"><div className="flex items-center justify-between mb-5"><div><p className="text-sm text-gray-500"><FileText className="w-4 h-4 inline mr-1" />表单区段</p><h2 className="text-xl font-semibold">{item.title || '表单'}</h2></div><span className="text-sm text-gray-500">字段 {sectionIndex + 1} / {(item.formAnswers || item.answers || []).length}</span></div>{item.description && <p className="text-sm text-gray-600 mb-5 whitespace-pre-wrap">{item.description}</p>}{(() => { const fields = item.formAnswers || (item.answers || []).filter((answer) => Boolean(answer.formItemId)) as any[]; const field = fields[sectionIndex]; if (!field) return <p className="text-gray-500">该区段没有字段。</p>; const value = formValues[field.formItemId]; const options = parseOptions(field.options); const imageItems = assessmentOptionImageItems(options); const videoEntries = formOptionVideoPresentations(options); return <AssessmentImageGate items={imageItems} loadAsset={loadAssessmentImage} disabled={submitting} ariaLabel={`${field.label} 选项视觉内容`}><FormOptionVideoGroupGate entries={videoEntries} loadSources={(entry) => loadCompositeVideoCapability(`${publicMode ? '/api/public/composite-assessments' : '/api/composite-assessments'}/attempts/${encodeURIComponent(state.id)}/form-sections/${encodeURIComponent(sectionId || item.id)}/items/${encodeURIComponent(field.formItemId)}/options/${entry.optionIndex}/video-capability`)}><div><h3 className="text-lg font-medium mb-4">{field.label}{field.required && <span className="text-red-500 text-sm ml-2">必填</span>}</h3>{field.type === 'single_choice' && <div className="space-y-2">{options.map((option) => <button type="button" key={option.value} onClick={() => void saveForm(field.formItemId, option.value)} disabled={submitting} className={`block w-full text-left border rounded px-4 py-3 ${value === option.value ? 'border-primary bg-primary/5 text-primary' : 'hover:border-gray-400'}`}>{option.label}</button>)}</div>}{field.type === 'multiple_choice' && <div className="space-y-2">{options.map((option) => { const values = Array.isArray(value) ? value : []; const selected = values.includes(option.value); return <button type="button" key={option.value} onClick={() => void saveForm(field.formItemId, selected ? values.filter((entry) => entry !== option.value) : [...values, option.value])} disabled={submitting} className={`block w-full text-left border rounded px-4 py-3 ${selected ? 'border-primary bg-primary/5 text-primary' : 'hover:border-gray-400'}`}>{selected ? '✓ ' : ''}{option.label}</button> })}</div>}{field.type === 'year_month' && <input type="month" value={typeof value === 'string' ? value : ''} onChange={(event) => void saveForm(field.formItemId, event.target.value)} disabled={submitting} className="w-full border rounded px-3 py-2" />}{(!['single_choice', 'multiple_choice', 'year_month'].includes(field.type)) && <textarea value={typeof value === 'string' ? value : ''} onChange={(event) => void saveForm(field.formItemId, event.target.value)} disabled={submitting} placeholder={field.placeholder || '请输入'} className="w-full border rounded px-3 py-2 min-h-32" />}<div className="flex justify-between mt-6"><button type="button" onClick={() => setSectionIndex((index) => Math.max(0, index - 1))} disabled={sectionIndex === 0 || submitting} className="btn-secondary"><ChevronLeft className="w-4 h-4 inline" />上一字段</button>{sectionIndex < fields.length - 1 ? <button type="button" onClick={() => setSectionIndex((index) => index + 1)} disabled={submitting} className="btn-secondary">下一字段<ChevronRight className="w-4 h-4 inline" /></button> : <button type="button" onClick={() => void submitSection()} disabled={submitting || requiresRestart} className="btn-primary"><CheckCircle className="w-4 h-4 inline mr-1" />{submitting ? '提交区段中...' : '提交整个区段'}</button>}</div></div></FormOptionVideoGroupGate></AssessmentImageGate> })()}</div>}

      {item?.type === 'SCALE' && item.scale && <div className="bg-white rounded-lg shadow p-6"><div className="flex items-center justify-between mb-5"><div><p className="text-sm text-gray-500"><Layers className="w-4 h-4 inline mr-1" />量表</p><h2 className="text-xl font-semibold">{item.scale.name}</h2></div><span className="text-sm text-gray-500">题目 {scaleIndex + 1} / {scaleItems.length}</span></div>{(() => { const question = scaleItems[scaleIndex]; if (!question) return <p className="text-gray-500">量表题目为空。</p>; const imageItems = assessmentImageItems(question.images); const videoPresentation = scaleItemVideoPresentation(question); return <AssessmentImageGate items={imageItems} loadAsset={loadAssessmentImage} disabled={submitting} ariaLabel={`${question.content} 视觉内容`}><ScaleFormVideoGate presentation={videoPresentation} loadSources={() => loadCompositeVideoCapability(`${publicMode ? '/api/public/composite-assessments' : '/api/composite-assessments'}/attempts/${encodeURIComponent(state.id)}/items/${encodeURIComponent(item.id)}/scale/items/${encodeURIComponent(question.itemCode)}/video-capability`)} ariaLabel={`${question.content} 视频内容`}><div><h3 className="text-lg font-medium mb-5">{question.content}{question.required && <span className="text-red-500 text-sm ml-2">必答</span>}</h3><div className="space-y-2">{question.options.map((option) => <button type="button" key={`${typeof option.value}:${String(option.value)}`} onClick={() => void saveScale(question.itemCode, option.value)} disabled={submitting} className={`block w-full text-left border rounded px-4 py-3 ${scaleValues[question.itemCode] === option.value ? 'border-primary bg-primary/5 text-primary' : 'hover:border-gray-400'}`}>{option.label}</button>)}</div><div className="flex justify-between mt-6"><button type="button" onClick={() => setScaleIndex((index) => Math.max(0, index - 1))} disabled={scaleIndex === 0 || submitting} className="btn-secondary"><ChevronLeft className="w-4 h-4 inline" />上一题</button>{scaleIndex < scaleItems.length - 1 ? <button type="button" onClick={() => setScaleIndex((index) => index + 1)} disabled={submitting} className="btn-secondary">下一题<ChevronRight className="w-4 h-4 inline" /></button> : <button type="button" onClick={() => void submitScaleNow()} disabled={submitting || requiresRestart} className="btn-primary"><CheckCircle className="w-4 h-4 inline mr-1" />{submitting ? '提交量表中...' : '提交整份量表'}</button>}</div></div></ScaleFormVideoGate></AssessmentImageGate> })()}</div>}

      <div className="mt-5 bg-white rounded shadow p-4"><p className="text-sm text-gray-500 mb-2">提交单元</p><div className="flex flex-wrap gap-2">{units.map((unit) => <span key={`${unit.type}-${unit.id}`} className={`px-3 py-1 rounded text-sm ${unit.completed ? 'bg-green-100 text-green-700' : unit.index === state.currentIndex ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>{unit.index + 1}. {unit.label || unit.type}</span>)}</div></div>
    </div>
  )
}

export default FinalCompositeAssessment