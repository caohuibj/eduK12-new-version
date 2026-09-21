import { compileCognitiveRuntime } from '../../assessment-runtime/compiler'
import {
  productNotReady,
  productReady,
  type ProductReadinessDecisionV1,
  type ProductReadinessIssueV1,
} from '../../assessment-governance/product-readiness'
import { resolveCognitiveFinalMaxTrials } from '../v2/final-submission-budget'
import { validateTaskDefinition } from '../v2/publication-gate'
import type { CognitiveProfile, TaskDefinition } from '../v2/types'

const releaseProfiles: CognitiveProfile[] = ['experience', 'standard', 'research']

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

/**
 * Generic technical readiness for one exact Cognitive task identity.
 *
 * This gate answers only whether the implementation/config is complete enough
 * to permit an explicit product release decision. It never reads or mutates
 * CognitiveTestConfig.status and it never evaluates scientific maturity.
 * Frontend runner parity remains a cross-tree CI concern because backend
 * runtime code must never import frontend registries.
 */
export const evaluateCognitiveProductReadiness = (
  definition: TaskDefinition<unknown, unknown>,
  baseConfig?: unknown,
): ProductReadinessDecisionV1 => {
  const blockers: ProductReadinessIssueV1[] = validateTaskDefinition(definition)
    .filter((candidate) => candidate.severity === 'error')
    .map((candidate) => ({
      stage: candidate.path.startsWith('report.')
        ? 'RESULT'
        : candidate.path.startsWith('finalSubmission')
          ? 'FINAL'
          : candidate.path.startsWith('scorer') || candidate.path.startsWith('metrics.') || candidate.path.startsWith('quality.')
            ? 'SCORING'
            : 'DEFINITION',
      code: 'COGNITIVE_TASK_INVALID',
      message: `${candidate.path}: ${candidate.message}`,
    }))

  if (baseConfig !== undefined) {
    const parsedBase = definition.configSchema.safeParse(baseConfig)
    if (!parsedBase.success) {
      blockers.push({
        stage: 'DEFINITION',
        code: 'COGNITIVE_CONFIG_INVALID',
        message: 'CognitiveTestConfig config does not match the exact task config schema',
      })
    } else {
      const parsedRecord = asRecord(parsedBase.data)
      if (!parsedRecord) {
        blockers.push({
          stage: 'DEFINITION',
          code: 'COGNITIVE_CONFIG_NOT_OBJECT',
          message: 'Cognitive product config must resolve to an object before profile patches are applied',
        })
      } else {
        for (const profile of releaseProfiles.filter(p => p === 'standard' || Object.prototype.hasOwnProperty.call(definition.profiles, p))) {
          const profileDefinition = definition.profiles[profile]
          if (!profileDefinition) {
            blockers.push({
              stage: 'DEFINITION',
              code: 'COGNITIVE_PROFILE_MISSING',
              message: `${profile} profile is required for product release`,
            })
            continue
          }
          const resolvedConfig = {
            ...parsedRecord,
            ...profileDefinition.configPatch,
          }
          try {
            resolveCognitiveFinalMaxTrials(definition, definition.configSchema.parse(resolvedConfig))
          } catch {
            blockers.push({ stage: 'FINAL', code: 'COGNITIVE_PROFILE_FINAL_INVALID', message: `${profile} profile must resolve to a valid FINAL trial budget` })
          }
          if (!definition.configSchema.safeParse(resolvedConfig).success) {
            blockers.push({
              stage: 'DEFINITION',
              code: 'COGNITIVE_PROFILE_CONFIG_INVALID',
              message: `${profile} profile configPatch does not resolve to a valid exact-task config`,
            })
          }
        }
      }
    }
  }

  if (blockers.length === 0) {
    try {
      const runtime = compileCognitiveRuntime({ definition })
      if (!runtime.runtimeCapabilities.supported) {
        blockers.push({
          stage: 'RUNTIME_COMPILE',
          code: 'COGNITIVE_RUNTIME_UNSUPPORTED',
          message: 'compiled Cognitive runtime does not declare supported=true',
        })
      }
    } catch (error) {
      blockers.push({
        stage: 'RUNTIME_COMPILE',
        code: 'COGNITIVE_RUNTIME_COMPILE_FAILED',
        message: error instanceof Error ? error.message : 'Cognitive runtime compile failed',
      })
    }
  }

  return blockers.length === 0 ? productReady() : productNotReady(blockers)
}
