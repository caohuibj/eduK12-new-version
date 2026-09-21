import { prisma } from '../config/database'
import { canonicalHash } from '../modules/assessment-runtime/canonical'
import { resolveEffectiveScaleDisclosure } from '../modules/scale/projection/context'
import { createScaleProjectionContext } from '../modules/scale/projection/context-factory'
import type { DisclosureCapabilitiesV1, ScaleDisclosureAudience } from '../modules/scale/policy/types'
import type { ExportData, ExportField } from './exportService.legacy'

export const EXPORT_PROJECTION_VERSION = 'scale-export-projection-v1' as const

export interface ExportScaleProjectionBindingV1 {
  scaleId: string
  instrumentKey: string
  instrumentVersion: string
  policyDisposition: 'FROZEN_V2' | 'LEGACY_PROFILE' | 'UNKNOWN'
  policyVersion: string
  runtimePolicyHash?: string
  capabilities: DisclosureCapabilitiesV1
}

export interface ExportProjectionBindingV1 {
  projectionVersion: typeof EXPORT_PROJECTION_VERSION
  resourceType: 'SCALE' | 'QUESTIONNAIRE'
  resourceId: string
  audience: ScaleDisclosureAudience
  scales: ExportScaleProjectionBindingV1[]
  fingerprint: string
}

const scaleBinding = (input: {
  scaleId: string
  instrumentKey: string
  instrumentVersion: string
  instrumentClass?: 'STANDARD' | 'CUSTOM_DESCRIPTIVE' | null
  audience: ScaleDisclosureAudience
}): ExportScaleProjectionBindingV1 => {
  const context = createScaleProjectionContext({
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    instrumentClass: input.instrumentClass,
    audience: input.audience,
    purpose: 'export',
  })
  const effective = resolveEffectiveScaleDisclosure(context)
  return {
    scaleId: input.scaleId,
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    policyDisposition: context.frozenPolicy.disposition,
    policyVersion: context.frozenPolicy.disclosure.policyVersion,
    ...(context.frozenPolicy.runtimePolicyHash ? { runtimePolicyHash: context.frozenPolicy.runtimePolicyHash } : {}),
    // Do not infer rawAnswers from FULL_REPORT. Raw answers are an independent
    // disclosure capability and must be explicitly enabled by policy.
    capabilities: effective,
  }
}

const finishBinding = (input: Omit<ExportProjectionBindingV1, 'fingerprint'>): ExportProjectionBindingV1 => ({
  ...input,
  fingerprint: canonicalHash({
    projectionVersion: input.projectionVersion,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    audience: input.audience,
    scales: input.scales,
  }),
})

export const resolveExportProjectionBinding = async (
  resourceType: 'SCALE' | 'QUESTIONNAIRE',
  resourceId: string,
  audience: ScaleDisclosureAudience = 'teacher',
): Promise<ExportProjectionBindingV1> => {
  if (resourceType === 'SCALE') {
    const scale = await prisma.scale.findUnique({
      where: { id: resourceId },
      select: { id: true, code: true, instrumentVersion: true, instrumentClass: true },
    })
    if (!scale?.code || !scale.instrumentVersion) throw new Error('量表不存在或版本信息不完整')
    return finishBinding({
      projectionVersion: EXPORT_PROJECTION_VERSION,
      resourceType,
      resourceId,
      audience,
      scales: [scaleBinding({
        scaleId: scale.id,
        instrumentKey: scale.code,
        instrumentVersion: scale.instrumentVersion,
        instrumentClass: scale.instrumentClass,
        audience,
      })],
    })
  }

  const questionnaire = await prisma.questionnaire.findUnique({
    where: { id: resourceId },
    select: {
      id: true,
      questionnaireScales: {
        orderBy: { position: 'asc' },
        select: { scale: { select: { id: true, code: true, instrumentVersion: true, instrumentClass: true } } },
      },
    },
  })
  if (!questionnaire) throw new Error('问卷不存在')
  const scales = questionnaire.questionnaireScales.map(({ scale }) => {
    if (!scale.code || !scale.instrumentVersion) throw new Error('问卷量表版本信息不完整')
    return scaleBinding({
      scaleId: scale.id,
      instrumentKey: scale.code,
      instrumentVersion: scale.instrumentVersion,
      instrumentClass: scale.instrumentClass,
      audience,
    })
  })
  return finishBinding({ projectionVersion: EXPORT_PROJECTION_VERSION, resourceType, resourceId, audience, scales })
}

const SAFE_STANDALONE_METADATA = new Set(['U_id', 'U_name', 'U_time', 'U_date'])
const METHOD_FIELDS = new Set(['INSTRUMENT_VERSION', 'SCORING_VERSION', 'REPORT_VERSION', 'DEFINITION_HASH'])

