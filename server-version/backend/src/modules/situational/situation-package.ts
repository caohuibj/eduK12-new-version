import type { SituationDefinitionV1, DefinitionIssue } from './situation-definition'
import type { SituationDefinitionV2 } from './situation-branching'
import {
  asLinearSituationDefinition,
  hashSituationRuntimeDefinition,
  runnerSituationRuntimeDefinition,
  validateSituationRuntimeDefinition,
  type SituationRuntimeDefinition,
} from './situation-runtime-definition'
import {
  deriveAuthoritativeSituationalTrajectory,
  projectReachableSituationDefinitionForScoring,
  reachableSituationalResponseKeys,
} from './situation-trajectory'
import {
  scoreSituational,
  validateSituationalResponse,
  type SituationalGoldenCase,
} from './situation-scoring'
interface SituationPackageBase {
  key: string
  instrumentVersion: string
  releaseStatus: 'DRAFT' | 'PUBLISHED' | 'RETIRED'
  /**
   * Legacy compatibility marker only. Scientific maturity is now governed by
   * resolveSituationalScientificMaturity(exact identity), so promotion does
   * not alter the executable package or become a runtime capability switch.
   */
  scienceMaturity?: 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE'
  goldenCases: SituationalGoldenCase[]
}

export interface SituationPackageV1 extends SituationPackageBase {
  definition: SituationDefinitionV1
}

export interface SituationPackageV2 extends SituationPackageBase {
  definition: SituationDefinitionV2
}

export type SituationPackage = SituationPackageV1 | SituationPackageV2

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

  const linear = asLinearSituationDefinition(definition)
  fixture.responses.forEach((response) => validateSituationalResponse(linear, response))

  const trajectory = deriveAuthoritativeSituationalTrajectory(definition, fixture.responses)
  if (!trajectory.reachedTerminal) throw new Error(`golden case ${fixture.name} 未到达 terminal`)

  const reachableKeys = new Set(reachableSituationalResponseKeys(definition, trajectory))
  const offPath = fixture.responses.find((response) => !reachableKeys.has(`${response.sceneKey}:${response.channelKey}`))
  if (offPath) throw new Error(`golden case ${fixture.name} 包含 off-path response：${offPath.sceneKey}:${offPath.channelKey}`)

  const reachableDefinition = projectReachableSituationDefinitionForScoring(definition, trajectory)
  const scoredKeys = new Set(reachableDefinition.scenes.flatMap((scene) => (
    scene.channels.map((channel) => `${scene.sceneKey}:${channel.channelKey}`)
  )))
  const scoredResponses = fixture.responses.filter((response) => scoredKeys.has(`${response.sceneKey}:${response.channelKey}`))
  return scoreSituational(reachableDefinition, scoredResponses, { responsesValidated: true })
}

/**
 * Exact-package executable correctness gate. V1 and V2 share one package
 * envelope and scorer. Provenance/source/license completeness belongs to
 * scientific qualification, not product publication.
 */
export const validateSituationPackage = (situationPackage: SituationPackage): SituationPackageValidation => {
  const identityIssues: DefinitionIssue[] = []
  if (!situationPackage.key.trim()) identityIssues.push({ path: 'key', message: 'package key 不能为空', severity: 'error' })
  if (!situationPackage.instrumentVersion.trim()) identityIssues.push({ path: 'instrumentVersion', message: 'package instrumentVersion 不能为空', severity: 'error' })
  if (!['DRAFT', 'PUBLISHED', 'RETIRED'].includes(situationPackage.releaseStatus)) identityIssues.push({ path: 'releaseStatus', message: 'package releaseStatus 不合法', severity: 'error' })
  const validation = validateSituationRuntimeDefinition(situationPackage.definition, {
    forPublish: false,
  })
  const issues = [...identityIssues, ...validation.issues]

  // Product presentation contract: non-text stimuli require a textual fallback
  // so a declared PUBLISHED package never reaches a renderer-only dead end.
  situationPackage.definition.scenes.forEach((scene, sceneIndex) => {
    if (scene.stimulus.type !== 'TEXT_V1' && (!scene.stimulus.text || scene.stimulus.text.trim().length === 0)) {
      issues.push({
        path: `scenes.${sceneIndex}.stimulus.text`,
        message: 'IMAGE/COMIC/VIDEO 情境必须保留文字题面以满足产品呈现回退',
        severity: 'error',
      })
    }
  })
  if (situationPackage.goldenCases.length === 0) {
    issues.push({ path: 'goldenCases', message: '情境化测评缺少 golden scoring fixture', severity: 'error' })
  }

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
