export const SCALE_DEVICE_PROVENANCE_SCHEMA_VERSION = 1 as const
export const SCALE_DEVICE_INPUT_PROVENANCE_METADATA_KEY = 'scaleDeviceInputProvenance'

export type ScaleDeviceClass = 'DESKTOP' | 'TABLET' | 'MOBILE' | 'UNKNOWN'
export type ScaleOsFamily = 'Windows' | 'macOS' | 'iOS' | 'Android' | 'Linux' | 'Other' | 'Unknown'
export type ScaleBrowserFamily = 'Chrome' | 'Safari' | 'Firefox' | 'Edge' | 'Other' | 'Unknown'
export type ScalePrimaryPointer = 'COARSE' | 'FINE' | 'UNKNOWN'

export interface DeviceInputProvenanceV1 {
  schemaVersion: typeof SCALE_DEVICE_PROVENANCE_SCHEMA_VERSION
  deviceClass: ScaleDeviceClass
  osFamily?: ScaleOsFamily
  browserFamily?: ScaleBrowserFamily
  viewportWidth?: number
  viewportHeight?: number
  screenWidth?: number
  screenHeight?: number
  devicePixelRatio?: number
  maxTouchPoints?: number
  primaryPointer: ScalePrimaryPointer
  capturedAt: string
}

/** Raw browser signals are transient inputs and are never persisted. */
export interface BrowserDeviceInputSignals {
  userAgent?: string | null
  platform?: string | null
  viewportWidth?: number | null
  viewportHeight?: number | null
  screenWidth?: number | null
  screenHeight?: number | null
  devicePixelRatio?: number | null
  maxTouchPoints?: number | null
  primaryCoarsePointer?: boolean | null
  primaryFinePointer?: boolean | null
}

const DEVICE_CLASSES: readonly ScaleDeviceClass[] = ['DESKTOP', 'TABLET', 'MOBILE', 'UNKNOWN']
const OS_FAMILIES: readonly ScaleOsFamily[] = ['Windows', 'macOS', 'iOS', 'Android', 'Linux', 'Other', 'Unknown']
const BROWSER_FAMILIES: readonly ScaleBrowserFamily[] = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Other', 'Unknown']
const POINTERS: readonly ScalePrimaryPointer[] = ['COARSE', 'FINE', 'UNKNOWN']

const finiteNonNegative = (value: number | null | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
)

const finitePositive = (value: number | null | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
)

const integerNonNegative = (value: number | null | undefined): value is number => (
  finiteNonNegative(value) && Number.isInteger(value)
)

const cleanDimension = (value: number | null | undefined) => (
  integerNonNegative(value) && value <= 100_000 ? value : undefined
)

const cleanRatio = (value: number | null | undefined) => (
  finitePositive(value) && value <= 100 ? value : undefined
)

const cleanTouchPoints = (value: number | null | undefined) => (
  integerNonNegative(value) && value <= 256 ? value : undefined
)

const normalized = (value: string | null | undefined) => (typeof value === 'string' ? value : '')

const browserFamilyFrom = (userAgent: string): ScaleBrowserFamily => {
  if (!userAgent) return 'Unknown'
  if (/Edg\//i.test(userAgent)) return 'Edge'
  if (/(?:Firefox|FxiOS)\//i.test(userAgent)) return 'Firefox'
  if (/(?:Chrome|CriOS)\//i.test(userAgent)) return 'Chrome'
  if (/(?:Safari|Version\/)\S*/i.test(userAgent)) return 'Safari'
  return 'Other'
}

const osFamilyFrom = (userAgent: string, platform: string, maxTouchPoints: number | undefined): ScaleOsFamily => {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/MacIntel/i.test(platform) && (maxTouchPoints ?? 0) > 0)) return 'iOS'
  if (/Android/i.test(userAgent)) return 'Android'
  if (/Windows/i.test(userAgent) || /Win/i.test(platform)) return 'Windows'
  if (/Macintosh|Mac OS X/i.test(userAgent) || /Mac/i.test(platform)) return 'macOS'
  if (/Linux/i.test(userAgent) || /Linux/i.test(platform)) return 'Linux'
  return userAgent || platform ? 'Other' : 'Unknown'
}

const pointerFrom = (signals: BrowserDeviceInputSignals): ScalePrimaryPointer => {
  if (signals.primaryCoarsePointer === true) return 'COARSE'
  if (signals.primaryFinePointer === true) return 'FINE'
  return 'UNKNOWN'
}

const deviceClassFrom = (signals: BrowserDeviceInputSignals): ScaleDeviceClass => {
  const userAgent = normalized(signals.userAgent)
  const platform = normalized(signals.platform)
  const touchCapable = (signals.maxTouchPoints ?? 0) > 0 || signals.primaryCoarsePointer === true
  const width = cleanDimension(signals.screenWidth) ?? cleanDimension(signals.viewportWidth)
  const height = cleanDimension(signals.screenHeight) ?? cleanDimension(signals.viewportHeight)
  const shortSide = width !== undefined && height !== undefined ? Math.min(width, height) : undefined
  const longSide = width !== undefined && height !== undefined ? Math.max(width, height) : undefined
  const mobileToken = /Mobile|iPhone|iPod/i.test(userAgent)
  const tabletToken = /iPad|Tablet/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))

  if (mobileToken || (touchCapable && shortSide !== undefined && longSide !== undefined && shortSide <= 600 && longSide <= 1_200)) return 'MOBILE'
  if (tabletToken || (touchCapable && shortSide !== undefined && longSide !== undefined && shortSide >= 600 && shortSide <= 1_200 && longSide <= 1_800)) return 'TABLET'
  if (signals.primaryFinePointer === true && !mobileToken && !tabletToken) return 'DESKTOP'
  // A MacIntel iPad UA can be indistinguishable from a desktop without its
  // touch signal; keep ambiguous cases explicit rather than overclaiming.
  if (platform && !touchCapable && /Mac|Win|Linux/i.test(platform) && signals.primaryFinePointer !== false) return 'DESKTOP'
  return 'UNKNOWN'
}

