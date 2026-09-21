import { decryptField, encryptField, isEncrypted, safeDecrypt } from '../../utils/encryption'
import { prisma } from '../../config/database'
import {
  hashScaleDefinition,
  validateScaleDefinition,
  runnerDefinition,
  type ScaleDefinitionV2,
} from './scale-definition'
import { getScalePackage } from './scale-package.registry'
import { buildScaleResult, parseScaleResultV2, type ScaleResultV2 } from './scale-result'
import type { ScaleAnswer } from './scale-scoring'
import {
  deviceInputProvenanceV1Schema,
  type DeviceInputProvenanceV1,
} from './device-input-provenance'
import {
  validateReferenceSetDefinition,
  type AssessmentReferenceSetDefinition,
  type ReferenceContext,
} from '../assessment-reference/reference'
import { DISCLOSURE_PRESETS } from './policy/disclosure'
import type { DisclosureCapabilitiesV1, ScaleDisclosureAudience } from './policy/types'
import { decryptFrozenScaleRuntimeSnapshot, parseVersionedFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { projectScaleAttemptForResume, projectScaleCompletedResponse } from './projection/scale-attempt.projector'
import { resolveLegacyScaleProjectionPolicy, scaleProjectionPolicyFromCompiled } from './projection/policy-resolver'
import type { ScaleProjectionPurpose, ScaleRelationalDisposition } from './projection/types'

export class ScaleDefinitionUnavailableError extends Error {
  constructor(message = '量表尚未安装有效的 v2 definition') {
    super(message)
    this.name = 'ScaleDefinitionUnavailableError'
  }
}

type ScaleRecordForDefinition = {
  code?: string | null
  instrumentVersion?: string | null
  definition?: unknown
  definitionHash?: string | null
  instrumentClass?: 'STANDARD' | 'CUSTOM_DESCRIPTIVE' | null
}

export const scaleDefinitionFromRecord = (scale: ScaleRecordForDefinition): ScaleDefinitionV2 => {
  if (scale.instrumentClass === 'STANDARD') {
    const scalePackage = scale.code && scale.instrumentVersion
      ? getScalePackage(scale.code, scale.instrumentVersion)
      : undefined
    if (!scalePackage) throw new ScaleDefinitionUnavailableError('STANDARD 量表没有匹配的代码 package')
    const packageHash = hashScaleDefinition(scalePackage.definition)
    if (scale.definitionHash && scale.definitionHash !== packageHash) {
      throw new ScaleDefinitionUnavailableError('STANDARD 量表 definition 与代码 package 不一致')
    }
    return scalePackage.definition
  }
  const validation = validateScaleDefinition(scale.definition, { instrumentClass: scale.instrumentClass ?? 'STANDARD' })
  if (!validation.definition || validation.issues.some((issue) => issue.severity === 'error')) {
    throw new ScaleDefinitionUnavailableError()
  }
  return validation.definition
}

export const scaleRunnerFromRecord = (scale: ScaleRecordForDefinition) => runnerDefinition(scaleDefinitionFromRecord(scale))

export const readJsonField = <T extends object>(value: unknown): { value: T | null; decryptError: boolean } => {
  if (value === null || value === undefined) return { value: null, decryptError: false }
  if (typeof value !== 'string') return { value: value as T, decryptError: false }
  if (isEncrypted(value)) {
    try {
      return { value: decryptField<T>(value), decryptError: false }
    } catch {
      return { value: null, decryptError: true }
    }
  }
  const parsed = safeDecrypt<T>(value)
  return { value: parsed, decryptError: parsed === null }
}

export type ScaleAnswerEnvelopeV1 = {
  schemaVersion: 1
  answers: ScaleAnswer[]
  deviceInputProvenance?: DeviceInputProvenanceV1
}

type ScaleAnswerReadResult = {
  answers: ScaleAnswer[]
  decryptError: boolean
  deviceInputProvenance?: DeviceInputProvenanceV1
}

const validScaleAnswerArray = (value: unknown): value is ScaleAnswer[] => (
  Array.isArray(value) && value.every((answer) => (
    answer
    && typeof answer === 'object'
    && !Array.isArray(answer)
    && typeof answer.itemCode === 'string'
    && (typeof answer.responseValue === 'string' || typeof answer.responseValue === 'number')
    && (answer.revision === undefined || (Number.isInteger(answer.revision) && answer.revision >= 0))
  ))
)

const isScaleAnswerEnvelopeV1 = (value: unknown): value is ScaleAnswerEnvelopeV1 => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (candidate.schemaVersion !== 1 || !validScaleAnswerArray(candidate.answers)) return false
  const allowed = new Set(['schemaVersion', 'answers', 'deviceInputProvenance'])
  if (Object.keys(candidate).some((key) => !allowed.has(key))) return false
  return candidate.deviceInputProvenance === undefined
    || deviceInputProvenanceV1Schema.safeParse(candidate.deviceInputProvenance).success
}

