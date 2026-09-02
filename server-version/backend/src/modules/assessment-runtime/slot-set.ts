import { canonicalHash } from './canonical'
import { encryptUnifiedRuntimePayload, decryptUnifiedRuntimePayload } from './security'
import type { JsonObject } from './types'
import { z } from 'zod'

export type FrozenSlotUnitType = 'SCALE' | 'COGNITIVE' | 'FORM_SECTION'

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
  unitType: z.enum(['SCALE', 'COGNITIVE', 'FORM_SECTION']),
  required: z.boolean(),
  sourceDefinitionIdentity: z.object({
    key: z.string().min(1),
    version: z.string().min(1),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict(),
  sourceBinding: z.record(jsonValueSchema),
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

export const createFrozenActiveSlotSet = (input: Omit<FrozenActiveSlotSetV1, 'snapshotHash'>): FrozenActiveSlotSetV1 => {
  const parsed = frozenSlotSetSchema.omit({ snapshotHash: true }).parse(input) as Omit<FrozenActiveSlotSetV1, 'snapshotHash'>
  if (!Number.isSafeInteger(parsed.attemptEpoch)) throw new Error('Invalid frozen active slot set attemptEpoch')
  const seen = new Set<string>()
  parsed.slots.forEach((slot) => {
    if (!slot.slotKey || seen.has(slot.slotKey)) throw new Error('Frozen active slot keys must be unique')
    seen.add(slot.slotKey)
  })
  const unsigned = unsignedSlotSet(parsed)
  return { ...unsigned, snapshotHash: canonicalHash(unsigned) }
}

export const hashFrozenActiveSlotSet = (value: FrozenActiveSlotSetV1): string => (
  canonicalHash(unsignedSlotSet(value))
)

export const parseFrozenActiveSlotSet = (value: unknown): FrozenActiveSlotSetV1 => {
  const parsed = frozenSlotSetSchema.parse(value) as FrozenActiveSlotSetV1
  const created = createFrozenActiveSlotSet({
    schemaVersion: parsed.schemaVersion,
    runtimeGeneration: parsed.runtimeGeneration,
    attemptEpoch: parsed.attemptEpoch,
    slots: parsed.slots,
  })
  if (created.snapshotHash !== parsed.snapshotHash) throw new Error('Frozen active slot set hash mismatch')
  return created
}

export const encryptFrozenActiveSlotSet = (value: FrozenActiveSlotSetV1): string => (
  encryptUnifiedRuntimePayload(value)
)

export const decryptFrozenActiveSlotSet = (value: string): FrozenActiveSlotSetV1 => (
  parseFrozenActiveSlotSet(decryptUnifiedRuntimePayload<unknown>(value))
)

export const questionnaireScaleSlotKey = (questionnaireScaleId: string): string => `scale:${questionnaireScaleId}`
export const compositeItemSlotKey = (compositeItemId: string, unitType: 'SCALE' | 'COGNITIVE'): string => `${unitType.toLowerCase()}:${compositeItemId}`
export const formSectionSlotKey = (sectionId: string): string => `form-section:${sectionId}`
