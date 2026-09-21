import { z } from 'zod'
import { canonicalHash } from './canonical'
import { decryptUnifiedRuntimePayload, encryptUnifiedRuntimePayload } from './security'
import {
  createFrozenUnitAdmission,
  hashFrozenUnitAdmission,
  parseFrozenUnitAdmission,
  type FrozenUnitAdmissionV1,
} from './admission-snapshot'
import type { AssessmentContextValues } from '../assessment-context/context'
import type { FrozenEligibilityDecisionV1 } from '../scale/policy/types'

export interface FrozenScaleDeploymentAdmissionBindingV1 {
  revision: number
  policyHash: string
  authorizationId: string
  authorizationVersion: number
  evaluatedAt: string
}

export interface FrozenScalePolicyAdmissionBindingV2 {
  runtimePolicyHash: string
  eligibility: FrozenEligibilityDecisionV1
  /** PR-3 start authorization audit. Older test-only V2 fixtures may omit it. */
  deployment?: FrozenScaleDeploymentAdmissionBindingV1
}

export interface FrozenUnitAdmissionV2 {
  schemaVersion: 2
  runtimeGeneration: 'UNIFIED_V1'
  frozenAt: string
  attemptEpoch: number
  scale?: FrozenUnitAdmissionV1['scale']
  cognitive?: FrozenUnitAdmissionV1['cognitive']
  formSection?: FrozenUnitAdmissionV1['formSection']
  principal: FrozenUnitAdmissionV1['principal']
  parent: FrozenUnitAdmissionV1['parent']
  requiresContext: boolean
  contextSnapshotHash: string | null
  contextValues: AssessmentContextValues | null
  governance: FrozenUnitAdmissionV1['governance']
  scalePolicy?: FrozenScalePolicyAdmissionBindingV2
  snapshotHash: string
}

const eligibilitySchema = z.object({
  schemaVersion: z.literal(1),
  evaluatorVersion: z.string().min(1),
  policyVersion: z.string().min(1),
  policyHash: z.string().regex(/^[0-9a-f]{64}$/),
  contextHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  identityBindingHash: z.string().regex(/^[0-9a-f]{64}$/),
  contextFrozenAt: z.string().datetime({ offset: true }).nullable(),
  evaluatedAt: z.string().datetime({ offset: true }),
  outcome: z.enum(['ELIGIBLE', 'INELIGIBLE', 'INDETERMINATE']),
  reasons: z.array(z.object({
    code: z.string().min(1),
    rule: z.string().min(1),
    field: z.string().min(1).optional(),
  }).strict()),
  factProvenance: z.object({
    subject: z.string().min(1),
    respondent: z.string().min(1),
    ageBasis: z.string().min(1).optional(),
  }).strict(),
}).strict()

const deploymentBindingSchema = z.object({
  revision: z.number().int().positive(),
  policyHash: z.string().regex(/^[0-9a-f]{64}$/),
  authorizationId: z.string().min(1),
  authorizationVersion: z.number().int().positive(),
  evaluatedAt: z.string().datetime({ offset: true }),
}).strict()