export const readScaleAnswers = (value: unknown): ScaleAnswerReadResult => {
  const parsed = readJsonField<ScaleAnswer[] | Record<string, unknown>>(value)
  if (parsed.decryptError || parsed.value === null) return { answers: [], decryptError: parsed.decryptError }
  if (validScaleAnswerArray(parsed.value)) return { answers: parsed.value, decryptError: false }
  if (!isScaleAnswerEnvelopeV1(parsed.value)) return { answers: [], decryptError: true }
  const envelope = parsed.value
  const provenance = deviceInputProvenanceV1Schema.safeParse(envelope.deviceInputProvenance)
  return {
    answers: envelope.answers,
    decryptError: false,
    ...(provenance.success ? { deviceInputProvenance: provenance.data } : {}),
  }
}

export const encryptScaleAnswers = (answers: ScaleAnswer[], deviceInputProvenance?: DeviceInputProvenanceV1): string => encryptField(
  deviceInputProvenance === undefined
    ? answers
    : {
        schemaVersion: 1,
        answers,
        deviceInputProvenance: deviceInputProvenanceV1Schema.parse(deviceInputProvenance),
      } satisfies ScaleAnswerEnvelopeV1,
)
export const encryptScaleResult = (result: ScaleResultV2): string => encryptField(result)

export const readScaleResult = (value: unknown): { result: ScaleResultV2 | null; decryptError: boolean } => {
  const parsed = readJsonField<ScaleResultV2>(value)
  if (parsed.decryptError || parsed.value === null) return { result: null, decryptError: parsed.decryptError }
  try {
    return { result: parseScaleResultV2(parsed.value), decryptError: false }
  } catch {
    return { result: null, decryptError: true }
  }
}

export interface ScaleResponseProjectionOptions {
  principalId?: string | null
  audience?: ScaleDisclosureAudience
  purpose?: ScaleProjectionPurpose
  accessCapabilities?: DisclosureCapabilitiesV1
  currentRestrictions?: DisclosureCapabilitiesV1
  relationalDisposition?: ScaleRelationalDisposition
  includeResumeAnswers?: boolean
}

const resolveProjectionPolicyForAssessment = (assessment: any, result: ScaleResultV2 | null) => {
  const storedSnapshot = assessment?.runtimeSnapshotEncrypted
  if (storedSnapshot !== null && storedSnapshot !== undefined) {
    try {
      // Runtime snapshots use the unified encrypted envelope, unlike result JSON.
      const snapshot = typeof storedSnapshot === 'string'
        ? decryptFrozenScaleRuntimeSnapshot(storedSnapshot)
        : parseVersionedFrozenScaleRuntimeSnapshot(storedSnapshot)
      if (snapshot.schemaVersion === 2) return { policy: scaleProjectionPolicyFromCompiled(snapshot.compiledPolicy), snapshotError: false }
    } catch {
      return { policy: resolveLegacyScaleProjectionPolicy('', ''), snapshotError: true }
    }
  }
  const instrumentKey = assessment?.scale?.code ?? result?.instrument.code
  const instrumentVersion = assessment?.scale?.instrumentVersion ?? result?.instrument.instrumentVersion
  const instrumentClass = assessment?.scale?.instrumentClass
  if (!instrumentKey || !instrumentVersion) return { policy: resolveLegacyScaleProjectionPolicy('', ''), snapshotError: false }
  return {
    policy: resolveLegacyScaleProjectionPolicy(instrumentKey, instrumentVersion, instrumentClass),
    snapshotError: false,
  }
}

