import { z } from 'zod'
import { canonicalHash } from './canonical'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from './security'
import type { AssessmentContextValues } from '../assessment-context/context'

export const FROZEN_UNIT_ADMISSION_SCHEMA_VERSION = 1 as const

export type FrozenAdmissionGovernanceStatus = 'READY' | 'HOLD'

export interface FrozenUnitAdmissionV1 {
  schemaVersion: typeof FROZEN_UNIT_ADMISSION_SCHEMA_VERSION
  runtimeGeneration: 'UNIFIED_V1'
  frozenAt: string
  attemptEpoch: number
  scale: {
    id: string
    code: string
    name: string
    instrumentVersion: string
  }
  principal: {
    userId: string | null
    questionnaireSessionId: string | null
    recoveryTokenHash: string | null
  }
  parent: null | {
    kind: 'questionnaire' | 'composite'
    parentId: string
    slotKey: string
    sourceDefinitionHash: string
    compiledRuntimeHash: string
  }
  requiresContext: boolean
  contextSnapshotHash: string | null
  contextValues: AssessmentContextValues | null
  governance: {
    status: FrozenAdmissionGovernanceStatus
    holdReason: string | null
  }
  snapshotHash: string
}

const unsignedAdmission = (input: Omit<FrozenUnitAdmissionV1, 'snapshotHash'>) => ({
  schemaVersion: input.schemaVersion,
  runtimeGeneration: input.runtimeGeneration,
  frozenAt: input.frozenAt,
  attemptEpoch: input.attemptEpoch,
  scale: input.scale,
  principal: input.principal,
  parent: input.parent,
  requiresContext: input.requiresContext,
  contextSnapshotHash: input.contextSnapshotHash,
  contextValues: input.contextValues,
  governance: input.governance,
})

const frozenUnitAdmissionSchema = z.object({
  schemaVersion: z.literal(1),
  runtimeGeneration: z.literal('UNIFIED_V1'),
  frozenAt: z.string().datetime({ offset: true }),
  attemptEpoch: z.number().int().positive(),
  scale: z.object({
    id: z.string().min(1),
    code: z.string().min(1),
    name: z.string().min(1),
    instrumentVersion: z.string().min(1),
  }).strict(),
  principal: z.object({
    userId: z.string().min(1).nullable(),
    questionnaireSessionId: z.string().min(1).nullable(),
    recoveryTokenHash: z.string().min(1).nullable(),
  }).strict(),
  parent: z.object({
    kind: z.enum(['questionnaire', 'composite']),
    parentId: z.string().min(1),
    slotKey: z.string().min(1),
    sourceDefinitionHash: z.string().regex(/^[0-9a-f]{64}$/),
    compiledRuntimeHash: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict().nullable(),
  requiresContext: z.boolean(),
  contextSnapshotHash: z.string().nullable(),
  contextValues: z.record(z.unknown()).nullable(),
  governance: z.object({
    status: z.enum(['READY', 'HOLD']),
    holdReason: z.string().min(1).nullable(),
  }).strict(),
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict()

export const createFrozenUnitAdmission = (input: {
  attemptEpoch: number
  scale: FrozenUnitAdmissionV1['scale']
  principal?: Partial<FrozenUnitAdmissionV1['principal']>
  parent?: FrozenUnitAdmissionV1['parent']
  requiresContext?: boolean
  contextSnapshotHash?: string | null
  contextValues?: AssessmentContextValues | null
  governance?: Partial<FrozenUnitAdmissionV1['governance']>
  frozenAt?: Date
}): FrozenUnitAdmissionV1 => {
  const frozenAt = input.frozenAt ?? new Date()
  if (Number.isNaN(frozenAt.getTime())) throw new Error('Invalid frozen unit admission frozenAt')
  if (input.governance?.status === 'HOLD' && !input.governance.holdReason) {
    throw new Error('HOLD admission requires holdReason')
  }
  const unsigned = unsignedAdmission({
    schemaVersion: 1,
    runtimeGeneration: 'UNIFIED_V1',
    frozenAt: frozenAt.toISOString(),
    attemptEpoch: input.attemptEpoch,
    scale: input.scale,
    principal: {
      userId: input.principal?.userId ?? null,
      questionnaireSessionId: input.principal?.questionnaireSessionId ?? null,
      recoveryTokenHash: input.principal?.recoveryTokenHash ?? null,
    },
    parent: input.parent ?? null,
    requiresContext: Boolean(input.requiresContext),
    contextSnapshotHash: input.contextSnapshotHash ?? null,
    contextValues: input.contextValues ?? null,
    governance: {
      status: input.governance?.status ?? 'READY',
      holdReason: input.governance?.holdReason ?? null,
    },
  })
  return { ...unsigned, snapshotHash: canonicalHash(unsigned) }
}

export const hashFrozenUnitAdmission = (snapshot: FrozenUnitAdmissionV1): string => (
  canonicalHash(unsignedAdmission(snapshot))
)

export const parseFrozenUnitAdmission = (value: unknown): FrozenUnitAdmissionV1 => {
  const snapshot = frozenUnitAdmissionSchema.parse(value) as FrozenUnitAdmissionV1
  if (hashFrozenUnitAdmission(snapshot) !== snapshot.snapshotHash) {
    throw new Error('Frozen unit admission hash mismatch')
  }
  if (snapshot.requiresContext && snapshot.contextSnapshotHash === null) {
    throw new Error('Frozen unit admission requires context but contextSnapshotHash is null')
  }
  if (snapshot.governance.status === 'HOLD' && !snapshot.governance.holdReason) {
    throw new Error('HOLD admission requires holdReason')
  }
  return snapshot
}

export const encryptFrozenUnitAdmission = (snapshot: FrozenUnitAdmissionV1): string => (
  encryptUnifiedRuntimePayload(snapshot)
)

export const decryptFrozenUnitAdmission = (encrypted: string, storedHash?: string | null): FrozenUnitAdmissionV1 => {
  const snapshot = parseFrozenUnitAdmission(decryptUnifiedRuntimePayload(encrypted))
  if (storedHash && storedHash !== snapshot.snapshotHash) {
    throw new Error('Frozen unit admission stored hash mismatch')
  }
  return snapshot
}

export const frozenAdmissionPersistence = (snapshot: FrozenUnitAdmissionV1): {
  frozenAdmissionSnapshotEncrypted: string
  frozenAdmissionSnapshotHash: string
} => ({
  frozenAdmissionSnapshotEncrypted: encryptFrozenUnitAdmission(snapshot),
  frozenAdmissionSnapshotHash: snapshot.snapshotHash,
})