const frozenUnitAdmissionV2Schema = z.object({
  schemaVersion: z.literal(2),
  runtimeGeneration: z.literal('UNIFIED_V1'),
  frozenAt: z.string().datetime({ offset: true }),
  attemptEpoch: z.number().int().positive(),
  scale: z.object({
    id: z.string().min(1),
    code: z.string().min(1),
    name: z.string().min(1),
    instrumentVersion: z.string().min(1),
  }).strict().optional(),
  cognitive: z.object({
    testType: z.string().min(1),
    engineVersion: z.string().min(1),
    scoringVersion: z.string().min(1),
    configHash: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict().optional(),
  formSection: z.object({
    id: z.string().min(1),
    identityHash: z.string().min(1),
    kind: z.enum(['questionnaire', 'composite']),
    definition: z.record(z.unknown()),
  }).strict().optional(),
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
  contextSnapshotHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  contextValues: z.record(z.unknown()).nullable(),
  governance: z.object({
    status: z.enum(['READY', 'HOLD']),
    holdReason: z.string().min(1).nullable(),
  }).strict(),
  scalePolicy: z.object({
    runtimePolicyHash: z.string().regex(/^[0-9a-f]{64}$/),
    eligibility: eligibilitySchema,
    deployment: deploymentBindingSchema.optional(),
  }).strict().optional(),
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict().superRefine((value, ctx) => {
  const identities = [value.scale, value.cognitive, value.formSection].filter(Boolean)
  if (identities.length !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Frozen V2 unit admission requires exactly one instrument identity' })
  if (value.scale && !value.scalePolicy) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scalePolicy'], message: 'Scale V2 admission requires scalePolicy' })
  if (!value.scale && value.scalePolicy) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scalePolicy'], message: 'scalePolicy is only valid for Scale admission' })
})

const unsignedV2 = (input: Omit<FrozenUnitAdmissionV2, 'snapshotHash'>) => {
  const unsigned: Record<string, unknown> = {
    schemaVersion: input.schemaVersion,
    runtimeGeneration: input.runtimeGeneration,
    frozenAt: input.frozenAt,
    attemptEpoch: input.attemptEpoch,
    principal: input.principal,
    parent: input.parent,
    requiresContext: input.requiresContext,
    contextSnapshotHash: input.contextSnapshotHash,
    contextValues: input.contextValues,
    governance: input.governance,
  }
  if (input.scale) unsigned.scale = input.scale
  if (input.cognitive) unsigned.cognitive = input.cognitive
  if (input.formSection) unsigned.formSection = input.formSection
  if (input.scalePolicy) unsigned.scalePolicy = input.scalePolicy
  return unsigned
}

export const hashFrozenUnitAdmissionV2 = (snapshot: FrozenUnitAdmissionV2): string => canonicalHash(unsignedV2(snapshot))

export const createFrozenUnitAdmissionV2 = (input: {
  attemptEpoch: number
  scale?: FrozenUnitAdmissionV1['scale']
  cognitive?: FrozenUnitAdmissionV1['cognitive']
  formSection?: FrozenUnitAdmissionV1['formSection']
  principal?: Partial<FrozenUnitAdmissionV1['principal']>
  parent?: FrozenUnitAdmissionV1['parent']
  requiresContext?: boolean
  contextSnapshotHash?: string | null
  contextValues?: AssessmentContextValues | null
  governance?: Partial<FrozenUnitAdmissionV1['governance']>
  scalePolicy?: FrozenScalePolicyAdmissionBindingV2
  frozenAt?: Date
}): FrozenUnitAdmissionV2 => {
  const v1 = createFrozenUnitAdmission(input)
  if (v1.scale && !input.scalePolicy) throw new Error('Scale V2 admission requires scalePolicy')
  if (!v1.scale && input.scalePolicy) throw new Error('scalePolicy is only valid for Scale admission')
  if (input.scalePolicy) {
    if (input.scalePolicy.runtimePolicyHash !== input.scalePolicy.eligibility.policyHash) {
      throw new Error('Scale admission eligibility policy hash mismatch')
    }
    if (input.scalePolicy.eligibility.contextHash !== v1.contextSnapshotHash) {
      throw new Error('Scale admission eligibility context hash mismatch')
    }
  }
  const unsigned: Omit<FrozenUnitAdmissionV2, 'snapshotHash'> = {
    schemaVersion: 2,
    runtimeGeneration: v1.runtimeGeneration,
    frozenAt: v1.frozenAt,
    attemptEpoch: v1.attemptEpoch,
    ...(v1.scale ? { scale: v1.scale } : {}),
    ...(v1.cognitive ? { cognitive: v1.cognitive } : {}),
    ...(v1.formSection ? { formSection: v1.formSection } : {}),
    principal: v1.principal,
    parent: v1.parent,
    requiresContext: v1.requiresContext,
    contextSnapshotHash: v1.contextSnapshotHash,
    contextValues: v1.contextValues,
    governance: v1.governance,
    ...(input.scalePolicy ? { scalePolicy: input.scalePolicy } : {}),
  }
  return { ...unsigned, snapshotHash: canonicalHash(unsignedV2(unsigned)) }
}

/** Backward-compatible PR-1 test name. */
export const createFrozenUnitAdmissionV2ForTest = createFrozenUnitAdmissionV2

export const parseFrozenUnitAdmissionV2 = (value: unknown): FrozenUnitAdmissionV2 => {
  const snapshot = frozenUnitAdmissionV2Schema.parse(value) as unknown as FrozenUnitAdmissionV2
  if (hashFrozenUnitAdmissionV2(snapshot) !== snapshot.snapshotHash) throw new Error('Frozen V2 unit admission hash mismatch')
  if (snapshot.scalePolicy) {
    if (snapshot.scalePolicy.runtimePolicyHash !== snapshot.scalePolicy.eligibility.policyHash) throw new Error('Scale admission eligibility policy hash mismatch')
    if (snapshot.scalePolicy.eligibility.contextHash !== snapshot.contextSnapshotHash) throw new Error('Scale admission eligibility context hash mismatch')
  }

  const v1Unsigned: Omit<FrozenUnitAdmissionV1, 'snapshotHash'> = {
    schemaVersion: 1,
    runtimeGeneration: snapshot.runtimeGeneration,
    frozenAt: snapshot.frozenAt,
    attemptEpoch: snapshot.attemptEpoch,
    ...(snapshot.scale ? { scale: snapshot.scale } : {}),
    ...(snapshot.cognitive ? { cognitive: snapshot.cognitive } : {}),
    ...(snapshot.formSection ? { formSection: snapshot.formSection } : {}),
    principal: snapshot.principal,
    parent: snapshot.parent,
    requiresContext: snapshot.requiresContext,
    contextSnapshotHash: snapshot.contextSnapshotHash,
    contextValues: snapshot.contextValues,
    governance: snapshot.governance,
  }
  const v1Candidate: FrozenUnitAdmissionV1 = {
    ...v1Unsigned,
    snapshotHash: hashFrozenUnitAdmission({ ...v1Unsigned, snapshotHash: '0'.repeat(64) }),
  }
  parseFrozenUnitAdmission(v1Candidate)
  return snapshot
}

export type VersionedFrozenUnitAdmission = FrozenUnitAdmissionV1 | FrozenUnitAdmissionV2

export const parseVersionedFrozenUnitAdmission = (value: unknown): VersionedFrozenUnitAdmission => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Frozen unit admission')
  const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion
  if (schemaVersion === 1) return parseFrozenUnitAdmission(value)
  if (schemaVersion === 2) return parseFrozenUnitAdmissionV2(value)
  throw new Error(`Unsupported Frozen unit admission schemaVersion: ${String(schemaVersion)}`)
}

export const encryptVersionedFrozenUnitAdmission = (snapshot: VersionedFrozenUnitAdmission): string => (
  encryptUnifiedRuntimePayload(snapshot)
)

export const decryptVersionedFrozenUnitAdmission = (
  encrypted: string,
  storedHash?: string | null,
): VersionedFrozenUnitAdmission => {
  const snapshot = parseVersionedFrozenUnitAdmission(decryptUnifiedRuntimePayload<unknown>(encrypted))
  if (storedHash && storedHash !== snapshot.snapshotHash) throw new Error('Frozen unit admission stored hash mismatch')
  return snapshot
}

export const versionedFrozenAdmissionPersistence = (snapshot: VersionedFrozenUnitAdmission): {
  frozenAdmissionSnapshotEncrypted: string
  frozenAdmissionSnapshotHash: string
} => ({
  frozenAdmissionSnapshotEncrypted: encryptVersionedFrozenUnitAdmission(snapshot),
  frozenAdmissionSnapshotHash: snapshot.snapshotHash,
})
