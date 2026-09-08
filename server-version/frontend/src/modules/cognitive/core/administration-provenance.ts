export type CognitiveDeviceClass =
  | 'PHONE'
  | 'TABLET'
  | 'DESKTOP_LAPTOP'
  | 'UNKNOWN'

export type CognitiveAdministrationMode =
  | 'TOUCH'
  | 'KEYBOARD_MOUSE'
  | 'MIXED'
  | 'UNKNOWN'

export type ObservedResponseModality =
  | 'touch'
  | 'mouse'
  | 'keyboard'
  | 'pen'
  | 'unknown'

export interface AdministrationProvenanceV1 {
  schemaVersion: 1
  deviceClass: CognitiveDeviceClass
  administrationMode: CognitiveAdministrationMode
}

export interface CoarseDeviceSignals {
  /** Explicit product/session fact wins over inference when one exists. */
  explicitDeviceClass?: CognitiveDeviceClass | null
  screenWidth?: number | null
  screenHeight?: number | null
  maxTouchPoints?: number | null
  primaryCoarsePointer?: boolean | null
  anyFinePointer?: boolean | null
}

const positiveFinite = (value: number | null | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
)

/**
 * Best-effort form-factor classification for calibration provenance.
 *
 * Precision intentionally wins over coverage: ambiguous touch-capable devices
 * remain UNKNOWN rather than being forced into a phone/tablet/desktop cohort.
 * Viewport width is deliberately not accepted because browser resizing and
 * split-screen are not hardware form-factor facts.
 */
export const inferCoarseDeviceClass = (signals: CoarseDeviceSignals): CognitiveDeviceClass => {
  const explicit = signals.explicitDeviceClass
  if (explicit && explicit !== 'UNKNOWN') return explicit

  if (!positiveFinite(signals.screenWidth) || !positiveFinite(signals.screenHeight)) return 'UNKNOWN'
  const shortSide = Math.min(signals.screenWidth, signals.screenHeight)
  const longSide = Math.max(signals.screenWidth, signals.screenHeight)
  const touchCapable = (signals.maxTouchPoints ?? 0) > 0

  // Conservative phone envelope in CSS screen pixels. Large/ambiguous devices
  // intentionally fall through to UNKNOWN.
  if (touchCapable && shortSide <= 480 && longSide <= 960) return 'PHONE'

  // Tablet requires both a coarse primary pointer and a tablet-like screen.
  // A touch laptop with a fine primary pointer therefore remains UNKNOWN.
  if (
    touchCapable
    && signals.primaryCoarsePointer === true
    && shortSide >= 600
    && shortSide <= 1024
    && longSide <= 1400
  ) return 'TABLET'

  // Non-touch devices with a fine pointer are the only high-confidence PC
  // case. Tablet + mouse and touchscreen laptop cases stay UNKNOWN.
  if (!touchCapable && signals.anyFinePointer === true) return 'DESKTOP_LAPTOP'

  return 'UNKNOWN'
}

export const readBrowserCoarseDeviceSignals = (): CoarseDeviceSignals => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return {}
  const media = typeof window.matchMedia === 'function'
    ? (query: string) => window.matchMedia(query).matches
    : () => false
  return {
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    primaryCoarsePointer: media('(pointer: coarse)'),
    anyFinePointer: media('(any-pointer: fine)'),
  }
}

export const reconcileDeviceClass = (
  previous: CognitiveDeviceClass,
  current: CognitiveDeviceClass,
): CognitiveDeviceClass => {
  if (previous === 'UNKNOWN') return current
  if (current === 'UNKNOWN') return previous
  return previous === current ? previous : 'UNKNOWN'
}

export const modalityFromPointerType = (pointerType: string): ObservedResponseModality => {
  if (pointerType === 'touch' || pointerType === 'mouse' || pointerType === 'pen') return pointerType
  return 'unknown'
}

const modeFromSeen = (seenTouch: boolean, seenKeyboardMouse: boolean): CognitiveAdministrationMode => {
  if (seenTouch && seenKeyboardMouse) return 'MIXED'
  if (seenTouch) return 'TOUCH'
  if (seenKeyboardMouse) return 'KEYBOARD_MOUSE'
  return 'UNKNOWN'
}

export interface AdministrationProvenanceTracker {
  observe: (modality: ObservedResponseModality) => boolean
  snapshot: () => AdministrationProvenanceV1
}

/**
 * Tiny O(1) session tracker. Pen is preserved only as a research-level detail
 * in future capture work; by itself it does not claim TOUCH or KEYBOARD_MOUSE.
 */
export const createAdministrationProvenanceTracker = (input: {
  deviceClass: CognitiveDeviceClass
  initial?: AdministrationProvenanceV1 | null
}): AdministrationProvenanceTracker => {
  const deviceClass = input.initial
    ? reconcileDeviceClass(input.initial.deviceClass, input.deviceClass)
    : input.deviceClass
  let seenTouch = input.initial?.administrationMode === 'TOUCH' || input.initial?.administrationMode === 'MIXED'
  let seenKeyboardMouse = input.initial?.administrationMode === 'KEYBOARD_MOUSE' || input.initial?.administrationMode === 'MIXED'
  let administrationMode = modeFromSeen(seenTouch, seenKeyboardMouse)

  return {
    observe(modality) {
      const before = administrationMode
      if (modality === 'touch') seenTouch = true
      if (modality === 'mouse' || modality === 'keyboard') seenKeyboardMouse = true
      // pen / unknown do not make a product-level administration claim.
      administrationMode = modeFromSeen(seenTouch, seenKeyboardMouse)
      return administrationMode !== before
    },
    snapshot() {
      return {
        schemaVersion: 1,
        deviceClass,
        administrationMode,
      }
    },
  }
}

export const isAdministrationProvenanceV1 = (value: unknown): value is AdministrationProvenanceV1 => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AdministrationProvenanceV1>
  return candidate.schemaVersion === 1
    && ['PHONE', 'TABLET', 'DESKTOP_LAPTOP', 'UNKNOWN'].includes(String(candidate.deviceClass))
    && ['TOUCH', 'KEYBOARD_MOUSE', 'MIXED', 'UNKNOWN'].includes(String(candidate.administrationMode))
}