const standaloneAllowed = (name: string, caps: DisclosureCapabilitiesV1): boolean => {
  if (SAFE_STANDALONE_METADATA.has(name)) return true
  if (name.startsWith('Q_V_') || name.startsWith('RT_') || name.startsWith('DEVICE_')) return caps.rawAnswers
  if (name.startsWith('Q_S_')) return caps.itemScores
  if (name.startsWith('SCORE_')) return caps.numericScores
  if (name.startsWith('QUALITY_')) return caps.resultQualityDetails
  if (name === 'REFERENCE_VERSIONS') return caps.references
  if (METHOD_FIELDS.has(name)) return caps.methods
  // Future standalone Scale fields fail closed until deliberately classified.
  return false
}

const questionnaireScaleSuffixAllowed = (suffix: string, caps: DisclosureCapabilitiesV1): boolean => {
  if (suffix.startsWith('Q_V_') || suffix.startsWith('RT_') || suffix.startsWith('DEVICE_')) return caps.rawAnswers
  if (suffix.startsWith('Q_S_')) return caps.itemScores
  if (suffix.startsWith('SCORE_')) return caps.numericScores
  if (suffix.startsWith('QUALITY_')) return caps.resultQualityDetails
  if (suffix === 'REFERENCE_VERSIONS') return caps.references
  if (METHOD_FIELDS.has(suffix) || suffix === 'CONTEXT_SNAPSHOT_HASH') return caps.methods
  // Future per-Scale questionnaire columns fail closed by default.
  return false
}

const questionnaireAllowed = (
  name: string,
  binding: ExportProjectionBindingV1,
): boolean => {
  if (SAFE_STANDALONE_METADATA.has(name)) return true
  // Questionnaire form fields are a separate, already-authorized product
  // surface. This projector only constrains embedded Scale result disclosure.
  if (/^F\d+_/.test(name)) return true
  if (name === 'CONTEXT_SNAPSHOT_HASH') return binding.scales.every((scale) => scale.capabilities.methods)
  const match = /^S(\d+)_/.exec(name)
  if (!match) return false
  const scale = binding.scales[Number(match[1]) - 1]
  if (!scale) return false
  return questionnaireScaleSuffixAllowed(name.slice(match[0].length), scale.capabilities)
}

const filterData = (data: ExportData, allowed: (field: ExportField) => boolean): ExportData => {
  const fields = data.fields.filter(allowed)
  const names = new Set(fields.map((field) => field.name))
  const rows = data.rows.map((row) => Object.fromEntries(Object.entries(row).filter(([name]) => names.has(name))))
  return { fields, rows }
}

export const projectExportData = (data: ExportData, binding: ExportProjectionBindingV1): ExportData => {
  if (binding.resourceType === 'SCALE') {
    const caps = binding.scales[0]?.capabilities
    if (!caps) return { fields: [], rows: data.rows.map(() => ({})) }
    return filterData(data, (field) => standaloneAllowed(field.name, caps))
  }
  return filterData(data, (field) => questionnaireAllowed(field.name, binding))
}

const FINGERPRINT_MARKER = '__projection_v1_'
const AUDIENCES: ScaleDisclosureAudience[] = ['respondent', 'subject', 'teacher', 'researcher']

export interface StoredExportProjectionBinding {
  audience: ScaleDisclosureAudience
  fingerprintPrefix: string
}

/** Persist the projection audience + fingerprint in the artifact storage key. */
export const bindExportStorageKey = (storageKey: string, binding: ExportProjectionBindingV1): string => {
  const dot = storageKey.lastIndexOf('.')
  const suffix = `${FINGERPRINT_MARKER}${binding.audience}_${binding.fingerprint.slice(0, 24)}`
  return dot > 0 ? `${storageKey.slice(0, dot)}${suffix}${storageKey.slice(dot)}` : `${storageKey}${suffix}`
}

export const projectionBindingFromStorageKey = (storageKey: string): StoredExportProjectionBinding | null => {
  const match = storageKey.match(/__projection_v1_(respondent|subject|teacher|researcher)_([0-9a-f]{24})(?=\.)/)
  if (!match || !AUDIENCES.includes(match[1] as ScaleDisclosureAudience)) return null
  return { audience: match[1] as ScaleDisclosureAudience, fingerprintPrefix: match[2] }
}

export const storageKeyMatchesProjection = (storageKey: string, binding: ExportProjectionBindingV1): boolean => {
  const stored = projectionBindingFromStorageKey(storageKey)
  return stored?.audience === binding.audience && stored.fingerprintPrefix === binding.fingerprint.slice(0, 24)
}
