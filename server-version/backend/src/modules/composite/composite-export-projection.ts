import { randomBytes } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { resolveEffectiveScaleDisclosure } from '../scale/projection/context'
import { createScaleProjectionContext } from '../scale/projection/context-factory'
import type { DisclosureCapabilitiesV1, ScaleDisclosureAudience } from '../scale/policy/types'
import type { CompositeExportData, CompositeExportField } from './composite-export.service'

export const COMPOSITE_EXPORT_PROJECTION_VERSION = 'composite-scale-export-projection-v1' as const

export interface CompositeExportScaleBindingV1 {
  prefix: string
  itemId: string
  scaleId: string | null
  instrumentKey: string | null
  instrumentVersion: string | null
  policyDisposition: 'FROZEN_V2' | 'LEGACY_PROFILE' | 'UNKNOWN'
  policyVersion: string
  runtimePolicyHash?: string
  capabilities: DisclosureCapabilitiesV1
}

export interface CompositeExportProjectionBindingV1 {
  projectionVersion: typeof COMPOSITE_EXPORT_PROJECTION_VERSION
  resourceType: 'COMPOSITE'
  resourceId: string
  audience: ScaleDisclosureAudience
  scales: CompositeExportScaleBindingV1[]
  fingerprint: string
}

type CompositeScaleItem = {
  id: string
  type: string
  scale?: {
    id?: string | null
    code?: string | null
    instrumentVersion?: string | null
    instrumentClass?: 'STANDARD' | 'CUSTOM_DESCRIPTIVE' | null
  } | null
}

const slotPrefix = (index: number) => `S${String(index + 1).padStart(3, '0')}_`

const scaleBindingFor = (
  item: CompositeScaleItem,
  index: number,
  audience: ScaleDisclosureAudience,
): CompositeExportScaleBindingV1 => {
  const instrumentKey = item.scale?.code ?? null
  const instrumentVersion = item.scale?.instrumentVersion ?? null
  const context = createScaleProjectionContext({
    instrumentKey,
    instrumentVersion,
    instrumentClass: item.scale?.instrumentClass ?? null,
    audience,
    purpose: 'export',
  })
  const capabilities = resolveEffectiveScaleDisclosure(context)
  return {
    prefix: slotPrefix(index),
    itemId: item.id,
    scaleId: item.scale?.id ?? null,
    instrumentKey,
    instrumentVersion,
    policyDisposition: context.frozenPolicy.disposition,
    policyVersion: context.frozenPolicy.disclosure.policyVersion,
    ...(context.frozenPolicy.runtimePolicyHash ? { runtimePolicyHash: context.frozenPolicy.runtimePolicyHash } : {}),
    capabilities,
  }
}

export const buildCompositeExportProjectionBinding = (input: {
  resourceId: string
  audience?: ScaleDisclosureAudience
  items: CompositeScaleItem[]
}): CompositeExportProjectionBindingV1 => {
  // Composite wide-export routes are teacher/admin product surfaces. ADMIN is
  // authorization, not a researcher/raw-data disclosure audience.
  const audience = input.audience ?? 'teacher'
  const scales = input.items.flatMap((item, index) => item.type === 'SCALE'
    ? [scaleBindingFor(item, index, audience)]
    : [])
  const identity = {
    projectionVersion: COMPOSITE_EXPORT_PROJECTION_VERSION,
    resourceType: 'COMPOSITE' as const,
    resourceId: input.resourceId,
    audience,
    scales,
  }
  return { ...identity, fingerprint: canonicalHash(identity) }
}

export const resolveCompositeExportProjectionBinding = async (
  resourceId: string,
  audience: ScaleDisclosureAudience = 'teacher',
): Promise<CompositeExportProjectionBindingV1> => {
  const composite = await prisma.compositeAssessment.findUnique({
    where: { id: resourceId },
    select: {
      id: true,
      items: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          type: true,
          scale: { select: { id: true, code: true, instrumentVersion: true, instrumentClass: true } },
        },
      },
    },
  })
  if (!composite) throw new Error('综合测评不存在')
  return buildCompositeExportProjectionBinding({ resourceId: composite.id, audience, items: composite.items })
}

