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
  validateReferenceSetDefinition,
  type AssessmentReferenceSetDefinition,
  type ReferenceContext,
} from '../assessment-reference/reference'

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

export const readScaleAnswers = (value: unknown): { answers: ScaleAnswer[]; decryptError: boolean } => {
  const parsed = readJsonField<ScaleAnswer[]>(value)
  if (parsed.decryptError || parsed.value === null) return { answers: [], decryptError: parsed.decryptError }
  if (!Array.isArray(parsed.value)) return { answers: [], decryptError: true }
  const valid = parsed.value.every((answer) => (
    answer
    && typeof answer === 'object'
    && !Array.isArray(answer)
    && typeof answer.itemCode === 'string'
    && (typeof answer.responseValue === 'string' || typeof answer.responseValue === 'number')
    && (answer.revision === undefined || (Number.isInteger(answer.revision) && answer.revision >= 0))
  ))
  return valid ? { answers: parsed.value as ScaleAnswer[], decryptError: false } : { answers: [], decryptError: true }
}

export const encryptScaleAnswers = (answers: ScaleAnswer[]): string => encryptField(answers)
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

const scaleMetadataForResponse = (scale: unknown): unknown => {
  if (!scale || typeof scale !== 'object' || Array.isArray(scale)) return scale
  const { definition: _definition, ...metadata } = scale as Record<string, unknown>
  return metadata
}

/** Return a response-safe assessment without encrypted JSON columns. */
export const scaleAssessmentForResponse = (assessment: any): any => {
  const answers = readScaleAnswers(assessment?.answers)
  const result = readScaleResult(assessment?.result)
  const { answers: _encryptedAnswers, result: _encryptedResult, scale, ...metadata } = assessment ?? {}
  return {
    ...metadata,
    ...(scale !== undefined ? { scale: scaleMetadataForResponse(scale) } : {}),
    answers: answers.answers,
    result: result.result,
    ...(answers.decryptError || result.decryptError ? { decryptError: true } : {}),
  }
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
