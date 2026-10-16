import { isControlReferenceField } from './control-reference-codec'
import { storeSharedSlotPlan, loadSharedSlotPlan, sharedControlWritesEnabled } from './shared-control-records'
import { createHash } from 'node:crypto'
import { BoundedArtifactCache, artifactContentKey } from './bounded-artifact-cache'
import { compactAssessmentStorageEnabled } from './compact-field-codec'
import { canonicalHash, canonicalJsonBytes, retainImmutableCanonicalValue } from './canonical'
import { encryptUnifiedRuntimePayload, decryptUnifiedRuntimePayload } from './security'
import type { JsonObject } from './types'
import { z } from 'zod'

export type FrozenSlotUnitType = 'SCALE' | 'COGNITIVE' | 'FORM_SECTION' | 'SITUATIONAL'

export interface FrozenSituationalRuntimeIdentityV1 {
  instrumentKey: string
  instrumentVersion: string
  definitionHash: string
  compiledRuntimeHash: string
  scorerKey: string
  scoringVersion: string
  runtimeGeneration: 'UNIFIED_V1'
  deliveryMode: 'FINAL_ONLY'
  frozenAt: string
}

export interface FrozenActiveSlotV1 {
  slotKey: string
  unitType: FrozenSlotUnitType
  required: boolean
  sourceDefinitionIdentity: {
    key: string
    version: string
    hash: string
  }
  sourceBinding: JsonObject
  /** Required for SITUATIONAL; optional for historical SCALE/COGNITIVE rows. */
  runtimeIdentity?: FrozenSituationalRuntimeIdentityV1
}

export const getFrozenActiveSlot = (input: {
  encrypted: string | null | undefined
  storedHash: string | null | undefined
  attemptEpoch: number
  slotKey: string
}): FrozenActiveSlotV1 => {
  if (!input.encrypted || !input.storedHash) throw new Error('Frozen active slot set is missing')
  const snapshot = decryptFrozenActiveSlotSet(input.encrypted)
  if (snapshot.snapshotHash !== input.storedHash) throw new Error('Frozen active slot set database hash mismatch')
  if (snapshot.attemptEpoch !== input.attemptEpoch) throw new Error('Frozen active slot set epoch mismatch')
  const slot = snapshot.slots.find((candidate) => candidate.slotKey === input.slotKey)
  if (!slot) throw new Error('Frozen active slot ' + input.slotKey + ' is missing')
  return slot
}

export interface FrozenActiveSlotSetV1 {
  schemaVersion: 1
  runtimeGeneration: 'UNIFIED_V1'
  attemptEpoch: number
  slots: FrozenActiveSlotV1[]
  snapshotHash: string
}

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(jsonValueSchema),
]))