const scaleFieldAllowed = (suffix: string, caps: DisclosureCapabilitiesV1): boolean => {
  if (suffix === 'scale_id' || suffix === 'scale_code') return true
  if (suffix.startsWith('Q_V_') || suffix.startsWith('RT_') || suffix.startsWith('device_')) return caps.rawAnswers
  if (suffix.startsWith('Q_S_')) return caps.itemScores
  if (suffix.startsWith('SCORE_')) return caps.numericScores
  if (suffix.startsWith('quality_')) return caps.resultQualityDetails
  if (suffix === 'reference_versions') return caps.references
  if ([
    'report_definition_version',
    'instrument_version',
    'scoring_version',
    'definition_hash',
    'context_snapshot_hash',
  ].includes(suffix)) return caps.methods
  // Future Scale export columns fail closed until deliberately classified.
  return false
}

const fieldAllowed = (field: CompositeExportField, binding: CompositeExportProjectionBindingV1): boolean => {
  const scalePrefixMatch = /^(S\d{3}_)/.exec(field.name)
  if (!scalePrefixMatch) return true
  const scale = binding.scales.find((candidate) => candidate.prefix === scalePrefixMatch[1])
  if (!scale) return false
  return scaleFieldAllowed(field.name.slice(scale.prefix.length), scale.capabilities)
}

export const projectCompositeExportData = (
  data: CompositeExportData,
  binding: CompositeExportProjectionBindingV1,
): CompositeExportData => {
  const fields = data.fields.filter((field) => fieldAllowed(field, binding))
  const names = new Set(fields.map((field) => field.name))
  const rows = data.rows.map((row) => Object.fromEntries(
    Object.entries(row).filter(([name]) => names.has(name)),
  ))
  return { ...data, fields, rows }
}

const AUDIENCE_CODE: Record<ScaleDisclosureAudience, string> = {
  respondent: '1',
  subject: '2',
  teacher: '3',
  researcher: '4',
}

const uuidLike = (compact: string): string => [
  compact.slice(0, 8),
  compact.slice(8, 12),
  compact.slice(12, 16),
  compact.slice(16, 20),
  compact.slice(20, 32),
].join('-')

const expectedArtifactPrefix = (binding: CompositeExportProjectionBindingV1): string => (
  `${binding.fingerprint.slice(0, 24)}${AUDIENCE_CODE[binding.audience]}`
)

export const bindCompositeExportFileName = (
  fileName: string,
  binding: CompositeExportProjectionBindingV1,
  entropy = randomBytes(4).toString('hex').slice(0, 7),
): string => {
  const match = fileName.match(/_([0-9a-f-]{36})\.(csv|sav|zip)$/i)
  if (!match) throw new Error('导出文件名缺少可绑定的 artifact identity')
  const compact = `${expectedArtifactPrefix(binding)}${entropy.toLowerCase()}`
  if (!/^[0-9a-f]{32}$/.test(compact)) throw new Error('导出 artifact identity 无效')
  return fileName.replace(match[1], uuidLike(compact))
}

export const compositeExportFileNameMatchesProjection = (
  fileName: string,
  binding: CompositeExportProjectionBindingV1,
): boolean => {
  const match = fileName.match(/_([0-9a-f-]{36})\.(csv|sav|zip)$/i)
  if (!match) return false
  const compact = match[1].replace(/-/g, '').toLowerCase()
  return /^[0-9a-f]{32}$/.test(compact) && compact.startsWith(expectedArtifactPrefix(binding))
}

export const bindCompositeExportFilePath = (
  filePath: string,
  binding: CompositeExportProjectionBindingV1,
): string => {
  const boundName = bindCompositeExportFileName(path.basename(filePath), binding)
  const boundPath = path.join(path.dirname(filePath), boundName)
  fs.renameSync(filePath, boundPath)
  return boundPath
}
