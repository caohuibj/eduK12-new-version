import {TrainingMaterials} from '../modules/assessment-media/TrainingMaterials'
import { isTrainingHost } from '../training/context'
import { TrainingCheckpointPanel } from '../modules/composite/TrainingCheckpointPanel'
import {TrainingTimingBoundary,restoreTrainingTiming} from '../modules/scale/TrainingTimingBoundary'
import {SurveyScaleTimingTracker,sealObservedScaleTimings} from '../modules/scale/item-timing'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { readMatchingWholeReceipt, rememberWholeReceipt, isRecoverableReceiptError, type WholeReceiptLookup } from '../modules/composite/receipt-recovery'
import { sessionFetch } from '../api/client'
import type { ApiResponse } from '../types'
import type { CompositeAttemptState, CompositeReportStatus, WholeQuestionnaireDefinition, WholeQuestionnaireInput, WholeQuestionnaireReceipt } from '../modules/composite/types'
import AssessmentImageGate from '../modules/assessment-media/AssessmentImageGate'
import ScaleFormVideoGate from '../modules/assessment-media/ScaleFormVideoGate'
import { assessmentImageItems } from '../modules/assessment-media/adapter'
import { scaleItemVideoPresentation } from '../modules/assessment-media/video-adapter'
import { requestAssessmentVideoCapabilities } from '../modules/assessment-media/video-capability-client'
import { readScaleDeviceInputProvenance, resolveScaleDeviceInputProvenance, type DeviceInputProvenanceV1 } from '../modules/scale/device-input-provenance'
import { createFinalDraftMeta, finalDraftStore, type FinalDraftMeta } from '../services/persistence/finalDraftStore'
import { checkpointId } from '../services/persistence/checkpointTypes'
import { runFinalDraftCapacityRetry } from '../services/persistence/finalDraftCapacityRetry'
import { recordFinalSubmissionFailure } from '../services/persistence/finalSubmissionFailure'
import { normalizeApiError } from '../utils/normalizeApiError'
import { AssessmentShell } from './assessment-shell'
import ScalePlayer from './questionnaire/ScalePlayer'
import { useLocalDraftSaveQueue } from './questionnaire/useLocalDraftSaveQueue'

export interface WholeQuestionnaireApi {
  wholeReceipt?: (id: string, submissionId: string, attemptEpoch: number) => Promise<ApiResponse<WholeReceiptLookup>>
  wholeDefinition: (id: string) => Promise<ApiResponse<WholeQuestionnaireDefinition>>
  submitWhole: (id: string, input: WholeQuestionnaireInput) => Promise<ApiResponse<WholeQuestionnaireReceipt>>
  reportStatus: (id: string) => Promise<ApiResponse<CompositeReportStatus>>
}
type Props = { state: CompositeAttemptState; api: WholeQuestionnaireApi; publicMode?: boolean; recoveryToken?: string; fallback: ReactNode; onExit: () => void; onCompleted: () => void }
type Answer = { responseValue: string | number; responseTimeMs?: number; changeCount?: number }
export const wholeDraftKey = (id: string, epoch: number) => `composite-whole:${id}:${epoch}`
export const wholeAnswerKey = (itemId: string, itemCode: string) => JSON.stringify([itemId, itemCode])
const responseError = (response: ApiResponse<unknown>) => Object.assign(new Error(response.message || '问卷请求失败'), {
  code: response.code, status: typeof response.code === 'number' ? response.code : undefined,
})
const readAnswer = (value: unknown): Answer => typeof value === 'object' && value !== null && 'responseValue' in value
  ? value as Answer : { responseValue: value as string | number }

