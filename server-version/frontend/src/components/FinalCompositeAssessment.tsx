import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Layers, Save } from 'lucide-react'
import { sessionFetch } from '../api/client'
import type { ApiResponse } from '../types'
import type { CompositeAttemptState, CompositeCurrentItem } from '../modules/composite/types'
import AssessmentImageGate from '../modules/assessment-media/AssessmentImageGate'
import FormOptionVideoGroupGate from '../modules/assessment-media/FormOptionVideoGroupGate'
import ScaleFormVideoGate from '../modules/assessment-media/ScaleFormVideoGate'
import { assessmentImageItems, assessmentOptionImageItems } from '../modules/assessment-media/adapter'
import { formOptionVideoPresentations, scaleItemVideoPresentation } from '../modules/assessment-media/video-adapter'
import { requestAssessmentVideoCapabilities } from '../modules/assessment-media/video-capability-client'
import CompositeUnitRequirements from '../modules/composite/CompositeUnitRequirements'
import { AssessmentShell } from './assessment-shell'
import FormPlayer from './questionnaire/FormPlayer'
import ScalePlayer from './questionnaire/ScalePlayer'
import { useLocalDraftSaveQueue } from './questionnaire/useLocalDraftSaveQueue'
import { checkpointId } from '../services/persistence/checkpointTypes'
import { createFinalDraftMeta, finalDraftStore, type FinalDraftMeta } from '../services/persistence/finalDraftStore'
import { runFinalDraftCapacityRetry } from '../services/persistence/finalDraftCapacityRetry'
import { recordFinalSubmissionFailure } from '../services/persistence/finalSubmissionFailure'
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
  /** School-only canonical Run transport; the legacy API remains unchanged. */
  campusMode?: boolean
  campusVideoLoader?: (path:string)=>Promise<import('../modules/assessment-media/types').AssessmentVideoCapabilitySources>
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
  if (response.code === 'FORM_ANSWER_INVALID') error.status = 400
  return error
}

