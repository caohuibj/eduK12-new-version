import { validateAudienceReport } from '../library/audience-report-gate'
import { validateReferenceSetDefinition } from '../../assessment-reference/reference'
import { parseScaleCatalogManifest } from '../library/catalog-manifest'
import { parseLocalizationManifest } from '../library/localization-manifest'
import { hashScaleDefinition, validateScaleDefinition } from '../scale-definition'
import { getScaleCustomScorerKeys, scoreScale } from '../scale-scoring'
import type { ScaleInstrumentSourceV1 } from './types'

export interface InstrumentSourceIssue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface InstrumentSourceValidation {
  valid: boolean
  issues: InstrumentSourceIssue[]
}

const exactIdentity = (source: ScaleInstrumentSourceV1) => ({
  instrumentKey: source.identity.instrumentKey,
  instrumentVersion: source.identity.instrumentVersion,
})

export const materializeCatalogManifest = (source: ScaleInstrumentSourceV1) => ({
  ...source.catalog,
  identity: {
    ...source.catalog.identity,
    ...exactIdentity(source),
  },
})

export const materializeLocalizationManifest = (source: ScaleInstrumentSourceV1) => (
  source.localization
    ? {
        ...source.localization,
        ...exactIdentity(source),
      }
    : undefined
)

export const validateScaleInstrumentSource = (source: ScaleInstrumentSourceV1): InstrumentSourceValidation => {
  const issues: InstrumentSourceIssue[] = []
  const catalogResult = parseScaleCatalogManifest(materializeCatalogManifest(source))
  if (!catalogResult.ok) {
    catalogResult.issues.forEach((issue) => issues.push({ path: `catalog.${issue.path}`, message: issue.message, severity: 'error' }))
  }

  const localization = materializeLocalizationManifest(source)
  if (localization) {
    const localizationResult = parseLocalizationManifest(localization)
    if (!localizationResult.ok) {
      localizationResult.issues.forEach((issue) => issues.push({ path: `localization.${issue.path}`, message: issue.message, severity: 'error' }))
    }
    const evidenceIds = new Set(source.catalog.evidence.map((entry) => entry.evidenceId))
    source.localization?.localEvidenceRefs.forEach((evidenceId, index) => {
      if (!evidenceIds.has(evidenceId)) {
        issues.push({ path: `localization.localEvidenceRefs.${index}`, message: `localization 引用了不存在的 evidenceId：${evidenceId}`, severity: 'error' })
      }
    })
  }

  if (!source.executable) {
    return { valid: issues.every((issue) => issue.severity !== 'error'), issues }
  }

  if (!source.applicability) issues.push({ path: 'applicability', message: 'executable source 缺少 applicability', severity: 'error' })
  if (!source.disclosure) issues.push({ path: 'disclosure', message: 'executable source 缺少 disclosure', severity: 'error' })
  if (localization && source.executable.contentLocale !== localization.targetLocale) {
    issues.push({
      path: 'executable.contentLocale',
      message: `contentLocale=${source.executable.contentLocale} 与 localization.targetLocale=${localization.targetLocale} 不一致`,
      severity: 'error',
    })
  }
  if (source.catalog.administration.itemCount !== source.executable.definition.items.length) {
    issues.push({ path: 'catalog.administration.itemCount', message: 'catalog itemCount 与 executable definition 不一致', severity: 'error' })
  }

  const pluginKeys = new Set((source.executable.scorerPlugins ?? []).map((plugin) => plugin.key))
  const scorerKey = source.executable.definition.scoring.scorerKey
  if (scorerKey && !pluginKeys.has(scorerKey) && !getScaleCustomScorerKeys().has(scorerKey)) {
    issues.push({ path: 'executable.definition.scoring.scorerKey', message: `缺少 scorer plugin：${scorerKey}`, severity: 'error' })
  }

  const definitionValidation = validateScaleDefinition(source.executable.definition, {
    instrumentClass: 'STANDARD',
    forPublish: false,
    scorerKeys: new Set([...getScaleCustomScorerKeys(), ...pluginKeys]),
  })
  definitionValidation.issues.forEach((issue) => issues.push({
    path: `executable.definition.${issue.path}`,
    message: issue.message,
    severity: issue.severity,
  }))

  issues.push(...validateAudienceReport(source.executable.definition))
  const scoreKeys = new Set(source.executable.definition.scoring.scores.map((score) => score.key))
  const referenceVersions = new Set<string>()
  source.executable.references.forEach((reference, referenceIndex) => {
    const path = `executable.references.${referenceIndex}`
    const validation = validateReferenceSetDefinition(reference)
    validation.issues.forEach((issue) => issues.push({ path: `${path}.${issue.path}`, message: issue.message, severity: issue.severity }))
    if (reference.instrumentType !== 'scale') issues.push({ path: `${path}.instrumentType`, message: 'Scale source reference 必须为 instrumentType=scale', severity: 'error' })
    if (reference.instrumentKey !== source.identity.instrumentKey) issues.push({ path: `${path}.instrumentKey`, message: 'reference instrumentKey 与 source identity 不一致', severity: 'error' })
    if (referenceVersions.has(reference.referenceVersion)) issues.push({ path: `${path}.referenceVersion`, message: 'referenceVersion 不能重复', severity: 'error' })
    referenceVersions.add(reference.referenceVersion)
    reference.entries.forEach((entry, entryIndex) => {
      const axes=source.executable?.definition.versionAxes
      if(axes && (!entry.governance || entry.governance.subjectKey!==axes.subjectKey || entry.governance.locale!==axes.locale || entry.governance.measurementHash!==hashScaleDefinition(source.executable!.definition))) issues.push({path:`${path}.entries.${entryIndex}.governance`,message:'REFERENCE_MEASUREMENT_AXES_MISMATCH',severity:'error'})
      if (entry.instrumentVersion !== source.identity.instrumentVersion) issues.push({ path: `${path}.entries.${entryIndex}.instrumentVersion`, message: 'reference instrumentVersion 与 source identity 不一致', severity: 'error' })
      if (entry.scoringVersion !== source.executable?.definition.scoring.scoringVersion) issues.push({ path: `${path}.entries.${entryIndex}.scoringVersion`, message: 'reference scoringVersion 与 definition 不一致', severity: 'error' })
      if (!scoreKeys.has(entry.scoreKey)) issues.push({ path: `${path}.entries.${entryIndex}.scoreKey`, message: `reference scoreKey 不存在：${entry.scoreKey}`, severity: 'error' })
    })
  })

  if (source.executable.goldenCases.length === 0) {
    issues.push({ path: 'executable.goldenCases', message: 'executable source 必须包含 golden cases', severity: 'error' })
  }
  source.executable.goldenCases.forEach((fixture, index) => {
    try {
      const output = scoreScale(source.executable!.definition, fixture.answers)
      if (output.quality.status !== fixture.expected.quality) issues.push({ path: `executable.goldenCases.${index}.quality`, message: `${fixture.name} quality 不匹配`, severity: 'error' })
      const actualKeys = output.scores.map((score) => score.key)
      if (JSON.stringify(actualKeys) !== JSON.stringify(fixture.expected.totalScoreKeys)) issues.push({ path: `executable.goldenCases.${index}.scores`, message: `${fixture.name} score keys 不匹配`, severity: 'error' })
      Object.entries(fixture.expected.scores).forEach(([key, expected]) => {
        const actual = output.scores.find((score) => score.key === key)?.value ?? null
        if (actual !== expected) issues.push({ path: `executable.goldenCases.${index}.scores.${key}`, message: `${fixture.name} ${key} 期望 ${expected}，实际 ${actual}`, severity: 'error' })
      })
    } catch (error) {
      issues.push({ path: `executable.goldenCases.${index}`, message: error instanceof Error ? error.message : `${fixture.name} 执行失败`, severity: 'error' })
    }
  })

  return { valid: issues.every((issue) => issue.severity !== 'error'), issues }
}
