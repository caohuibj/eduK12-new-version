import type { ApiResponse } from '../../types'
import type {
  WholeQuestionnaireBinding,
  WholeQuestionnaireDefinition,
  WholeQuestionnaireTemplate,
} from './types'

/** The frozen attempt identity the inline payload must match before it may be
 * consumed. slotSetHash is intentionally absent: the attempt state does not
 * carry it, and slot-set drift is already fenced by the runner's draft meta
 * identity check (FinalDraftIdentityConflictError), which refuses to reuse a
 * sealed draft across different frozen slot sets. */
export type InlineWholeDefinitionIdentity = {
  attemptId: string
  attemptEpoch?: number
  contextSnapshotHash?: string | null
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const MAX_MEMORY_TEMPLATES = 16
const MAX_STORAGE_TEMPLATES = 6
const TEMPLATE_KEY_PREFIX = 'composite:whole-template:v1:'
const TEMPLATE_INDEX_KEY = 'composite:whole-template:v1:index'

const memoryTemplateCache = new Map<string, WholeQuestionnaireTemplate>()

const defaultSessionStorage = (): StorageLike | null => {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const normalizeTemplateHash = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 128 || /[\s,;/\\?#]/.test(trimmed)) return null
  return trimmed
}

const touchMemoryTemplate = (hash: string, template: WholeQuestionnaireTemplate): void => {
  memoryTemplateCache.delete(hash)
  memoryTemplateCache.set(hash, template)
  while (memoryTemplateCache.size > MAX_MEMORY_TEMPLATES) {
    const oldest = memoryTemplateCache.keys().next().value
    if (!oldest) break
    memoryTemplateCache.delete(oldest)
  }
}

const isValidTemplateShape = (
  value: unknown,
  expectedHash?: string,
): value is WholeQuestionnaireTemplate => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<WholeQuestionnaireTemplate>
  const hash = normalizeTemplateHash(candidate.templateHash)
  if (!hash || (expectedHash && hash !== expectedHash)) return false
  if (typeof candidate.slotSetHash !== 'string' || !candidate.slotSetHash) return false
  if (!Array.isArray(candidate.units)) return false
  return candidate.units.length > 0 || (Array.isArray(candidate.formSections) && candidate.formSections.length > 0)
}

const extractTemplate = (
  source: WholeQuestionnaireTemplate | WholeQuestionnaireDefinition | null | undefined,
): WholeQuestionnaireTemplate | null => {
  if (!source) return null
  const templateHash = normalizeTemplateHash(source.templateHash)
  if (!templateHash || typeof source.slotSetHash !== 'string' || !source.slotSetHash) return null
  if (!Array.isArray(source.units)) return null
  const units = source.units.map((unit) => ({
    itemId: unit.itemId,
    definitionHash: unit.definitionHash,
    ...(unit.presentationMode ? { presentationMode: unit.presentationMode } : {}),
    scale: unit.scale,
    ...(unit.position !== undefined ? { position: unit.position } : {}),
  }))
  if (units.length === 0 && (source.formSections?.length ?? 0) === 0) return null
  return {
    templateHash,
    slotSetHash: source.slotSetHash,
    ...(source.formSections ? { formSections: source.formSections } : {}),
    units,
  }
}

const readStorageIndex = (storage: StorageLike): string[] => {
  try {
    const raw = storage.getItem(TEMPLATE_INDEX_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => normalizeTemplateHash(entry))
      .filter((entry): entry is string => Boolean(entry))
  } catch {
    return []
  }
}

const writeStorageIndex = (storage: StorageLike, hashes: string[]): void => {
  try {
    storage.setItem(TEMPLATE_INDEX_KEY, JSON.stringify(hashes))
  } catch {
    // Storage quota or restricted browser modes are handled as cache misses.
  }
}

const removeTemplateFromStorage = (hash: string, storage: StorageLike | null): void => {
  if (!storage) return
  try {
    storage.removeItem(`${TEMPLATE_KEY_PREFIX}${hash}`)
    const nextIndex = readStorageIndex(storage).filter((entry) => entry !== hash)
    writeStorageIndex(storage, nextIndex)
  } catch {
    // Ignore storage cleanup errors.
  }
}

const writeTemplateToStorage = (template: WholeQuestionnaireTemplate, storage: StorageLike | null): void => {
  if (!storage) return
  const nextIndex = readStorageIndex(storage).filter((entry) => entry !== template.templateHash)
  while (nextIndex.length >= MAX_STORAGE_TEMPLATES) {
    const evicted = nextIndex.shift()
    if (!evicted) break
    try {
      storage.removeItem(`${TEMPLATE_KEY_PREFIX}${evicted}`)
    } catch {
      // Continue best-effort cleanup.
    }
  }
  const serialized = JSON.stringify(template)
  for (let attempt = 0; attempt <= MAX_STORAGE_TEMPLATES; attempt++) {
    try {
      storage.setItem(`${TEMPLATE_KEY_PREFIX}${template.templateHash}`, serialized)
      writeStorageIndex(storage, [...nextIndex, template.templateHash])
      return
    } catch {
      if (nextIndex.length === 0) break
      const evicted = nextIndex.shift()
      if (!evicted) break
      try {
        storage.removeItem(`${TEMPLATE_KEY_PREFIX}${evicted}`)
      } catch {
        // Ignore and continue evicting.
      }
    }
  }
  writeStorageIndex(storage, nextIndex)
}

/** Reset module-level and sessionStorage template caches in unit tests. */
export const clearWholeQuestionnaireTemplateCacheForTest = (
  storage: StorageLike | null = defaultSessionStorage(),
): void => {
  const hashes = new Set<string>(memoryTemplateCache.keys())
  if (storage) {
    for (const hash of readStorageIndex(storage)) hashes.add(hash)
  }
  memoryTemplateCache.clear()
  if (!storage) return
  for (const hash of hashes) {
    try {
      storage.removeItem(`${TEMPLATE_KEY_PREFIX}${hash}`)
    } catch {
      // Ignore cleanup errors.
    }
  }
  try {
    storage.removeItem(TEMPLATE_INDEX_KEY)
  } catch {
    // Ignore cleanup errors.
  }
}

/** Extract and cache the user-invariant questionnaire template under its content hash. */
export const cacheWholeQuestionnaireTemplate = (
  source: WholeQuestionnaireTemplate | WholeQuestionnaireDefinition | null | undefined,
  storage: StorageLike | null = defaultSessionStorage(),
): WholeQuestionnaireTemplate | null => {
  const template = extractTemplate(source)
  if (!template) return null
  touchMemoryTemplate(template.templateHash, template)
  writeTemplateToStorage(template, storage)
  return template
}

/** Look up a previously cached whole-questionnaire template by templateHash. */
export const getCachedWholeQuestionnaireTemplate = (
  rawHash: string,
  storage: StorageLike | null = defaultSessionStorage(),
): WholeQuestionnaireTemplate | null => {
  const hash = normalizeTemplateHash(rawHash)
  if (!hash) return null
  const inMemory = memoryTemplateCache.get(hash)
  if (inMemory) {
    touchMemoryTemplate(hash, inMemory)
    return inMemory
  }
  if (!storage) return null
  let raw: string | null = null
  try {
    raw = storage.getItem(`${TEMPLATE_KEY_PREFIX}${hash}`)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isValidTemplateShape(parsed, hash)) {
      removeTemplateFromStorage(hash, storage)
      return null
    }
    touchMemoryTemplate(hash, parsed)
    return parsed
  } catch {
    removeTemplateFromStorage(hash, storage)
    return null
  }
}