const inferServerAudience = (assessment: any): ScaleDisclosureAudience => (
  // The teacher/admin list surface is the only Scale route that selects the
  // related user object. This is server-owned query shape; request parameters
  // cannot promote themselves to a broader audience. Explicit options still
  // win for callers that already know their audience.
  assessment?.user && typeof assessment.user === 'object' ? 'teacher' : 'respondent'
)

/**
 * Strict response projection. Resume and completed DTOs use explicit allowlists;
 * completed responses never return raw answers. V2 snapshots use their frozen
 * policy, while known V1 identities use the explicit PR-1 compatibility profile.
 */
export const scaleAssessmentForResponse = (
  assessment: any,
  options: ScaleResponseProjectionOptions = {},
): any => {
  const answers = readScaleAnswers(assessment?.answers)
  const result = readScaleResult(assessment?.result)
  const directProvenance = deviceInputProvenanceV1Schema.safeParse(assessment?.deviceInputProvenance)
  const full = DISCLOSURE_PRESETS.FULL_REPORT()
  const resolved = resolveProjectionPolicyForAssessment(assessment, result.result)
  const audience = options.audience ?? inferServerAudience(assessment)
  const projectionContext = {
    principalId: options.principalId ?? null,
    audience,
    purpose: options.purpose ?? (assessment?.status === 'COMPLETED' ? 'result' : 'resume'),
    accessDecision: {
      source: 'RESOURCE_AUTHORIZATION' as const,
      allowed: true,
      capabilities: options.accessCapabilities ?? full,
    },
    frozenPolicy: resolved.policy,
    currentRestrictions: options.currentRestrictions ?? full,
    relationalDisposition: options.relationalDisposition ?? 'NON_RELATIONAL',
  }

  if (assessment?.status === 'COMPLETED') {
    try {
      return projectScaleCompletedResponse({
        assessment,
        result: result.result,
        context: projectionContext,
        decryptError: result.decryptError || resolved.snapshotError,
      })
    } catch {
      // Scoring/persistence has already completed before this serializer runs.
      // A projection defect must fail closed as an unavailable DTO rather than
      // causing the client to retry FINAL and potentially confuse persistence
      // success with response serialization failure.
      return projectScaleCompletedResponse({
        assessment,
        result: null,
        context: {
          ...projectionContext,
          frozenPolicy: resolveLegacyScaleProjectionPolicy('', ''),
          currentRestrictions: DISCLOSURE_PRESETS.NONE(),
        },
        decryptError: true,
      })
    }
  }
  return projectScaleAttemptForResume({
    assessment,
    answers: answers.answers,
    deviceInputProvenance: answers.deviceInputProvenance ?? (directProvenance.success ? directProvenance.data : undefined),
    includeAnswers: options.includeResumeAnswers ?? audience === 'respondent',
    decryptError: answers.decryptError || resolved.snapshotError,
  })
}

export const loadScaleReferenceSets = async (instrumentKey: string): Promise<AssessmentReferenceSetDefinition[]> => {
  const rows = await prisma.assessmentReferenceSet.findMany({
    where: { instrumentType: 'SCALE', instrumentKey },
  })
  return rows.flatMap((row) => {
    const raw = row.definition
    const validation = validateReferenceSetDefinition({
      ...(raw && typeof raw === 'object' ? raw : {}),
      schemaVersion: 1,
      instrumentType: 'scale',
      instrumentKey: row.instrumentKey,
      referenceVersion: row.referenceVersion,
      status: row.status,
    })
    return validation.definition ? [validation.definition] : []
  })
}

export const buildScaleResultForRecord = async (input: {
  scale: {
    id: string
    code: string
    name: string
    instrumentVersion: string
    instrumentClass?: 'STANDARD' | 'CUSTOM_DESCRIPTIVE'
    definition: unknown
  }
  answers: ScaleAnswer[]
  participantContext?: ReferenceContext
  participantContextHash?: string | null
}): Promise<ScaleResultV2> => {
  const definition = scaleDefinitionFromRecord(input.scale)
  const referenceSets = await loadScaleReferenceSets(input.scale.code)
  return buildScaleResult({
    scaleId: input.scale.id,
    instrumentKey: input.scale.code,
    name: input.scale.name,
    instrumentVersion: input.scale.instrumentVersion,
    definition,
    answers: input.answers,
    referenceSets,
    participantContext: input.participantContext,
    participantContextHash: input.participantContextHash,
  })
}
