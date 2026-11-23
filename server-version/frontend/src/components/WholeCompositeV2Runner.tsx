import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { deferredPage } from './page-loading/deferredPage'
import { AssessmentShell } from './assessment-shell'
import { ReceiptOnlyConfirmation } from './ReceiptOnlyConfirmation'
import ScalePlayer from './questionnaire/ScalePlayer'
import { FormPlayer, type FormPlayerValue } from './questionnaire/FormPlayer'
import AssessmentImageGate from '../modules/assessment-media/AssessmentImageGate'
import { assessmentImageItems } from '../modules/assessment-media/adapter'
import { createWholeCognitiveSessionApi } from '../modules/composite/whole-cognitive-adapter'
import { createWholeSituationalRunnerClient } from '../modules/composite/whole-situational-adapter'
import type { CognitiveSessionApi } from '../modules/cognitive/api'
import type { SituationalRunnerClient } from '../modules/situational/api'
import type { CompositeScaleRunnerItem, WholeQuestionnaireFormSectionItem } from '../modules/composite/types'
import type {
  WholeV2Client,
  WholeV2CognitiveTemplateUnit,
  WholeV2FormSectionTemplateUnit,
  WholeV2LockedUnit,
  WholeV2Meta,
  WholeV2Receipt,
  WholeV2ScaleTemplateUnit,
  WholeV2SituationalTemplateUnit,
  WholeV2Template,
  WholeV2UnitSubmitPayload,
} from '../modules/composite/whole-v2.types'
import { normalizeApiError } from '../utils/normalizeApiError'

const LazyCognitiveRunner = deferredPage(async () => ({
  default: (await import('../modules/cognitive/pages/CognitiveRunner')).CognitiveRunner,
}))
const LazySituationalRunner = deferredPage(() => import('../modules/situational/pages/SituationalRunner'))

export type WholeV2Step =
  | {
      kind: 'SCALE_ITEM'
      slotKey: string
      unit: WholeV2ScaleTemplateUnit
      question: CompositeScaleRunnerItem
    }
  | {
      kind: 'FORM_ITEM'
      slotKey: string
      unit: WholeV2FormSectionTemplateUnit
      item: WholeQuestionnaireFormSectionItem
    }
  | {
      kind: 'SITUATIONAL_UNIT'
      slotKey: string
      unit: WholeV2SituationalTemplateUnit
    }
  | {
      kind: 'COGNITIVE_UNIT'
      slotKey: string
      unit: WholeV2CognitiveTemplateUnit
    }

export interface WholeCompositeV2RunnerProps {
  attemptId: string
  title?: string
  instruction?: string | null
  client: WholeV2Client
  onExit: () => void
  onCompleted: (receipt: WholeV2Receipt) => void
  onReceiptAccepted?: (completedAt?: string) => void
  /** Optional test seams to inject lightweight runners in unit tests. */
  renderCognitive?: (props: {
    sessionId: string
    api: CognitiveSessionApi
    onCompleted: () => void
    onExit: () => void
  }) => React.ReactNode
  renderSituational?: (props: {
    attemptId: string
    parentAttemptId: string
    compositeItemId: string
    client: SituationalRunnerClient
    onCompleted: () => void
  }) => React.ReactNode
}

function makeSubmissionId(attemptId: string, epoch: number): string {
  const rand = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  return `wholev2:${attemptId}:${epoch}:${rand}`
}

function parseFormOptions(
  rawOptions: WholeQuestionnaireFormSectionItem['formOptions'],
  formDef?: WholeQuestionnaireFormSectionItem['formDefinition'],
): Array<{ value: string; label: string }> {
  if (formDef && Array.isArray((formDef as { options?: unknown[] }).options)) {
    return ((formDef as { options: Array<Record<string, unknown>> }).options).map(o => ({
      value: String(o.optionKey ?? o.value ?? ''),
      label: String(o.label ?? ''),
    }))
  }
  if (Array.isArray(rawOptions)) {
    return rawOptions.map(o => ({
      value: String((o as { value?: unknown; optionKey?: unknown }).value ?? (o as { optionKey?: unknown }).optionKey ?? ''),
      label: String((o as { label?: unknown }).label ?? ''),
    }))
  }
  if (typeof rawOptions === 'string') {
    try {
      const parsed = JSON.parse(rawOptions)
      if (Array.isArray(parsed)) {
        return parsed.map((o: Record<string, unknown>) => ({
          value: String(o.value ?? o.optionKey ?? ''),
          label: String(o.label ?? ''),
        }))
      }
    } catch {
      /* ignore malformed legacy options string */
    }
  }
  return []
}