/** Evict a stale or corrupted cached template from memory and sessionStorage. */
export const evictCachedWholeQuestionnaireTemplate = (
  rawHash: string,
  storage: StorageLike | null = defaultSessionStorage(),
): void => {
  const hash = normalizeTemplateHash(rawHash)
  if (!hash) return
  memoryTemplateCache.delete(hash)
  removeTemplateFromStorage(hash, storage)
}

/** Return up to `limit` verified template hashes ordered from most recent to oldest. */
export const getKnownWholeTemplateHashes = (
  storage: StorageLike | null = defaultSessionStorage(),
  limit = 4,
): string[] => {
  const cap = Math.max(0, Math.floor(limit))
  if (cap === 0) return []
  const candidates: string[] = []
  const memoryKeys = Array.from(memoryTemplateCache.keys())
  for (let i = memoryKeys.length - 1; i >= 0; i--) candidates.push(memoryKeys[i]!)
  if (storage) {
    const stored = readStorageIndex(storage)
    for (let i = stored.length - 1; i >= 0; i--) candidates.push(stored[i]!)
  }
  const seen = new Set<string>()
  const result: string[] = []
  for (const hash of candidates) {
    if (seen.has(hash)) continue
    seen.add(hash)
    if (memoryTemplateCache.has(hash) || getCachedWholeQuestionnaireTemplate(hash, storage)) {
      result.push(hash)
      if (result.length >= cap) break
    }
  }
  return result
}

