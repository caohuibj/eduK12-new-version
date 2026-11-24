import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MemoryRouter, useInRouterContext } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { deferredPage } from './page-loading/deferredPage'
import { AssessmentShell } from './assessment-shell'
import { ReceiptOnlyConfirmation } from './ReceiptOnlyConfirmation'
import ScalePlayer from './questionnaire/ScalePlayer'
import { FormPlayer, type FormPlayerValue } from './questionnaire/FormPlayer'
import AssessmentImageGate from '../modules/assessment-media/AssessmentImageGate'
import FormOptionVideoGroupGate from '../modules/assessment-media/FormOptionVideoGroupGate'
import ScaleFormVideoGate from '../modules/assessment-media/ScaleFormVideoGate'
import { TrainingMaterials } from '../modules/assessment-media/TrainingMaterials'
import { assessmentImageItems, assessmentOptionImageItems } from '../modules/assessment-media/adapter'
import { formOptionVideoPresentations, scaleItemVideoPresentation } from '../modules/assessment-media/video-adapter'
import type { PublicMaterial } from '../modules/assessment-media/material'
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
  WholeV2SubmitInput,
  WholeV2Template,
  WholeV2UnitSubmitPayload,
} from '../modules/composite/whole-v2.types'
import { normalizeApiError } from '../utils/normalizeApiError'
import {
  SurveyScaleTimingTracker,
  sealObservedScaleTimings,
  type SurveyScaleTimings,
} from '../modules/scale/item-timing'
import { TrainingTimingBoundary } from '../modules/scale/TrainingTimingBoundary'

const LazyCognitiveRunner = deferredPage(async () => ({
  default: (await import('../modules/cognitive/pages/CognitiveRunner')).CognitiveRunner,
}))
const LazySituationalRunner = deferredPage(() => import('../modules/situational/pages/SituationalRunner'))

const OTHER_TEXT_PREFIX = '__otherText:'
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000
const MIN_TTL_MS = 60 * 60 * 1000
const MAX_TTL_MS = 48 * 60 * 60 * 1000

interface StoredLocalDraft {
  drafts: Record<string, Record<string, unknown>>
  formOtherTexts: Record<string, Record<string, string>>
  itemTimings?: Record<string, SurveyScaleTimings>
  elapsedMs: number
  updatedAt: number
  expiresAt: number
}

interface SealedPendingSubmission {
  submissionId: string
  payload: WholeV2SubmitInput
  sealedAt: string
  expiresAt: number
}

interface CheckpointConflictState {
  serverRevision: number
  serverUpdatedAt: string | null
  serverDrafts: Record<string, Record<string, unknown>>
  serverFormOtherTexts: Record<string, Record<string, string>>
  serverItemTimings: Record<string, SurveyScaleTimings>
  serverLockedUnits: Record<string, WholeV2LockedUnit>
}

type SealedRecoveryState = 'SEALED' | 'UNCONFIRMED' | 'REJECTED_CONFLICT'

function clampTtlMs(ttlHours?: number | null): number {
  if (typeof ttlHours !== 'number' || !Number.isFinite(ttlHours)) return DEFAULT_TTL_MS
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, Math.round(ttlHours * 3_600_000)))
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    /* ignore restricted storage environments */
  }
  return null
}

function draftStorageKey(attemptId: string, epoch: number): string {
  return `whole_v2_draft:${attemptId}:${epoch}`
}

function pendingStorageKey(attemptId: string, epoch: number): string {
  return `whole_v2_pending:${attemptId}:${epoch}`
}

function readStoredJson<T>(key: string): T | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeStoredJson(key: string, value: unknown): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota errors */
  }
}

function removeStoredKey(key: string): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    /* ignore storage errors */
  }
}

/** Strips Cognitive raw trials and SJT research data before writing a sealed
 * pending submission to localStorage; the server checkpoint holds locked units
 * authoritatively and rehydrates them on crash recovery. */
function stripLockedUnitsForStorage(sealed: SealedPendingSubmission): SealedPendingSubmission {
  const units: Record<string, WholeV2UnitSubmitPayload> = {}
  for (const [slotKey, unit] of Object.entries(sealed.payload.units)) {
    if (unit.unitType === 'SCALE' || unit.unitType === 'FORM_SECTION') {
      units[slotKey] = unit
    }
  }
  return {
    ...sealed,
    payload: {
      ...sealed.payload,
      units,
    },
  }
}

/** Rehydrates locked Cognitive/SJT units from server checkpoint into a stored
 * pending submission so crash-reloaded retries send the exact canonical payload. */
