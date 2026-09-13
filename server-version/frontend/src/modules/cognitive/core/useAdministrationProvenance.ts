import { useCallback, useEffect, useRef } from 'react'
import type { CognitiveSession } from '../types'
import type { RunnerStatus } from './runner.types'
import {
  createAdministrationProvenanceTracker,
  inferCoarseDeviceClass,
  isAdministrationProvenanceV1,
  modalityFromPointerType,
  readBrowserCoarseDeviceSignals,
  type AdministrationProvenanceV1,
  type CognitiveAdministrationMode,
  type ObservedResponseModality,
} from './administration-provenance'
import { usesGlobalKeyboardCapture } from './readiness'
import { finalDraftStore } from '../../../services/persistence/finalDraftStore'

export const COGNITIVE_ADMINISTRATION_PROVENANCE_METADATA_KEY = 'cognitiveAdministrationProvenance'

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || target.isContentEditable
}

const insideTaskRoot = (target: EventTarget | null) => (
  target instanceof Element && Boolean(target.closest('[data-cognitive-task-root="true"]'))
)

const applyMode = (
  tracker: ReturnType<typeof createAdministrationProvenanceTracker>,
  mode: CognitiveAdministrationMode,
) => {
  if (mode === 'TOUCH' || mode === 'MIXED') tracker.observe('touch')
  if (mode === 'KEYBOARD_MOUSE' || mode === 'MIXED') tracker.observe('keyboard')
}

export const readCognitiveAdministrationProvenance = (
  metadata: Record<string, unknown> | undefined,
): AdministrationProvenanceV1 | null => {
  const candidate = metadata?.[COGNITIVE_ADMINISTRATION_PROVENANCE_METADATA_KEY]
  return isAdministrationProvenanceV1(candidate) ? candidate : null
}

const sameProvenance = (left: AdministrationProvenanceV1 | null, right: AdministrationProvenanceV1) => (
  left?.schemaVersion === right.schemaVersion
  && left.deviceClass === right.deviceClass
  && left.administrationMode === right.administrationMode
)

/**
 * Owns coarse administration provenance for one FINAL_ONLY Cognitive session.
 * Detailed interaction history is intentionally not retained here; COG-P5
 * owns any future research-capture event stream.
 */
export const useAdministrationProvenance = (
  session: CognitiveSession | null,
  status: RunnerStatus,
) => {
  const sessionKey = session?.deliveryMode === 'FINAL_ONLY' ? session.sessionId : null
  const trackerSessionRef = useRef<string | null>(null)
  const trackerRef = useRef<ReturnType<typeof createAdministrationProvenanceTracker> | null>(null)
  const persistChainRef = useRef<Promise<unknown>>(Promise.resolve())

  if (sessionKey && trackerSessionRef.current !== sessionKey) {
    trackerSessionRef.current = sessionKey
    trackerRef.current = createAdministrationProvenanceTracker({
      deviceClass: inferCoarseDeviceClass(readBrowserCoarseDeviceSignals()),
    })
  } else if (!sessionKey && trackerSessionRef.current !== null) {
    trackerSessionRef.current = null
    trackerRef.current = null
  }

  const persist = useCallback((draftKey: string, snapshot: AdministrationProvenanceV1) => {
    persistChainRef.current = persistChainRef.current
      .catch(() => undefined)
      .then(() => finalDraftStore.setInstrumentMetadata(draftKey, {
        [COGNITIVE_ADMINISTRATION_PROVENANCE_METADATA_KEY]: snapshot,
      }))
      // Provenance is calibration metadata. A storage failure must not make a
      // participant lose an otherwise valid assessment attempt.
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!sessionKey || !trackerRef.current) return
    let cancelled = false
    const draftKey = `cognitive:${sessionKey}`
    void finalDraftStore.get(draftKey).then((meta) => {
      if (cancelled || trackerSessionRef.current !== sessionKey || !trackerRef.current || !meta) return
      const stored = readCognitiveAdministrationProvenance(meta.instrumentMetadata)
      if (stored) {
        const current = trackerRef.current.snapshot()
        const merged = createAdministrationProvenanceTracker({
          deviceClass: current.deviceClass,
          initial: stored,
        })
        applyMode(merged, current.administrationMode)
        trackerRef.current = merged
      }
      const snapshot = trackerRef.current.snapshot()
      if (!sameProvenance(stored, snapshot)) persist(draftKey, snapshot)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [persist, sessionKey])

  const observe = useCallback((modality: ObservedResponseModality) => {
    if (!sessionKey || !trackerRef.current) return
    const changed = trackerRef.current.observe(modality)
    if (!changed) return
    persist(`cognitive:${sessionKey}`, trackerRef.current.snapshot())
  }, [persist, sessionKey])

  useEffect(() => {
    const active = Boolean(sessionKey) && (status === 'RUNNING' || status === 'SUBMITTING_TRIAL')
    if (!active || !session) return

    const onPointerDown = (event: PointerEvent) => {
      if (!insideTaskRoot(event.target)) return
      observe(modalityFromPointerType(event.pointerType))
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (
        !insideTaskRoot(event.target)
        && !usesGlobalKeyboardCapture(session.testType, session.engineVersion)
      ) return
      observe('keyboard')
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [observe, session, sessionKey, status])

  return {
    snapshot: () => trackerRef.current?.snapshot() ?? null,
  }
}