const FinalCompositeAssessment: React.FC<FinalCompositeAssessmentProps> = ({ state, publicMode = false, recoveryToken, submitFormSection, submitScale, onReload, onExit, onCompleted, onEnterCognitive, onEnterSituational, onRestart, campusMode=false, campusVideoLoader }) => {
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
  const draftLocked = Boolean(meta && (meta.status !== 'DRAFT' || meta.sealedSubmission))
  const { schedule: scheduleLocalSave, flush: flushLocalSaves, status: localSaveStatus } = useLocalDraftSaveQueue(draftKey)
  const [exiting, setExiting] = useState(false)

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
    const schoolPath=campusMode
      ? path.replace('/api/composite-assessments/attempts/', '/api/campus/composite-attempts/')
      : path
    const response = await sessionFetch(schoolPath, publicMode ? { headers: { 'X-Recovery-Token': publicCapability } } : undefined)
    if (!response.ok) throw new Error(`视觉内容加载失败 (${response.status})`)
    return response.blob()
  }, [item, publicMode, recoveryToken, sectionId, state.id, campusMode])

  const loadCompositeVideoCapability = useCallback(async (path: string) => {
    if(campusMode){
      if(!campusVideoLoader)throw new Error('校园视觉测评尚无视频授权客户端')
      return campusVideoLoader(path.replace(
        '/api/composite-assessments/attempts/','/api/campus/composite-attempts/'))
    }
    if (!publicMode) return requestAssessmentVideoCapabilities(path)
    const publicCapability = recoveryToken || (typeof window === 'undefined' ? '' : window.sessionStorage.getItem(`composite:recovery:attempt:${state.id}`) || '')
    if (!publicCapability) throw new Error('缺少综合测评恢复凭据')
    return requestAssessmentVideoCapabilities(path, { headers: { 'X-Recovery-Token': publicCapability } })
  }, [publicMode, recoveryToken, state.id, campusMode, campusVideoLoader])

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
        if (!cancelled) {
          setMeta(null)
          setRequiresRestart(false)
          setLoadingDraft(false)
        }
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
    if (!draftKey || submitting || exiting || draftLocked) return
    setFormValues((previous) => ({ ...previous, [itemId]: value }))
    await scheduleLocalSave(`form:${itemId}`, async () => {
      await finalDraftStore.putAnswer({ draftKey, itemKey: itemId, value, updatedAt: Date.now() })
    })
  }

  const saveScale = async (itemCode: string, value: ResponseValue) => {
    if (!draftKey || submitting || exiting || draftLocked) return
    setScaleValues((previous) => ({ ...previous, [itemCode]: value }))
    await scheduleLocalSave(`scale:${itemCode}`, async () => {
      await finalDraftStore.putAnswer({ draftKey, itemKey: itemCode, value: { responseValue: value }, updatedAt: Date.now() })
    })
  }

  const saveAndExit = async () => {
    if (exiting || submitting) return
    setExiting(true)
    try {
      await flushLocalSaves()
      onExit()
    } catch (cause) {
      setError(normalizeApiError(cause).message)
    } finally { setExiting(false) }
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
      await flushLocalSaves()
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
      const nextMeta = await recordFinalSubmissionFailure(draftKey, cause, meta.submissionId).catch(() => finalDraftStore.get(draftKey)).catch(() => ({ ...meta, status: 'RETRY_PENDING' as const }))
      if (nextMeta) setMeta(nextMeta)
      setRequiresRestart(nextMeta?.status === 'CONFLICT')
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
      await flushLocalSaves()
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
      const nextMeta = await recordFinalSubmissionFailure(draftKey, cause, meta.submissionId).catch(() => finalDraftStore.get(draftKey)).catch(() => ({ ...meta, status: 'RETRY_PENDING' as const }))
      if (nextMeta) setMeta(nextMeta)
      setRequiresRestart(nextMeta?.status === 'CONFLICT')
      setError(normalizeApiError(cause).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingDraft) return <div className="flex h-64 items-center justify-center text-gray-500">正在恢复本地草稿...</div>
  if (state.status === 'COMPLETED') return null

  const units = state.units || state.items
  const currentUnit = units[state.currentIndex]
  const contextText = state.context?.status === 'frozen' ? '上下文已冻结，后续模块共享同一快照。' : '答案只保存在本地草稿中，完成单元时一次提交。'
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
  const formFields = item?.type === 'FORM_SECTION'
    ? (item.formAnswers || (item.answers || []).filter((answer) => Boolean(answer.formItemId))) as any[]
    : []
  const scaleItems = item?.type === 'SCALE'
    ? (item.scale?.definition?.items || []) as Array<(NonNullable<NonNullable<CompositeCurrentItem['scale']>['definition']>['items'][number]) & { images?: unknown; video?: unknown }>
    : []

  return (
    <AssessmentShell
      title={state.name}
      eyebrow={state.productKind === 'QUESTIONNAIRE' ? '问卷' : '综合测评'}
      instructions={(
        <div className="space-y-2">
          {state.instruction ? <p>{state.instruction}</p> : null}
          <p>当前单元：{currentUnit?.label || item?.type || '—'}</p>
          <p>{contextText} 浏览器重开后可以继续恢复。</p>
        </div>
      )}
      progress={{ kind: 'count', completed: state.completedItems, total: state.totalItems, label: '综合测评单元进度' }}
      submissionStatus={submissionStatus}
      recoveryState={recoveryState}
      actions={(
        <button type="button" onClick={() => void saveAndExit()} disabled={exiting || submitting} className="btn-secondary min-h-11">
          <Save className="mr-1 inline h-4 w-4" />{exiting ? '正在保存…' : '保存并退出'}
        </button>
      )}
      navigation={(
        <section aria-label="提交单元" className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-600">提交单元</p>
          <div className="flex flex-wrap gap-2">
            {units.map((unit) => (
              <span
                key={`${unit.type}-${unit.id}`}
                className={`rounded px-3 py-1 text-sm ${unit.completed ? 'bg-green-100 text-green-700' : unit.index === state.currentIndex ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {unit.index + 1}. {unit.label || unit.type}
              </span>
            ))}
          </div>
        </section>
      )}
    >
      {publicMode && recoveryToken ? <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <p>匿名恢复凭证已保存；请继续保管。</p>
        <details className="mt-2" aria-label="本次匿名作答恢复凭证">
          <summary className="cursor-pointer">保存本次恢复凭证</summary>
          <p className="mt-2">换浏览器或设备时，用完整凭证恢复这次作答。请自行保管，勿公开分享。</p>
          <code className="my-2 block select-all break-all">{recoveryToken}</code>
          <button type="button" className="btn-secondary" onClick={() => void (async () => {
            try { await navigator.clipboard.writeText(recoveryToken) }
            catch { setError('复制失败，请选中并手动保存完整恢复凭证。') }
          })()}>复制恢复凭证</button>
        </details>
      </div> : null}
      {error ? <p role="alert" className="mb-4 text-sm text-red-600">{error}</p> : null}
      {requiresRestart && onRestart ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>本地草稿已保留。当前测评版本已变化，请重启后继续。</span>
          <button type="button" onClick={() => void onRestart()} disabled={submitting} className="btn-primary min-h-11 whitespace-nowrap">重启并继续</button>
        </div>
      ) : null}

      <CompositeUnitRequirements item={item} />
      {localSaveStatus.state !== 'idle' ? <p role={localSaveStatus.state === 'error' ? 'alert' : 'status'} className="mb-4 text-sm">{localSaveStatus.message}</p> : null}

      {item?.type === 'COGNITIVE' ? (
        <div className="card p-8 text-center">
          <h2 className="mb-3 text-xl font-semibold">{currentUnit?.label || '认知任务'}</h2>
          <p className="mb-6 text-gray-600">认知测验会逐试次写入本地，完成时一次提交全部试次。</p>
          <button type="button" onClick={() => onEnterCognitive(item)} className="btn-primary min-h-11">开始/继续认知任务</button>
        </div>
      ) : null}

      {item?.type === 'SITUATIONAL' ? (
        <div className="card p-8 text-center">
          <h2 className="mb-3 text-xl font-semibold">{currentUnit?.label || '文字情境测评'}</h2>
          <p className="mb-6 text-gray-600">进入文字情境测评后，答案只在本地保留，完成时一次提交冻结结果。</p>
          <button type="button" onClick={() => onEnterSituational(item)} className="btn-primary min-h-11">开始/继续文字情境测评</button>
        </div>
      ) : null}

      {item?.type === 'FORM_SECTION' ? (
        <div>
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <p className="text-sm text-slate-500"><FileText className="mr-1 inline h-4 w-4" />表单区段</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">{item.title || '表单'}</h2>
            {item.description ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{item.description}</p> : null}
          </div>
          {(() => {
            const field = formFields[sectionIndex]
            if (!field) return item.contextSection || item.formSection?.contextSection
              ? <p role="alert" className="text-amber-800">历史背景信息区段缺少字段。请联系教师发布修复版本后重新开始，已提交记录会保留。</p>
              : <div className="space-y-3"><p className="text-gray-600">此历史区段没有字段。确认后会提交空区段记录并继续。</p><button type="button" className="btn-primary" disabled={submitting || requiresRestart || exiting} onClick={() => void submitSection()}>{submitting ? '正在提交…' : '确认并继续'}</button></div>
            const value = formValues[field.formItemId]
            const options = parseOptions(field.options)
            const imageItems = assessmentOptionImageItems(options)
            const videoEntries = formOptionVideoPresentations(options)
            return (
              <AssessmentImageGate items={imageItems} loadAsset={loadAssessmentImage} disabled={submitting} ariaLabel={`${field.label} 选项视觉内容`}>
                <FormOptionVideoGroupGate
                  entries={videoEntries}
                  loadSources={(entry) => loadCompositeVideoCapability(`${publicMode ? '/api/public/composite-assessments' : '/api/composite-assessments'}/attempts/${encodeURIComponent(state.id)}/form-sections/${encodeURIComponent(sectionId || item.id)}/items/${encodeURIComponent(field.formItemId)}/options/${entry.optionIndex}/video-capability`)}
                >
                  <FormPlayer
                    item={{
                      id: field.formItemId,
                      type: field.type,
                      label: field.label,
                      placeholder: field.placeholder,
                      required: Boolean(field.required),
                    }}
                    options={options}
                    value={value}
                    navigationDisabled={exiting}
                    answerDisabled={draftLocked || exiting}
                    submitDisabled={requiresRestart || exiting}
                    position={sectionIndex + 1}
                    total={formFields.length}
                    onChange={(nextValue) => saveForm(field.formItemId, nextValue)}
                    onPrevious={() => setSectionIndex((index) => Math.max(0, index - 1))}
                    onNext={sectionIndex < formFields.length - 1
                      ? () => setSectionIndex((index) => index + 1)
                      : undefined}
                    onSubmit={sectionIndex === formFields.length - 1 ? submitSection : undefined}
                    submitting={submitting}
                  />
                </FormOptionVideoGroupGate>
              </AssessmentImageGate>
            )
          })()}
        </div>
      ) : null}

      {item?.type === 'SCALE' && item.scale ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500"><Layers className="mr-1 inline h-4 w-4" />量表</p>
              <h2 className="text-xl font-semibold text-slate-900">{item.scale.name}</h2>
            </div>
            <span className="text-sm text-slate-500">题目 {scaleIndex + 1} / {scaleItems.length}</span>
          </div>
          {(() => {
            const question = scaleItems[scaleIndex]
            if (!question) return <p className="text-gray-500">量表题目为空。</p>
            const imageItems = assessmentImageItems(question.images)
            const videoPresentation = scaleItemVideoPresentation(question)
            return (
              <AssessmentImageGate items={imageItems} loadAsset={loadAssessmentImage} disabled={submitting} ariaLabel={`${question.content} 视觉内容`}>
                <ScaleFormVideoGate
                  presentation={videoPresentation}
                  loadSources={() => loadCompositeVideoCapability(`${publicMode ? '/api/public/composite-assessments' : '/api/composite-assessments'}/attempts/${encodeURIComponent(state.id)}/items/${encodeURIComponent(item.id)}/scale/items/${encodeURIComponent(question.itemCode)}/video-capability`)}
                  ariaLabel={`${question.content} 视频内容`}
                >
                  <ScalePlayer
                    key={question.itemCode}
                    item={question}
                    value={scaleValues[question.itemCode]}
                    navigationDisabled={exiting}
                    answerDisabled={draftLocked || exiting}
                    submitDisabled={requiresRestart || exiting}
                    position={scaleIndex + 1}
                    total={scaleItems.length}
                    onChange={(nextValue) => saveScale(question.itemCode, nextValue)}
                    onPrevious={() => setScaleIndex((index) => Math.max(0, index - 1))}
                    onNext={scaleIndex < scaleItems.length - 1
                      ? () => setScaleIndex((index) => index + 1)
                      : undefined}
                    onSubmit={scaleIndex === scaleItems.length - 1 ? submitScaleNow : undefined}
                    submitting={submitting}
                  />
                </ScaleFormVideoGate>
              </AssessmentImageGate>
            )
          })()}
        </div>
      ) : null}
    </AssessmentShell>
  )
}

export default FinalCompositeAssessment