function WholeCompositeQuestionnaireRunner({ state, api, publicMode = false, recoveryToken, fallback, onExit, onCompleted }: Props) {
  const draftKey = wholeDraftKey(state.id, state.attemptEpoch ?? 1)
  const [definition, setDefinition] = useState<WholeQuestionnaireDefinition | null>(null)
  const [meta, setMeta] = useState<FinalDraftMeta | null>(null)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [useFallback, setUseFallback] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [checkpointBusy, setCheckpointBusy] = useState(false)
  const [checkpointRestoreGeneration, setCheckpointRestoreGeneration] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadRound, setLoadRound] = useState(0)
  const [submitStartedAt, setSubmitStartedAt] = useState<number | null>(null)
  const [submitElapsedSeconds, setSubmitElapsedSeconds] = useState(0)
  const submitting = useRef(false)
  const questionStart = useRef(Date.now())
  const timingRef=useRef<Record<string,SurveyScaleTimingTracker>>({})
  const timingMetadata=()=>Object.fromEntries((definition?.units??[]).filter(unit=>unit.trainingTiming&&timingRef.current[unit.itemId]).map(unit=>[unit.itemId,{snapshotHash:unit.trainingTiming!.snapshotHash,items:timingRef.current[unit.itemId].snapshot()}]))
  const local = useLocalDraftSaveQueue(draftKey)
  const { flush, schedule } = local
  const questions = useMemo(() => definition?.units.flatMap(unit => unit.scale.definition!.items.map(question => ({ unit, question }))) ?? [], [definition])
  const current = questions[index]
  const locked = checkpointBusy || Boolean(meta && (meta.status !== 'DRAFT' || meta.sealedSubmission))
  useEffect(() => { questionStart.current = Date.now() }, [index, draftKey])
  useEffect(() => {
    if (submitStartedAt === null) { setSubmitElapsedSeconds(0); return }
    const update = () => setSubmitElapsedSeconds(Math.max(0, Math.floor((Date.now() - submitStartedAt) / 1000)))
    update(); const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [submitStartedAt])


  useEffect(() => {
    let cancelled = false
    const initialize = async () => {
      setLoading(true); setError(null); setUseFallback(false); setAccepted(false)
      try {
        const existing = await finalDraftStore.get(draftKey)
        if (cancelled) return
        // A sealed request can be confirmed even with new enrollment disabled.
        if (existing?.sealedSubmission) {
          setMeta(existing)
          const receipt = await readMatchingWholeReceipt(api.wholeReceipt
            ? () => api.wholeReceipt!(state.id, existing.submissionId, existing.attemptEpoch) : undefined, state.id, existing.submissionId)
          if (receipt) {
            rememberWholeReceipt(receipt); setAccepted(true)
            await finalDraftStore.setStatus(draftKey, 'COMPLETED'); await finalDraftStore.delete(draftKey)
          }
          return
        }
        const status = await api.reportStatus(state.id)
        if (status.code !== 0 || !status.data) throw responseError(status)
        if (status.data.wholeSubmissionReceived) { setAccepted(true); return }
        if (!existing && state.items.some(item => item.type === 'SCALE' && item.completed)) { setUseFallback(true); return }
        let delivered: ApiResponse<WholeQuestionnaireDefinition>
        try { delivered = await api.wholeDefinition(state.id) }
        catch (cause) {
          if (!existing && normalizeApiError(cause).status === 409) { setUseFallback(true); return }
          throw cause
        }
        if (delivered.code !== 0 || !delivered.data) {
          if (!existing && (delivered.code === 409 || delivered.code === 'STALE_ATTEMPT')) { setUseFallback(true); return }
          throw responseError(delivered)
        }
        const next = delivered.data
        // Whole-questionnaire flattening must not override a frozen whole-page unit.
        if (next.units.some(unit => unit.presentationMode === 'ALL_AT_ONCE')) { setUseFallback(true); return }
        if (next.attemptId !== state.id || next.attemptEpoch !== (state.attemptEpoch ?? 1)
          || !next.units.length || next.units.some(unit => !unit.scale.definition?.items.length)) throw new Error('整卷内容不完整，请重新加载；本地草稿会保留。')
        // Do not switch a pre-existing sealed unit into a different submission protocol.
        const oldDrafts = await Promise.all(next.units.map(unit => finalDraftStore.get(`composite-scale:${unit.scaleAssessmentId}`)))
        if (!existing && oldDrafts.some(old => old && (old.status !== 'DRAFT' || old.sealedSubmission))) { setUseFallback(true); return }
        let nextMeta = await finalDraftStore.ensure(createFinalDraftMeta({ draftKey, instrument: 'composite-whole',
          attemptId: state.id, attemptEpoch: next.attemptEpoch, definitionHash: next.slotSetHash,
          contextSnapshotHash: next.contextSnapshotHash, deliveryMode: 'final_only', submissionId: checkpointId() }))
        if (nextMeta.status === 'DRAFT' && !nextMeta.sealedSubmission) {
          const provenance = { ...(nextMeta.instrumentMetadata?.wholeUnitProvenance as Record<string, DeviceInputProvenanceV1> | undefined) }
          for (let unitIndex = 0; unitIndex < next.units.length; unitIndex++) {
            const unit = next.units[unitIndex], old = oldDrafts[unitIndex]
            const oldMatches = old?.attemptEpoch === next.attemptEpoch && old.definitionHash === unit.definitionHash
              && old.contextSnapshotHash === next.contextSnapshotHash && old.status === 'DRAFT' && !old.sealedSubmission
            if (old && !oldMatches) throw new Error('检测到不匹配的量表草稿，已保留；请先核对原作答进度。')
            provenance[unit.itemId] ??= oldMatches ? readScaleDeviceInputProvenance(old.instrumentMetadata) ?? resolveScaleDeviceInputProvenance({}) : resolveScaleDeviceInputProvenance({})
            if (oldMatches) {
              const stored = new Set((await finalDraftStore.listAnswers(draftKey)).map(answer => answer.itemKey))
              for (const answer of await finalDraftStore.listAnswers(old.draftKey)) {
                const key = wholeAnswerKey(unit.itemId, answer.itemKey)
                if (!stored.has(key)) await finalDraftStore.putAnswer({ ...answer, draftKey, itemKey: key })
              }
            }
          }
          await finalDraftStore.setInstrumentMetadata(draftKey, { wholeUnitProvenance: provenance })
          nextMeta = (await finalDraftStore.get(draftKey))!
        }
        const restored = Object.fromEntries((await finalDraftStore.listAnswers(draftKey)).map(answer => [answer.itemKey, readAnswer(answer.value)]))
        if (!cancelled) {
          timingRef.current=Object.fromEntries(next.units.filter(unit=>unit.trainingTiming).map(unit=>{
            const saved=(nextMeta.instrumentMetadata?.wholeScaleTiming as Record<string,unknown>|undefined)?.[unit.itemId]
            const old=oldDrafts[next.units.indexOf(unit)]
            const restoredTiming=restoreTrainingTiming(saved?{trainingScaleTiming:saved}:old?.instrumentMetadata,unit.trainingTiming!.snapshotHash)
            const initial=Object.fromEntries(unit.scale.definition!.items.filter(q=>restored[wholeAnswerKey(unit.itemId,q.itemCode)]!==undefined).map(q=>[q.itemCode,restored[wholeAnswerKey(unit.itemId,q.itemCode)].responseValue]))
            return [unit.itemId,new SurveyScaleTimingTracker(restoredTiming,initial)]
          }))
          setDefinition(next); setMeta(nextMeta); setAnswers(restored); setIndex(0) }
      } catch (cause) { if (!cancelled) setError(normalizeApiError(cause).message) }
      finally { if (!cancelled) setLoading(false) }
    }
    void initialize()
    return () => { cancelled = true }
  }, [state, api, draftKey, loadRound])

  const saveAnswer = async (value: string | number) => {
    if (!current || locked || busy || submitting.current) return false
    const key = wholeAnswerKey(current.unit.itemId, current.question.itemCode), previous = answers[key]
    timingRef.current[current.unit.itemId]?.answer(current.question.itemCode,previous?.responseValue,value)
    const now = Date.now(), answer: Answer = { responseValue: value,
      responseTimeMs: (previous?.responseTimeMs ?? 0) + Math.max(0, now - questionStart.current),
      changeCount: (previous?.changeCount ?? 0) + (previous && previous.responseValue !== value ? 1 : 0) }
    questionStart.current = now
    setAnswers(prior => ({ ...prior, [key]: answer }))
    return schedule(key, () => finalDraftStore.putAnswer({ draftKey, itemKey: key, value: answer, updatedAt: now },
      Object.keys(timingRef.current).length ? { wholeScaleTiming: timingMetadata() } : undefined))
  }
  const saveAndExit = async () => {
    if (submitting.current || busy || checkpointBusy) return
    setBusy(true)
    try { Object.values(timingRef.current).forEach(tracker=>tracker.pause()); if(!locked&&Object.keys(timingRef.current).length)await finalDraftStore.setInstrumentMetadata(draftKey,{wholeScaleTiming:timingMetadata()});await flush(); onExit() } catch (cause) { setError(normalizeApiError(cause).message) }
    finally { setBusy(false) }
  }
  const submit = async () => {
    if (!meta || submitting.current || busy || checkpointBusy || accepted || meta.status === 'CONFLICT') return
    if (!meta.sealedSubmission) {
      const missing = questions.findIndex(({ unit, question }) => question.required && answers[wholeAnswerKey(unit.itemId, question.itemCode)]?.responseValue === undefined)
      if (missing >= 0) {
        setIndex(missing)
        if (publicMode) window.requestAnimationFrame(() => {
          const target = document.getElementById(`training-anonymous-whole-required:${state.id}`)
          target?.focus({ preventScroll: true }); target?.scrollIntoView?.({ block: 'center' })
        })
        setError('还有必答题未作答，请完成后提交整份问卷。'); return
      }
    }
    Object.values(timingRef.current).forEach(tracker=>tracker.pause())
    submitting.current = true; setBusy(true); setError(null); setSubmitStartedAt(Date.now())
    let confirmed = false
    try {
      await flush()
      const sealed = await finalDraftStore.sealForSubmission<WholeQuestionnaireInput>(draftKey, snapshot => {
        if (!definition) throw new Error('整卷定义尚未加载')
        const saved = new Map(snapshot.answers.map(answer => [answer.itemKey, readAnswer(answer.value)]))
        const missing = questions.some(({ unit, question }) => question.required && saved.get(wholeAnswerKey(unit.itemId, question.itemCode))?.responseValue === undefined)
        if (missing) throw new Error('必答题尚未完整保存到本机，请确认后再提交。')
        const provenance = snapshot.meta.instrumentMetadata?.wholeUnitProvenance as Record<string, DeviceInputProvenanceV1> | undefined
        return { submissionId: snapshot.meta.submissionId, attemptEpoch: snapshot.meta.attemptEpoch,
          slotSetHash: snapshot.meta.definitionHash, contextSnapshotHash: snapshot.meta.contextSnapshotHash,
          units: definition.units.map(unit => ({ itemId: unit.itemId, definitionHash: unit.definitionHash,
            ...(unit.trainingTiming&&timingRef.current[unit.itemId]?{itemTimings:sealObservedScaleTimings(unit.scale.definition!.items.map(q=>q.itemCode),Object.fromEntries(unit.scale.definition!.items.filter(q=>saved.has(wholeAnswerKey(unit.itemId,q.itemCode))).map(q=>[q.itemCode,saved.get(wholeAnswerKey(unit.itemId,q.itemCode))!.responseValue])),timingRef.current[unit.itemId].snapshot())}:{}),
            answers: unit.scale.definition!.items.flatMap(question => {
              const answer = saved.get(wholeAnswerKey(unit.itemId, question.itemCode))
              return answer?.responseValue === undefined ? [] : [{ itemCode: question.itemCode, ...answer }]
            }), ...(provenance?.[unit.itemId] ? { deviceInputProvenance: provenance[unit.itemId] } : {}) })) }
      })
      if (!sealed) throw new Error('本地整卷草稿不存在，请重新加载')
      setMeta(sealed.meta)
      const result = await runFinalDraftCapacityRetry({ operation: async () => {
        const lookup = api.wholeReceipt ? () => api.wholeReceipt!(state.id, sealed.payload.submissionId, sealed.payload.attemptEpoch) : undefined
        if (meta.sealedSubmission) {
          const recovered = await readMatchingWholeReceipt(lookup, state.id, sealed.payload.submissionId)
          if (recovered) return recovered
        }
        let response: ApiResponse<WholeQuestionnaireReceipt>
        try {
          response = await api.submitWhole(state.id, sealed.payload)
          if (response.code !== 0 || !response.data) throw responseError(response)
        } catch (cause) {
          if (isRecoverableReceiptError(cause)) {
            const recovered = await readMatchingWholeReceipt(lookup, state.id, sealed.payload.submissionId)
            if (recovered) return recovered
          }
          throw cause
        }
        const receipt = response.data
        if (receipt.status !== 'ACCEPTED' || receipt.attemptId !== state.id || receipt.submissionId !== sealed.payload.submissionId || !receipt.payloadHash) throw new Error('未收到匹配的持久化交卷回执，草稿已保留。')
        return receipt
      }, onRetry: async ({ error: cause }) => {
        const pending = await finalDraftStore.setStatus(draftKey, 'RETRY_PENDING', { code: String(normalizeApiError(cause).code ?? 'ASSESSMENT_SUBMIT_BUSY'), message: normalizeApiError(cause).message })
        if (pending) setMeta(pending)
        setError('服务器繁忙或网络中断，正在重试同一份整卷；答案已保留。')
      } })
      confirmed = true; setAccepted(true); rememberWholeReceipt(result)
      try { sessionStorage.setItem(`composite:whole-receipt:${state.id}`, JSON.stringify(result)) } catch { /* The server receipt is already durable. */ }
      await finalDraftStore.setStatus(draftKey, 'COMPLETED')
      await finalDraftStore.delete(draftKey)
      onCompleted()
    } catch (cause) {
      if (confirmed) { setError('交卷已保存。报告页面暂未打开，请点击查看报告，无需重新交卷。'); return }
      const next = await recordFinalSubmissionFailure(draftKey, cause, meta.submissionId).catch(() => null)
      if (next) setMeta(next)
      setError(normalizeApiError(cause).message)
    } finally { submitting.current = false; setBusy(false); setSubmitStartedAt(null) }
  }
  const unitPath = current ? `${publicMode ? '/api/public/composite-assessments' : '/api/composite-assessments'}/attempts/${encodeURIComponent(state.id)}/items/${encodeURIComponent(current.unit.itemId)}/scale` : ''
  const loadImage = useCallback(async (assetId: string) => {
    const response = await sessionFetch(`${unitPath}/assets/${encodeURIComponent(assetId)}/content`, publicMode ? { headers: { 'X-Recovery-Token': recoveryToken || '' } } : undefined)
    if (!response.ok) throw new Error(`视觉内容加载失败 (${response.status})`)
    return response.blob()
  }, [unitPath, publicMode, recoveryToken])
  if (useFallback) return <>{fallback}</>
  if (loading) return <p role="status" className="p-6 text-slate-600">正在恢复整卷本机草稿…</p>
  return <AssessmentShell title={state.name} eyebrow="问卷"
    instructions={<div className="space-y-2">{state.instruction ? <p>{state.instruction}</p> : null}<p>整卷答案保存在当前浏览器，最后一次提交。请使用同一浏览器继续未提交的草稿。</p></div>}
    progress={definition ? { kind: 'count', completed: Object.keys(answers).length, total: questions.length, label: '整卷作答进度' } : undefined}
    saveStatus={local.status}
    submissionStatus={accepted ? { state: 'committed', message: publicMode ? '整份问卷已可靠保存。报告按生成状态和开放权限显示，无需再次交卷。' : '整份问卷已可靠保存，正在生成报告。' } : busy ? { state: 'submitting', message: submitElapsedSeconds >= 8 ? `已等待 ${submitElapsedSeconds} 秒，正在确认服务器保存；请勿关闭，本机草稿仍保留。` : '正在提交并确认保存…' } : locked ? { state: 'pending', message: '整卷已封存，重试将使用相同内容。' } : { state: 'ready' }}
    actions={<button type="button" className="btn-secondary min-h-11" disabled={busy || checkpointBusy} onClick={() => void saveAndExit()}>保存并退出</button>}>
    {definition && meta && !accepted ? <TrainingCheckpointPanel policy={state.trainingPersistence} definitionHash={state.checkpointDefinitionHash} publicMode={publicMode} recoveryToken={recoveryToken}
      disabled={busy || meta.status !== 'DRAFT' || !!meta.sealedSubmission} onBusy={setCheckpointBusy} activeSlotKeys={definition.units.map(unit=>`scale:${unit.itemId}`)}
      getDrafts={async()=>{await flush();return definition.units.map(unit=>({slotKey:`scale:${unit.itemId}`,answers:Object.fromEntries(unit.scale.definition!.items.filter(q=>answers[wholeAnswerKey(unit.itemId,q.itemCode)]!==undefined).map(q=>[q.itemCode,answers[wholeAnswerKey(unit.itemId,q.itemCode)]])),...(timingRef.current[unit.itemId]?{itemTimings:timingRef.current[unit.itemId].snapshot()}: {})}))}}
      restore={async rows=>{
        await flush()
        const next: Record<string, Answer> = {}
        const nextTiming: Record<string, SurveyScaleTimingTracker> = {}
        for (const unit of definition.units) {
          const row = rows.find(row => row.slotKey === `scale:${unit.itemId}`)
          // This is one logical whole-draft replacement. A partial server
          // checkpoint cannot authorize discarding the other local units.
          if (!row) throw new Error('服务器整卷草稿不完整，本机内容保持不变。')
          for (const q of unit.scale.definition!.items) if (Object.prototype.hasOwnProperty.call(row.answers, q.itemCode)) next[wholeAnswerKey(unit.itemId, q.itemCode)] = readAnswer(row.answers[q.itemCode])
          if (unit.trainingTiming) nextTiming[unit.itemId] = new SurveyScaleTimingTracker(row.itemTimings ?? {}, Object.fromEntries(Object.entries(row.answers).map(([key, value]) => [key, readAnswer(value).responseValue])))
        }
        const wholeScaleTiming = Object.fromEntries(definition.units.filter(unit => unit.trainingTiming).map(unit => [unit.itemId,
          { snapshotHash: unit.trainingTiming!.snapshotHash, items: nextTiming[unit.itemId].snapshot() }]))
        await finalDraftStore.replaceAnswers(meta, Object.entries(next).map(([itemKey, value]) => ({ draftKey, itemKey, value, updatedAt: Date.now() })), { wholeScaleTiming })
        // Every unit's answers and timing committed together before UI/ref changes.
        setCheckpointRestoreGeneration(value => value + 1)
        timingRef.current = nextTiming
        setAnswers(next); setIndex(0)
      }}/>:null}
    {error ? <p role="alert" className="mb-4 text-red-700">{error}</p> : null}
    {publicMode && recoveryToken ? <p className="mb-4 text-sm text-gray-600">请在页面上方保存本次匿名作答的恢复链接。链接不包含未提交答案，本机草稿或已保存的临时进度仍按各自有效期恢复。</p> : null}
    {accepted ? <div className="space-y-4"><h2 className="text-xl font-semibold">交卷成功</h2><p>答案已保存。可以离开页面，稍后查看报告；报告失败不需要重新交卷。</p><button className="btn-primary min-h-11" type="button" onClick={onCompleted}>查看报告进度</button></div>
      : meta?.sealedSubmission ? <div className="space-y-4"><p>整卷已封存，本机草稿会保留到服务器确认保存。</p><button type="button" className="btn-primary min-h-11" disabled={busy || meta.status === 'CONFLICT'} onClick={() => void submit()}>重试并确认整卷提交</button></div>
        : current ? <div id={publicMode ? `training-anonymous-whole-required:${state.id}` : undefined} tabIndex={publicMode ? -1 : undefined} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="mb-3 text-xl font-semibold">{current.unit.scale.name}</h2>
          {current.unit.scale.instruction ? <p className="mb-4 whitespace-pre-wrap text-slate-600">{current.unit.scale.instruction}</p> : null}
          <p className="mb-4 text-sm text-slate-600">整卷第 {index + 1} / {questions.length} 题</p>
          <TrainingMaterials items={current.question.materials} loadAsset={loadImage}/>
          <AssessmentImageGate items={assessmentImageItems((current.question as { images?: unknown }).images)} loadAsset={loadImage} disabled={busy}>
            <ScaleFormVideoGate presentation={scaleItemVideoPresentation(current.question)} loadSources={() => requestAssessmentVideoCapabilities(`${unitPath}/items/${encodeURIComponent(current.question.itemCode)}/video-capability`, publicMode ? { headers: { 'X-Recovery-Token': recoveryToken || '' } } : undefined)}>
              {(()=>{const player=(<ScalePlayer scopeKey={`${draftKey}:${current.unit.itemId}:${checkpointRestoreGeneration}`} autoAdvance={isTrainingHost() && !publicMode} item={current.question} value={answers[wholeAnswerKey(current.unit.itemId, current.question.itemCode)]?.responseValue}
                answerDisabled={locked || busy} navigationDisabled={busy} submitDisabled={busy || meta?.status === 'CONFLICT'}
                position={index + 1} total={questions.length} onChange={saveAnswer} onPrevious={() => setIndex(prior => Math.max(0, prior - 1))}
                onNext={index + 1 < questions.length ? () => setIndex(prior => prior + 1) : undefined}
                onSubmit={index + 1 === questions.length ? submit : undefined} submitLabel="提交整份问卷" submitting={busy} />);const tracker=timingRef.current[current.unit.itemId];return current.unit.trainingTiming&&tracker?<TrainingTimingBoundary tracker={tracker} itemKey={current.question.itemCode} locked={locked||busy} onTiming={()=>{if(!locked&&!busy&&!submitting.current)void schedule('whole-timing',()=>finalDraftStore.setInstrumentMetadata(draftKey,{wholeScaleTiming:timingMetadata()}).then(()=>undefined)).catch(()=>undefined)}}>{player}</TrainingTimingBoundary>:player})()}
            </ScaleFormVideoGate>
          </AssessmentImageGate>
        </div> : <button type="button" className="btn-secondary min-h-11" onClick={() => setLoadRound(prior => prior + 1)}>重新加载整卷草稿</button>}
  </AssessmentShell>
}

/** Conditional paths must submit only the current accepted unit, even if a
 * stale whole-questionnaire draft happens to exist in this browser. */
export default function WholeCompositeQuestionnaire(props: Props) {
  if (props.state.trainingFlow || props.state.currentItem?.presentationMode === 'ALL_AT_ONCE') return <>{props.fallback}</>
  return <WholeCompositeQuestionnaireRunner {...props} />
}