function isAnsweredValue(val: unknown): boolean {
  if (val === undefined || val === null) return false
  if (typeof val === 'string') return val.trim().length > 0
  if (Array.isArray(val)) return val.length > 0
  return true
}

export function WholeCompositeV2Runner({
  attemptId,
  title: fallbackTitle,
  instruction: fallbackInstruction,
  client,
  onExit,
  onCompleted,
  onReceiptAccepted,
  renderCognitive,
  renderSituational,
}: WholeCompositeV2RunnerProps) {
  const [meta, setMeta] = useState<WholeV2Meta | null>(null)
  const [template, setTemplate] = useState<WholeV2Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Scale & Form drafts keyed by slotKey -> itemCode/formItemId -> value
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({})
  const [formOtherTexts, setFormOtherTexts] = useState<Record<string, Record<string, string>>>({})
  const [lockedUnits, setLockedUnits] = useState<Record<string, WholeV2LockedUnit>>({})
  const [revision, setRevision] = useState(0)
  const [index, setIndex] = useState(0)
  const [savingDraft, setSavingDraft] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<WholeV2Receipt | null>(null)

  const startedAtRef = useRef<number>(Date.now())
  const submissionIdRef = useRef<string | null>(null)
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const revisionRef = useRef(revision)
  revisionRef.current = revision

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void (async () => {
      try {
        const metaRes = await client.loadMeta()
        if (metaRes.code !== 0 || !metaRes.data) {
          throw new Error(metaRes.message || '加载整卷元数据失败')
        }
        const tplRes = await client.loadTemplate(metaRes.data.templateHash)
        if (tplRes.code !== 0 || !tplRes.data) {
          throw new Error(tplRes.message || '加载整卷模板失败')
        }
        if (cancelled) return
        setMeta(metaRes.data)
        setTemplate(tplRes.data)
        setRevision(metaRes.data.checkpoint.revision)
        setDrafts(metaRes.data.checkpoint.envelope?.drafts ?? {})
        setLockedUnits(metaRes.data.checkpoint.envelope?.lockedUnits ?? {})
        submissionIdRef.current = makeSubmissionId(metaRes.data.attemptId, metaRes.data.attemptEpoch)
      } catch (cause) {
        if (!cancelled) setLoadError(normalizeApiError(cause).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [attemptId, client])

  const steps = useMemo<WholeV2Step[]>(() => {
    if (!template) return []
    const ordered = [...template.units].sort((a, b) => a.position - b.position)
    const list: WholeV2Step[] = []
    for (const unit of ordered) {
      if (unit.unitType === 'FORM_SECTION') {
        for (const item of unit.items) {
          list.push({ kind: 'FORM_ITEM', slotKey: unit.slotKey, unit, item })
        }
      } else if (unit.unitType === 'SCALE') {
        for (const question of unit.definition.items) {
          list.push({ kind: 'SCALE_ITEM', slotKey: unit.slotKey, unit, question })
        }
      } else if (unit.unitType === 'SITUATIONAL') {
        list.push({ kind: 'SITUATIONAL_UNIT', slotKey: unit.slotKey, unit })
      } else if (unit.unitType === 'COGNITIVE') {
        list.push({ kind: 'COGNITIVE_UNIT', slotKey: unit.slotKey, unit })
      }
    }
    return list
  }, [template])

  const completedStepsCount = useMemo(() => {
    let count = 0
    for (const step of steps) {
      if (step.kind === 'SCALE_ITEM') {
        if (isAnsweredValue(drafts[step.slotKey]?.[step.question.itemCode])) count += 1
      } else if (step.kind === 'FORM_ITEM') {
        if (isAnsweredValue(drafts[step.slotKey]?.[step.item.id])) count += 1
      } else {
        if (lockedUnits[step.slotKey]) count += 1
      }
    }
    return count
  }, [steps, drafts, lockedUnits])

  const persistCheckpoint = useCallback(async (
    lockUnit?: {
      slotKey: string
      unit:
        | Omit<Extract<WholeV2LockedUnit, { unitType: 'COGNITIVE' }>, 'lockedAt' | 'payloadHash'>
        | Omit<Extract<WholeV2LockedUnit, { unitType: 'SITUATIONAL' }>, 'lockedAt' | 'payloadHash'>
    },
  ) => {
    if (!meta) return
    setSavingDraft(true)
    setError(null)
    try {
      const res = await client.saveCheckpoint({
        expectedRevision: revisionRef.current,
        attemptEpoch: meta.attemptEpoch,
        drafts: draftsRef.current,
        ...(lockUnit ? { lockUnit } : {}),
      })
      if (res.code !== 0 || !res.data) {
        throw new Error(res.message || '保存进度失败')
      }
      setRevision(res.data.revision)
      if (res.data.envelope) {
        setDrafts(res.data.envelope.drafts)
        setLockedUnits(res.data.envelope.lockedUnits)
      }
    } catch (cause) {
      const msg = normalizeApiError(cause).message
      setError(msg)
      throw cause
    } finally {
      setSavingDraft(false)
    }
  }, [client, meta])

  const saveAndExit = useCallback(async () => {
    try {
      await persistCheckpoint()
      onExit()
    } catch {
      /* error already displayed */
    }
  }, [persistCheckpoint, onExit])

  const setScaleAnswer = useCallback((slotKey: string, itemCode: string, value: string | number) => {
    setError(null)
    setDrafts(prev => ({
      ...prev,
      [slotKey]: { ...(prev[slotKey] ?? {}), [itemCode]: value },
    }))
  }, [])

  const setFormAnswer = useCallback((slotKey: string, formItemId: string, value: FormPlayerValue) => {
    setError(null)
    setDrafts(prev => ({
      ...prev,
      [slotKey]: { ...(prev[slotKey] ?? {}), [formItemId]: value },
    }))
  }, [])

  const setFormOtherText = useCallback((slotKey: string, formItemId: string, text: string) => {
    setFormOtherTexts(prev => ({
      ...prev,
      [slotKey]: { ...(prev[slotKey] ?? {}), [formItemId]: text },
    }))
  }, [])

  const submitWhole = useCallback(async () => {
    if (!meta || !template || submitting) return
    setError(null)

    const unitsPayload: Record<string, WholeV2UnitSubmitPayload> = {}
    for (const unit of template.units) {
      if (unit.unitType === 'FORM_SECTION') {
        const slotDraft = draftsRef.current[unit.slotKey] ?? {}
        const otherMap = formOtherTexts[unit.slotKey] ?? {}
        for (const item of unit.items) {
          if (item.required && !isAnsweredValue(slotDraft[item.id])) {
            setError(`请先完成必填项：${item.formLabel}`)
            return
          }
        }
        unitsPayload[unit.slotKey] = {
          unitType: 'FORM_SECTION',
          definitionHash: unit.definitionHash,
          answers: unit.items
            .filter(item => slotDraft[item.id] !== undefined)
            .map(item => ({
              formItemId: item.id,
              value: slotDraft[item.id],
              ...(otherMap[item.id] !== undefined ? { otherText: otherMap[item.id] } : {}),
            })),
        }
      } else if (unit.unitType === 'SCALE') {
        const slotDraft = draftsRef.current[unit.slotKey] ?? {}
        for (const item of unit.definition.items) {
          if (item.required && !isAnsweredValue(slotDraft[item.itemCode])) {
            setError(`请先完成量表题目：${item.content}`)
            return
          }
        }
        unitsPayload[unit.slotKey] = {
          unitType: 'SCALE',
          definitionHash: unit.definitionHash,
          answers: unit.definition.items
            .filter(item => slotDraft[item.itemCode] !== undefined)
            .map(item => ({
              itemCode: item.itemCode,
              responseValue: slotDraft[item.itemCode] as string | number,
            })),
        }
      } else if (unit.unitType === 'SITUATIONAL') {
        const locked = lockedUnits[unit.slotKey]
        if (!locked || locked.unitType !== 'SITUATIONAL') {
          if (unit.required) {
            setError(`请先完成情境测评：${unit.title}`)
            return
          }
          continue
        }
        unitsPayload[unit.slotKey] = {
          unitType: 'SITUATIONAL',
          definitionHash: unit.definitionHash,
          responses: locked.responses,
          ...(locked.researchEvents ? { researchEvents: locked.researchEvents } : {}),
          ...(locked.totalTimeMs !== undefined ? { totalTimeMs: locked.totalTimeMs } : {}),
        }
      } else if (unit.unitType === 'COGNITIVE') {
        const locked = lockedUnits[unit.slotKey]
        if (!locked || locked.unitType !== 'COGNITIVE') {
          if (unit.required) {
            setError(`请先完成认知测验：${unit.title}`)
            return
          }
          continue
        }
        unitsPayload[unit.slotKey] = {
          unitType: 'COGNITIVE',
          definitionHash: unit.definitionHash,
          randomSeed: locked.randomSeed,
          trials: locked.trials,
          ...(locked.summaryMeta ? { summaryMeta: locked.summaryMeta } : {}),
        }
      }
    }

    setSubmitting(true)
    try {
      const submissionId = submissionIdRef.current ?? makeSubmissionId(meta.attemptId, meta.attemptEpoch)
      submissionIdRef.current = submissionId
      const res = await client.submitWhole({
        submissionId,
        attemptEpoch: meta.attemptEpoch,
        publicationHash: meta.publicationHash,
        slotSetHash: meta.slotSetHash,
        totalTimeMs: Math.max(0, Date.now() - startedAtRef.current),
        units: unitsPayload,
      })
      if (res.code !== 0 || !res.data) {
        throw new Error(res.message || '整卷提交失败')
      }
      setReceipt(res.data)
      if (res.data.receiptOnly) {
        onReceiptAccepted?.(res.data.completedAt)
      } else {
        onCompleted(res.data)
      }
    } catch (cause) {
      setError(normalizeApiError(cause).message)
    } finally {
      setSubmitting(false)
    }
  }, [meta, template, submitting, formOtherTexts, lockedUnits, client, onReceiptAccepted, onCompleted])

  const current = steps[index]

  const activeCognitiveApi = useMemo<CognitiveSessionApi | null>(() => {
    if (!meta || current?.kind !== 'COGNITIVE_UNIT') return null
    const seed = meta.unitSeeds?.[current.slotKey]
    if (!seed) return null
    return createWholeCognitiveSessionApi({
      slot: current.unit,
      randomSeed: seed,
      attemptEpoch: meta.attemptEpoch,
      alreadyLocked: Boolean(lockedUnits[current.slotKey]),
      loadSlotImage: client.loadSlotImage,
      issueSlotVideo: client.issueSlotVideo,
      onLockUnit: async unit => {
        await persistCheckpoint({ slotKey: current.slotKey, unit })
      },
    })
  }, [meta, current, lockedUnits, client, persistCheckpoint])

  const activeSituationalClient = useMemo<SituationalRunnerClient | null>(() => {
    if (!meta || current?.kind !== 'SITUATIONAL_UNIT') return null
    return createWholeSituationalRunnerClient({
      slot: current.unit,
      parentAttemptId: meta.attemptId,
      attemptEpoch: meta.attemptEpoch,
      alreadyLocked: Boolean(lockedUnits[current.slotKey]),
      loadSlotImage: client.loadSlotImage,
      issueSlotVideo: client.issueSlotVideo,
      onLockUnit: async unit => {
        await persistCheckpoint({ slotKey: current.slotKey, unit })
      },
    })
  }, [meta, current, lockedUnits, client, persistCheckpoint])

  const advanceAfterUnitComplete = useCallback(() => {
    setIndex(prev => (prev + 1 < steps.length ? prev + 1 : prev))
  }, [steps.length])

  if (loading) {
    return <p role="status" className="p-6 text-slate-600">正在加载整卷测评定义…</p>
  }

  if (loadError || !meta || !template) {
    return (
      <div role="alert" className="space-y-4 p-6">
        <p className="text-red-700">{loadError || '整卷定义不可用'}</p>
        <button type="button" className="btn-secondary min-h-11" onClick={onExit}>返回</button>
      </div>
    )
  }

  if (receipt?.receiptOnly) {
    return <ReceiptOnlyConfirmation acceptedAt={receipt.completedAt} onExit={onExit} />
  }

  const displayTitle = template.title || fallbackTitle || '综合测评'
  const displayInstruction = template.instruction ?? fallbackInstruction

  return (
    <AssessmentShell
      title={displayTitle}
      eyebrow="综合测评"
      instructions={
        <div className="space-y-2">
          {displayInstruction ? <p>{displayInstruction}</p> : null}
          <p>整卷答案可随时暂存；认知测验与情境测评完成后将自动锁定，全部完成后一次提交。</p>
        </div>
      }
      progress={{ kind: 'count', completed: completedStepsCount, total: steps.length, label: '整卷作答进度' }}
      saveStatus={savingDraft ? { state: 'saving', message: '正在保存进度…' } : { state: 'idle' }}
      submissionStatus={
        receipt
          ? { state: 'committed', message: '整份测评已提交并完成计分。' }
          : submitting
            ? { state: 'submitting', message: '正在提交整份测评…' }
            : { state: 'ready' }
      }
      actions={
        <button
          type="button"
          className="btn-secondary min-h-11"
          disabled={submitting || savingDraft}
          onClick={() => void saveAndExit()}
        >
          保存并退出
        </button>
      }
    >
      {error ? <p role="alert" className="mb-4 text-red-700">{error}</p> : null}

      {current?.kind === 'SCALE_ITEM' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="mb-2 text-xl font-semibold">{current.unit.title}</h2>
          {current.unit.instruction ? (
            <p className="mb-4 whitespace-pre-wrap text-slate-600">{current.unit.instruction}</p>
          ) : null}
          <p className="mb-4 text-sm text-slate-600">整卷第 {index + 1} / {steps.length} 步</p>
          <AssessmentImageGate
            items={assessmentImageItems((current.question as { images?: unknown }).images)}
            loadAsset={assetId => client.loadSlotImage(current.slotKey, assetId)}
            disabled={submitting}
          >
            <ScalePlayer
              scopeKey={`wholev2:${meta.attemptId}:${current.slotKey}`}
              item={current.question}
              value={drafts[current.slotKey]?.[current.question.itemCode] as string | number | undefined}
              answerDisabled={submitting}
              navigationDisabled={submitting}
              submitDisabled={submitting}
              position={index + 1}
              total={steps.length}
              onChange={val => setScaleAnswer(current.slotKey, current.question.itemCode, val)}
              onPrevious={() => setIndex(prev => Math.max(0, prev - 1))}
              onNext={index + 1 < steps.length ? () => setIndex(prev => prev + 1) : undefined}
              onSubmit={index + 1 === steps.length ? () => void submitWhole() : undefined}
              submitLabel="提交整份问卷"
              submitting={submitting}
            />
          </AssessmentImageGate>
        </div>
      ) : null}

      {current?.kind === 'FORM_ITEM' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="mb-2 text-xl font-semibold">{current.unit.title}</h2>
          {current.unit.description ? (
            <p className="mb-4 whitespace-pre-wrap text-slate-600">{current.unit.description}</p>
          ) : null}
          <p className="mb-4 text-sm text-slate-600">整卷第 {index + 1} / {steps.length} 步</p>
          <FormPlayer
            scopeKey={`wholev2:${meta.attemptId}:${current.slotKey}`}
            item={{
              id: current.item.id,
              type: current.item.formType,
              label: current.item.formLabel,
              placeholder: current.item.formPlaceholder,
              required: current.item.required,
              formDefinition: current.item.formDefinition,
              formPolicy: current.item.formPolicy as any,
            }}
            options={parseFormOptions(current.item.formOptions, current.item.formDefinition)}
            value={drafts[current.slotKey]?.[current.item.id] as FormPlayerValue}
            otherText={formOtherTexts[current.slotKey]?.[current.item.id]}
            onOtherTextChange={text => setFormOtherText(current.slotKey, current.item.id, text)}
            answerDisabled={submitting}
            navigationDisabled={submitting}
            submitDisabled={submitting}
            position={index + 1}
            total={steps.length}
            onChange={val => setFormAnswer(current.slotKey, current.item.id, val)}
            onPrevious={() => setIndex(prev => Math.max(0, prev - 1))}
            onNext={index + 1 < steps.length ? () => setIndex(prev => prev + 1) : undefined}
            onSubmit={index + 1 === steps.length ? () => void submitWhole() : undefined}
            submitLabel="提交整份问卷"
            submitting={submitting}
          />
        </div>
      ) : null}

      {current?.kind === 'SITUATIONAL_UNIT' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="mb-2 text-xl font-semibold">{current.unit.title}</h2>
          <p className="mb-4 text-sm text-slate-600">整卷第 {index + 1} / {steps.length} 步（情境测评）</p>
          {lockedUnits[current.slotKey] ? (
            <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4" data-testid={`locked-unit:${current.slotKey}`}>
              <p className="flex items-center gap-2 font-medium text-emerald-800">
                <Lock className="h-4 w-4" aria-hidden="true" />
                本项情境测评已完成并锁定，不可重复作答。
              </p>
              <div className="flex flex-wrap gap-3">
                {index > 0 ? (
                  <button type="button" className="btn-secondary min-h-11" onClick={() => setIndex(prev => prev - 1)}>
                    上一步
                  </button>
                ) : null}
                {index + 1 < steps.length ? (
                  <button type="button" className="btn-primary min-h-11" onClick={() => setIndex(prev => prev + 1)}>
                    继续下一步
                  </button>
                ) : (
                  <button type="button" className="btn-primary min-h-11" disabled={submitting} onClick={() => void submitWhole()}>
                    {submitting ? '正在提交…' : '提交整份问卷'}
                  </button>
                )}
              </div>
            </div>
          ) : activeSituationalClient ? (
            renderSituational ? (
              renderSituational({
                attemptId: current.slotKey,
                parentAttemptId: meta.attemptId,
                compositeItemId: current.unit.itemId,
                client: activeSituationalClient,
                onCompleted: advanceAfterUnitComplete,
              })
            ) : (
              <MemoryRouter key={current.slotKey}>
                <LazySituationalRunner
                  host={{
                    attemptId: current.slotKey,
                    parentAttemptId: meta.attemptId,
                    compositeItemId: current.unit.itemId,
                    client: activeSituationalClient,
                    instructionsSummary: '作答说明',
                    onCompleted: advanceAfterUnitComplete,
                  }}
                />
              </MemoryRouter>
            )
          ) : null}
        </div>
      ) : null}

      {current?.kind === 'COGNITIVE_UNIT' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="mb-2 text-xl font-semibold">{current.unit.title}</h2>
          <p className="mb-4 text-sm text-slate-600">整卷第 {index + 1} / {steps.length} 步（认知测验）</p>
          {lockedUnits[current.slotKey] ? (
            <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4" data-testid={`locked-unit:${current.slotKey}`}>
              <p className="flex items-center gap-2 font-medium text-emerald-800">
                <Lock className="h-4 w-4" aria-hidden="true" />
                本项认知测验已完成并锁定，不可重复作答。
              </p>
              <div className="flex flex-wrap gap-3">
                {index > 0 ? (
                  <button type="button" className="btn-secondary min-h-11" onClick={() => setIndex(prev => prev - 1)}>
                    上一步
                  </button>
                ) : null}
                {index + 1 < steps.length ? (
                  <button type="button" className="btn-primary min-h-11" onClick={() => setIndex(prev => prev + 1)}>
                    继续下一步
                  </button>
                ) : (
                  <button type="button" className="btn-primary min-h-11" disabled={submitting} onClick={() => void submitWhole()}>
                    {submitting ? '正在提交…' : '提交整份问卷'}
                  </button>
                )}
              </div>
            </div>
          ) : activeCognitiveApi ? (
            renderCognitive ? (
              renderCognitive({
                sessionId: current.slotKey,
                api: activeCognitiveApi,
                onCompleted: advanceAfterUnitComplete,
                onExit: () => void saveAndExit(),
              })
            ) : (
              <MemoryRouter key={current.slotKey}>
                <LazyCognitiveRunner
                  embedded={{
                    sessionId: current.slotKey,
                    api: activeCognitiveApi,
                    completionTitle: '本项认知测验已完成并锁定',
                    completionAction: index + 1 < steps.length ? '继续下一步' : '返回整卷提交',
                    completionNotice: '测验原始记录已锁定保存，完成所有单元后统一提交整份问卷。',
                    onCompleted: advanceAfterUnitComplete,
                    onExit: () => void saveAndExit(),
                  }}
                />
              </MemoryRouter>
            )
          ) : (
            <p role="alert" className="text-red-700">当前认知测验缺少服务端签发的随机种子，请刷新重试。</p>
          )}
        </div>
      ) : null}
    </AssessmentShell>
  )
}

export default WholeCompositeV2Runner
