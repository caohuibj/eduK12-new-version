import type { SituationDefinitionV1, DefinitionIssue } from './situation-definition'
import type { SituationDefinitionV2 } from './situation-branching'
import {
  hashSituationRuntimeDefinition,
  runnerSituationRuntimeDefinition,
  validateSituationRuntimeDefinition,
  type SituationRuntimeDefinition,
} from './situation-runtime-definition'
import {
  deriveAuthoritativeSituationalTrajectory,
  projectReachableSituationDefinitionForScoring,
} from './situation-trajectory'
import { scoreSituational, type SituationalGoldenCase } from './situation-scoring'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from './packages/sjt-assertiveness-golden-zh-cn-v1'
import { SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE } from './packages/sjt-responsibility-golden-zh-cn-v1'
import { SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE } from './packages/sjt-anxiety-golden-zh-cn-v1'
import { SJT_STATIC_VISUAL_E2E_PACKAGE } from './packages/sjt-static-visual-e2e-fixture'

interface SituationPackageBase {
  key: string
  instrumentVersion: string
  releaseStatus: 'DRAFT' | 'PUBLISHED' | 'RETIRED'
  scienceMaturity: 'PILOT' | 'RESEARCH_GRADE'
  goldenCases: SituationalGoldenCase[]
}

export interface SituationPackageV1 extends SituationPackageBase {
  definition: SituationDefinitionV1
}

export interface SituationPackageV2 extends SituationPackageBase {
  definition: SituationDefinitionV2
}

export type SituationPackage = SituationPackageV1 | SituationPackageV2

// Production content remains V1 until a later content PR deliberately adds a
// reviewed V2 pilot. C only makes the package/runtime admission contract V2-capable.
const packages: SituationPackageV1[] = [
  SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE,
  SJT_RESPONSIBILITY_GOLDEN_ZH_CN_V1_PACKAGE,
  SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE,
  ...(process.env.SITUATIONAL_STATIC_VISUAL_FIXTURE === 'true' ? [SJT_STATIC_VISUAL_E2E_PACKAGE] : []),
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
 * remain in the registry for validation and CI, but only PUBLISHED pilot
 * packages may be selected for a student-facing attempt. The implementation
 * depends only on the common package envelope, so a test/future V2 package can
 * use the exact same admission semantics without a second registry.
 */
export const selectPublishedSituationPackage = <T extends SituationPackage>(
  availablePackages: readonly T[],
  key: string,
  instrumentVersion?: string,
): T | undefined => {
  const candidates = availablePackages
    .filter((candidate) => (
      candidate.key === key
      && candidate.releaseStatus === 'PUBLISHED'
      && candidate.scienceMaturity === 'PILOT'
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

const scoreGoldenCase = (
  definition: SituationRuntimeDefinition,
  fixture: SituationalGoldenCase,
) => {
  if (definition.schemaVersion === 1) return scoreSituational(definition, fixture.responses)
  const trajectory = deriveAuthoritativeSituationalTrajectory(definition, fixture.responses)
  if (!trajectory.reachedTerminal) throw new Error(`golden case ${fixture.name} 未到达 terminal`)
  const reachableDefinition = projectReachableSituationDefinitionForScoring(definition, trajectory)
  const reachableSceneKeys = new Set(trajectory.sceneKeys)
  const offPath = fixture.responses.find((response) => !reachableSceneKeys.has(response.sceneKey))
  if (offPath) throw new Error(`golden case ${fixture.name} 包含 off-path response：${offPath.sceneKey}:${offPath.channelKey}`)
  return scoreSituational(reachableDefinition, fixture.responses)
}

/**
 * Package-level release gate. V1 and V2 share one package envelope and one
 * scorer. V2 adds authoritative trajectory validation before its golden case
 * is projected to the existing scientific scoring plane.
 */
export const validateSituationPackage = (situationPackage: SituationPackage): SituationPackageValidation => {
  const identityIssues: DefinitionIssue[] = []
  if (!situationPackage.key.trim()) identityIssues.push({ path: 'key', message: 'package key 不能为空', severity: 'error' })
  if (!situationPackage.instrumentVersion.trim()) identityIssues.push({ path: 'instrumentVersion', message: 'package instrumentVersion 不能为空', severity: 'error' })
  if (!['DRAFT', 'PUBLISHED', 'RETIRED'].includes(situationPackage.releaseStatus)) identityIssues.push({ path: 'releaseStatus', message: 'package releaseStatus 不合法', severity: 'error' })
  if (!['PILOT', 'RESEARCH_GRADE'].includes(situationPackage.scienceMaturity)) identityIssues.push({ path: 'scienceMaturity', message: 'package scienceMaturity 不合法', severity: 'error' })
  const validation = validateSituationRuntimeDefinition(situationPackage.definition, {
    forPublish: true,
    requireGoldenFixture: true,
    hasGoldenFixture: situationPackage.goldenCases.length > 0,
  })
  const issues = [...identityIssues, ...validation.issues]
  const definition = validation.definition ?? situationPackage.definition
  if (hashSituationRuntimeDefinition(situationPackage.definition) !== hashSituationRuntimeDefinition(definition)) {
    issues.push({ path: 'definitionHash', message: 'definition hash 计算不稳定', severity: 'error' })
  }
  try {
    const runner = runnerSituationRuntimeDefinition(situationPackage.definition)
    if (runner.scenes.some((scene) => scene.channels.length === 0)) issues.push({ path: 'runner', message: 'Runner 存在没有响应通道的场景', severity: 'error' })
  } catch (error) {
    issues.push({ path: 'runner', message: error instanceof Error ? error.message : 'Runner definition 无法构建', severity: 'error' })
  }
  situationPackage.goldenCases.forEach((fixture, index) => {
    try {
      const output = scoreGoldenCase(situationPackage.definition, fixture)
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
    definitionHash: hashSituationRuntimeDefinition(situationPackage.definition),
    issues,
  }
}