const frozenSlotSchema = z.object({
  slotKey: z.string().min(1),
  unitType: z.enum(['SCALE', 'COGNITIVE', 'FORM_SECTION', 'SITUATIONAL']),
  required: z.boolean(),
  sourceDefinitionIdentity: z.object({
    key: z.string().min(1),
    version: z.string().min(1),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict(),
  sourceBinding: z.record(jsonValueSchema),
  runtimeIdentity: z.object({
    instrumentKey: z.string().min(1),
    instrumentVersion: z.string().min(1),
    definitionHash: z.string().regex(/^[0-9a-f]{64}$/),
    compiledRuntimeHash: z.string().regex(/^[0-9a-f]{64}$/),
    scorerKey: z.string().min(1),
    scoringVersion: z.string().min(1),
    runtimeGeneration: z.literal('UNIFIED_V1'),
    deliveryMode: z.literal('FINAL_ONLY'),
    frozenAt: z.string().datetime({ offset: true }),
  }).strict().optional(),
}).strict()

const frozenSlotSetSchema = z.object({
  schemaVersion: z.literal(1),
  runtimeGeneration: z.literal('UNIFIED_V1'),
  attemptEpoch: z.number().int().min(1),
  slots: z.array(frozenSlotSchema),
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

const unsignedSlotSet = (input: Omit<FrozenActiveSlotSetV1, 'snapshotHash'>) => ({
  schemaVersion: input.schemaVersion,
  runtimeGeneration: input.runtimeGeneration,
  attemptEpoch: input.attemptEpoch,
  slots: input.slots,
})

const assertFrozenSlotContents = (parsed: Omit<FrozenActiveSlotSetV1, 'snapshotHash'>): void => {
  if (!Number.isSafeInteger(parsed.attemptEpoch)) throw new Error('Invalid frozen active slot set attemptEpoch')
  const seen = new Set<string>()
  parsed.slots.forEach((slot) => {
    if (!slot.slotKey || seen.has(slot.slotKey)) throw new Error('Frozen active slot keys must be unique')
    seen.add(slot.slotKey)
    if (slot.unitType === 'SITUATIONAL') {
      if (!slot.runtimeIdentity) throw new Error('Situational frozen slot runtime identity is required')
      if (
        slot.runtimeIdentity.instrumentKey !== slot.sourceDefinitionIdentity.key
        || slot.runtimeIdentity.instrumentVersion !== slot.sourceDefinitionIdentity.version
        || slot.runtimeIdentity.definitionHash !== slot.sourceDefinitionIdentity.hash
      ) throw new Error('Situational frozen slot runtime identity mismatch')
    }
  })
}

export const createFrozenActiveSlotSet = (input: Omit<FrozenActiveSlotSetV1, 'snapshotHash'>): FrozenActiveSlotSetV1 => {
  const parsed = frozenSlotSetSchema.omit({ snapshotHash: true }).parse(input) as Omit<FrozenActiveSlotSetV1, 'snapshotHash'>
  assertFrozenSlotContents(parsed)
  const unsigned = unsignedSlotSet(parsed)
  return { ...unsigned, snapshotHash: canonicalHash(unsigned) }
}

export const hashFrozenActiveSlotSet = (value: FrozenActiveSlotSetV1): string => (
  canonicalHash(unsignedSlotSet(value))
)

export const parseFrozenActiveSlotSet = (value: unknown): FrozenActiveSlotSetV1 => {
  const parsed = frozenSlotSetSchema.parse(value) as FrozenActiveSlotSetV1
  // The full schema has already validated these exact children. Retain all
  // semantic checks without a second Zod clone of the same tree.
  assertFrozenSlotContents(parsed)
  const unsigned = unsignedSlotSet(parsed), snapshotHash = canonicalHash(unsigned)
  if (snapshotHash !== parsed.snapshotHash) throw new Error('Frozen active slot set hash mismatch')
  return { ...unsigned, snapshotHash }
}

export const encryptFrozenActiveSlotSet = (value: FrozenActiveSlotSetV1): string => (
  encryptUnifiedRuntimePayload(value)
)

// Only immutable plan content is reused. Ownership, stored hash, epoch and
// requested-slot checks remain outside this cache and execute on every call.
// Cipher keys include the active encryption-key identity; corruption or key
// changes cannot be satisfied from a previous verification.
const verifiedSlotPlans = new BoundedArtifactCache<FrozenActiveSlotSetV1>(128, 4 * 1024 * 1024)
const verifiedSlotCiphers = new BoundedArtifactCache<string>(512, 512 * 1024)
export const frozenSlotPlanCacheStats = () => ({ plans: verifiedSlotPlans.stats(), ciphers: verifiedSlotCiphers.stats() })
export const decryptFrozenActiveSlotSet = (value: string): FrozenActiveSlotSetV1 => {
  if (!compactAssessmentStorageEnabled()) return parseFrozenActiveSlotSet(decryptUnifiedRuntimePayload<unknown>(value))
  const keyIdentity = createHash('sha256').update(process.env.DATA_ENCRYPTION_KEY ?? '').digest('hex')
  const cipherKey = createHash('sha256').update(keyIdentity).update(':').update(value).digest('hex')
  const knownHash = verifiedSlotCiphers.get(cipherKey)
  if (knownHash) { const known = verifiedSlotPlans.get(knownHash); if (known) return known }
  const decoded = decryptUnifiedRuntimePayload<unknown>(value)
  // A second ciphertext must authenticate and match the full canonical content,
  // including its own hash and epoch, before it can reuse a validated plan.
  const bytes = canonicalJsonBytes(decoded), hash = artifactContentKey(bytes)
  let plan = verifiedSlotPlans.get(hash)
  if (!plan) {
    plan = retainImmutableCanonicalValue(parseFrozenActiveSlotSet(decoded))
    verifiedSlotPlans.set(hash, plan, bytes.length * 6 + 2048)
  }
  // Oversize plans can be decoded correctly but are never admitted to the cache.
  if (verifiedSlotPlans.get(hash)) verifiedSlotCiphers.set(cipherKey, hash, 512)
  return plan
}

export const questionnaireScaleSlotKey = (questionnaireScaleId: string): string => `scale:${questionnaireScaleId}`
export const compositeItemSlotKey = (compositeItemId: string, unitType: 'SCALE' | 'COGNITIVE' | 'SITUATIONAL'): string => `${unitType.toLowerCase()}:${compositeItemId}`
export const formSectionSlotKey = (sectionId: string): string => `form-section:${sectionId}`

export const storeFrozenActiveSlotSet = (snapshot: FrozenActiveSlotSetV1): Promise<string> => storeSharedSlotPlan(snapshot)
const sharedSlotContentIndex=new BoundedArtifactCache<string>(128,64*1024)
export const loadFrozenActiveSlotSet = async (value: string): Promise<FrozenActiveSlotSetV1> => {
  // Legacy ciphertext keeps the existing verified-cipher fast path.
  if(!isControlReferenceField(value))return decryptFrozenActiveSlotSet(value)
  const ref=decryptUnifiedRuntimePayload<any>(value)
  if(ref?.k!=='FSP2'||typeof ref.p!=='string'||!/^[a-f0-9]{64}$/.test(ref.p)||!Number.isSafeInteger(ref.e)||ref.e<1||Object.keys(ref).some(k=>!['k','p','e'].includes(k)))throw new Error('Frozen slot reference invalid')
  const key=ref.p+':'+ref.e,knownHash=sharedSlotContentIndex.get(key),known=knownHash?verifiedSlotPlans.get(knownHash):undefined
  if(known)return known
  const decoded=await loadSharedSlotPlan(value,ref),parsed=parseFrozenActiveSlotSet(decoded)
  retainImmutableCanonicalValue(parsed)
  verifiedSlotPlans.set(parsed.snapshotHash,parsed,canonicalJsonBytes(parsed).length*6+512)
  sharedSlotContentIndex.set(key,parsed.snapshotHash,key.length*2+256)
  return parsed
}

export const loadFrozenActiveSlot = async (input: Parameters<typeof getFrozenActiveSlot>[0]): Promise<FrozenActiveSlotV1> => {
  if (!input.encrypted || !input.storedHash) throw new Error('Frozen active slot set is missing')
  const snapshot = await loadFrozenActiveSlotSet(input.encrypted)
  if (snapshot.snapshotHash !== input.storedHash || snapshot.attemptEpoch !== input.attemptEpoch) throw new Error('Frozen active slot set binding mismatch')
  const slot = snapshot.slots.find(candidate => candidate.slotKey === input.slotKey)
  if (!slot) throw new Error('Frozen active slot is missing')
  return slot
}
