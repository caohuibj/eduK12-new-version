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

const legacyRawExportCapabilities = (
  disposition: ExportScaleProjectionBindingV1['policyDisposition'],
  capabilities: DisclosureCapabilitiesV1,
): DisclosureCapabilitiesV1 => disposition === 'LEGACY_PROFILE'
  ? { ...capabilities, rawAnswers: true }
  : capabilities

const scaleBinding = (input: {
  scaleId: string
  instrumentKey: string
  instrumentVersion: string
  audience: ScaleDisclosureAudience
}): ExportScaleProjectionBindingV1 => {
  const context = createScaleProjectionContext({
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
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
    capabilities: legacyRawExportCapabilities(context.frozenPolicy.disposition, effective),
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
  audience: ScaleDisclosureAudience = 'researcher',
): Promise<ExportProjectionBindingV1> => {
  if (resourceType === 'SCALE') {
    const scale = await prisma.scale.findUnique({
      where: { id: resourceId },
      select: { id: true, code: true, instrumentVersion: true },
    })
    if (!scale?.code || !scale.instrumentVersion) throw new Error('量表不存在或版本信息不完整')
    return finishBinding({
      projectionVersion: EXPORT_PROJECTION_VERSION,
      resourceType,
      resourceId,
      audience,
      scales: [scaleBinding({ scaleId: scale.id, instrumentKey: scale.code, instrumentVersion: scale.instrumentVersion, audience })],
    })
  }

  const questionnaire = await prisma.questionnaire.findUnique({
    where: { id: resourceId },
    select: {
      id: true,
      questionnaireScales: {
        orderBy: { position: 'asc' },
        select: { scale: { select: { id: true, code: true, instrumentVersion: true } } },
      },
    },
  })
  if (!questionnaire) throw new Error('问卷不存在')
  const scales = questionnaire.questionnaireScales.map(({ scale }) => {
    if (!scale.code || !scale.instrumentVersion) throw new Error('问卷量表版本信息不完整')
    return scaleBinding({ scaleId: scale.id, instrumentKey: scale.code, instrumentVersion: scale.instrumentVersion, audience })
  })
  return finishBinding({ projectionVersion: EXPORT_PROJECTION_VERSION, resourceType, resourceId, audience, scales })
}

const standaloneAllowed = (name: string, caps: DisclosureCapabilitiesV1): boolean => {
  if (name.startsWith('Q_V_') || name.startsWith('RT_') || name.startsWith('DEVICE_')) return caps.rawAnswers
  if (name.startsWith('Q_S_')) return caps.itemScores
  if (name.startsWith('SCORE_')) return caps.numericScores
  if (name.startsWith('QUALITY_')) return caps.resultQualityDetails
  if (name === 'REFERENCE_VERSIONS') return caps.references
  if (['INSTRUMENT_VERSION', 'SCORING_VERSION', 'REPORT_VERSION', 'DEFINITION_HASH'].includes(name)) return caps.methods
  return true
}

const questionnaireAllowed = (
  name: string,
  binding: ExportProjectionBindingV1,
): boolean => {
  if (name === 'CONTEXT_SNAPSHOT_HASH') return binding.scales.every((scale) => scale.capabilities.methods)
  const match = /^S(\d+)_/.exec(name)
  if (!match) return true
  const scale = binding.scales[Number(match[1]) - 1]
  if (!scale) return false
  const suffix = name.slice(match[0].length)
  if (suffix.startsWith('Q_V_') || suffix.startsWith('RT_') || suffix.startsWith('DEVICE_')) return scale.capabilities.rawAnswers
  if (suffix.startsWith('Q_S_')) return scale.capabilities.itemScores
  if (suffix.startsWith('SCORE_')) return scale.capabilities.numericScores
  if (suffix.startsWith('QUALITY_')) return scale.capabilities.resultQualityDetails
  if (suffix === 'REFERENCE_VERSIONS') return scale.capabilities.references
  if (['INSTRUMENT_VERSION', 'SCORING_VERSION', 'REPORT_VERSION', 'DEFINITION_HASH', 'CONTEXT_SNAPSHOT_HASH'].includes(suffix)) return scale.capabilities.methods
  return true
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

const FINGERPRINT_MARKER = '__projection_'

export const bindExportStorageKey = (storageKey: string, fingerprint: string): string => {
  const dot = storageKey.lastIndexOf('.')
  const suffix = `${FINGERPRINT_MARKER}${fingerprint.slice(0, 24)}`
  return dot > 0 ? `${storageKey.slice(0, dot)}${suffix}${storageKey.slice(dot)}` : `${storageKey}${suffix}`
}

export const projectionFingerprintFromStorageKey = (storageKey: string): string | null => {
  const match = storageKey.match(/__projection_([0-9a-f]{24})(?=\.)/)
  return match?.[1] ?? null
}

export const storageKeyMatchesProjection = (storageKey: string, binding: ExportProjectionBindingV1): boolean => (
  projectionFingerprintFromStorageKey(storageKey) === binding.fingerprint.slice(0, 24)
)