function rehydrateSealedWithLockedUnits(
  sealed: SealedPendingSubmission,
  template: WholeV2Template,
  lockedUnits: Record<string, WholeV2LockedUnit>,
): SealedPendingSubmission {
  const units: Record<string, WholeV2UnitSubmitPayload> = { ...sealed.payload.units }
  for (const unit of template.units) {
    if (units[unit.slotKey]) continue
    const locked = lockedUnits[unit.slotKey]
    if (!locked) continue
    if (unit.unitType === 'SITUATIONAL' && locked.unitType === 'SITUATIONAL') {
      units[unit.slotKey] = {
        unitType: 'SITUATIONAL',
        definitionHash: unit.definitionHash,
        responses: locked.responses,
        ...(locked.researchEvents ? { researchEvents: locked.researchEvents } : {}),
        ...(locked.totalTimeMs !== undefined ? { totalTimeMs: locked.totalTimeMs } : {}),
      }
    } else if (unit.unitType === 'COGNITIVE' && locked.unitType === 'COGNITIVE') {
      units[unit.slotKey] = {
        unitType: 'COGNITIVE',
        definitionHash: unit.definitionHash,
        randomSeed: locked.randomSeed,
        trials: locked.trials,
        ...(locked.summaryMeta ? { summaryMeta: locked.summaryMeta } : {}),
      }
    }
  }
  return {
    ...sealed,
    payload: {
      ...sealed.payload,
      units,
    },
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

function canonicalLockedUnitPayload(
  unit:
    | WholeV2LockedUnit
    | Omit<Extract<WholeV2LockedUnit, { unitType: 'COGNITIVE' }>, 'lockedAt' | 'payloadHash'>
    | Omit<Extract<WholeV2LockedUnit, { unitType: 'SITUATIONAL' }>, 'lockedAt' | 'payloadHash'>,
): string {
  if (unit.unitType === 'COGNITIVE') {
    return canonicalJson({
      unitType: 'COGNITIVE',
      itemId: unit.itemId,
      randomSeed: unit.randomSeed,
      trials: unit.trials,
      ...(unit.summaryMeta !== undefined ? { summaryMeta: unit.summaryMeta } : {}),
    })
  }
  return canonicalJson({
    unitType: 'SITUATIONAL',
    itemId: unit.itemId,
    responses: unit.responses,
    ...(unit.researchEvents !== undefined ? { researchEvents: unit.researchEvents } : {}),
    ...(unit.totalTimeMs !== undefined ? { totalTimeMs: unit.totalTimeMs } : {}),
  })
}

function sameLockedUnitPayload(
  existing: WholeV2LockedUnit,
  candidate:
    | Omit<Extract<WholeV2LockedUnit, { unitType: 'COGNITIVE' }>, 'lockedAt' | 'payloadHash'>
    | Omit<Extract<WholeV2LockedUnit, { unitType: 'SITUATIONAL' }>, 'lockedAt' | 'payloadHash'>,
): boolean {
  if (existing.unitType !== candidate.unitType || existing.itemId !== candidate.itemId) return false
  return canonicalLockedUnitPayload(existing) === canonicalLockedUnitPayload(candidate)
}

/** Packs formOtherTexts into checkpoint drafts using `__otherText:<itemId>` keys so
 * "Other" text inputs survive save-and-exit and cross-device resume cleanly. */
function packDraftsWithOtherTexts(
  drafts: Record<string, Record<string, unknown>>,
  formOtherTexts: Record<string, Record<string, string>>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  const allSlots = new Set([...Object.keys(drafts), ...Object.keys(formOtherTexts)])
  for (const slotKey of allSlots) {
    const merged: Record<string, unknown> = { ...(drafts[slotKey] ?? {}) }
    const others = formOtherTexts[slotKey]
    if (others) {
      for (const [itemId, text] of Object.entries(others)) {
        if (text !== '') merged[`${OTHER_TEXT_PREFIX}${itemId}`] = text
      }
    }
    if (Object.keys(merged).length > 0) out[slotKey] = merged
  }
  return out
}

function unpackDraftsAndOtherTexts(
  rawDrafts: Record<string, Record<string, unknown>> | undefined,
): {
  drafts: Record<string, Record<string, unknown>>
  formOtherTexts: Record<string, Record<string, string>>
} {
  const drafts: Record<string, Record<string, unknown>> = {}
  const formOtherTexts: Record<string, Record<string, string>> = {}
  if (!rawDrafts) return { drafts, formOtherTexts }
  for (const [slotKey, entries] of Object.entries(rawDrafts)) {
    const cleanSlot: Record<string, unknown> = {}
    const otherSlot: Record<string, string> = {}
    for (const [key, value] of Object.entries(entries ?? {})) {
      if (key.startsWith(OTHER_TEXT_PREFIX)) {
        if (typeof value === 'string') otherSlot[key.slice(OTHER_TEXT_PREFIX.length)] = value
      } else {
        cleanSlot[key] = value
      }
    }
    if (Object.keys(cleanSlot).length > 0) drafts[slotKey] = cleanSlot
    if (Object.keys(otherSlot).length > 0) formOtherTexts[slotKey] = otherSlot
  }
  return { drafts, formOtherTexts }
}

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

type FormOptionWithMedia = {
  value: string
  label: string
  images?: unknown
  video?: unknown
}

function projectFormOption(raw: Record<string, unknown>): FormOptionWithMedia {
  return {
    value: String(raw.optionKey ?? raw.value ?? ''),
    label: String(raw.label ?? ''),
    ...(raw.images !== undefined ? { images: raw.images } : {}),
    ...(raw.video !== undefined ? { video: raw.video } : {}),
  }
}

function parseFormOptions(
  rawOptions: WholeQuestionnaireFormSectionItem['formOptions'],
  formDef?: WholeQuestionnaireFormSectionItem['formDefinition'],
): FormOptionWithMedia[] {
  const defOptions = (formDef as { options?: unknown } | null | undefined)?.options
  if (Array.isArray(defOptions) && defOptions.length > 0) {
    return defOptions.map(o => projectFormOption((o ?? {}) as Record<string, unknown>))
  }
  if (Array.isArray(rawOptions)) {
    return rawOptions.map(o => {
      const rec = (o ?? {}) as Record<string, unknown>
      return {
        value: String(rec.value ?? rec.optionKey ?? ''),
        label: String(rec.label ?? ''),
        ...(rec.images !== undefined ? { images: rec.images } : {}),
        ...(rec.video !== undefined ? { video: rec.video } : {}),
      }
    })
  }
  if (typeof rawOptions === 'string') {
    try {
      const parsed = JSON.parse(rawOptions)
      if (Array.isArray(parsed)) {
        return parsed.map(o => {
          const rec = (o ?? {}) as Record<string, unknown>
          return {
            value: String(rec.value ?? rec.optionKey ?? ''),
            label: String(rec.label ?? ''),
            ...(rec.images !== undefined ? { images: rec.images } : {}),
            ...(rec.video !== undefined ? { video: rec.video } : {}),
          }
        })
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

function OptionalRouterBoundary({ routerKey, children }: { routerKey: string; children: React.ReactNode }) {
  const inRouter = useInRouterContext()
  if (inRouter) return <React.Fragment key={routerKey}>{children}</React.Fragment>
  return <MemoryRouter key={routerKey}>{children}</MemoryRouter>
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
  const [reloadNonce, setReloadNonce] = useState(0)

  // Scale & Form drafts keyed by slotKey -> itemCode/formItemId -> value
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({})
  const [formOtherTexts, setFormOtherTexts] = useState<Record<string, Record<string, string>>>({})
  const [itemTimings, setItemTimings] = useState<Record<string, SurveyScaleTimings>>({})
  const [lockedUnits, setLockedUnits] = useState<Record<string, WholeV2LockedUnit>>({})
  const [revision, setRevision] = useState(0)
  const [index, setIndex] = useState(0)
  const [savingDraft, setSavingDraft] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pendingSeal, setPendingSeal] = useState<SealedPendingSubmission | null>(null)
  const [sealedRecoveryState, setSealedRecoveryState] = useState<SealedRecoveryState>('SEALED')
  const [otherSubmissionReceipt, setOtherSubmissionReceipt] = useState<WholeV2Receipt | null>(null)
  const [checkpointConflict, setCheckpointConflict] = useState<CheckpointConflictState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<WholeV2Receipt | null>(null)

  const mountTimestampRef = useRef<number>(Date.now())
  const baseElapsedMsRef = useRef<number>(0)
  const timingTrackersRef = useRef<Record<string, SurveyScaleTimingTracker>>({})
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const formOtherTextsRef = useRef(formOtherTexts)
  formOtherTextsRef.current = formOtherTexts
  const itemTimingsRef = useRef(itemTimings)
  itemTimingsRef.current = itemTimings
  const revisionRef = useRef(revision)
  revisionRef.current = revision
  const localDirtyRef = useRef(false)

  const getScaleTracker = useCallback((slotKey: string): SurveyScaleTimingTracker => {
    let tracker = timingTrackersRef.current[slotKey]
    if (!tracker) {
      tracker = new SurveyScaleTimingTracker(
        itemTimingsRef.current[slotKey] ?? {},
        draftsRef.current[slotKey] ?? {},
      )
      timingTrackersRef.current[slotKey] = tracker
    }
    return tracker
  }, [])

  const updateSlotTimings = useCallback((slotKey: string, rows: SurveyScaleTimings) => {
    itemTimingsRef.current = { ...itemTimingsRef.current, [slotKey]: rows }
    setItemTimings(prev => ({ ...prev, [slotKey]: rows }))
  }, [])

  const snapshotAllTrackers = useCallback((): Record<string, SurveyScaleTimings> => {
    const merged: Record<string, SurveyScaleTimings> = { ...itemTimingsRef.current }
    for (const [slotKey, tracker] of Object.entries(timingTrackersRef.current)) {
      merged[slotKey] = tracker.snapshot()
    }
    return merged
  }, [])

  const computeTotalElapsedMs = useCallback(() => (
    Math.max(0, baseElapsedMsRef.current + (Date.now() - mountTimestampRef.current))
  ), [])

  const finalizeReceipt = useCallback((accepted: WholeV2Receipt, epoch: number) => {
    removeStoredKey(pendingStorageKey(attemptId, epoch))
    removeStoredKey(draftStorageKey(attemptId, epoch))
    setPendingSeal(null)
    setOtherSubmissionReceipt(null)
    setCheckpointConflict(null)
    setReceipt(accepted)
    if (accepted.receiptOnly) {
      onReceiptAccepted?.(accepted.completedAt)
    } else {
      onCompleted(accepted)
    }
  }, [attemptId, onReceiptAccepted, onCompleted])

  const reconcileExistingReceipt = useCallback((
    existing: WholeV2Receipt,
    epoch: number,
    localSeal: SealedPendingSubmission | null,
  ) => {
    if (localSeal && existing.submissionId !== localSeal.submissionId) {
      // Another tab/device completed this attempt with a different submissionId;
      // surface this explicitly instead of silently assuming local edits won.
      removeStoredKey(pendingStorageKey(attemptId, epoch))
      removeStoredKey(draftStorageKey(attemptId, epoch))
      setPendingSeal(null)
      setOtherSubmissionReceipt(existing)
      return
    }
    finalizeReceipt(existing, epoch)
  }, [attemptId, finalizeReceipt])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setCheckpointConflict(null)
    setOtherSubmissionReceipt(null)
    mountTimestampRef.current = Date.now()
    localDirtyRef.current = false
    void (async () => {
      try {
        const metaRes = await client.loadMeta()
        if (metaRes.code !== 0 || !metaRes.data) {
          throw new Error(metaRes.message || '加载整卷元数据失败')
        }
        const loadedMeta = metaRes.data
        const now = Date.now()

        // Read & TTL-evict any stored pending seal before reconciling existingReceipt
        const rawSealed = readStoredJson<SealedPendingSubmission>(pendingStorageKey(loadedMeta.attemptId, loadedMeta.attemptEpoch))
        const validStoredSeal = rawSealed
          && (!rawSealed.expiresAt || rawSealed.expiresAt > now)
          && rawSealed.payload.attemptEpoch === loadedMeta.attemptEpoch
          && rawSealed.payload.publicationHash === loadedMeta.publicationHash
          ? rawSealed
          : null
        if (rawSealed && !validStoredSeal) {
          removeStoredKey(pendingStorageKey(loadedMeta.attemptId, loadedMeta.attemptEpoch))
        }

        // Recover already-committed submission immediately on refresh / lost response
        if (loadedMeta.existingReceipt) {
          if (!cancelled) {
            setMeta(loadedMeta)
            reconcileExistingReceipt(loadedMeta.existingReceipt, loadedMeta.attemptEpoch, validStoredSeal)
          }
          return
        }

        const tplRes = await client.loadTemplate(loadedMeta.templateHash)
        if (tplRes.code !== 0 || !tplRes.data) {
          throw new Error(tplRes.message || '加载整卷模板失败')
        }
        if (cancelled) return

        const serverUnpacked = unpackDraftsAndOtherTexts(loadedMeta.checkpoint.envelope?.drafts)
        const serverTimings = (loadedMeta.checkpoint.envelope?.itemTimings ?? {}) as Record<string, SurveyScaleTimings>
        const serverLockedUnits = loadedMeta.checkpoint.envelope?.lockedUnits ?? {}

        // Only restore localStorage drafts when persistence policy permits local drafts and entry has not expired
        const localDraftAllowed = loadedMeta.persistencePolicy?.draftCheckpointEnabled === true
        const rawLocalDraft = readStoredJson<StoredLocalDraft>(draftStorageKey(loadedMeta.attemptId, loadedMeta.attemptEpoch))
        const validLocalDraft = localDraftAllowed
          && rawLocalDraft
          && typeof rawLocalDraft.expiresAt === 'number'
          && rawLocalDraft.expiresAt > now
          ? rawLocalDraft
          : null
        if (rawLocalDraft && !validLocalDraft) {
          removeStoredKey(draftStorageKey(loadedMeta.attemptId, loadedMeta.attemptEpoch))
        }

        // Compare server checkpoint timestamp vs local draft timestamp so stale localStorage
        // never silently overwrites newer server drafts saved on another device/tab (P1-03).
        const serverUpdatedAt = loadedMeta.checkpoint.updatedAt ? Date.parse(loadedMeta.checkpoint.updatedAt) : 0
        const localUpdatedAt = typeof validLocalDraft?.updatedAt === 'number' ? validLocalDraft.updatedAt : 0
        const localIsNewer = Boolean(
          validLocalDraft
            && (loadedMeta.checkpoint.revision === 0 || (Number.isFinite(serverUpdatedAt) && localUpdatedAt > serverUpdatedAt)),
        )

        const mergedDrafts: Record<string, Record<string, unknown>> = { ...serverUnpacked.drafts }
        const mergedOthers: Record<string, Record<string, string>> = { ...serverUnpacked.formOtherTexts }
        const mergedTimings: Record<string, SurveyScaleTimings> = loadedMeta.timingEnabled
          ? { ...serverTimings }
          : {}

        if (localIsNewer && validLocalDraft) {
          for (const [slotKey, entries] of Object.entries(validLocalDraft.drafts ?? {})) {
            mergedDrafts[slotKey] = { ...(mergedDrafts[slotKey] ?? {}), ...entries }
          }
          for (const [slotKey, entries] of Object.entries(validLocalDraft.formOtherTexts ?? {})) {
            mergedOthers[slotKey] = { ...(mergedOthers[slotKey] ?? {}), ...entries }
          }
          if (loadedMeta.timingEnabled && validLocalDraft.itemTimings) {
            for (const [slotKey, entries] of Object.entries(validLocalDraft.itemTimings)) {
              mergedTimings[slotKey] = { ...(mergedTimings[slotKey] ?? {}), ...entries }
            }
          }
        }
        baseElapsedMsRef.current = validLocalDraft && typeof validLocalDraft.elapsedMs === 'number' && Number.isFinite(validLocalDraft.elapsedMs)
          ? Math.max(0, validLocalDraft.elapsedMs)
          : 0

        timingTrackersRef.current = {}
        draftsRef.current = mergedDrafts
        itemTimingsRef.current = mergedTimings
        setMeta(loadedMeta)
        setTemplate(tplRes.data)
        setRevision(loadedMeta.checkpoint.revision)
        setDrafts(mergedDrafts)
        setFormOtherTexts(mergedOthers)
        setItemTimings(mergedTimings)
        setLockedUnits(serverLockedUnits)
        if (validStoredSeal) {
          setPendingSeal(rehydrateSealedWithLockedUnits(validStoredSeal, tplRes.data, serverLockedUnits))
          setSealedRecoveryState('SEALED')
        } else {
          setPendingSeal(null)
        }
      } catch (cause) {
        if (!cancelled) setLoadError(normalizeApiError(cause).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [attemptId, client, reloadNonce, reconcileExistingReceipt])

  // Persist local drafts ONLY when Training persistence policy explicitly enables drafts (P1-05),
  // with bounded TTL (1–48h) and updatedAt timestamp for conflict-safe resume.
  useEffect(() => {
    if (!meta || receipt || !localDirtyRef.current) return
    if (meta.persistencePolicy?.draftCheckpointEnabled !== true) return
    const now = Date.now()
    const ttlMs = clampTtlMs(meta.persistencePolicy.draftTtlHours)
    writeStoredJson(draftStorageKey(meta.attemptId, meta.attemptEpoch), {
      drafts,
      formOtherTexts,
      ...(meta.timingEnabled ? { itemTimings } : {}),
      elapsedMs: computeTotalElapsedMs(),
      updatedAt: now,
      expiresAt: now + ttlMs,
    } satisfies StoredLocalDraft)
  }, [meta, receipt, drafts, formOtherTexts, itemTimings, computeTotalElapsedMs])

  // Respect probabilistic variant activeSlotKeys when present
  const activeUnits = useMemo(() => {
    if (!template) return []
    const allowed = meta?.activeSlotKeys ? new Set(meta.activeSlotKeys) : null
    return [...template.units]
      .filter(u => !allowed || allowed.has(u.slotKey))
      .sort((a, b) => a.position - b.position)
  }, [template, meta?.activeSlotKeys])

  const steps = useMemo<WholeV2Step[]>(() => {
    const list: WholeV2Step[] = []
    for (const unit of activeUnits) {
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
  }, [activeUnits])

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

  const draftCheckpointAllowed = meta?.persistencePolicy ? meta.persistencePolicy.draftCheckpointEnabled : true

  const persistCheckpoint = useCallback(async (
    lockUnit?: {
      slotKey: string
      unit:
        | Omit<Extract<WholeV2LockedUnit, { unitType: 'COGNITIVE' }>, 'lockedAt' | 'payloadHash'>
        | Omit<Extract<WholeV2LockedUnit, { unitType: 'SITUATIONAL' }>, 'lockedAt' | 'payloadHash'>
    },
    options?: { forceOverwrite?: boolean; overrideRevision?: number },
  ): Promise<'saved' | 'conflict' | 'receipt'> => {
    if (!meta) return 'saved'
    setSavingDraft(true)
    setError(null)
    const packedDrafts = draftCheckpointAllowed
      ? packDraftsWithOtherTexts(draftsRef.current, formOtherTextsRef.current)
      : {}
    const liveTimings = meta.timingEnabled ? snapshotAllTrackers() : {}
    const timingsPayload = meta.timingEnabled && Object.keys(liveTimings).length > 0
      ? liveTimings
      : undefined
    const attemptSave = async (
      expectedRev: number,
      draftsToSend: Record<string, Record<string, unknown>>,
      timingsToSend?: Record<string, SurveyScaleTimings>,
    ) => {
      const res = await client.saveCheckpoint({
        expectedRevision: expectedRev,
        attemptEpoch: meta.attemptEpoch,
        drafts: draftsToSend,
        ...(timingsToSend && Object.keys(timingsToSend).length > 0 ? { itemTimings: timingsToSend } : {}),
        ...(lockUnit ? { lockUnit } : {}),
      })
      if (res.code !== 0 || !res.data) {
        throw new Error(res.message || '保存进度失败')
      }
      return res.data
    }
    try {
      let saved
      const baseRevision = options?.overrideRevision ?? revisionRef.current
      try {
        saved = await attemptSave(baseRevision, packedDrafts, timingsPayload)
      } catch (firstErr) {
        const normalized = normalizeApiError(firstErr)
        const isConflict = normalized.code === 'CHECKPOINT_CONFLICT' || normalized.status === 409
        if (!isConflict || options?.forceOverwrite) {
          throw firstErr
        }
        const refreshed = await client.loadMeta()
        if (refreshed.code !== 0 || !refreshed.data) {
          throw firstErr
        }
        if (refreshed.data.existingReceipt) {
          reconcileExistingReceipt(refreshed.data.existingReceipt, refreshed.data.attemptEpoch, pendingSeal)
          return 'receipt'
        }
        const serverCheckpoint = refreshed.data.checkpoint
        const serverEnvelope = serverCheckpoint.envelope
        const serverLocked = serverEnvelope?.lockedUnits ?? {}
        const serverUnpacked = unpackDraftsAndOtherTexts(serverEnvelope?.drafts)
        const serverTimings = (serverEnvelope?.itemTimings ?? {}) as Record<string, SurveyScaleTimings>

        if (lockUnit) {
          // Case A: Cognitive/SJT lockUnit 409 recovery
          const existingLocked = serverLocked[lockUnit.slotKey]
          if (existingLocked) {
            if (sameLockedUnitPayload(existingLocked, lockUnit.unit)) {
              // Lost ACK on the exact same Cognitive/SJT lock: confirm idempotently without overwriting server drafts.
              setRevision(serverCheckpoint.revision)
              revisionRef.current = serverCheckpoint.revision
              setLockedUnits(serverLocked)
              if (draftCheckpointAllowed && serverEnvelope) {
                setDrafts(serverUnpacked.drafts)
                setFormOtherTexts(serverUnpacked.formOtherTexts)
              }
              return 'saved'
            }
            throw firstErr
          }
          // Not yet locked on server: preserve server's newer drafts and attach lockUnit only (never overwrite newer drafts!).
          const serverRawDrafts = draftCheckpointAllowed ? (serverEnvelope?.drafts ?? {}) : {}
          setRevision(serverCheckpoint.revision)
          revisionRef.current = serverCheckpoint.revision
          setLockedUnits(serverLocked)
          saved = await attemptSave(serverCheckpoint.revision, serverRawDrafts, meta.timingEnabled ? serverTimings : undefined)
        } else {
          // Case B: Plain draft version conflict -> surface explicit choice instead of silently overwriting other device's drafts!
          setCheckpointConflict({
            serverRevision: serverCheckpoint.revision,
            serverUpdatedAt: serverCheckpoint.updatedAt,
            serverDrafts: serverUnpacked.drafts,
            serverFormOtherTexts: serverUnpacked.formOtherTexts,
            serverItemTimings: serverTimings,
            serverLockedUnits: serverLocked,
          })
          setError('检测到其他窗口或设备已更新云端草稿，请选择采用云端最新版本或覆盖云端。')
          return 'conflict'
        }
      }
      setCheckpointConflict(null)
      setRevision(saved.revision)
      revisionRef.current = saved.revision
      if (saved.envelope) {
        if (draftCheckpointAllowed) {
          const unpacked = unpackDraftsAndOtherTexts(saved.envelope.drafts)
          setDrafts(unpacked.drafts)
          setFormOtherTexts(unpacked.formOtherTexts)
        }
        setLockedUnits(saved.envelope.lockedUnits)
      }
      return 'saved'
    } catch (cause) {
      const msg = normalizeApiError(cause).message
      setError(msg)
      throw cause
    } finally {
      setSavingDraft(false)
    }
  }, [client, meta, draftCheckpointAllowed, pendingSeal, reconcileExistingReceipt, snapshotAllTrackers])

  const adoptServerConflictDraft = useCallback(() => {
    if (!checkpointConflict) return
    timingTrackersRef.current = {}
    draftsRef.current = checkpointConflict.serverDrafts
    setDrafts(checkpointConflict.serverDrafts)
    setFormOtherTexts(checkpointConflict.serverFormOtherTexts)
    if (meta?.timingEnabled) {
      itemTimingsRef.current = checkpointConflict.serverItemTimings
      setItemTimings(checkpointConflict.serverItemTimings)
    }
    setLockedUnits(checkpointConflict.serverLockedUnits)
    setRevision(checkpointConflict.serverRevision)
    revisionRef.current = checkpointConflict.serverRevision
    localDirtyRef.current = false
    setCheckpointConflict(null)
    setError(null)
  }, [checkpointConflict, meta?.timingEnabled])

  const forceOverwriteConflictDraft = useCallback(async () => {
    if (!checkpointConflict) return
    try {
      await persistCheckpoint(undefined, {
        forceOverwrite: true,
        overrideRevision: checkpointConflict.serverRevision,
      })
    } catch {
      /* error already surfaced */
    }
  }, [checkpointConflict, persistCheckpoint])

  const saveAndExit = useCallback(async () => {
    if (!draftCheckpointAllowed) {
      onExit()
      return
    }
    try {
      const outcome = await persistCheckpoint()
      if (outcome === 'saved') {
        onExit()
      }
    } catch {
      /* error already displayed */
    }
  }, [draftCheckpointAllowed, persistCheckpoint, onExit])

  const setScaleAnswer = useCallback((slotKey: string, itemCode: string, value: string | number) => {
    if (pendingSeal) return
    const prevValue = draftsRef.current[slotKey]?.[itemCode]
    localDirtyRef.current = true
    setError(null)
    setDrafts(prev => ({
      ...prev,
      [slotKey]: { ...(prev[slotKey] ?? {}), [itemCode]: value },
    }))
    // Only record item-level process timing telemetry when timing is explicitly enabled (BROWSER_ACTIVE_SCALE_V1).
    if (meta?.timingEnabled !== true) return
    const tracker = getScaleTracker(slotKey)
    tracker.answer(itemCode, prevValue, value)
    updateSlotTimings(slotKey, tracker.snapshot())
  }, [pendingSeal, meta?.timingEnabled, getScaleTracker, updateSlotTimings])

  const setFormAnswer = useCallback((slotKey: string, formItemId: string, value: FormPlayerValue) => {
    if (pendingSeal) return
    localDirtyRef.current = true
    setError(null)
    setDrafts(prev => ({
      ...prev,
      [slotKey]: { ...(prev[slotKey] ?? {}), [formItemId]: value },
    }))
  }, [pendingSeal])

  const setFormOtherText = useCallback((slotKey: string, formItemId: string, text: string) => {
    if (pendingSeal) return
    localDirtyRef.current = true
    setFormOtherTexts(prev => ({
      ...prev,
      [slotKey]: { ...(prev[slotKey] ?? {}), [formItemId]: text },
    }))
  }, [pendingSeal])

  const reloadServerState = useCallback(() => {
    if (meta) {
      removeStoredKey(pendingStorageKey(meta.attemptId, meta.attemptEpoch))
    }
    setPendingSeal(null)
    setSealedRecoveryState('SEALED')
    setError(null)
    setReloadNonce(prev => prev + 1)
  }, [meta])

  const submitWhole = useCallback(async () => {
    if (!meta || !template || submitting) return
    setError(null)

    const isRetryOfSeal = Boolean(pendingSeal)
    let sealedToSend = pendingSeal
    if (!sealedToSend) {
      const unitsPayload: Record<string, WholeV2UnitSubmitPayload> = {}
      for (const unit of activeUnits) {
        if (unit.unitType === 'FORM_SECTION') {
          const slotDraft = draftsRef.current[unit.slotKey] ?? {}
          const otherMap = formOtherTextsRef.current[unit.slotKey] ?? {}
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
                ...(otherMap[item.id] !== undefined && otherMap[item.id] !== '' ? { otherText: otherMap[item.id] } : {}),
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
          let sealedTimings: SurveyScaleTimings | undefined
          if (meta.timingEnabled) {
            const tracker = timingTrackersRef.current[unit.slotKey]
            let rawTimings: SurveyScaleTimings
            if (tracker) {
              tracker.pause()
              rawTimings = tracker.snapshot()
            } else {
              rawTimings = itemTimingsRef.current[unit.slotKey] ?? {}
            }
            const observed = sealObservedScaleTimings(
              unit.definition.items.map(item => item.itemCode),
              slotDraft,
              rawTimings,
            )
            if (Object.keys(observed).length > 0) {
              sealedTimings = observed
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
            ...(sealedTimings ? { timings: sealedTimings } : {}),
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

      const now = Date.now()
      const submissionId = makeSubmissionId(meta.attemptId, meta.attemptEpoch)
      sealedToSend = {
        submissionId,
        sealedAt: new Date(now).toISOString(),
        expiresAt: now + clampTtlMs(meta.persistencePolicy?.draftTtlHours),
        payload: {
          submissionId,
          attemptEpoch: meta.attemptEpoch,
          publicationHash: meta.publicationHash,
          slotSetHash: meta.slotSetHash,
          totalTimeMs: computeTotalElapsedMs(),
          units: unitsPayload,
        },
      }
      // Seal locally BEFORE sending (omitting Cognitive trials & SJT research events from localStorage).
      writeStoredJson(
        pendingStorageKey(meta.attemptId, meta.attemptEpoch),
        stripLockedUnitsForStorage(sealedToSend),
      )
      setPendingSeal(sealedToSend)
      setSealedRecoveryState('SEALED')
    }

    setSubmitting(true)
    try {
      // On retry of a previously sealed submission, probe server status explicitly first (P1-04).
      if (isRetryOfSeal) {
        let probe: Awaited<ReturnType<WholeV2Client['loadMeta']>>
        try {
          probe = await client.loadMeta()
        } catch {
          setSealedRecoveryState('UNCONFIRMED')
          setError('暂时无法连接服务器核对回执状态，本机封存答案已保留，请网络恢复后重试。')
          return
        }
        if (probe.code !== 0 || !probe.data) {
          setSealedRecoveryState('UNCONFIRMED')
          setError(probe.message || '回执状态核对失败，本机封存答案已保留，请稍后重试。')
          return
        }
        if (probe.data.existingReceipt) {
          reconcileExistingReceipt(probe.data.existingReceipt, meta.attemptEpoch, sealedToSend)
          return
        }
      }

      const res = await client.submitWhole(sealedToSend.payload)
      if (res.code !== 0 || !res.data) {
        throw new Error(res.message || '整卷提交失败')
      }
      finalizeReceipt(res.data, meta.attemptEpoch)
    } catch (cause) {
      const normalized = normalizeApiError(cause)
      if (normalized.status === 400) {
        // Validation error: unseal so participant can fix invalid answers.
        removeStoredKey(pendingStorageKey(meta.attemptId, meta.attemptEpoch))
        setPendingSeal(null)
        setSealedRecoveryState('SEALED')
      } else if (
        normalized.status === 409
        && (
          normalized.code === 'STALE_ATTEMPT'
          || normalized.code === 'DEFINITION_MISMATCH'
          || normalized.code === 'CHECKPOINT_LOCKED_UNIT_IMMUTABLE'
          || normalized.code === 'SUBMISSION_PAYLOAD_CONFLICT'
        )
      ) {
        // Terminal conflict: surface explicit server-reload recovery exit instead of stranding frozen UI.
        setSealedRecoveryState('REJECTED_CONFLICT')
      } else {
        setSealedRecoveryState('UNCONFIRMED')
      }
      setError(normalized.message)
    } finally {
      setSubmitting(false)
    }
  }, [meta, template, submitting, pendingSeal, activeUnits, lockedUnits, client, computeTotalElapsedMs, finalizeReceipt, reconcileExistingReceipt])

  const loadSlotVideoSources = useCallback(async (slotKey: string, videoKey: string) => {
    const res = await client.issueSlotVideo(slotKey, videoKey)
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '加载视频资源失败')
    }
    return res.data
  }, [client])

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

  if (otherSubmissionReceipt && meta) {
    return (
      <div role="alert" className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
        <h2 className="text-lg font-semibold">此测评已在其他窗口或设备完成提交</h2>
        <p className="text-sm">
          服务端已确认另一笔提交（完成时间：{otherSubmissionReceipt.completedAt}），当前窗口的未确认封存内容已自动失效，不会重复落库。
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-primary min-h-11"
            onClick={() => finalizeReceipt(otherSubmissionReceipt, meta.attemptEpoch)}
          >
            确认并查看结果
          </button>
          <button type="button" className="btn-secondary min-h-11" onClick={onExit}>返回</button>
        </div>
      </div>
    )
  }

  if (loadError || !meta || (!template && !receipt)) {
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

  const displayTitle = template?.title || fallbackTitle || '综合测评'
  const displayInstruction = template?.instruction ?? fallbackInstruction
  const lockedForPendingSubmit = Boolean(pendingSeal) || submitting

  return (
    <AssessmentShell
      title={displayTitle}
      eyebrow="综合测评"
      instructions={
        <div className="space-y-2">
          {displayInstruction ? <p>{displayInstruction}</p> : null}
          <p>
            {draftCheckpointAllowed
              ? '整卷答案可随时暂存；认知测验与情境测评完成后将自动锁定，全部完成后一次提交。'
              : '认知测验与情境测评完成后将自动锁定，请完成全部内容后一次提交。'}
          </p>
        </div>
      }
      progress={{ kind: 'count', completed: completedStepsCount, total: steps.length, label: '整卷作答进度' }}
      saveStatus={savingDraft ? { state: 'saving', message: '正在保存进度…' } : { state: 'idle' }}
      submissionStatus={
        receipt
          ? { state: 'committed', message: '整份测评已提交并完成计分。' }
          : submitting
            ? { state: 'submitting', message: '正在提交整份测评…' }
            : pendingSeal
              ? {
                  state: 'pending',
                  message: sealedRecoveryState === 'REJECTED_CONFLICT'
                    ? '服务端状态已变更，请重新加载服务端状态。'
                    : '上次提交回执尚未确认，答案已封存，请点击确认重试。',
                }
              : { state: 'ready' }
      }
      actions={
        <button
          type="button"
          className="btn-secondary min-h-11"
          disabled={lockedForPendingSubmit || savingDraft}
          onClick={() => void saveAndExit()}
        >
          {draftCheckpointAllowed ? '保存并退出' : '退出'}
        </button>
      }
    >
      {checkpointConflict ? (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <span>
            云端草稿已在其他窗口更新（版本 v{checkpointConflict.serverRevision}），为避免覆盖他人/他端作答，请明确选择恢复方式。
          </span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary min-h-10" onClick={adoptServerConflictDraft}>
              采用云端最新草稿
            </button>
            <button
              type="button"
              className="btn-secondary min-h-10"
              disabled={savingDraft}
              onClick={() => void forceOverwriteConflictDraft()}
            >
              使用当前内容覆盖云端
            </button>
          </div>
        </div>
      ) : null}

      {pendingSeal && !receipt ? (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            {sealedRecoveryState === 'REJECTED_CONFLICT'
              ? '服务端返回版本或状态冲突，当前本机封存提交无法直接重发。请重新加载服务端最新状态。'
              : sealedRecoveryState === 'UNCONFIRMED'
                ? '回执状态尚未确认，本机封存答案安全保留。点击右侧按钮先核对服务端回执，未收到时沿用原提交号重发。'
                : '存在尚未确认回执的封存提交，答案已冻结。点击右侧按钮将先核对服务端状态，若未收到则沿用原提交号重发。'}
          </span>
          <div className="flex flex-wrap gap-2">
            {sealedRecoveryState !== 'REJECTED_CONFLICT' ? (
              <button
                type="button"
                className="btn-primary min-h-10"
                disabled={submitting}
                onClick={() => void submitWhole()}
              >
                {submitting ? '正在核对并重试…' : '核对并重试提交'}
              </button>
            ) : null}
            {sealedRecoveryState === 'REJECTED_CONFLICT' ? (
              <button
                type="button"
                className="btn-primary min-h-10"
                disabled={submitting}
                onClick={reloadServerState}
              >
                重新加载服务端状态
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="mb-4 text-red-700">{error}</p> : null}

      {current?.kind === 'SCALE_ITEM' ? (() => {
        const scaleVideo = scaleItemVideoPresentation(current.question)
        const scalePlayer = (
          <ScalePlayer
            scopeKey={`wholev2:${meta.attemptId}:${current.slotKey}`}
            item={current.question}
            value={drafts[current.slotKey]?.[current.question.itemCode] as string | number | undefined}
            answerDisabled={lockedForPendingSubmit}
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
        )
        return (
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <h2 className="mb-2 text-xl font-semibold">{current.unit.title}</h2>
            {current.unit.instruction ? (
              <p className="mb-4 whitespace-pre-wrap text-slate-600">{current.unit.instruction}</p>
            ) : null}
            <p className="mb-4 text-sm text-slate-600">整卷第 {index + 1} / {steps.length} 步</p>
            <AssessmentImageGate
              items={assessmentImageItems((current.question as { images?: unknown }).images)}
              loadAsset={assetId => client.loadSlotImage(current.slotKey, assetId)}
              disabled={lockedForPendingSubmit}
            >
              <ScaleFormVideoGate
                presentation={scaleVideo}
                loadSources={() => loadSlotVideoSources(current.slotKey, scaleVideo!.video.assetId)}
                ariaLabel={`${current.unit.title} 题目视频`}
              >
                {meta.timingEnabled ? (
                  <TrainingTimingBoundary
                    key={current.slotKey}
                    tracker={getScaleTracker(current.slotKey)}
                    itemKey={current.question.itemCode}
                    locked={lockedForPendingSubmit}
                    onTiming={rows => updateSlotTimings(current.slotKey, rows)}
                  >
                    {scalePlayer}
                  </TrainingTimingBoundary>
                ) : scalePlayer}
              </ScaleFormVideoGate>
            </AssessmentImageGate>
          </div>
        )
      })() : null}

      {current?.kind === 'FORM_ITEM' ? (() => {
        const options = parseFormOptions(current.item.formOptions, current.item.formDefinition)
        const materials = (current.item.formDefinition as { materials?: PublicMaterial[] } | null | undefined)?.materials
        const formPlayer = (
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
            options={options}
            value={drafts[current.slotKey]?.[current.item.id] as FormPlayerValue}
            otherText={formOtherTexts[current.slotKey]?.[current.item.id]}
            onOtherTextChange={text => setFormOtherText(current.slotKey, current.item.id, text)}
            answerDisabled={lockedForPendingSubmit}
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
        )
        return (
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
            <h2 className="mb-2 text-xl font-semibold">{current.unit.title}</h2>
            {current.unit.description ? (
              <p className="mb-4 whitespace-pre-wrap text-slate-600">{current.unit.description}</p>
            ) : null}
            <p className="mb-4 text-sm text-slate-600">整卷第 {index + 1} / {steps.length} 步</p>
            <TrainingMaterials
              items={materials}
              loadAsset={assetId => client.loadSlotImage(current.slotKey, assetId)}
            />
            <AssessmentImageGate
              items={assessmentOptionImageItems(options)}
              loadAsset={assetId => client.loadSlotImage(current.slotKey, assetId)}
              disabled={lockedForPendingSubmit}
            >
              <FormOptionVideoGroupGate
                entries={formOptionVideoPresentations(options)}
                loadSources={entry => loadSlotVideoSources(current.slotKey, entry.presentation.video.assetId)}
              >
                {formPlayer}
              </FormOptionVideoGroupGate>
            </AssessmentImageGate>
          </div>
        )
      })() : null}

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
              <OptionalRouterBoundary routerKey={current.slotKey}>
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
              </OptionalRouterBoundary>
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
              <OptionalRouterBoundary routerKey={current.slotKey}>
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
              </OptionalRouterBoundary>
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