export const readBrowserDeviceInputSignals = (): BrowserDeviceInputSignals => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return {}
  const media = typeof window.matchMedia === 'function'
    ? (query: string) => window.matchMedia(query).matches
    : (_query: string) => null
  return {
    userAgent: typeof navigator.userAgent === 'string' ? navigator.userAgent : null,
    platform: typeof navigator.platform === 'string' ? navigator.platform : null,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    devicePixelRatio: window.devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    primaryCoarsePointer: media('(pointer: coarse)'),
    primaryFinePointer: media('(pointer: fine)'),
  }
}

export const inferDeviceInputProvenance = (
  signals: BrowserDeviceInputSignals,
  capturedAt = new Date().toISOString(),
): DeviceInputProvenanceV1 => {
  const maxTouchPoints = cleanTouchPoints(signals.maxTouchPoints)
  return {
    schemaVersion: SCALE_DEVICE_PROVENANCE_SCHEMA_VERSION,
    deviceClass: deviceClassFrom(signals),
    osFamily: osFamilyFrom(normalized(signals.userAgent), normalized(signals.platform), maxTouchPoints),
    browserFamily: browserFamilyFrom(normalized(signals.userAgent)),
    ...(cleanDimension(signals.viewportWidth) === undefined ? {} : { viewportWidth: cleanDimension(signals.viewportWidth) }),
    ...(cleanDimension(signals.viewportHeight) === undefined ? {} : { viewportHeight: cleanDimension(signals.viewportHeight) }),
    ...(cleanDimension(signals.screenWidth) === undefined ? {} : { screenWidth: cleanDimension(signals.screenWidth) }),
    ...(cleanDimension(signals.screenHeight) === undefined ? {} : { screenHeight: cleanDimension(signals.screenHeight) }),
    ...(cleanRatio(signals.devicePixelRatio) === undefined ? {} : { devicePixelRatio: cleanRatio(signals.devicePixelRatio) }),
    ...(maxTouchPoints === undefined ? {} : { maxTouchPoints }),
    primaryPointer: pointerFrom(signals),
    capturedAt,
  }
}

export const captureScaleDeviceInputProvenance = (): DeviceInputProvenanceV1 => (
  inferDeviceInputProvenance(readBrowserDeviceInputSignals())
)

const isoDate = (value: unknown): value is string => (
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && !Number.isNaN(Date.parse(value))
)

const validOptionalDimension = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100_000)
const validOptionalRatio = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100)
const validOptionalTouchPoints = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 256)

export const isDeviceInputProvenanceV1 = (value: unknown): value is DeviceInputProvenanceV1 => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  const allowed = new Set([
    'schemaVersion', 'deviceClass', 'osFamily', 'browserFamily',
    'viewportWidth', 'viewportHeight', 'screenWidth', 'screenHeight',
    'devicePixelRatio', 'maxTouchPoints', 'primaryPointer', 'capturedAt',
  ])
  if (Object.keys(candidate).some((key) => !allowed.has(key))) return false
  return candidate.schemaVersion === SCALE_DEVICE_PROVENANCE_SCHEMA_VERSION
    && DEVICE_CLASSES.includes(candidate.deviceClass as ScaleDeviceClass)
    && (candidate.osFamily === undefined || OS_FAMILIES.includes(candidate.osFamily as ScaleOsFamily))
    && (candidate.browserFamily === undefined || BROWSER_FAMILIES.includes(candidate.browserFamily as ScaleBrowserFamily))
    && validOptionalDimension(candidate.viewportWidth)
    && validOptionalDimension(candidate.viewportHeight)
    && validOptionalDimension(candidate.screenWidth)
    && validOptionalDimension(candidate.screenHeight)
    && validOptionalRatio(candidate.devicePixelRatio)
    && validOptionalTouchPoints(candidate.maxTouchPoints)
    && POINTERS.includes(candidate.primaryPointer as ScalePrimaryPointer)
    && isoDate(candidate.capturedAt)
}

export const readScaleDeviceInputProvenance = (
  metadata: Record<string, unknown> | undefined,
): DeviceInputProvenanceV1 | null => {
  const candidate = metadata?.[SCALE_DEVICE_INPUT_PROVENANCE_METADATA_KEY]
  return isDeviceInputProvenanceV1(candidate) ? candidate : null
}

/** Resolve one attempt snapshot without recapturing an existing value. */
export const resolveScaleDeviceInputProvenance = (input: {
  metadata?: Record<string, unknown>
  serverValue?: unknown
  existing?: DeviceInputProvenanceV1 | null
}): DeviceInputProvenanceV1 => (
  readScaleDeviceInputProvenance(input.metadata)
  || (isDeviceInputProvenanceV1(input.serverValue) ? input.serverValue : null)
  || input.existing
  || captureScaleDeviceInputProvenance()
)
