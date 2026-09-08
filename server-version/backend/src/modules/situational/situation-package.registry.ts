import { hashSituationDefinition, runnerSituationDefinition, validateSituationDefinition, type DefinitionIssue, type SituationDefinitionV1 } from './situation-definition'
import { scoreSituational, type SituationalGoldenCase } from './situation-scoring'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from './packages/sjt-assertiveness-golden-zh-cn-v1'
import { SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE } from './packages/sjt-responsibility-golden-zh-cn-v1'
import { SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE } from './packages/sjt-anxiety-golden-zh-cn-v1'

export interface SituationPackageV1 {
  key: string
  instrumentVersion: string
  releaseStatus: 'DRAFT' | 'PUBLISHED' | 'RETIRED'
  scienceMaturity: 'PILOT' | 'RESEARCH_GRADE'
  definition: SituationDefinitionV1
  goldenCases: SituationalGoldenCase[]
}

const packages: SituationPackageV1[] = [
  SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE,
  SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE,
  SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE,
]

const packageIdentityKey = (key: string, instrumentVersion: string): string => JSON.stringify([key, instrumentVersion])
const packageByKey = new Map<string, SituationPackageV1>()
for (const situationPackage of packages) {
  const identity = packageIdentityKey(situationPackage.key, situationPackage.instrumentVersion)
  if (packageByKey.has(identity)) {
    throw new Error(`Duplicate situation package identity: ${situationPackage.key}@${situationPackage.instrumentVersion}`)
  }
  packageByKey.set(identity, situationPackage)
}

export const getSituationPackage = (key: string, instrumentVersion: string): SituationPackageV1 | undefined => (
  packageByKey.get(packageIdentityKey(key, instrumentVersion))
)

export const listSituationPackages = (): SituationPackageV1[] => [...packages]

export const hasSituationPackage = (key: string, instrumentVersion: string): boolean => (
  packageByKey.has(packageIdentityKey(key, instrumentVersion))
)

/**
 * Participant runtime admission is release-state aware. Development packages
 * remain in the registry for validation and CI, but only PUBLISHED packages
 * may be selected for a student-facing attempt.
 */
export const selectPublishedSituationPackage = (
  availablePackages: readonly SituationPackageV1[],
  key: string,
  instrumentVersion?: string,
): SituationPackageV1 | undefined => {
  const candidates = availablePackages
    .filter((candidate) => (
      candidate.key === key
      && candidate.releaseStatus === 'PUBLISHED'
      && (instrumentVersion === undefined || candidate.instrumentVersion === instrumentVersion)
    ))
    .sort((left, right) => compareSituationalInstrumentVersions(right.instrumentVersion, left.instrumentVersion))
  return candidates[0]
}

/** Compare numeric version segments without treating 1.0.10 as older than 1.0.2. */
export const compareSituationalInstrumentVersions = (left: string, right: string): number => {
  const leftParts = left.split(/[.-]/u)
  const rightParts = right.split(/[.-]/u)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index]
    const rightPart = rightParts[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    const leftNumber = /^\d+$/u.test(leftPart) ? Number(leftPart) : null
    const rightNumber = /^\d+$/u.test(rightPart) ? Number(rightPart) : null
    if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
      return leftNumber - rightNumber
    }
    const comparison = leftPart.localeCompare(rightPart, 'en')
    if (comparison !== 0) return comparison
  }
  return 0
}

export interface SituationPackageValidation {
  valid: boolean
  definitionHash: string
  issues: DefinitionIssue[]
}

/**
 * Package-level release gate. A package is code-owned, so its golden cases and
 * runner/report shape are checked together with the definition contract. The
 * function is pure and can be used by seed, CI, or an admin diagnostic endpoint
 * without touching the database.
 */
export const validateSituationPackage = (situationPackage: SituationPackageV1): SituationPackageValidation => {
  const identityIssues: DefinitionIssue[] = []
  if (!situationPackage.key.trim()) identityIssues.push({ path: 'key', message: 'package key 不能为空', severity: 'error' })
  if (!situationPackage.instrumentVersion.trim()) identityIssues.push({ path: 'instrumentVersion', message: 'package instrumentVersion 不能为空', severity: 'error' })
  if (!['DRAFT', 'PUBLISHED', 'RETIRED'].includes(situationPackage.releaseStatus)) identityIssues.push({ path: 'releaseStatus', message: 'package releaseStatus 不合法', severity: 'error' })
  const validation = validateSituationDefinition(situationPackage.definition, {
    forPublish: true,
    requireGoldenFixture: true,
    hasGoldenFixture: situationPackage.goldenCases.length > 0,
  })
  const issues = [...identityIssues, ...validation.issues]
  if (hashSituationDefinition(situationPackage.definition) !== hashSituationDefinition(validation.definition ?? situationPackage.definition)) {
    issues.push({ path: 'definitionHash', message: 'definition hash 计算不稳定', severity: 'error' })
  }
  try {
    const runner = runnerSituationDefinition(situationPackage.definition)
    if (runner.scenes.some((scene) => scene.channels.length === 0)) issues.push({ path: 'runner', message: 'Runner 存在没有响应通道的场景', severity: 'error' })
  } catch (error) {
    issues.push({ path: 'runner', message: error instanceof Error ? error.message : 'Runner definition 无法构建', severity: 'error' })
  }
  situationPackage.goldenCases.forEach((fixture, index) => {
    try {
      const output = scoreSituational(situationPackage.definition, fixture.responses)
      if (output.quality.status !== fixture.expected.quality) {
        issues.push({ path: `goldenCases.${index}.quality`, message: `golden case ${fixture.name} 的 quality 不匹配`, severity: 'error' })
      }
      const actualKeys = output.metrics.map((metric) => metric.key)
      if (JSON.stringify(actualKeys) !== JSON.stringify(fixture.expected.metricKeys)) {
        issues.push({ path: `goldenCases.${index}.metrics`, message: `golden case ${fixture.name} 的 metric key 不匹配`, severity: 'error' })
      }
      Object.entries(fixture.expected.metrics).forEach(([key, expected]) => {
        const actual = output.metrics.find((metric) => metric.key === key)?.value ?? null
        if (actual !== expected) {
          issues.push({ path: `goldenCases.${index}.metrics.${key}`, message: `golden case ${fixture.name} 的 ${key} 不匹配：期望 ${expected}，实际 ${actual}`, severity: 'error' })
        }
      })
    } catch (error) {
      issues.push({ path: `goldenCases.${index}`, message: error instanceof Error ? error.message : `golden case ${fixture.name} 计分失败`, severity: 'error' })
    }
  })
  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    definitionHash: hashSituationDefinition(situationPackage.definition),
    issues,
  }
}