export const isWholeQuestionnaireBinding = (value: unknown): value is WholeQuestionnaireBinding => {
  if (typeof value !== 'object' || value === null || 'formSections' in value) return false
  const candidate = value as Partial<WholeQuestionnaireBinding>
  return typeof candidate.attemptId === 'string' && candidate.attemptId.length > 0
    && typeof candidate.attemptEpoch === 'number'
    && typeof candidate.slotSetHash === 'string' && candidate.slotSetHash.length > 0
    && typeof candidate.templateHash === 'string' && candidate.templateHash.length > 0
    && Array.isArray(candidate.units)
    && candidate.units.every((unit) => typeof unit === 'object' && unit !== null && !('scale' in unit))
}

/** Combine a cached static template with a user-specific binding after strict integrity checks. */
export const applyWholeTemplateBinding = (
  template: WholeQuestionnaireTemplate,
  binding: WholeQuestionnaireBinding,
): WholeQuestionnaireDefinition | null => {
  if (!isValidTemplateShape(template) || !isWholeQuestionnaireBinding(binding)) return null
  if (template.templateHash !== binding.templateHash || template.slotSetHash !== binding.slotSetHash) return null
  if (binding.units.length !== template.units.length) return null

  const templateUnitByItemId = new Map(template.units.map((unit) => [unit.itemId, unit]))
  const seenItemIds = new Set<string>()
  const units: WholeQuestionnaireDefinition['units'] = []

  for (const bound of binding.units) {
    if (!bound.itemId || !bound.scaleAssessmentId || seenItemIds.has(bound.itemId)) return null
    seenItemIds.add(bound.itemId)
    const tmplUnit = templateUnitByItemId.get(bound.itemId)
    if (!tmplUnit || tmplUnit.definitionHash !== bound.definitionHash) return null
    units.push({
      itemId: tmplUnit.itemId,
      definitionHash: tmplUnit.definitionHash,
      ...((bound.presentationMode ?? tmplUnit.presentationMode)
        ? { presentationMode: bound.presentationMode ?? tmplUnit.presentationMode }
        : {}),
      ...(bound.trainingTiming ? { trainingTiming: bound.trainingTiming } : {}),
      scaleAssessmentId: bound.scaleAssessmentId,
      scale: tmplUnit.scale,
      ...(tmplUnit.position !== undefined ? { position: tmplUnit.position } : {}),
    })
  }

  if (units.length === 0 && (template.formSections?.length ?? 0) === 0) return null

  return {
    attemptId: binding.attemptId,
    attemptEpoch: binding.attemptEpoch,
    slotSetHash: binding.slotSetHash,
    contextSnapshotHash: binding.contextSnapshotHash ?? null,
    templateHash: binding.templateHash,
    units,
    ...(template.formSections ? { formSections: template.formSections } : {}),
  }
}

/** Cache inline definitions or assemble inline bindings synchronously when the template is cached locally. */
export const assembleInlineWholePayload = (
  payload: {
    wholeDefinition?: WholeQuestionnaireDefinition | null
    wholeBinding?: WholeQuestionnaireBinding | null
  } | null | undefined,
  storage: StorageLike | null = defaultSessionStorage(),
): WholeQuestionnaireDefinition | null => {
  if (!payload) return null
  if (payload.wholeDefinition) {
    cacheWholeQuestionnaireTemplate(payload.wholeDefinition, storage)
    return payload.wholeDefinition
  }
  if (payload.wholeBinding) {
    const cached = getCachedWholeQuestionnaireTemplate(payload.wholeBinding.templateHash, storage)
    if (!cached) return null
    const assembled = applyWholeTemplateBinding(cached, payload.wholeBinding)
    if (!assembled) {
      evictCachedWholeQuestionnaireTemplate(payload.wholeBinding.templateHash, storage)
      return null
    }
    return assembled
  }
  return null
}

/** Resolve a GET /whole/definition response whether it returned a full definition or a binding. */
export const resolveWholeDefinitionPayload = async (
  payload: WholeQuestionnaireDefinition | WholeQuestionnaireBinding | { wholeBinding: WholeQuestionnaireBinding },
  fetchTemplate: (templateHash: string) => Promise<ApiResponse<WholeQuestionnaireTemplate>>,
  fallbackDefinition: () => Promise<ApiResponse<WholeQuestionnaireDefinition>>,
  storage: StorageLike | null = defaultSessionStorage(),
): Promise<ApiResponse<WholeQuestionnaireDefinition>> => {
  const binding = 'wholeBinding' in payload
    ? payload.wholeBinding
    : isWholeQuestionnaireBinding(payload)
      ? payload
      : null

  if (!binding) {
    const full = payload as WholeQuestionnaireDefinition
    cacheWholeQuestionnaireTemplate(full, storage)
    return { code: 0, data: full, message: 'OK' }
  }

  const cached = getCachedWholeQuestionnaireTemplate(binding.templateHash, storage)
  if (cached) {
    const assembled = applyWholeTemplateBinding(cached, binding)
    if (assembled) return { code: 0, data: assembled, message: 'OK' }
    evictCachedWholeQuestionnaireTemplate(binding.templateHash, storage)
  }

  try {
    const fetched = await fetchTemplate(binding.templateHash)
    if (fetched.code === 0 && fetched.data) {
      const assembled = applyWholeTemplateBinding(fetched.data, binding)
      if (assembled) {
        cacheWholeQuestionnaireTemplate(fetched.data, storage)
        return { code: 0, data: assembled, message: 'OK' }
      }
    }
  } catch {
    // Template fetch or mismatch falls back to the authoritative full definition.
  }

  evictCachedWholeQuestionnaireTemplate(binding.templateHash, storage)
  const fallback = await fallbackDefinition()
  if (fallback?.code === 0 && fallback.data) {
    cacheWholeQuestionnaireTemplate(fallback.data, storage)
  }
  return fallback
}

/** X-05A dual-track delivery: prefer the whole definition that arrived inline
 * with the START response, and fall back to the existing GET endpoint whenever
 * the inline payload is absent, stale (identity mismatch) or structurally
 * incomplete. The returned inline payload is consumed exactly once, so a later
 * reload always re-fetches from the authoritative endpoint. The runner keeps
 * its own second-layer validation on whatever this returns. */
export const wholeDefinitionWithInlineFallback = async (
  inline: WholeQuestionnaireDefinition | null | undefined,
  identity: InlineWholeDefinitionIdentity,
  fallback: () => Promise<ApiResponse<WholeQuestionnaireDefinition>>,
): Promise<ApiResponse<WholeQuestionnaireDefinition>> => {
  const identityMatches = Boolean(
    inline && inline.attemptId === identity.attemptId
      && (identity.attemptEpoch === undefined || inline.attemptEpoch === identity.attemptEpoch)
      && (identity.contextSnapshotHash === undefined
        || (inline.contextSnapshotHash ?? null) === (identity.contextSnapshotHash ?? null)),
  )
  const usable = Boolean(
    identityMatches
      && ((inline!.units?.length ?? 0) > 0 || (inline!.formSections?.length ?? 0) > 0),
  )
  if (usable) return { code: 0, data: inline!, message: 'OK' }
  return fallback()
}

/** Consume a Study Wave inline definition once. Broken storage/JSON is a cache miss;
 * it must never prevent the authoritative GET fallback. */
export const takeStoredWholeDefinition = (
  attemptId: string,
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
): WholeQuestionnaireDefinition | null => {
  const key = `composite:inline-definition:${attemptId}`
  let cached: string | null
  try {
    cached = storage.getItem(key)
    storage.removeItem(key)
  } catch {
    return null
  }
  if (!cached) return null
  try {
    const parsed: unknown = JSON.parse(cached)
    if (typeof parsed !== 'object' || parsed === null || !('attemptId' in parsed) || parsed.attemptId !== attemptId) return null
    return parsed as WholeQuestionnaireDefinition
  } catch {
    return null
  }
}
